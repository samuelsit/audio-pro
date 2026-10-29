import { SystemClock } from '@ha/adapters';
import type { Prisma } from '@ha/db';
import {
  ageAt,
  calculerPagination,
  champsDifferents,
  choixFusionSchema,
  criteresRecherchePatientSchema,
  differencesAuditees,
  erreurDateNaissance,
  fusionnerFiches,
  motifsDoublon,
  nirSchema,
  normaliserPourRecherche,
  patientSaisieSchema,
  peutAccederAuCentre,
  sourceParDefaut,
  type AmcSaisie,
  type AmoSaisie,
  type ChampFusion,
  type Civilite,
  type Clock,
  type CriteresRecherchePatient,
  type DoublonsPossibles,
  type FicheFusion,
  type IdentiteComparable,
  type OrigineDonnee,
  type Pagination,
  type PatientSaisie,
  type Perimetre,
  type Qualite,
  type Sexe,
  type SourceFusion,
} from '@ha/domain';
import { z } from 'zod';

import {
  AccesRefuseError,
  verifierPerimetre,
  verifierRole,
  type UtilisateurConnecte,
} from '../auth/acces';
import { withAudit, type EvenementAudit } from '../audit/journal';
import { base, empreinteNir, type ClientTransaction } from '../chiffrement';
import { ErreurSaisie, valider } from '../erreurs';
import { centresDuPerimetre } from '../perimetre';

export const PATIENTS_PAR_PAGE = 25;

const horloge: Clock = new SystemClock();

/** Date du jour à Paris (AAAA-MM-JJ) : `now()` est déjà exprimé dans ce fuseau. */
function aujourdhui(): string {
  return horloge.now().slice(0, 10);
}

/** Colonne `@db.Date` ↔ date calendaire ISO (minuit UTC, sans fuseau). */
function versDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function depuisDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dateOuNull(date: Date | null): string | null {
  return date === null ? null : depuisDate(date);
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

export interface PatientResume {
  id: string;
  civilite: Civilite;
  nomNaissance: string;
  nomUsage: string | null;
  prenoms: string;
  dateNaissance: string;
  age: number;
  centre: { id: string; nom: string };
  telephone: string | null;
}

export interface CouvertureAmoDetail {
  nir: string;
  rangNaissance: number;
  qualite: Qualite;
  regime: string | null;
  caisse: string | null;
  centreGestionnaire: string | null;
  finDroits: string | null;
  c2s: boolean;
  ald: boolean;
  origine: OrigineDonnee;
  /** Instant ISO de la dernière lecture de la carte Vitale. */
  derniereLectureVitale: string | null;
}

export type CouvertureAmcDetail = AmcSaisie;

export interface PatientDetail extends PatientResume {
  sexe: Sexe;
  adresseLigne1: string | null;
  adresseLigne2: string | null;
  codePostal: string | null;
  ville: string | null;
  email: string | null;
  medecinTraitant: string | null;
  consentementSms: boolean;
  consentementEmail: boolean;
  consentementCourrier: boolean;
  notes: string | null;
  amo: CouvertureAmoDetail | null;
  amc: CouvertureAmcDetail | null;
  /** Fiche conservée si celle-ci a été fusionnée. */
  fusionneDansId: string | null;
}

const selectionPatient = {
  id: true,
  organisationId: true,
  centreId: true,
  civilite: true,
  nomNaissance: true,
  nomUsage: true,
  prenoms: true,
  dateNaissance: true,
  sexe: true,
  adresseLigne1: true,
  adresseLigne2: true,
  codePostal: true,
  ville: true,
  telephone: true,
  email: true,
  medecinTraitant: true,
  consentementSms: true,
  consentementEmail: true,
  consentementCourrier: true,
  notes: true,
  fusionneDansId: true,
  centre: { select: { id: true, nom: true } },
} as const;

type LignePatient = Prisma.PatientGetPayload<{ select: typeof selectionPatient }>;

/** Client qui chiffre et déchiffre : `base()` ou une transaction ouverte par `withAudit`. */
type Client = ClientTransaction | ReturnType<typeof base>;

/**
 * Lit une fiche complète, couvertures comprises (lues directement : champs chiffrés).
 * Lève AccesRefuseError si la fiche n'existe pas dans l'organisation ou si son centre est hors des droits.
 */
async function lireFiche(
  client: Client,
  acteur: UtilisateurConnecte,
  patientId: string,
): Promise<PatientDetail> {
  const p: LignePatient | null = await client.patient.findFirst({
    where: { id: patientId, organisationId: acteur.organisationId },
    select: selectionPatient,
  });
  if (!p || !peutAccederAuCentre(acteur, p.centreId)) {
    throw new AccesRefuseError();
  }
  const [amo, amc] = await Promise.all([
    client.couvertureAmo.findUnique({ where: { patientId } }),
    client.couvertureAmc.findUnique({ where: { patientId } }),
  ]);
  const dateNaissance = depuisDate(p.dateNaissance);
  return {
    id: p.id,
    civilite: p.civilite,
    nomNaissance: p.nomNaissance,
    nomUsage: p.nomUsage,
    prenoms: p.prenoms,
    dateNaissance,
    age: ageAt(dateNaissance, aujourdhui()),
    centre: p.centre,
    telephone: p.telephone,
    sexe: p.sexe,
    adresseLigne1: p.adresseLigne1,
    adresseLigne2: p.adresseLigne2,
    codePostal: p.codePostal,
    ville: p.ville,
    email: p.email,
    medecinTraitant: p.medecinTraitant,
    consentementSms: p.consentementSms,
    consentementEmail: p.consentementEmail,
    consentementCourrier: p.consentementCourrier,
    notes: p.notes,
    fusionneDansId: p.fusionneDansId,
    amo: amo && {
      nir: amo.nir,
      rangNaissance: amo.rangNaissance,
      qualite: amo.qualite,
      regime: amo.regime,
      caisse: amo.caisse,
      centreGestionnaire: amo.centreGestionnaire,
      finDroits: dateOuNull(amo.finDroits),
      c2s: amo.c2s,
      ald: amo.ald === 'OUI',
      origine: amo.origine,
      derniereLectureVitale: amo.derniereLectureVitale?.toISOString() ?? null,
    },
    amc: amc && {
      organismeNom: amc.organismeNom,
      organismeIdentifiant: amc.organismeIdentifiant,
      numeroAdherent: amc.numeroAdherent,
      typeContrat: amc.typeContrat,
      debutValidite: dateOuNull(amc.debutValidite),
      finValidite: dateOuNull(amc.finValidite),
    },
  };
}

function evenementLecture(fiche: PatientDetail): EvenementAudit {
  return {
    action: 'READ',
    entiteType: 'PATIENT',
    entiteId: fiche.id,
    patientId: fiche.id,
    centreId: fiche.centre.id,
  };
}

export type ResultatOuverture =
  { type: 'fiche'; fiche: PatientDetail } | { type: 'fusionnee'; conserveeId: string };

/**
 * Ouvre une fiche : une ligne READ dans le journal. Une fiche fusionnée renvoie vers la fiche conservée
 * (dont l'ouverture sera journalisée à son tour).
 */
export async function obtenirPatient(
  acteur: UtilisateurConnecte,
  patientId: string,
): Promise<ResultatOuverture> {
  const fiche = await lireFiche(base(), acteur, patientId);
  if (fiche.fusionneDansId !== null) {
    return { type: 'fusionnee', conserveeId: fiche.fusionneDansId };
  }
  return withAudit(
    acteur,
    async (tx) => ({ type: 'fiche' as const, fiche: await lireFiche(tx, acteur, patientId) }),
    (resultat) => evenementLecture(resultat.fiche),
  );
}

// ---------------------------------------------------------------------------
// Liste et recherche
// ---------------------------------------------------------------------------

/** Fiches non fusionnées de l'organisation, limitées aux centres du périmètre. */
function clausePerimetre(
  acteur: UtilisateurConnecte,
  perimetre: Perimetre,
): Prisma.PatientWhereInput {
  const centres = centresDuPerimetre(acteur, perimetre);
  return {
    organisationId: acteur.organisationId,
    fusionneDansId: null,
    ...(centres === null ? {} : { centreId: { in: [...centres] } }),
  };
}

/** Une liste n'ouvre aucune fiche : pas de ligne READ. */
export async function listerPatients(
  acteur: UtilisateurConnecte,
  perimetre: Perimetre,
  saisie: unknown,
): Promise<{
  patients: PatientResume[];
  pagination: Pagination;
  criteres: CriteresRecherchePatient;
}> {
  verifierPerimetre(acteur, perimetre);
  const criteres = valider(criteresRecherchePatientSchema, saisie);
  const where: Prisma.PatientWhereInput = {
    ...clausePerimetre(acteur, perimetre),
    ...(criteres.nom
      ? {
          OR: [
            { nomNaissanceRecherche: { contains: criteres.nom } },
            { nomUsageRecherche: { contains: criteres.nom } },
          ],
        }
      : {}),
    ...(criteres.prenom ? { prenomsRecherche: { contains: criteres.prenom } } : {}),
    ...(criteres.dateNaissance ? { dateNaissance: versDate(criteres.dateNaissance) } : {}),
    ...(criteres.empreinte ? { couvertureAmo: { nirEmpreinte: criteres.empreinte } } : {}),
  };
  const total = await base().patient.count({ where });
  const pagination = calculerPagination(criteres.page, PATIENTS_PAR_PAGE, total);
  const lignes = await base().patient.findMany({
    where,
    select: {
      id: true,
      civilite: true,
      nomNaissance: true,
      nomUsage: true,
      prenoms: true,
      dateNaissance: true,
      telephone: true,
      centre: { select: { id: true, nom: true } },
    },
    orderBy: [{ nomNaissanceRecherche: 'asc' }, { prenomsRecherche: 'asc' }, { id: 'asc' }],
    skip: pagination.decalage,
    take: PATIENTS_PAR_PAGE,
  });
  const jour = aujourdhui();
  return {
    patients: lignes.map((p) => {
      const dateNaissance = depuisDate(p.dateNaissance);
      return { ...p, dateNaissance, age: ageAt(dateNaissance, jour) };
    }),
    pagination,
    criteres,
  };
}

/**
 * Recherche exacte par NIR. Le NIR ne sort jamais du serveur : on renvoie son empreinte (pour l'URL de
 * la liste) et, s'il n'y a qu'une fiche dans le périmètre, son identifiant.
 */
export async function rechercherParNir(
  acteur: UtilisateurConnecte,
  perimetre: Perimetre,
  saisie: unknown,
): Promise<{ empreinte: string; patientId: string | null }> {
  verifierPerimetre(acteur, perimetre);
  const { nir } = valider(z.object({ nir: nirSchema }), saisie);
  const empreinte = empreinteNir(nir);
  const trouves = await base().patient.findMany({
    where: { ...clausePerimetre(acteur, perimetre), couvertureAmo: { nirEmpreinte: empreinte } },
    select: { id: true },
    take: 2,
  });
  return { empreinte, patientId: trouves.length === 1 ? (trouves[0]?.id ?? null) : null };
}

// ---------------------------------------------------------------------------
// Doublons
// ---------------------------------------------------------------------------

/**
 * Doublons possibles dans toute l'organisation (fiches non fusionnées). Ceux d'un centre hors des droits
 * de l'acteur ne révèlent que le nom du centre (choix validé à l'étape 3, voir ADR-006).
 */
async function chercherDoublons(
  acteur: UtilisateurConnecte,
  identite: IdentiteComparable,
  exclureId: string | null,
): Promise<DoublonsPossibles> {
  const noms = [identite.nomNaissance, identite.nomUsage]
    .filter((nom): nom is string => nom !== null)
    .map(normaliserPourRecherche);
  const lignes = await base().patient.findMany({
    where: {
      organisationId: acteur.organisationId,
      fusionneDansId: null,
      ...(exclureId === null ? {} : { id: { not: exclureId } }),
      OR: [
        {
          dateNaissance: versDate(identite.dateNaissance),
          OR: [{ nomNaissanceRecherche: { in: noms } }, { nomUsageRecherche: { in: noms } }],
        },
        ...(identite.nirEmpreinte === null
          ? []
          : [{ couvertureAmo: { nirEmpreinte: identite.nirEmpreinte } }]),
      ],
    },
    select: {
      id: true,
      centreId: true,
      nomNaissance: true,
      nomUsage: true,
      prenoms: true,
      dateNaissance: true,
      centre: { select: { nom: true } },
      // Lecture imbriquée sans champ chiffré : empreinte, qualité et rang seulement.
      couvertureAmo: { select: { nirEmpreinte: true, qualite: true, rangNaissance: true } },
    },
    orderBy: [{ nomNaissanceRecherche: 'asc' }, { id: 'asc' }],
    take: 50,
  });

  const visibles: DoublonsPossibles['visibles'][number][] = [];
  const horsPerimetre: DoublonsPossibles['horsPerimetre'][number][] = [];
  for (const l of lignes) {
    const dateNaissance = depuisDate(l.dateNaissance);
    const motifs = motifsDoublon(identite, {
      nomNaissance: l.nomNaissance,
      nomUsage: l.nomUsage,
      dateNaissance,
      nirEmpreinte: l.couvertureAmo?.nirEmpreinte ?? null,
      qualite: l.couvertureAmo?.qualite ?? null,
      rangNaissance: l.couvertureAmo?.rangNaissance ?? null,
    });
    if (motifs.length === 0) {
      continue;
    }
    if (peutAccederAuCentre(acteur, l.centreId)) {
      visibles.push({
        id: l.id,
        nomNaissance: l.nomNaissance,
        nomUsage: l.nomUsage,
        prenoms: l.prenoms,
        dateNaissance,
        centreNom: l.centre.nom,
        motifs,
        qualite: l.couvertureAmo?.qualite ?? null,
        rangNaissance: l.couvertureAmo?.rangNaissance ?? null,
      });
    } else {
      horsPerimetre.push({ centreNom: l.centre.nom, motifs });
    }
  }
  return { visibles, horsPerimetre };
}

function aDesDoublons(doublons: DoublonsPossibles): boolean {
  return doublons.visibles.length > 0 || doublons.horsPerimetre.length > 0;
}

/** Doublons possibles d'une fiche existante (bandeau de la fiche). Aucune ligne d'audit : pas d'ouverture. */
export async function doublonsDeLaFiche(
  acteur: UtilisateurConnecte,
  fiche: PatientDetail,
): Promise<DoublonsPossibles> {
  return chercherDoublons(
    acteur,
    {
      nomNaissance: fiche.nomNaissance,
      nomUsage: fiche.nomUsage,
      dateNaissance: fiche.dateNaissance,
      nirEmpreinte: fiche.amo ? empreinteNir(nirSchema.parse(fiche.amo.nir)) : null,
      qualite: fiche.amo?.qualite ?? null,
      rangNaissance: fiche.amo?.rangNaissance ?? null,
    },
    fiche.id,
  );
}

/** Création suspendue : des fiches correspondent déjà. L'utilisateur confirme ou ouvre l'existante. */
export class ErreurDoublonPossible extends Error {
  constructor(readonly doublons: DoublonsPossibles) {
    super('Ce patient existe peut-être déjà.');
    this.name = 'ErreurDoublonPossible';
  }
}

// ---------------------------------------------------------------------------
// Création et modification
// ---------------------------------------------------------------------------

/** Centre de rattachement : actif, dans l'organisation et accessible à l'acteur. */
async function verifierCentreRattachement(
  acteur: UtilisateurConnecte,
  centreId: string,
): Promise<void> {
  const centre = await base().centre.findFirst({
    where: { id: centreId, organisationId: acteur.organisationId, actif: true },
    select: { id: true },
  });
  if (!centre || !peutAccederAuCentre(acteur, centreId)) {
    throw ErreurSaisie.surChamp('centreId', 'Centre de rattachement inconnu ou non autorisé.');
  }
}

function validerSaisie(saisie: unknown): PatientSaisie {
  const donnees = valider(patientSaisieSchema, saisie);
  const erreurDate = erreurDateNaissance(donnees.dateNaissance, aujourdhui());
  if (erreurDate) {
    throw ErreurSaisie.surChamp('dateNaissance', erreurDate);
  }
  return donnees;
}

function donneesPatient(d: PatientSaisie) {
  return {
    centreId: d.centreId,
    civilite: d.civilite,
    nomNaissance: d.nomNaissance,
    nomUsage: d.nomUsage,
    prenoms: d.prenoms,
    dateNaissance: versDate(d.dateNaissance),
    sexe: d.sexe,
    adresseLigne1: d.adresseLigne1,
    adresseLigne2: d.adresseLigne2,
    codePostal: d.codePostal,
    ville: d.ville,
    telephone: d.telephone,
    email: d.email,
    medecinTraitant: d.medecinTraitant,
    consentementSms: d.consentementSms,
    consentementEmail: d.consentementEmail,
    consentementCourrier: d.consentementCourrier,
    notes: d.notes,
    nomNaissanceRecherche: normaliserPourRecherche(d.nomNaissance),
    nomUsageRecherche: d.nomUsage === null ? null : normaliserPourRecherche(d.nomUsage),
    prenomsRecherche: normaliserPourRecherche(d.prenoms),
  };
}

interface ProvenanceAmo {
  origine: OrigineDonnee;
  derniereLectureVitale: string | null;
}

function donneesAmo(amo: AmoSaisie, provenance: ProvenanceAmo) {
  return {
    nir: amo.nir,
    nirEmpreinte: empreinteNir(amo.nir),
    rangNaissance: amo.rangNaissance,
    qualite: amo.qualite,
    regime: amo.regime,
    caisse: amo.caisse,
    centreGestionnaire: amo.centreGestionnaire,
    finDroits: amo.finDroits === null ? null : versDate(amo.finDroits),
    c2s: amo.c2s,
    ald: amo.ald ? 'OUI' : 'NON',
    origine: provenance.origine,
    derniereLectureVitale:
      provenance.derniereLectureVitale === null ? null : new Date(provenance.derniereLectureVitale),
  };
}

function donneesAmc(amc: AmcSaisie) {
  return {
    organismeNom: amc.organismeNom,
    organismeIdentifiant: amc.organismeIdentifiant,
    numeroAdherent: amc.numeroAdherent,
    typeContrat: amc.typeContrat,
    debutValidite: amc.debutValidite === null ? null : versDate(amc.debutValidite),
    finValidite: amc.finValidite === null ? null : versDate(amc.finValidite),
  };
}

/** Écrit (ou retire) les couvertures d'un patient, directement sur leurs modèles (champs chiffrés). */
async function ecrireCouvertures(
  tx: ClientTransaction,
  patientId: string,
  amo: AmoSaisie | null,
  provenanceAmo: ProvenanceAmo,
  amc: AmcSaisie | null,
): Promise<void> {
  if (amo === null) {
    await tx.couvertureAmo.deleteMany({ where: { patientId } });
  } else {
    const donnees = donneesAmo(amo, provenanceAmo);
    await tx.couvertureAmo.upsert({
      where: { patientId },
      create: { patientId, ...donnees },
      update: donnees,
    });
  }
  if (amc === null) {
    await tx.couvertureAmc.deleteMany({ where: { patientId } });
  } else {
    const donnees = donneesAmc(amc);
    await tx.couvertureAmc.upsert({
      where: { patientId },
      create: { patientId, ...donnees },
      update: donnees,
    });
  }
}

/** Fiche lue ramenée à la forme d'une saisie (comparaisons, audit, fusion). */
function versSaisie(fiche: PatientDetail): PatientSaisie {
  return {
    centreId: fiche.centre.id,
    civilite: fiche.civilite,
    nomNaissance: fiche.nomNaissance,
    nomUsage: fiche.nomUsage,
    prenoms: fiche.prenoms,
    dateNaissance: fiche.dateNaissance,
    sexe: fiche.sexe,
    adresseLigne1: fiche.adresseLigne1,
    adresseLigne2: fiche.adresseLigne2,
    codePostal: fiche.codePostal,
    ville: fiche.ville,
    telephone: fiche.telephone,
    email: fiche.email,
    medecinTraitant: fiche.medecinTraitant,
    consentementSms: fiche.consentementSms,
    consentementEmail: fiche.consentementEmail,
    consentementCourrier: fiche.consentementCourrier,
    notes: fiche.notes,
    amo: fiche.amo && {
      nir: nirSchema.parse(fiche.amo.nir),
      rangNaissance: fiche.amo.rangNaissance,
      qualite: fiche.amo.qualite,
      regime: fiche.amo.regime,
      caisse: fiche.amo.caisse,
      centreGestionnaire: fiche.amo.centreGestionnaire,
      finDroits: fiche.amo.finDroits,
      c2s: fiche.amo.c2s,
      ald: fiche.amo.ald,
    },
    amc: fiche.amc,
  };
}

const SAISIE_MANUELLE: ProvenanceAmo = { origine: 'SAISIE', derniereLectureVitale: null };

/**
 * Crée une fiche. Si des doublons possibles existent et que l'utilisateur n'a pas confirmé, rien n'est
 * écrit : ErreurDoublonPossible porte les candidats à afficher.
 */
export async function creerPatient(
  acteur: UtilisateurConnecte,
  saisie: unknown,
  { confirmerDoublon = false }: { confirmerDoublon?: boolean } = {},
): Promise<string> {
  const donnees = validerSaisie(saisie);
  await verifierCentreRattachement(acteur, donnees.centreId);
  const doublons = await chercherDoublons(
    acteur,
    {
      nomNaissance: donnees.nomNaissance,
      nomUsage: donnees.nomUsage,
      dateNaissance: donnees.dateNaissance,
      nirEmpreinte: donnees.amo ? empreinteNir(donnees.amo.nir) : null,
      qualite: donnees.amo?.qualite ?? null,
      rangNaissance: donnees.amo?.rangNaissance ?? null,
    },
    null,
  );
  if (aDesDoublons(doublons) && !confirmerDoublon) {
    throw new ErreurDoublonPossible(doublons);
  }
  const p = await withAudit(
    acteur,
    async (tx) => {
      const cree = await tx.patient.create({
        data: { organisationId: acteur.organisationId, ...donneesPatient(donnees) },
        select: { id: true },
      });
      await ecrireCouvertures(tx, cree.id, donnees.amo, SAISIE_MANUELLE, donnees.amc);
      return cree;
    },
    (cree) => ({
      action: 'CREATE',
      entiteType: 'PATIENT',
      entiteId: cree.id,
      patientId: cree.id,
      centreId: donnees.centreId,
      champs: differencesAuditees('PATIENT', null, donnees),
      ...(aDesDoublons(doublons)
        ? {
            details: {
              creationMalgreDoublon: true,
              doublonsVisibles: doublons.visibles.map((d) => d.id),
              doublonsHorsPerimetre: doublons.horsPerimetre.length,
            },
          }
        : {}),
    }),
  );
  return p.id;
}

function memeAmo(a: AmoSaisie | null, b: AmoSaisie | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Modifie une fiche (et ses couvertures). L'acteur doit avoir accès à l'ancien et au nouveau centre.
 * Une couverture AMO modifiée à la main repasse en origine SAISIE (la date de dernière lecture Vitale reste).
 */
export async function modifierPatient(
  acteur: UtilisateurConnecte,
  patientId: string,
  saisie: unknown,
): Promise<void> {
  const actuelle = await lireFiche(base(), acteur, patientId);
  if (actuelle.fusionneDansId !== null) {
    throw new ErreurSaisie({}, 'Cette fiche a été fusionnée : modifiez la fiche conservée.');
  }
  const donnees = validerSaisie(saisie);
  await verifierCentreRattachement(acteur, donnees.centreId);
  const avant = versSaisie(actuelle);
  const provenance: ProvenanceAmo =
    actuelle.amo && memeAmo(avant.amo, donnees.amo)
      ? {
          origine: actuelle.amo.origine,
          derniereLectureVitale: actuelle.amo.derniereLectureVitale,
        }
      : { origine: 'SAISIE', derniereLectureVitale: actuelle.amo?.derniereLectureVitale ?? null };
  await withAudit(
    acteur,
    async (tx) => {
      await tx.patient.update({ where: { id: patientId }, data: donneesPatient(donnees) });
      await ecrireCouvertures(tx, patientId, donnees.amo, provenance, donnees.amc);
    },
    {
      action: 'UPDATE',
      entiteType: 'PATIENT',
      entiteId: patientId,
      patientId,
      centreId: donnees.centreId,
      champs: differencesAuditees('PATIENT', avant, donnees),
    },
  );
}

// ---------------------------------------------------------------------------
// Fusion
// ---------------------------------------------------------------------------

/** Forme comparée à l'écran de fusion : adresse et couvertures en blocs. */
export interface FichePourFusion extends FicheFusion {
  readonly centreId: string;
  readonly civilite: Civilite;
  readonly nomNaissance: string;
  readonly nomUsage: string | null;
  readonly prenoms: string;
  readonly dateNaissance: string;
  readonly sexe: Sexe;
  readonly adresse: {
    readonly ligne1: string | null;
    readonly ligne2: string | null;
    readonly codePostal: string | null;
    readonly ville: string | null;
  };
  readonly telephone: string | null;
  readonly email: string | null;
  readonly medecinTraitant: string | null;
  readonly consentementSms: boolean;
  readonly consentementEmail: boolean;
  readonly consentementCourrier: boolean;
  readonly amo: CouvertureAmoDetail | null;
  readonly amc: CouvertureAmcDetail | null;
}

function versFicheFusion(f: PatientDetail): FichePourFusion {
  return {
    centreId: f.centre.id,
    civilite: f.civilite,
    nomNaissance: f.nomNaissance,
    nomUsage: f.nomUsage,
    prenoms: f.prenoms,
    dateNaissance: f.dateNaissance,
    sexe: f.sexe,
    adresse: {
      ligne1: f.adresseLigne1,
      ligne2: f.adresseLigne2,
      codePostal: f.codePostal,
      ville: f.ville,
    },
    telephone: f.telephone,
    email: f.email,
    medecinTraitant: f.medecinTraitant,
    consentementSms: f.consentementSms,
    consentementEmail: f.consentementEmail,
    consentementCourrier: f.consentementCourrier,
    amo: f.amo,
    amc: f.amc,
    notes: f.notes,
  };
}

export interface PreparationFusion {
  conservee: PatientDetail;
  doublon: PatientDetail;
  /** Champs qui diffèrent, avec la source proposée par défaut. */
  champs: { champ: ChampFusion; parDefaut: SourceFusion }[];
}

/** Fusion : ADMIN ou AUDIO, avec accès aux centres des deux fiches, toutes deux non fusionnées. */
async function lireCouple(
  client: Client,
  acteur: UtilisateurConnecte,
  conserveeId: string,
  doublonId: string,
): Promise<[PatientDetail, PatientDetail]> {
  verifierRole(acteur, 'ADMIN', 'AUDIO');
  if (conserveeId === doublonId) {
    throw new ErreurSaisie({}, 'Choisissez deux fiches différentes.');
  }
  const conservee = await lireFiche(client, acteur, conserveeId);
  const doublon = await lireFiche(client, acteur, doublonId);
  if (conservee.fusionneDansId !== null || doublon.fusionneDansId !== null) {
    throw new ErreurSaisie({}, 'L’une des deux fiches a déjà été fusionnée.');
  }
  return [conservee, doublon];
}

/** Prépare l'écran de fusion : ouvre les deux fiches (deux lignes READ). */
export async function preparerFusion(
  acteur: UtilisateurConnecte,
  conserveeId: string,
  doublonId: string,
): Promise<PreparationFusion> {
  return withAudit(
    acteur,
    async (tx) => {
      const [conservee, doublon] = await lireCouple(tx, acteur, conserveeId, doublonId);
      const a = versFicheFusion(conservee);
      const b = versFicheFusion(doublon);
      return {
        conservee,
        doublon,
        champs: champsDifferents(a, b).map((champ) => ({
          champ,
          parDefaut: sourceParDefaut(a, b, champ),
        })),
      };
    },
    (r) => [evenementLecture(r.conservee), evenementLecture(r.doublon)],
  );
}

/**
 * Fusionne `doublonId` dans `conserveeId` : la fiche conservée reçoit les valeurs choisies, le doublon
 * est marqué fusionné (jamais supprimé) et disparaît des listes. Les fiches déjà fusionnées dans le
 * doublon sont rattachées à la fiche conservée. Deux lignes UPDATE dans le journal.
 */
export async function fusionnerPatients(
  acteur: UtilisateurConnecte,
  conserveeId: string,
  doublonId: string,
  choixSaisis: unknown,
): Promise<void> {
  const choix = valider(choixFusionSchema, choixSaisis);
  const fusionneLe = new Date(horloge.now());
  const details = { fusion: { conservee: conserveeId, doublon: doublonId } };
  await withAudit(
    acteur,
    async (tx) => {
      const [conservee, doublon] = await lireCouple(tx, acteur, conserveeId, doublonId);
      const resultat = fusionnerFiches(versFicheFusion(conservee), versFicheFusion(doublon), choix);
      const avant = versSaisie(conservee);
      const { adresse, amo, ...reste } = resultat;
      const apres: PatientSaisie = {
        ...avant,
        ...reste,
        adresseLigne1: adresse.ligne1,
        adresseLigne2: adresse.ligne2,
        codePostal: adresse.codePostal,
        ville: adresse.ville,
        amo: amo && {
          nir: nirSchema.parse(amo.nir),
          rangNaissance: amo.rangNaissance,
          qualite: amo.qualite,
          regime: amo.regime,
          caisse: amo.caisse,
          centreGestionnaire: amo.centreGestionnaire,
          finDroits: amo.finDroits,
          c2s: amo.c2s,
          ald: amo.ald,
        },
      };
      await tx.patient.update({ where: { id: conserveeId }, data: donneesPatient(apres) });
      await ecrireCouvertures(tx, conserveeId, apres.amo, amo ?? SAISIE_MANUELLE, apres.amc);
      await tx.patient.updateMany({
        where: { fusionneDansId: doublonId },
        data: { fusionneDansId: conserveeId },
      });
      await tx.patient.update({
        where: { id: doublonId },
        data: { fusionneDansId: conserveeId, fusionneLe },
      });
      return { conservee, doublon, avant, apres };
    },
    ({ conservee, doublon, avant, apres }): EvenementAudit[] => [
      {
        action: 'UPDATE',
        entiteType: 'PATIENT',
        entiteId: conservee.id,
        patientId: conservee.id,
        centreId: apres.centreId,
        champs: differencesAuditees('PATIENT', avant, apres),
        details,
      },
      {
        action: 'UPDATE',
        entiteType: 'PATIENT',
        entiteId: doublon.id,
        patientId: doublon.id,
        centreId: doublon.centre.id,
        champs: differencesAuditees(
          'PATIENT',
          { fusionneDansId: null },
          { fusionneDansId: conservee.id },
        ),
        details,
      },
    ],
  );
}
