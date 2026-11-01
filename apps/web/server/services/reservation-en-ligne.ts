import { randomBytes, randomInt } from 'node:crypto';

import { SystemClock } from '@ha/adapters';
import { clientPlateforme } from '@ha/db';
import {
  ajouterJours,
  bornesJourMs,
  calculerCreneauxLibres,
  choixCreneauSchema,
  clientPeutSeConnecter,
  codeSmsSchema,
  coordonneesReservationSchema,
  deplacementEnLigneSchema,
  differencesAuditees,
  DUREE_VERROU_MINUTES,
  ENVOIS_CODE_MAX,
  estDansLaFenetre,
  fenetreReservation,
  instantsDisponibles,
  lectureCreneauxSchema,
  LONGUEUR_CODE_SMS,
  localDepuisInstant,
  messageCodeSms,
  normaliserPourRecherche,
  peutModifierEnLigne,
  rapprocherPatient,
  statutApresDeplacementEnLigne,
  statutReservationEnLigne,
  TENTATIVES_CODE_MAX,
  VERSION_CONSENTEMENT,
  type Captcha,
  type Clock,
  type Creneau,
  type FenetreReservation,
  type HorairesOuverture,
  type InstantDisponible,
  type Notifier,
  type ValidationReservation,
} from '@ha/domain';

import { AccesRefuseError } from '../auth/acces';
import { enregistrerTentative, type RegleLimitation } from '../auth/limitation';
import { journaliser, type AuteurAudit, type EvenementAudit } from '../audit/journal';
import { captcha as captchaConfigure } from '../captcha';
import { base, enTransaction, type ClientTransaction, type ContexteClient } from '../chiffrement';
import { ErreurConflitAgenda, ErreurSaisie, ressourcePerdue, valider } from '../erreurs';
import { notifier as notifierConfigure, reservationPubliqueOuverte } from '../notifier';
import { publierEvenement } from '../evenements';
import {
  empreinteCaptcha,
  empreinteCode,
  empreinteJeton,
  empreintesEgales,
  empreinteTelephone,
  signatureLien,
} from '../reservation-empreintes';
import {
  appliquerAnnulation,
  appliquerDeplacement,
  charge,
  choisirCabine,
  contexteDuCreneau,
  evenementRdv,
  praticiensDuCentre,
  selectionEcriture,
  verifierConflits,
} from './agenda';
import {
  centreActif,
  exceptionsDeLaPeriode,
  horaires,
  occupationsDeLaPeriode,
  STATUTS_OCCUPANTS,
} from './agenda-socle';
import { notifierPatientEnLigne } from './notifications-reservation';

const MS_PAR_MINUTE = 60_000;
/** Jours renvoyés par lecture : une transaction, et rien de plus, sur le pool partagé avec le logiciel. */
const JOURS_PAR_LECTURE = 7;
const CRENEAUX_MAX = 2_000;
/** « Peu importe » essaie un autre praticien si le premier vient d'être pris. */
const ESSAIS_VERROU = 5;
const VALIDITE_CODE_MINUTES = 10;

// Réglages produit, pas des règles réglementaires. Chaque réponse d'un parcours public coûte une connexion : on
// compte avant de lire.
export const LIMITE_LECTURE_IP: RegleLimitation = { max: 120, fenetreSecondes: 60 };
export const LIMITE_VERROU_IP: RegleLimitation = { max: 10, fenetreSecondes: 15 * 60 };
export const LIMITE_CODE_IP: RegleLimitation = { max: 20, fenetreSecondes: 60 * 60 };
export const LIMITE_CODE_TELEPHONE: RegleLimitation = { max: 5, fenetreSecondes: 60 * 60 };
export const LIMITE_VERIFICATION_IP: RegleLimitation = { max: 30, fenetreSecondes: 15 * 60 };
export const LIMITE_LIEN_IP: RegleLimitation = { max: 30, fenetreSecondes: 15 * 60 };
// Plus longue que la validité d'un défi ALTCHA : sinon le compteur repart et la réponse se rejoue.
const LIMITE_REJEU_CAPTCHA: RegleLimitation = { max: 1, fenetreSecondes: 10 * 60 };

export interface Dependances {
  readonly horloge: Clock;
  readonly notifier: Notifier;
  readonly captcha: Captcha;
}

function dependances(partielles: Partial<Dependances>): Dependances {
  return {
    horloge: partielles.horloge ?? new SystemClock(),
    get notifier() {
      return partielles.notifier ?? notifierConfigure();
    },
    get captcha() {
      return partielles.captcha ?? captchaConfigure();
    },
  };
}

function instantDe(horloge: Clock): Date {
  return new Date(horloge.now());
}

/** Un visiteur n'a pas de compte : le journal note l'origine, pas une personne. */
function auteurEnLigne(organisationId: string): AuteurAudit {
  return {
    utilisateurId: null,
    libelle: 'Réservation en ligne',
    role: null,
    organisationId,
  };
}

class ErreurLimite extends ErreurSaisie {
  constructor() {
    super({}, 'Trop de tentatives. Réessayez dans quelques minutes.');
    this.name = 'ErreurLimite';
  }
}

async function limiter(cle: string, regle: RegleLimitation, instant: Date): Promise<void> {
  if (!(await enregistrerTentative(cle, regle, instant.getTime()))) {
    throw new ErreurLimite();
  }
}

/** Le créneau a été pris entre-temps : le patient en choisit un autre. */
export class ErreurCreneauIndisponible extends ErreurSaisie {
  constructor() {
    super({}, 'Ce créneau vient d’être pris. Choisissez-en un autre.');
    this.name = 'ErreurCreneauIndisponible';
  }
}

/** Le parcours n'existe plus (verrou expiré, code épuisé) : le patient repart du choix du créneau. */
export class ErreurParcoursExpire extends ErreurSaisie {
  constructor() {
    super({}, 'Votre réservation a expiré. Choisissez à nouveau un créneau.');
    this.name = 'ErreurParcoursExpire';
  }
}

// ---------------------------------------------------------------------------
// Page publique
// ---------------------------------------------------------------------------

export interface CiblePublique extends ContexteClient {
  readonly centreId: string;
}

/** Slugs → client et centre : seule étape sans contexte client. Inconnu ou suspendu : refus (404). */
export async function resoudreCentre(
  slugClient: string,
  slugCentre: string,
): Promise<CiblePublique> {
  if (!reservationPubliqueOuverte()) {
    throw new AccesRefuseError();
  }
  const organisation = await clientPlateforme().organisation.findUnique({
    where: { slug: slugClient },
    select: { id: true, statut: true },
  });
  if (!organisation || !clientPeutSeConnecter(organisation.statut)) {
    throw new AccesRefuseError();
  }
  const centre = await clientPlateforme().centre.findFirst({
    where: { organisationId: organisation.id, slug: slugCentre, actif: true },
    select: { id: true },
  });
  if (!centre) {
    throw new AccesRefuseError();
  }
  return { organisationId: organisation.id, centreId: centre.id };
}

async function parametresActifs(
  tx: Pick<ClientTransaction, 'parametresReservation'>,
  centreId: string,
) {
  const parametres = await tx.parametresReservation.findFirst({ where: { centreId, actif: true } });
  if (!parametres) {
    throw new AccesRefuseError();
  }
  return parametres;
}

const selectionType = {
  id: true,
  nom: true,
  dureeMinutes: true,
  requierePraticien: true,
  requiereCabine: true,
  delaiMinimalMinutes: true,
} as const;

/** Un type se réserve s'il est actif, déclaré réservable par le client, et retenu par le centre. */
async function typeReservable(
  tx: Pick<ClientTransaction, 'typeRdvEnLigne'>,
  centreId: string,
  typeRdvId: string,
) {
  const ligne = await tx.typeRdvEnLigne.findFirst({
    where: { centreId, typeRdvId, typeRdv: { actif: true, reservableEnLigne: true } },
    select: { typeRdv: { select: selectionType } },
  });
  if (!ligne) {
    throw ErreurSaisie.surChamp('typeRdvId', 'Ce type de rendez-vous n’est pas réservable.');
  }
  return ligne.typeRdv;
}

export interface CentrePublic {
  nom: string;
  adresseLigne1: string;
  adresseLigne2: string | null;
  codePostal: string;
  ville: string;
  telephone: string;
  horaires: HorairesOuverture;
  types: { id: string; nom: string; dureeMinutes: number; requierePraticien: boolean }[];
  praticiens: { id: string; nom: string }[];
}

/** Vitrine d'un centre : ce qu'un inconnu peut voir, rien d'autre. */
export async function lireCentrePublic(cible: CiblePublique): Promise<CentrePublic> {
  const { centreId } = cible;
  return enTransaction(cible, async (tx) => {
    await parametresActifs(tx, centreId);
    const centre = await tx.centre.findFirstOrThrow({
      where: { id: centreId },
      select: {
        nom: true,
        adresseLigne1: true,
        adresseLigne2: true,
        codePostal: true,
        ville: true,
        telephone: true,
        horairesOuverture: true,
      },
    });
    const types = await tx.typeRdvEnLigne.findMany({
      where: { centreId, typeRdv: { actif: true, reservableEnLigne: true } },
      select: { typeRdv: { select: selectionType } },
      orderBy: { typeRdv: { nom: 'asc' } },
    });
    const praticiens = await praticiensDuCentre(tx, centreId);
    const { horairesOuverture, ...identite } = centre;
    return {
      ...identite,
      horaires: horaires(horairesOuverture),
      types: types.map(({ typeRdv: t }) => ({
        id: t.id,
        nom: t.nom,
        dureeMinutes: t.dureeMinutes,
        requierePraticien: t.requierePraticien,
      })),
      praticiens: praticiens.map(({ id, nom }) => ({ id, nom })),
    };
  });
}

interface RechercheInterne {
  readonly centreId: string;
  readonly type: {
    readonly dureeMinutes: number;
    readonly requierePraticien: boolean;
    readonly requiereCabine: boolean;
  };
  readonly praticienId: string | null;
  readonly du: string;
  readonly au: string;
  readonly fenetre: FenetreReservation;
  readonly instant: Date;
  readonly exclure?: string;
}

/** Le moteur de l'agenda, nourri des rendez-vous et des verrous encore valides. */
async function creneauxLibres(tx: ClientTransaction, r: RechercheInterne): Promise<Creneau[]> {
  const { centreId, type, praticienId, du, au, fenetre, instant, exclure } = r;
  const { horairesOuverture } = await centreActif(tx, centreId);
  const tous = await praticiensDuCentre(tx, centreId);
  const praticiens = praticienId === null ? tous : tous.filter((p) => p.id === praticienId);
  if (praticienId !== null && praticiens.length === 0) {
    throw ErreurSaisie.surChamp('praticienId', 'Ce praticien n’exerce pas dans ce centre.');
  }
  const cabines = await tx.cabine.findMany({
    where: { centreId, actif: true },
    select: { id: true },
    orderBy: { nom: 'asc' },
  });
  const cabineIds = cabines.map((c) => c.id);
  const debut = bornesJourMs(du).debut;
  const fin = bornesJourMs(au).fin;
  const exceptions = await exceptionsDeLaPeriode(tx, debut, fin);
  const occupations = await occupationsDeLaPeriode(tx, {
    debut,
    fin,
    praticienIds: praticiens.map((p) => p.id),
    cabineIds,
    instant,
    ...(exclure ? { exclure } : {}),
  });
  return calculerCreneauxLibres({
    centreId,
    du,
    au,
    dureeMinutes: type.dureeMinutes,
    requierePraticien: type.requierePraticien,
    requiereCabine: type.requiereCabine,
    praticiens,
    cabines: cabineIds,
    horairesCentre: horairesOuverture,
    exceptions,
    occupations,
    pasAvant: fenetre.pasAvant,
    limite: CRENEAUX_MAX,
  });
}

function fenetreDe(
  parametres: { delaiMinimalMinutes: number; horizonJours: number },
  type: { delaiMinimalMinutes: number },
  maintenant: number,
): FenetreReservation {
  return fenetreReservation({
    maintenant,
    delaiCentreMinutes: parametres.delaiMinimalMinutes,
    delaiTypeMinutes: type.delaiMinimalMinutes,
    horizonJours: parametres.horizonJours,
  });
}

/** Sept jours à partir de `depuis`, ramenés dans la fenêtre. `null` : rien de réservable sur cette période. */
function joursDeLecture(
  depuis: string,
  fenetre: FenetreReservation,
): { readonly du: string; readonly au: string } | null {
  const premier = localDepuisInstant(fenetre.pasAvant).date;
  const du = depuis < premier ? premier : depuis;
  const dernier = ajouterJours(du, JOURS_PAR_LECTURE - 1);
  const au = dernier > fenetre.dernierJour ? fenetre.dernierJour : dernier;
  return du > au ? null : { du, au };
}

export interface LectureCreneaux {
  instants: InstantDisponible[];
  /** Jour suivant à demander, `null` en fin d'horizon. */
  suite: string | null;
}

function lecture(
  creneaux: readonly Creneau[],
  jours: { readonly au: string },
  fenetre: FenetreReservation,
): LectureCreneaux {
  return {
    instants: instantsDisponibles(creneaux),
    suite: jours.au < fenetre.dernierJour ? ajouterJours(jours.au, 1) : null,
  };
}

/** Créneaux libres d'un type, tous praticiens confondus ou pour celui demandé. */
export async function lireCreneaux(
  cible: CiblePublique,
  saisie: unknown,
  ip: string,
  options: Partial<Dependances> = {},
): Promise<LectureCreneaux> {
  const { typeRdvId, praticienId, depuis } = valider(lectureCreneauxSchema, saisie);
  const instant = instantDe(dependances(options).horloge);
  await limiter(`rdv:lecture:${ip}`, LIMITE_LECTURE_IP, instant);
  return enTransaction(cible, async (tx) => {
    const { centreId } = cible;
    const parametres = await parametresActifs(tx, centreId);
    const type = await typeReservable(tx, centreId, typeRdvId);
    const fenetre = fenetreDe(parametres, type, instant.getTime());
    const jours = joursDeLecture(depuis, fenetre);
    if (jours === null) {
      return { instants: [], suite: null };
    }
    const creneaux = await creneauxLibres(tx, {
      centreId,
      type,
      praticienId,
      ...jours,
      fenetre,
      instant,
    });
    return lecture(creneaux, jours, fenetre);
  });
}

/** Défi du captcha, remis au navigateur. */
export async function creerDefiCaptcha(options: Partial<Dependances> = {}): Promise<string> {
  return dependances(options).captcha.creerDefi();
}

// ---------------------------------------------------------------------------
// Verrou
// ---------------------------------------------------------------------------

export interface VerrouPose {
  /** Porté par le formulaire du navigateur, jamais par l'URL : les journaux d'accès en garderaient la trace. */
  jeton: string;
  expireLe: number;
}

/** Tirage au sort, pour ne pas remplir l'agenda du premier praticien dans l'ordre alphabétique. */
function tirer<T>(valeurs: readonly T[]): T | undefined {
  return valeurs.length === 0 ? undefined : valeurs[randomInt(valeurs.length)];
}

async function poserVerrou(
  cible: CiblePublique,
  choix: { typeRdvId: string; praticienId: string | null; debut: number },
  instant: Date,
): Promise<VerrouPose> {
  const { centreId } = cible;
  const { typeRdvId, praticienId, debut } = choix;
  const jeton = randomBytes(32).toString('base64url');
  const expireLe = new Date(instant.getTime() + DUREE_VERROU_MINUTES * MS_PAR_MINUTE);
  await enTransaction(cible, async (tx) => {
    const parametres = await parametresActifs(tx, centreId);
    const type = await typeReservable(tx, centreId, typeRdvId);
    const fenetre = fenetreDe(parametres, type, instant.getTime());
    if (!estDansLaFenetre(debut, fenetre)) {
      throw new ErreurCreneauIndisponible();
    }
    const fin = debut + type.dureeMinutes * MS_PAR_MINUTE;
    // Instruction à part, avant l'insertion : un prédicat d'exclusion ne sait pas lire l'heure, et un verrou
    // expiré bloquerait sinon le créneau. Un concurrent attend cette suppression, puis perd sur l'exclusion.
    await tx.reservationEnLigne.deleteMany({
      where: {
        statut: 'VERROU',
        expireLe: { lte: instant },
        debut: { lt: new Date(fin) },
        fin: { gt: new Date(debut) },
      },
    });
    const { date } = localDepuisInstant(debut);
    const creneaux = await creneauxLibres(tx, {
      centreId,
      type,
      praticienId,
      du: date,
      au: date,
      fenetre,
      instant,
    });
    const retenu = tirer(creneaux.filter((c) => c.debut === debut));
    if (retenu === undefined) {
      throw new ErreurCreneauIndisponible();
    }
    await tx.reservationEnLigne.create({
      data: {
        centreId,
        typeRdvId,
        praticienId: retenu.praticienId,
        cabineId: retenu.cabineId,
        debut: new Date(debut),
        fin: new Date(fin),
        expireLe,
        jetonEmpreinte: empreinteJeton(jeton),
        // Sert à juger le délai à la finalisation : l'horloge du service, pas celle de la base.
        createdAt: instant,
      },
    });
    // Nouvelle instruction, nouvel instantané : un rendez-vous validé entre la lecture et l'insertion se voit ici.
    const ressources = [
      ...(retenu.praticienId ? [{ praticienId: retenu.praticienId }] : []),
      ...(retenu.cabineId ? [{ cabineId: retenu.cabineId }] : []),
    ];
    const pris = await tx.rendezVous.count({
      where: {
        debut: { lt: new Date(fin) },
        fin: { gt: new Date(debut) },
        statut: { in: STATUTS_OCCUPANTS },
        OR: ressources,
      },
    });
    if (pris > 0) {
      throw new ErreurCreneauIndisponible();
    }
  });
  return { jeton, expireLe: expireLe.getTime() };
}

/** Tient un créneau pendant la saisie. Pour « peu importe », retente sur un praticien encore libre. */
export async function verrouillerCreneau(
  cible: CiblePublique,
  saisie: unknown,
  ip: string,
  options: Partial<Dependances> = {},
): Promise<VerrouPose> {
  const { typeRdvId, praticienId, debut, captcha } = valider(choixCreneauSchema, saisie);
  const deps = dependances(options);
  const instant = instantDe(deps.horloge);
  await limiter(`rdv:verrou:${ip}`, LIMITE_VERROU_IP, instant);
  const inedite = await enregistrerTentative(
    `rdv:captcha:${empreinteCaptcha(captcha)}`,
    LIMITE_REJEU_CAPTCHA,
    instant.getTime(),
  );
  if (!inedite || !(await deps.captcha.verifier(captcha))) {
    throw ErreurSaisie.surChamp('captcha', 'La vérification anti-robot a échoué. Réessayez.');
  }
  const essais = praticienId === null ? ESSAIS_VERROU : 1;
  for (let essai = 1; ; essai += 1) {
    try {
      return await poserVerrou(cible, { typeRdvId, praticienId, debut }, instant);
    } catch (erreur) {
      const perdu = ressourcePerdue(erreur) !== null || erreur instanceof ErreurCreneauIndisponible;
      if (!perdu) {
        throw erreur;
      }
      if (essai >= essais) {
        throw new ErreurCreneauIndisponible();
      }
    }
  }
}

/** Le patient change d'avis : son créneau redevient libre sans attendre l'expiration. */
export async function libererVerrou(cible: CiblePublique, jeton: string): Promise<void> {
  await base(cible).reservationEnLigne.deleteMany({
    where: { jetonEmpreinte: empreinteJeton(jeton), statut: 'VERROU' },
  });
}

// ---------------------------------------------------------------------------
// Vérification du téléphone
// ---------------------------------------------------------------------------

function genererCode(): string {
  return String(randomInt(10 ** LONGUEUR_CODE_SMS)).padStart(LONGUEUR_CODE_SMS, '0');
}

/** Masque un numéro à l'affichage : `+33612345678` → `06 •• •• •• 78`. */
function telephoneMasque(telephone: string): string {
  return `0${telephone.slice(3, 4)} •• •• •• ${telephone.slice(-2)}`;
}

export interface CodeEnvoye {
  telephone: string;
  expireLe: number;
}

/** Enregistre les coordonnées et envoie le code. Un renvoi repart de zéro, dans la limite des envois. */
export async function demanderCode(
  cible: CiblePublique,
  jeton: string,
  saisie: unknown,
  ip: string,
  options: Partial<Dependances> = {},
): Promise<CodeEnvoye> {
  const d = valider(coordonneesReservationSchema, saisie);
  const deps = dependances(options);
  const instant = instantDe(deps.horloge);
  await limiter(`rdv:code:${ip}`, LIMITE_CODE_IP, instant);
  await limiter(`rdv:code:${empreinteTelephone(d.telephone)}`, LIMITE_CODE_TELEPHONE, instant);
  const client = base(cible);
  const reservation = await client.reservationEnLigne.findFirst({
    where: {
      jetonEmpreinte: empreinteJeton(jeton),
      statut: 'VERROU',
      expireLe: { gt: instant },
    },
    select: { id: true, expireLe: true },
  });
  if (!reservation) {
    throw new ErreurParcoursExpire();
  }
  const code = genererCode();
  const codeExpireLe = new Date(instant.getTime() + VALIDITE_CODE_MINUTES * MS_PAR_MINUTE);
  // Le créneau tient au moins le temps de saisir le code ; le nombre d'envois borne l'allongement.
  const expireLe = reservation.expireLe < codeExpireLe ? codeExpireLe : reservation.expireLe;
  const { count } = await client.reservationEnLigne.updateMany({
    where: {
      id: reservation.id,
      statut: 'VERROU',
      expireLe: { gt: instant },
      codeEnvois: { lt: ENVOIS_CODE_MAX },
    },
    data: {
      nom: d.nom,
      prenom: d.prenom,
      dateNaissance: new Date(`${d.dateNaissance}T00:00:00.000Z`),
      telephone: d.telephone,
      email: d.email,
      motif: d.motif,
      consentementRgpdLe: instant,
      consentementSmsLe: d.consentementSms ? instant : null,
      versionConsentement: VERSION_CONSENTEMENT,
      codeEmpreinte: empreinteCode(reservation.id, code),
      codeExpireLe,
      codeTentatives: 0,
      codeEnvois: { increment: 1 },
      expireLe,
    },
  });
  if (count !== 1) {
    throw new ErreurSaisie({}, 'Trop de codes demandés pour cette réservation.');
  }
  try {
    await deps.notifier.envoyerSms({ destinataire: d.telephone, texte: messageCodeSms(code) });
  } catch {
    throw new ErreurSaisie({}, 'Le SMS n’a pas pu partir. Réessayez dans un instant.');
  }
  return { telephone: telephoneMasque(d.telephone), expireLe: expireLe.getTime() };
}

// ---------------------------------------------------------------------------
// Finalisation
// ---------------------------------------------------------------------------

export interface ConfirmationReservation {
  date: string;
  heure: string;
  /** Le centre valide à la main : le patient l'apprend avant de partir. */
  aValider: boolean;
}

function confirmation(rdv: { debut: Date; statut: string }): ConfirmationReservation {
  return { ...localDepuisInstant(rdv.debut.getTime()), aValider: rdv.statut === 'PLANIFIE' };
}

interface VerrouAFinaliser {
  readonly id: string;
  readonly centreId: string;
  readonly typeRdvId: string;
  readonly praticienId: string | null;
  readonly cabineId: string | null;
  readonly debut: Date;
  readonly fin: Date;
  readonly createdAt: Date;
  readonly nom: string | null;
  readonly prenom: string | null;
  readonly dateNaissance: Date | null;
  readonly telephone: string | null;
  readonly motif: string | null;
  readonly consentementSmsLe: Date | null;
}

async function rapprocher(tx: ClientTransaction, r: VerrouAFinaliser): Promise<string | null> {
  const { dateNaissance } = r;
  if (dateNaissance === null) {
    return null;
  }
  const nom = normaliserPourRecherche(r.nom ?? '');
  const fiches = await tx.patient.findMany({
    where: {
      dateNaissance,
      fusionneDansId: null,
      OR: [{ nomNaissanceRecherche: nom }, { nomUsageRecherche: nom }],
    },
    select: {
      id: true,
      nomNaissance: true,
      nomUsage: true,
      prenoms: true,
      dateNaissance: true,
      telephone: true,
    },
  });
  return rapprocherPatient(
    fiches.map((f) => ({ ...f, dateNaissance: f.dateNaissance.toISOString().slice(0, 10) })),
    {
      nom: r.nom ?? '',
      prenom: r.prenom ?? '',
      dateNaissance: dateNaissance.toISOString().slice(0, 10),
      telephone: r.telephone ?? '',
    },
  );
}

/** Reporte sur la fiche l'accord donné en réservant, seule écriture du parcours public sur un dossier. */
async function reporterConsentement(
  tx: ClientTransaction,
  patientId: string,
  centreId: string,
): Promise<EvenementAudit | null> {
  const { count } = await tx.patient.updateMany({
    where: { id: patientId, consentementSms: false },
    data: { consentementSms: true },
  });
  return count === 0
    ? null
    : {
        action: 'UPDATE',
        entiteType: 'PATIENT',
        entiteId: patientId,
        patientId,
        centreId,
        champs: differencesAuditees(
          'PATIENT',
          { consentementSms: false },
          { consentementSms: true },
        ),
      };
}

const selectionVerrou = {
  id: true,
  centreId: true,
  typeRdvId: true,
  praticienId: true,
  cabineId: true,
  debut: true,
  fin: true,
  createdAt: true,
  nom: true,
  prenom: true,
  dateNaissance: true,
  telephone: true,
  motif: true,
  consentementSmsLe: true,
} as const;

async function creerRendezVous(
  tx: ClientTransaction,
  cible: CiblePublique,
  r: VerrouAFinaliser,
  instant: Date,
): Promise<ConfirmationReservation> {
  const parametres = await parametresActifs(tx, r.centreId);
  const type = await typeReservable(tx, r.centreId, r.typeRdvId);
  const debut = r.debut.getTime();
  const fin = r.fin.getTime();
  // Le délai se juge au moment du choix : le temps de saisir son code ne doit pas faire perdre le créneau.
  if (!estDansLaFenetre(debut, fenetreDe(parametres, type, r.createdAt.getTime()))) {
    throw new ErreurCreneauIndisponible();
  }
  // Une fermeture ou un congé posé depuis le verrou ne se voit pas dans les contraintes d'exclusion.
  const candidat = { centreId: r.centreId, praticienId: r.praticienId, debut, fin };
  const contexte = await contexteDuCreneau(tx, { ...candidat, exclureVerrou: r.id, instant });
  const souhaitee =
    r.cabineId !== null && contexte.cabines.includes(r.cabineId) ? r.cabineId : null;
  const cabineId = choisirCabine(candidat, souhaitee, type.requiereCabine, contexte);
  verifierConflits({ ...candidat, cabineId }, contexte, false);

  const patientId = await rapprocher(tx, r);
  const rdv = await tx.rendezVous.create({
    data: {
      centreId: r.centreId,
      typeRdvId: r.typeRdvId,
      patientId,
      prospectNom: patientId === null ? `${r.nom ?? ''} ${r.prenom ?? ''}`.trim() : null,
      prospectTelephone: patientId === null ? r.telephone : null,
      praticienId: r.praticienId,
      cabineId,
      debut: r.debut,
      fin: r.fin,
      statut: statutReservationEnLigne(parametres.validation),
      origine: 'EN_LIGNE',
      notes: r.motif === null ? null : `Motif saisi en ligne : ${r.motif}`,
      createdById: null,
    },
    select: selectionEcriture,
  });
  await publierEvenement(tx, { type: 'RDV_CREE', charge: charge(rdv) }, instant);
  const consentement =
    patientId !== null && r.consentementSmsLe !== null
      ? await reporterConsentement(tx, patientId, r.centreId)
      : null;
  await tx.reservationEnLigne.update({
    where: { id: r.id },
    data: {
      statut: 'FINALISEE',
      rendezVousId: rdv.id,
      motif: null,
      codeEmpreinte: null,
      // Fiche retrouvée : l'identité saisie n'a plus d'usage. Un prospect la garde jusqu'à son arrivée.
      ...(patientId === null ? {} : { nom: null, prenom: null, dateNaissance: null }),
    },
  });
  const gabarit = parametres.validation === 'MANUELLE' ? 'RDV_DEMANDE_RECUE' : 'RDV_CONFIRME';
  await notifierPatientEnLigne(tx, rdv, gabarit, rdv.version);
  await journaliser(tx, auteurEnLigne(cible.organisationId), [
    evenementRdv(rdv, null),
    ...(consentement ? [consentement] : []),
  ]);
  return confirmation(rdv);
}

/** Renvoie la confirmation déjà acquise : un double envoi du formulaire ne doit rien créer ni rien refuser. */
async function dejaFinalisee(
  cible: CiblePublique,
  reservationId: string,
): Promise<ConfirmationReservation | null> {
  const ligne = await base(cible).reservationEnLigne.findFirst({
    where: { id: reservationId, statut: 'FINALISEE' },
    select: { rendezVous: { select: { debut: true, statut: true } } },
  });
  return ligne?.rendezVous ? confirmation(ligne.rendezVous) : null;
}

async function finaliser(
  cible: CiblePublique,
  reservationId: string,
  instant: Date,
): Promise<ConfirmationReservation> {
  try {
    const resultat = await enTransaction(cible, async (tx) => {
      // Porte d'entrée : ce verrou de ligne fait attendre un double envoi jusqu'à la fin de cette transaction.
      const { count } = await tx.reservationEnLigne.updateMany({
        where: { id: reservationId, statut: 'VERROU', expireLe: { gt: instant } },
        data: { updatedAt: instant },
      });
      if (count !== 1) {
        return null;
      }
      const r = await tx.reservationEnLigne.findUniqueOrThrow({
        where: { id: reservationId },
        select: selectionVerrou,
      });
      return creerRendezVous(tx, cible, r, instant);
    });
    if (resultat !== null) {
      return resultat;
    }
    const acquise = await dejaFinalisee(cible, reservationId);
    if (acquise !== null) {
      return acquise;
    }
    throw new ErreurParcoursExpire();
  } catch (erreur) {
    const perdu =
      ressourcePerdue(erreur) !== null ||
      erreur instanceof AccesRefuseError ||
      (erreur instanceof ErreurSaisie && !(erreur instanceof ErreurParcoursExpire));
    if (!perdu) {
      throw erreur;
    }
    // La transaction a été annulée, le verrou tient toujours : le créneau n'est plus à ce patient.
    await base(cible).reservationEnLigne.deleteMany({
      where: { id: reservationId, statut: 'VERROU' },
    });
    throw new ErreurCreneauIndisponible();
  }
}

/** Vérifie le code et, s'il est bon, crée le rendez-vous. Sa réponse ne dit pas si une fiche a été retrouvée. */
export async function validerCode(
  cible: CiblePublique,
  jeton: string,
  saisie: unknown,
  ip: string,
  options: Partial<Dependances> = {},
): Promise<ConfirmationReservation> {
  const code = valider(codeSmsSchema, saisie);
  const instant = instantDe(dependances(options).horloge);
  await limiter(`rdv:verification:${ip}`, LIMITE_VERIFICATION_IP, instant);
  const client = base(cible);
  const reservation = await client.reservationEnLigne.findFirst({
    where: { jetonEmpreinte: empreinteJeton(jeton) },
    select: { id: true, statut: true, codeEmpreinte: true, codeExpireLe: true },
  });
  if (!reservation) {
    throw new ErreurParcoursExpire();
  }
  if (reservation.statut === 'FINALISEE') {
    const acquise = await dejaFinalisee(cible, reservation.id);
    if (acquise !== null) {
      return acquise;
    }
    throw new ErreurParcoursExpire();
  }
  // Compté et validé avant de juger le code : ni une erreur ni des essais parallèles ne l'effacent.
  const { count } = await client.reservationEnLigne.updateMany({
    where: {
      id: reservation.id,
      statut: 'VERROU',
      expireLe: { gt: instant },
      codeTentatives: { lt: TENTATIVES_CODE_MAX },
    },
    data: { codeTentatives: { increment: 1 } },
  });
  if (count !== 1) {
    await client.reservationEnLigne.deleteMany({
      where: { id: reservation.id, statut: 'VERROU' },
    });
    throw new ErreurParcoursExpire();
  }
  const valide =
    reservation.codeEmpreinte !== null &&
    reservation.codeExpireLe !== null &&
    reservation.codeExpireLe > instant &&
    empreintesEgales(reservation.codeEmpreinte, empreinteCode(reservation.id, code));
  if (!valide) {
    throw ErreurSaisie.surChamp('code', 'Code incorrect.');
  }
  return finaliser(cible, reservation.id, instant);
}

// ---------------------------------------------------------------------------
// Lien du patient
// ---------------------------------------------------------------------------

const selectionLien = {
  id: true,
  typeRdvId: true,
  centre: {
    select: {
      nom: true,
      adresseLigne1: true,
      adresseLigne2: true,
      codePostal: true,
      ville: true,
      telephone: true,
    },
  },
  rendezVous: { select: selectionEcriture },
} as const;

/** La signature d'abord : `base()` garde une instance par client, un jeton forgé n'en crée pas. */
async function cibleDuLien(jeton: string) {
  const cible = signatureLien().lire(jeton);
  if (cible === null) {
    throw new AccesRefuseError();
  }
  const organisation = await clientPlateforme().organisation.findUnique({
    where: { id: cible.organisationId },
    select: { statut: true },
  });
  if (!organisation || !clientPeutSeConnecter(organisation.statut)) {
    throw new AccesRefuseError();
  }
  return cible;
}

async function reservationDuLien(tx: ClientTransaction, reservationId: string) {
  const reservation = await tx.reservationEnLigne.findFirst({
    where: { id: reservationId, statut: 'FINALISEE' },
    select: selectionLien,
  });
  if (!reservation?.rendezVous) {
    throw new AccesRefuseError();
  }
  return { ...reservation, rendezVous: reservation.rendezVous };
}

export interface EtatLien {
  date: string;
  heure: string;
  statut: string;
  centre: {
    nom: string;
    adresseLigne1: string;
    adresseLigne2: string | null;
    codePostal: string;
    ville: string;
    telephone: string;
  };
  modifiable: boolean;
  /** Le déplacement suppose que le centre réserve encore en ligne ; l'annulation, non. */
  deplacable: boolean;
  delaiModificationHeures: number;
}

/** Ce que voit le porteur du lien : ni nom, ni type de rendez-vous. Un lien transféré ne dévoile rien. */
export async function lireLien(
  jeton: string,
  ip: string,
  options: Partial<Dependances> = {},
): Promise<EtatLien> {
  const instant = instantDe(dependances(options).horloge);
  const cible = await cibleDuLien(jeton);
  await limiter(`rdv:lien:${ip}`, LIMITE_LIEN_IP, instant);
  return enTransaction(cible, async (tx) => {
    const { rendezVous: rdv, centre } = await reservationDuLien(tx, cible.reservationId);
    const parametres = await tx.parametresReservation.findUnique({
      where: { centreId: rdv.centreId },
    });
    const modifiable = peutModifierEnLigne({
      statut: rdv.statut,
      debut: rdv.debut.getTime(),
      maintenant: instant.getTime(),
      delaiModificationHeures: parametres?.delaiModificationHeures ?? 0,
    });
    return {
      ...localDepuisInstant(rdv.debut.getTime()),
      statut: rdv.statut,
      centre,
      modifiable,
      deplacable: modifiable && parametres?.actif === true,
      delaiModificationHeures: parametres?.delaiModificationHeures ?? 0,
    };
  });
}

function refusModification(): ErreurSaisie {
  return new ErreurSaisie(
    {},
    'Ce rendez-vous ne peut plus être modifié en ligne. Contactez le centre.',
  );
}

/** Annule par le lien, dans la limite fixée par le centre. */
export async function annulerParLien(
  jeton: string,
  ip: string,
  options: Partial<Dependances> = {},
): Promise<void> {
  const instant = instantDe(dependances(options).horloge);
  const cible = await cibleDuLien(jeton);
  await limiter(`rdv:lien:${ip}`, LIMITE_LIEN_IP, instant);
  await enTransaction(cible, async (tx) => {
    const { rendezVous: rdv } = await reservationDuLien(tx, cible.reservationId);
    const parametres = await tx.parametresReservation.findUnique({
      where: { centreId: rdv.centreId },
    });
    const modifiable = peutModifierEnLigne({
      statut: rdv.statut,
      debut: rdv.debut.getTime(),
      maintenant: instant.getTime(),
      delaiModificationHeures: parametres?.delaiModificationHeures ?? 0,
    });
    if (!modifiable) {
      throw refusModification();
    }
    const apres = await appliquerAnnulation(tx, rdv, rdv.version, instant);
    await notifierPatientEnLigne(tx, rdv, 'RDV_ANNULE', rdv.version + 1);
    await journaliser(tx, auteurEnLigne(cible.organisationId), evenementRdv(apres, rdv));
  });
}

/** Créneaux proposés pour déplacer ce rendez-vous : même type, même centre. */
export async function lireCreneauxDuLien(
  jeton: string,
  depuis: string,
  ip: string,
  options: Partial<Dependances> = {},
): Promise<LectureCreneaux> {
  const instant = instantDe(dependances(options).horloge);
  const cible = await cibleDuLien(jeton);
  await limiter(`rdv:lecture:${ip}`, LIMITE_LECTURE_IP, instant);
  return enTransaction(cible, async (tx) => {
    const { rendezVous: rdv } = await reservationDuLien(tx, cible.reservationId);
    const parametres = await parametresActifs(tx, rdv.centreId);
    const type = await typeReservable(tx, rdv.centreId, rdv.typeRdvId);
    const fenetre = fenetreDe(parametres, type, instant.getTime());
    const jours = joursDeLecture(depuis, fenetre);
    if (jours === null) {
      return { instants: [], suite: null };
    }
    const creneaux = await creneauxLibres(tx, {
      centreId: rdv.centreId,
      type,
      praticienId: null,
      ...jours,
      fenetre,
      instant,
      exclure: rdv.id,
    });
    return lecture(creneaux, jours, fenetre);
  });
}

function gabaritDeplacement(validation: ValidationReservation) {
  return validation === 'MANUELLE' ? 'RDV_DEMANDE_RECUE' : 'RDV_DEPLACE';
}

/** Déplace par le lien. Les mêmes règles qu'à la réservation : verrous, disponibilités, délai, horizon. */
export async function deplacerParLien(
  jeton: string,
  saisie: unknown,
  ip: string,
  options: Partial<Dependances> = {},
): Promise<ConfirmationReservation> {
  const { debut, praticienId } = valider(deplacementEnLigneSchema, saisie);
  const instant = instantDe(dependances(options).horloge);
  const cible = await cibleDuLien(jeton);
  await limiter(`rdv:lien:${ip}`, LIMITE_LIEN_IP, instant);
  try {
    return await enTransaction(cible, async (tx) => {
      const { rendezVous: rdv } = await reservationDuLien(tx, cible.reservationId);
      const parametres = await parametresActifs(tx, rdv.centreId);
      const modifiable = peutModifierEnLigne({
        statut: rdv.statut,
        debut: rdv.debut.getTime(),
        maintenant: instant.getTime(),
        delaiModificationHeures: parametres.delaiModificationHeures,
      });
      if (!modifiable) {
        throw refusModification();
      }
      const type = await typeReservable(tx, rdv.centreId, rdv.typeRdvId);
      const fenetre = fenetreDe(parametres, type, instant.getTime());
      if (!estDansLaFenetre(debut, fenetre)) {
        throw new ErreurCreneauIndisponible();
      }
      const { date } = localDepuisInstant(debut);
      const creneaux = await creneauxLibres(tx, {
        centreId: rdv.centreId,
        type,
        praticienId,
        du: date,
        au: date,
        fenetre,
        instant,
        exclure: rdv.id,
      });
      const possibles = creneaux.filter((c) => c.debut === debut);
      const retenu = possibles.find((c) => c.praticienId === rdv.praticienId) ?? tirer(possibles);
      if (retenu === undefined) {
        throw new ErreurCreneauIndisponible();
      }
      const statut = statutApresDeplacementEnLigne(rdv.statut, parametres.validation);
      const { apres } = await appliquerDeplacement(tx, rdv, {
        version: rdv.version,
        praticienId: retenu.praticienId,
        debut,
        fin: debut + type.dureeMinutes * MS_PAR_MINUTE,
        confirmer: false,
        statut,
        instant,
      });
      await notifierPatientEnLigne(
        tx,
        apres,
        gabaritDeplacement(parametres.validation),
        rdv.version + 1,
      );
      await journaliser(tx, auteurEnLigne(cible.organisationId), evenementRdv(apres, rdv));
      return confirmation(apres);
    });
  } catch (erreur) {
    if (ressourcePerdue(erreur) !== null || erreur instanceof ErreurConflitAgenda) {
      throw new ErreurCreneauIndisponible();
    }
    throw erreur;
  }
}
