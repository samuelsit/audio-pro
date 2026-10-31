import { SystemClock } from '@ha/adapters';
import type { Prisma } from '@ha/db';
import {
  ajouterJours,
  arriveeProspectSchema,
  bornesJourMs,
  calculerCreneauxLibres,
  changementStatutRdvSchema,
  contient,
  deplacementRdvSchema,
  detecterConflits,
  differencesAuditees,
  estBloquant,
  estDeplacable,
  etapeSalleAttente,
  instantDeDepose,
  instantSaisi,
  localDepuisInstant,
  normaliserPourRecherche,
  peutAccederAuCentre,
  peutPasserA,
  plagesCabine,
  plagesPraticien,
  rdvSaisieSchema,
  rechercheCreneauxSchema,
  versionRdvSchema,
  type Candidat,
  type Clock,
  type CodeConflit,
  type ContexteConflits,
  type Creneau,
  type EtapeSalleAttente,
  type EvenementAgenda,
  type Intervalle,
  type OrigineRdv,
  type StatutRdv,
} from '@ha/domain';
import { z } from 'zod';

import { AccesRefuseError, verifierAccesCentre, type UtilisateurConnecte } from '../auth/acces';
import { withAudit, type EvenementAudit } from '../audit/journal';
import { base, type ClientTransaction } from '../chiffrement';
import { ErreurConflitAgenda, ErreurSaisie, ressourcePerdue, valider } from '../erreurs';
import { publierEvenement } from '../evenements';
import { centreActif, exceptionsDeLaPeriode, horaires, STATUTS_OCCUPANTS } from './agenda-socle';
import {
  ecrirePatient,
  evenementCreation,
  preparerCreation,
  type PreparationPatient,
} from './patients';

const MS_PAR_MINUTE = 60_000;

/** Fenêtre de la recherche du prochain créneau. */
const HORIZON_RECHERCHE_JOURS = 60;
const CRENEAUX_PROPOSES = 20;

const LONGUEUR_MIN_RECHERCHE = 2;
const PATIENTS_PROPOSES = 8;

const horloge: Clock = new SystemClock();

function maintenant(): Date {
  return new Date(horloge.now());
}

/** Le rendez-vous a changé depuis son affichage : on ne l'écrase pas. */
export class ErreurRdvModifie extends ErreurSaisie {
  constructor() {
    super({}, 'Ce rendez-vous vient d’être modifié. Actualisez la page.');
    this.name = 'ErreurRdvModifie';
  }
}

/** Traduit le verdict de la contrainte d'exclusion, dernier rempart après `detecterConflits`. */
async function sousExclusion<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (erreur) {
    const perdue = ressourcePerdue(erreur);
    if (perdue !== null) {
      throw new ErreurConflitAgenda([perdue]);
    }
    throw erreur;
  }
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

const selectionGrille = {
  id: true,
  version: true,
  centreId: true,
  praticienId: true,
  cabineId: true,
  debut: true,
  fin: true,
  statut: true,
  origine: true,
  prospectNom: true,
  prospectTelephone: true,
  priseEnChargeLe: true,
  typeRdv: { select: { nom: true, couleur: true } },
  cabine: { select: { nom: true } },
  patient: {
    select: { id: true, nomNaissance: true, nomUsage: true, prenoms: true, telephone: true },
  },
} as const;

type LigneGrille = Prisma.RendezVousGetPayload<{ select: typeof selectionGrille }>;

/** Ce que voit la grille : ni notes ni dossier, une liste n'ouvre aucune fiche (ADR-006, ADR-020). */
export interface RdvGrille {
  id: string;
  version: number;
  praticienId: string | null;
  cabineId: string | null;
  cabine: string | null;
  debut: number;
  fin: number;
  statut: StatutRdv;
  origine: OrigineRdv;
  type: string;
  couleur: string;
  /** Nom du patient ou du prospect. */
  nom: string;
  telephone: string | null;
  patientId: string | null;
  /** Le lien vers la fiche reste soumis aux droits : patient rattaché à un autre centre, pas de lien. */
  ficheAccessible: boolean;
  priseEnCharge: boolean;
}

function nomPatient(p: {
  readonly nomNaissance: string;
  readonly nomUsage: string | null;
  readonly prenoms: string;
}): string {
  return `${p.nomUsage ?? p.nomNaissance} ${p.prenoms}`;
}

function versRdvGrille(
  acteur: UtilisateurConnecte,
  ligne: LigneGrille,
  centrePatient: ReadonlyMap<string, string>,
): RdvGrille {
  const { patient } = ligne;
  const centre = patient ? centrePatient.get(patient.id) : undefined;
  return {
    id: ligne.id,
    version: ligne.version,
    praticienId: ligne.praticienId,
    cabineId: ligne.cabineId,
    cabine: ligne.cabine?.nom ?? null,
    debut: ligne.debut.getTime(),
    fin: ligne.fin.getTime(),
    statut: ligne.statut,
    origine: ligne.origine,
    type: ligne.typeRdv.nom,
    couleur: ligne.typeRdv.couleur,
    nom: patient ? nomPatient(patient) : (ligne.prospectNom ?? ''),
    telephone: patient ? patient.telephone : ligne.prospectTelephone,
    patientId: patient?.id ?? null,
    ficheAccessible: centre !== undefined && peutAccederAuCentre(acteur, centre),
    priseEnCharge: ligne.priseEnChargeLe !== null,
  };
}

async function versRdvsGrille(
  acteur: UtilisateurConnecte,
  lignes: readonly LigneGrille[],
): Promise<RdvGrille[]> {
  const patientIds = lignes.flatMap((l) => (l.patient ? [l.patient.id] : []));
  const patients = await base(acteur).patient.findMany({
    where: { id: { in: [...new Set(patientIds)] } },
    select: { id: true, centreId: true },
  });
  const centrePatient = new Map(patients.map((p) => [p.id, p.centreId]));
  return lignes.map((ligne) => versRdvGrille(acteur, ligne, centrePatient));
}

export interface ColonnePraticien {
  id: string;
  nom: string;
}

export interface AgendaPeriode {
  rdv: RdvGrille[];
  praticiens: ColonnePraticien[];
  cabines: { id: string; nom: string }[];
  /** Plages disponibles par praticien et par date (`praticienId:date`), pour griser le reste. */
  plages: Record<string, Intervalle[]>;
  /** Ouverture du centre par date. */
  ouverture: Record<string, Intervalle[]>;
  /** Praticiens de ce centre occupés ailleurs : sans identité, ces patients sont hors du périmètre. */
  occupationsAilleurs: { praticienId: string; debut: number; fin: number }[];
}

function datesDe(du: string, au: string): string[] {
  const dates = [du];
  while (dates.at(-1) !== au) {
    dates.push(ajouterJours(dates.at(-1) ?? du, 1));
  }
  return dates;
}

async function praticiensDuCentre(acteur: UtilisateurConnecte, centreId: string) {
  const lignes = await base(acteur).praticienCentre.findMany({
    where: { centreId, praticien: { utilisateur: { actif: true } } },
    select: {
      praticienId: true,
      horaires: true,
      praticien: { select: { utilisateur: { select: { prenom: true, nom: true } } } },
    },
  });
  return lignes
    .map(({ praticienId, horaires: valeur, praticien }) => ({
      id: praticienId,
      nom: `${praticien.utilisateur.prenom} ${praticien.utilisateur.nom}`,
      horaires: horaires(valeur),
    }))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

/** Agenda d'un centre sur une période de dates (bornes incluses). L'agenda est toujours par centre. */
export async function lireAgenda(
  acteur: UtilisateurConnecte,
  centreId: string,
  du: string,
  au: string,
): Promise<AgendaPeriode> {
  verifierAccesCentre(acteur, centreId);
  const client = base(acteur);
  const { horairesOuverture } = await centreActif(client, centreId);
  const debut = new Date(bornesJourMs(du).debut);
  const fin = new Date(bornesJourMs(au).fin);
  const praticiens = await praticiensDuCentre(acteur, centreId);
  const [lignes, cabines, exceptions, ailleurs] = await Promise.all([
    client.rendezVous.findMany({
      where: { centreId, debut: { lt: fin }, fin: { gt: debut }, statut: { not: 'ANNULE' } },
      select: selectionGrille,
      orderBy: { debut: 'asc' },
    }),
    client.cabine.findMany({
      where: { centreId, actif: true },
      select: { id: true, nom: true },
      orderBy: { nom: 'asc' },
    }),
    exceptionsDeLaPeriode(client, debut.getTime(), fin.getTime()),
    client.rendezVous.findMany({
      where: {
        centreId: { not: centreId },
        praticienId: { in: praticiens.map((p) => p.id) },
        debut: { lt: fin },
        fin: { gt: debut },
        statut: { in: STATUTS_OCCUPANTS },
      },
      select: { praticienId: true, debut: true, fin: true },
    }),
  ]);
  const dates = datesDe(du, au);
  const plages: Record<string, Intervalle[]> = {};
  for (const praticien of praticiens) {
    for (const date of dates) {
      plages[`${praticien.id}:${date}`] = plagesPraticien({
        date,
        centreId,
        praticienId: praticien.id,
        horaires: praticien.horaires,
        exceptions,
      });
    }
  }
  return {
    rdv: await versRdvsGrille(acteur, lignes),
    praticiens: praticiens.map(({ id, nom }) => ({ id, nom })),
    cabines,
    plages,
    ouverture: Object.fromEntries(
      dates.map((date) => [
        date,
        plagesCabine({
          date,
          centreId,
          cabineId: '',
          horairesCentre: horairesOuverture,
          exceptions,
        }),
      ]),
    ),
    occupationsAilleurs: ailleurs.flatMap(({ praticienId, debut: d, fin: f }) =>
      praticienId === null ? [] : [{ praticienId, debut: d.getTime(), fin: f.getTime() }],
    ),
  };
}

export interface RdvDetail extends RdvGrille {
  centreId: string;
  typeRdvId: string;
  notes: string | null;
  dossierId: string | null;
  prospectNom: string | null;
  prospectTelephone: string | null;
  arriveLe: number | null;
}

function selectionDetail() {
  return { ...selectionGrille, typeRdvId: true, notes: true, dossierId: true, arriveLe: true };
}

/** Ouvre un rendez-vous : ses notes peuvent porter des données de santé, d'où une ligne READ. */
export async function lireRdv(acteur: UtilisateurConnecte, id: string): Promise<RdvDetail> {
  const ligne = await withAudit(
    acteur,
    async (tx) => {
      const rdv = await tx.rendezVous.findFirst({ where: { id }, select: selectionDetail() });
      if (!rdv) {
        throw new AccesRefuseError();
      }
      verifierAccesCentre(acteur, rdv.centreId);
      return rdv;
    },
    (rdv): EvenementAudit => ({
      action: 'READ',
      entiteType: 'RENDEZ_VOUS',
      entiteId: rdv.id,
      patientId: rdv.patient?.id ?? null,
      centreId: rdv.centreId,
    }),
  );
  const [grille] = await versRdvsGrille(acteur, [ligne]);
  return {
    ...(grille as RdvGrille),
    centreId: ligne.centreId,
    typeRdvId: ligne.typeRdvId,
    notes: ligne.notes,
    dossierId: ligne.dossierId,
    prospectNom: ligne.prospectNom,
    prospectTelephone: ligne.prospectTelephone,
    arriveLe: ligne.arriveLe?.getTime() ?? null,
  };
}

export interface RdvPatient {
  id: string;
  debut: number;
  fin: number;
  statut: StatutRdv;
  type: string;
  centre: string;
  praticien: string | null;
}

/** Rendez-vous d'un patient, vus depuis sa fiche, à la manière des dossiers : l'ouverture écrit le READ. */
export async function listerRdvDuPatient(
  acteur: UtilisateurConnecte,
  patientId: string,
): Promise<RdvPatient[]> {
  const lignes = await base(acteur).rendezVous.findMany({
    where: {
      patientId,
      ...(acteur.role === 'ADMIN_CLIENT' ? {} : { centreId: { in: [...acteur.centreIds] } }),
    },
    select: {
      id: true,
      debut: true,
      fin: true,
      statut: true,
      typeRdv: { select: { nom: true } },
      centre: { select: { nom: true } },
      praticien: { select: { utilisateur: { select: { prenom: true, nom: true } } } },
    },
    orderBy: { debut: 'desc' },
  });
  return lignes.map(({ typeRdv, centre, praticien, debut, fin, ...reste }) => ({
    ...reste,
    debut: debut.getTime(),
    fin: fin.getTime(),
    type: typeRdv.nom,
    centre: centre.nom,
    praticien: praticien && `${praticien.utilisateur.prenom} ${praticien.utilisateur.nom}`,
  }));
}

export interface PatientPropose {
  id: string;
  nom: string;
  dateNaissance: string;
  telephone: string | null;
}

/** Recherche de patient pour un rendez-vous : bornée aux centres de l'utilisateur (ADR-002, ADR-020). */
export async function rechercherPatientsPourRdv(
  acteur: UtilisateurConnecte,
  terme: string,
): Promise<PatientPropose[]> {
  const nom = normaliserPourRecherche(terme);
  if (nom.length < LONGUEUR_MIN_RECHERCHE) {
    return [];
  }
  const lignes = await base(acteur).patient.findMany({
    where: {
      fusionneDansId: null,
      ...(acteur.role === 'ADMIN_CLIENT' ? {} : { centreId: { in: [...acteur.centreIds] } }),
      OR: [
        { nomNaissanceRecherche: { contains: nom } },
        { nomUsageRecherche: { contains: nom } },
        { prenomsRecherche: { contains: nom } },
      ],
    },
    select: {
      id: true,
      nomNaissance: true,
      nomUsage: true,
      prenoms: true,
      dateNaissance: true,
      telephone: true,
    },
    orderBy: [{ nomNaissanceRecherche: 'asc' }, { prenomsRecherche: 'asc' }],
    take: PATIENTS_PROPOSES,
  });
  return lignes.map((p) => ({
    id: p.id,
    nom: nomPatient(p),
    dateNaissance: p.dateNaissance.toISOString().slice(0, 10),
    telephone: p.telephone,
  }));
}

export type SalleAttente = Record<EtapeSalleAttente, RdvGrille[]> & { attendus: RdvGrille[] };

/** Salle d'attente d'un centre pour une journée. */
export async function lireSalleAttente(
  acteur: UtilisateurConnecte,
  centreId: string,
  date: string,
): Promise<SalleAttente> {
  verifierAccesCentre(acteur, centreId);
  await centreActif(base(acteur), centreId);
  const { debut, fin } = bornesJourMs(date);
  const lignes = await base(acteur).rendezVous.findMany({
    where: {
      centreId,
      debut: { gte: new Date(debut), lt: new Date(fin) },
      statut: { in: ['PLANIFIE', 'CONFIRME', 'ARRIVE', 'VU'] },
    },
    select: selectionGrille,
    orderBy: { debut: 'asc' },
  });
  const rdv = await versRdvsGrille(acteur, lignes);
  const salle: SalleAttente = { attendus: [], ARRIVE: [], EN_COURS: [], TERMINE: [] };
  for (const r of rdv) {
    salle[etapeSalleAttente(r.statut, r.priseEnCharge) ?? 'attendus'].push(r);
  }
  return salle;
}

export interface CreneauPropose extends Creneau {
  date: string;
  heure: string;
  praticien: string | null;
}

/** Créneaux libres à partir d'une date, pour un type, un centre et éventuellement un praticien. */
export async function chercherCreneaux(
  acteur: UtilisateurConnecte,
  saisie: unknown,
): Promise<CreneauPropose[]> {
  const { centreId, typeRdvId, praticienId, depuis } = valider(rechercheCreneauxSchema, saisie);
  verifierAccesCentre(acteur, centreId);
  const client = base(acteur);
  const type = await client.typeRdv.findFirst({ where: { id: typeRdvId, actif: true } });
  if (!type) {
    throw ErreurSaisie.surChamp('typeRdvId', 'Type de rendez-vous inconnu.');
  }
  const { horairesOuverture } = await centreActif(client, centreId);
  const tous = await praticiensDuCentre(acteur, centreId);
  const praticiens = praticienId === null ? tous : tous.filter((p) => p.id === praticienId);
  if (praticienId !== null && praticiens.length === 0) {
    throw ErreurSaisie.surChamp('praticienId', 'Ce praticien n’exerce pas dans ce centre.');
  }
  const cabines = await client.cabine.findMany({
    where: { centreId, actif: true },
    select: { id: true },
    orderBy: { nom: 'asc' },
  });
  const cabineIds = cabines.map((c) => c.id);
  const au = ajouterJours(depuis, HORIZON_RECHERCHE_JOURS);
  const debut = bornesJourMs(depuis).debut;
  const fin = bornesJourMs(au).fin;
  const [exceptions, occupations] = await Promise.all([
    exceptionsDeLaPeriode(client, debut, fin),
    client.rendezVous.findMany({
      where: {
        debut: { lt: new Date(fin) },
        fin: { gt: new Date(debut) },
        statut: { in: STATUTS_OCCUPANTS },
        OR: [{ praticienId: { in: praticiens.map((p) => p.id) } }, { cabineId: { in: cabineIds } }],
      },
      select: { praticienId: true, cabineId: true, debut: true, fin: true },
    }),
  ]);
  const creneaux = calculerCreneauxLibres({
    centreId,
    du: depuis,
    au,
    dureeMinutes: type.dureeMinutes,
    requierePraticien: type.requierePraticien,
    requiereCabine: type.requiereCabine,
    praticiens,
    cabines: cabineIds,
    horairesCentre: horairesOuverture,
    exceptions,
    occupations: occupations.map((o) => ({
      ...o,
      debut: o.debut.getTime(),
      fin: o.fin.getTime(),
    })),
    pasAvant: maintenant().getTime(),
    limite: CRENEAUX_PROPOSES,
  });
  return creneaux.map((c) => ({
    ...c,
    ...localDepuisInstant(c.debut),
    praticien: tous.find((p) => p.id === c.praticienId)?.nom ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Conflits
// ---------------------------------------------------------------------------

interface ContexteCreneau extends ContexteConflits {
  readonly cabines: readonly string[];
}

/** Tout ce que juge `detecterConflits` pour ce créneau, lu dans la transaction de l'écriture. */
async function contexteDuCreneau(
  tx: ClientTransaction,
  creneau: {
    readonly centreId: string;
    readonly praticienId: string | null;
    readonly debut: number;
    readonly fin: number;
    readonly exclure?: string;
  },
): Promise<ContexteCreneau> {
  const { centreId, praticienId, debut, fin, exclure } = creneau;
  const { horairesOuverture } = await centreActif(tx, centreId);
  const exercice = praticienId
    ? await tx.praticienCentre.findUnique({
        where: { praticienId_centreId: { praticienId, centreId } },
        select: { horaires: true },
      })
    : null;
  if (praticienId !== null && exercice === null) {
    throw ErreurSaisie.surChamp('praticienId', 'Ce praticien n’exerce pas dans ce centre.');
  }
  const cabines = await tx.cabine.findMany({
    where: { centreId, actif: true },
    select: { id: true },
    orderBy: { nom: 'asc' },
  });
  const cabineIds = cabines.map((c) => c.id);
  const jour = bornesJourMs(localDepuisInstant(debut).date);
  const exceptions = await exceptionsDeLaPeriode(tx, jour.debut, jour.fin);
  const occupations = await tx.rendezVous.findMany({
    where: {
      ...(exclure ? { id: { not: exclure } } : {}),
      debut: { lt: new Date(fin) },
      fin: { gt: new Date(debut) },
      statut: { in: STATUTS_OCCUPANTS },
      OR: [...(praticienId ? [{ praticienId }] : []), { cabineId: { in: cabineIds } }],
    },
    select: { praticienId: true, cabineId: true, debut: true, fin: true },
  });
  return {
    cabines: cabineIds,
    horairesCentre: horairesOuverture,
    horairesPraticien: exercice ? horaires(exercice.horaires) : null,
    exceptions,
    occupations: occupations.map((o) => ({
      ...o,
      debut: o.debut.getTime(),
      fin: o.fin.getTime(),
    })),
  };
}

function cabineDisponible(
  cabineId: string,
  candidat: Omit<Candidat, 'cabineId'>,
  { horairesCentre, exceptions }: ContexteCreneau,
): boolean {
  const { date } = localDepuisInstant(candidat.debut);
  const { centreId } = candidat;
  return contient(plagesCabine({ date, centreId, cabineId, horairesCentre, exceptions }), candidat);
}

/** La cabine demandée, ou la première libre, de préférence dans ses disponibilités. */
function choisirCabine(
  candidat: Omit<Candidat, 'cabineId'>,
  souhaitee: string | null,
  requise: boolean,
  contexte: ContexteCreneau,
): string | null {
  if (souhaitee !== null) {
    if (!contexte.cabines.includes(souhaitee)) {
      throw ErreurSaisie.surChamp('cabineId', 'Cette cabine n’appartient pas à ce centre.');
    }
    return souhaitee;
  }
  if (!requise) {
    return null;
  }
  const libres = contexte.cabines.filter(
    (id) => !contexte.occupations.some((o) => o.cabineId === id),
  );
  const [premiere] = libres;
  if (premiere === undefined) {
    throw new ErreurConflitAgenda(['CABINE_PRISE']);
  }
  return libres.find((id) => cabineDisponible(id, candidat, contexte)) ?? premiere;
}

/** Refuse ce qui ne se force pas, et ce qui n'a pas été confirmé. Renvoie ce qui a été confirmé. */
function verifierConflits(
  candidat: Candidat,
  contexte: ContexteCreneau,
  confirmer: boolean,
): readonly CodeConflit[] {
  const conflits = detecterConflits(candidat, contexte);
  if (conflits.some(estBloquant) || (conflits.length > 0 && !confirmer)) {
    throw new ErreurConflitAgenda(conflits);
  }
  return conflits;
}

// ---------------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------------

const selectionEcriture = {
  id: true,
  version: true,
  centreId: true,
  typeRdvId: true,
  patientId: true,
  dossierId: true,
  praticienId: true,
  cabineId: true,
  debut: true,
  fin: true,
  statut: true,
  origine: true,
  prospectNom: true,
  prospectTelephone: true,
  priseEnChargeLe: true,
  typeRdv: { select: { requiereCabine: true, requierePraticien: true } },
} as const;

type RdvLu = Prisma.RendezVousGetPayload<{ select: typeof selectionEcriture }>;

function instantane(r: Omit<RdvLu, 'typeRdv' | 'version'>) {
  return {
    centreId: r.centreId,
    typeRdvId: r.typeRdvId,
    praticienId: r.praticienId,
    cabineId: r.cabineId,
    debut: r.debut.toISOString(),
    fin: r.fin.toISOString(),
    statut: r.statut,
    origine: r.origine,
  };
}

function charge(r: Omit<RdvLu, 'typeRdv' | 'version'>) {
  return {
    rendezVousId: r.id,
    centreId: r.centreId,
    typeRdvId: r.typeRdvId,
    patientId: r.patientId,
    dossierId: r.dossierId,
    praticienId: r.praticienId,
    cabineId: r.cabineId,
    debut: r.debut.toISOString(),
    fin: r.fin.toISOString(),
  };
}

async function lireRdvPourEcrire(
  tx: ClientTransaction,
  acteur: UtilisateurConnecte,
  id: string,
): Promise<RdvLu> {
  const rdv = await tx.rendezVous.findFirst({ where: { id }, select: selectionEcriture });
  if (!rdv) {
    throw new AccesRefuseError();
  }
  verifierAccesCentre(acteur, rdv.centreId);
  return rdv;
}

/** Toute écriture passe ici : la version lue doit être la dernière (verrou optimiste). */
async function ecrireRdv(
  tx: ClientTransaction,
  id: string,
  version: number,
  data: Prisma.RendezVousUncheckedUpdateManyInput,
): Promise<void> {
  const { count } = await tx.rendezVous.updateMany({
    where: { id, version },
    data: { ...data, version: { increment: 1 } },
  });
  if (count !== 1) {
    throw new ErreurRdvModifie();
  }
}

const RDV = 'RENDEZ_VOUS';

function evenementRdv(
  rdv: Omit<RdvLu, 'typeRdv' | 'version'>,
  avant: Parameters<typeof instantane>[0] | null,
  details?: Readonly<Record<string, unknown>>,
): EvenementAudit {
  return {
    action: avant ? 'UPDATE' : 'CREATE',
    entiteType: 'RENDEZ_VOUS',
    entiteId: rdv.id,
    patientId: rdv.patientId,
    centreId: rdv.centreId,
    champs: differencesAuditees(RDV, avant ? instantane(avant) : null, instantane(rdv)),
    ...(details ? { details } : {}),
  };
}

function detailsConfirmation(conflits: readonly CodeConflit[]) {
  return conflits.length > 0 ? { conflitsConfirmes: conflits } : undefined;
}

async function verifierPatient(
  tx: ClientTransaction,
  acteur: UtilisateurConnecte,
  patientId: string,
): Promise<void> {
  const patient = await tx.patient.findFirst({
    where: { id: patientId, fusionneDansId: null },
    select: { centreId: true },
  });
  if (!patient) {
    throw new AccesRefuseError();
  }
  verifierAccesCentre(acteur, patient.centreId);
}

/** Crée un rendez-vous. Lève ErreurConflitAgenda si le créneau ne convient pas. */
export async function creerRdv(acteur: UtilisateurConnecte, saisie: unknown): Promise<string> {
  const d = valider(rdvSaisieSchema, saisie);
  verifierAccesCentre(acteur, d.centreId);
  const debut = instantSaisi(d.date, d.heure);
  if (debut === null) {
    throw ErreurSaisie.surChamp(
      'heure',
      'Cette heure n’existe pas ce jour-là (changement d’heure).',
    );
  }
  const fin = debut + d.dureeMinutes * MS_PAR_MINUTE;
  const { rdv } = await sousExclusion(() =>
    withAudit(
      acteur,
      async (tx) => {
        const type = await tx.typeRdv.findFirst({
          where: { id: d.typeRdvId, actif: true },
          select: { requierePraticien: true, requiereCabine: true },
        });
        if (!type) {
          throw ErreurSaisie.surChamp('typeRdvId', 'Type de rendez-vous inconnu.');
        }
        if (type.requierePraticien && d.praticienId === null) {
          throw ErreurSaisie.surChamp('praticienId', 'Choisir le praticien.');
        }
        if (d.patientId !== null) {
          await verifierPatient(tx, acteur, d.patientId);
        }
        if (d.dossierId !== null) {
          const dossier = await tx.dossier.findFirst({
            where: { id: d.dossierId, patientId: d.patientId ?? '' },
            select: { id: true },
          });
          if (!dossier) {
            throw ErreurSaisie.surChamp('dossierId', 'Ce dossier n’est pas celui de ce patient.');
          }
        }
        const candidat = { centreId: d.centreId, praticienId: d.praticienId, debut, fin };
        const contexte = await contexteDuCreneau(tx, candidat);
        const cabineId = choisirCabine(candidat, d.cabineId, type.requiereCabine, contexte);
        const conflits = verifierConflits(
          { ...candidat, cabineId },
          contexte,
          d.confirmerHorsDisponibilites && d.origine !== 'EN_LIGNE',
        );
        const cree = await tx.rendezVous.create({
          data: {
            centreId: d.centreId,
            typeRdvId: d.typeRdvId,
            patientId: d.patientId,
            prospectNom: d.prospectNom,
            prospectTelephone: d.prospectTelephone,
            dossierId: d.dossierId,
            praticienId: d.praticienId,
            cabineId,
            debut: new Date(debut),
            fin: new Date(fin),
            origine: d.origine,
            notes: d.notes,
            createdById: acteur.id,
          },
          select: selectionEcriture,
        });
        await publierEvenement(tx, { type: 'RDV_CREE', charge: charge(cree) }, maintenant());
        return { rdv: cree, conflits };
      },
      ({ rdv: cree, conflits: confirmes }) =>
        evenementRdv(cree, null, detailsConfirmation(confirmes)),
    ),
  );
  return rdv.id;
}

/** Déplace ou redimensionne, y compris d'un praticien à l'autre. La cabine suit si elle reste libre. */
export async function deplacerRdv(
  acteur: UtilisateurConnecte,
  id: string,
  saisie: unknown,
): Promise<void> {
  const d = valider(deplacementRdvSchema, saisie);
  await sousExclusion(() =>
    withAudit(
      acteur,
      async (tx) => {
        const rdv = await lireRdvPourEcrire(tx, acteur, id);
        if (!estDeplacable(rdv.statut)) {
          throw new ErreurSaisie({}, 'Ce rendez-vous ne peut plus être déplacé.');
        }
        const debut = instantDeDepose(d.date, d.heure, rdv.debut.getTime());
        if (debut === null) {
          throw ErreurSaisie.surChamp(
            'heure',
            'Cette heure n’existe pas ce jour-là (changement d’heure).',
          );
        }
        const fin = debut + d.dureeMinutes * MS_PAR_MINUTE;
        const praticienId = d.praticienId === undefined ? rdv.praticienId : d.praticienId;
        if (rdv.typeRdv.requierePraticien && praticienId === null) {
          throw ErreurSaisie.surChamp('praticienId', 'Choisir le praticien.');
        }
        const candidat = { centreId: rdv.centreId, praticienId, debut, fin };
        const contexte = await contexteDuCreneau(tx, { ...candidat, exclure: id });
        const garde =
          rdv.cabineId !== null && !contexte.occupations.some((o) => o.cabineId === rdv.cabineId);
        const cabineId = choisirCabine(
          candidat,
          garde ? rdv.cabineId : null,
          rdv.cabineId !== null || rdv.typeRdv.requiereCabine,
          contexte,
        );
        const conflits = verifierConflits(
          { ...candidat, cabineId },
          contexte,
          d.confirmerHorsDisponibilites,
        );
        const apres = {
          ...rdv,
          praticienId,
          cabineId,
          debut: new Date(debut),
          fin: new Date(fin),
        };
        await ecrireRdv(tx, id, d.version, {
          praticienId,
          cabineId,
          debut: apres.debut,
          fin: apres.fin,
        });
        const evenement: EvenementAgenda = {
          type: 'RDV_DEPLACE',
          charge: {
            ...charge(apres),
            ancienDebut: rdv.debut.toISOString(),
            ancienFin: rdv.fin.toISOString(),
          },
        };
        await publierEvenement(tx, evenement, maintenant());
        return { rdv, apres, conflits };
      },
      ({ rdv, apres, conflits }) => evenementRdv(apres, rdv, detailsConfirmation(conflits)),
    ),
  );
}

const notesSchema = z.object({
  version: versionRdvSchema,
  notes: z
    .string()
    .trim()
    .max(2000, '2000 caractères au maximum.')
    .transform((notes) => (notes === '' ? null : notes)),
});

/** Les notes ne sont jamais recopiées dans le journal : seul le fait de les avoir changées y figure. */
export async function modifierNotesRdv(
  acteur: UtilisateurConnecte,
  id: string,
  saisie: unknown,
): Promise<void> {
  const { version, notes } = valider(notesSchema, saisie);
  await withAudit(
    acteur,
    async (tx) => {
      const rdv = await lireRdvPourEcrire(tx, acteur, id);
      await ecrireRdv(tx, id, version, { notes });
      return rdv;
    },
    (rdv): EvenementAudit => ({
      action: 'UPDATE',
      entiteType: RDV,
      entiteId: rdv.id,
      patientId: rdv.patientId,
      centreId: rdv.centreId,
      champs: [{ champ: 'notes', masque: true }],
    }),
  );
}

/** Confirmé, vu ou absent. L'arrivée et l'annulation ont leur propre action. */
export async function changerStatutRdv(
  acteur: UtilisateurConnecte,
  id: string,
  saisie: unknown,
): Promise<void> {
  const { version, statut } = valider(changementStatutRdvSchema, saisie);
  await withAudit(
    acteur,
    async (tx) => {
      const rdv = await lireRdvPourEcrire(tx, acteur, id);
      if (!peutPasserA(rdv.statut, statut)) {
        throw new ErreurSaisie({}, 'Ce changement de statut n’est pas possible.');
      }
      const instant = maintenant();
      const termine =
        statut === 'VU'
          ? { termineLe: instant, priseEnChargeLe: rdv.priseEnChargeLe ?? instant }
          : {};
      await ecrireRdv(tx, id, version, { statut, ...termine });
      return { rdv, apres: { ...rdv, statut } };
    },
    ({ rdv, apres }) => evenementRdv(apres, rdv),
  );
}

/** Le patient entre en cabine : il passe d'« arrivé » à « en cours » dans la salle d'attente. */
export async function prendreEnCharge(
  acteur: UtilisateurConnecte,
  id: string,
  version: unknown,
): Promise<void> {
  const versionLue = valider(versionRdvSchema, version);
  await withAudit(
    acteur,
    async (tx) => {
      const rdv = await lireRdvPourEcrire(tx, acteur, id);
      if (rdv.statut !== 'ARRIVE' || rdv.priseEnChargeLe !== null) {
        throw new ErreurSaisie({}, 'Ce patient n’est pas en attente.');
      }
      await ecrireRdv(tx, id, versionLue, { priseEnChargeLe: maintenant() });
      return rdv;
    },
    (rdv): EvenementAudit => ({
      action: 'UPDATE',
      entiteType: RDV,
      entiteId: rdv.id,
      patientId: rdv.patientId,
      centreId: rdv.centreId,
      champs: [{ champ: 'priseEnChargeLe', masque: true }],
    }),
  );
}

/** Annule : le créneau se libère et l'événement part pour les rappels. */
export async function annulerRdv(
  acteur: UtilisateurConnecte,
  id: string,
  version: unknown,
): Promise<void> {
  const versionLue = valider(versionRdvSchema, version);
  await withAudit(
    acteur,
    async (tx) => {
      const rdv = await lireRdvPourEcrire(tx, acteur, id);
      if (!peutPasserA(rdv.statut, 'ANNULE')) {
        throw new ErreurSaisie({}, 'Ce rendez-vous ne peut plus être annulé.');
      }
      await ecrireRdv(tx, id, versionLue, { statut: 'ANNULE' });
      await publierEvenement(tx, { type: 'RDV_ANNULE', charge: charge(rdv) }, maintenant());
      return { rdv, apres: { ...rdv, statut: 'ANNULE' as const } };
    },
    ({ rdv, apres }) => evenementRdv(apres, rdv),
  );
}

const arriveeSchema = z.object({
  version: versionRdvSchema,
  prospect: z.unknown().optional(),
});

function saisiePatient(
  rdv: { centreId: string; prospectTelephone: string | null },
  prospect: Extract<z.output<typeof arriveeProspectSchema>, { mode: 'NOUVEAU' }>,
) {
  const { civilite, nomNaissance, prenoms, dateNaissance, sexe } = prospect;
  return {
    centreId: rdv.centreId,
    civilite,
    nomNaissance,
    prenoms,
    dateNaissance,
    sexe,
    telephone: rdv.prospectTelephone,
    consentementSms: false,
    consentementEmail: false,
    consentementCourrier: false,
    amoC2s: false,
    amoAld: false,
  };
}

/** Arrivée d'un patient ; un prospect devient patient dans la même transaction. */
export async function marquerArrivee(
  acteur: UtilisateurConnecte,
  id: string,
  saisie: unknown,
): Promise<void> {
  const { version, prospect } = valider(arriveeSchema, saisie);
  // Contrôles de la fiche nouvelle hors transaction : ils lisent par `base(acteur)` (ADR-019).
  const lu = await base(acteur).rendezVous.findFirst({
    where: { id },
    select: { centreId: true, patientId: true, prospectTelephone: true },
  });
  if (!lu) {
    throw new AccesRefuseError();
  }
  verifierAccesCentre(acteur, lu.centreId);
  const arrivee = lu.patientId === null ? valider(arriveeProspectSchema, prospect) : null;
  const preparation: PreparationPatient | null =
    arrivee?.mode === 'NOUVEAU'
      ? await preparerCreation(acteur, saisiePatient(lu, arrivee), {
          confirmerDoublon: arrivee.confirmerDoublon,
        })
      : null;

  await withAudit(
    acteur,
    async (tx) => {
      const rdv = await lireRdvPourEcrire(tx, acteur, id);
      if (!peutPasserA(rdv.statut, 'ARRIVE')) {
        throw new ErreurSaisie({}, 'Ce rendez-vous ne peut plus être marqué arrivé.');
      }
      if (rdv.statut === 'ABSENT') {
        const contexte = await contexteDuCreneau(tx, {
          centreId: rdv.centreId,
          praticienId: rdv.praticienId,
          debut: rdv.debut.getTime(),
          fin: rdv.fin.getTime(),
          exclure: id,
        });
        const repris = detecterConflits(
          {
            centreId: rdv.centreId,
            praticienId: rdv.praticienId,
            cabineId: rdv.cabineId,
            debut: rdv.debut.getTime(),
            fin: rdv.fin.getTime(),
          },
          contexte,
        ).filter(estBloquant);
        if (repris.length > 0) {
          throw new ErreurConflitAgenda(
            repris,
            'Ce créneau a été repris entre-temps : créez un nouveau rendez-vous.',
          );
        }
      }
      let creation: EvenementAudit | null = null;
      let patientId = rdv.patientId;
      if (preparation !== null) {
        patientId = await ecrirePatient(tx, acteur, preparation);
        creation = evenementCreation(patientId, preparation);
      } else if (arrivee?.mode === 'EXISTANT') {
        await verifierPatient(tx, acteur, arrivee.patientId);
        patientId = arrivee.patientId;
      }
      if (patientId === null) {
        throw new ErreurSaisie({}, 'Choisir le patient.');
      }
      await ecrireRdv(tx, id, version, {
        statut: 'ARRIVE',
        arriveLe: maintenant(),
        patientId,
        prospectNom: null,
        prospectTelephone: null,
      });
      return { rdv, apres: { ...rdv, statut: 'ARRIVE' as const, patientId }, creation };
    },
    ({ rdv, apres, creation }) => [...(creation ? [creation] : []), evenementRdv(apres, rdv)],
  );
}
