import {
  calculerPagination,
  clefCreneau,
  controlesAPlanifier,
  ignoranceControleSchema,
  lireCreneau,
  pageSchema,
  planificationControleSchema,
  peutSuivreSav,
  STATUTS_RDV_PROPOSABLES,
  type ControleAPlanifier,
  type ControleTraite,
  type Pagination,
  type ParametresSav,
  type Perimetre,
} from '@ha/domain';

import {
  AccesRefuseError,
  verifierAccesCentre,
  verifierPerimetre,
  type UtilisateurConnecte,
} from '../auth/acces';
import { withAudit } from '../audit/journal';
import { base } from '../chiffrement';
import { ErreurSaisie, valider } from '../erreurs';
import { centresDuPerimetre } from '../perimetre';
import { chercherCreneaux, creerRdv } from './agenda';
import { depuisDate, versDate } from './dossiers';
import { exigerPatient, parametresSav } from './garanties';
import { aujourdhui } from './patients';
import { LIGNES_PAR_PAGE_SAV } from './tickets-sav';

type Client = ReturnType<typeof base>;

/** Un rendez-vous annulé ou manqué repropose son contrôle ; tout autre statut le traite. */
function controlesTraites(
  lignes: readonly {
    dateReference: Date;
    rang: number;
    statut: 'PLANIFIE' | 'IGNORE';
    rendezVous: { statut: string } | null;
  }[],
): ControleTraite[] {
  return lignes
    .filter(
      ({ statut, rendezVous }) =>
        statut === 'IGNORE' ||
        !STATUTS_RDV_PROPOSABLES.some((proposable) => proposable === rendezVous?.statut),
    )
    .map(({ dateReference, rang }) => ({ dateReference: depuisDate(dateReference), rang }));
}

const selectionDecision = {
  patientId: true,
  dateReference: true,
  rang: true,
  statut: true,
  rendezVous: { select: { statut: true } },
} as const;

async function controlesDe(
  client: Client,
  patientId: string,
  parametres: ParametresSav,
  jour: string,
): Promise<ControleAPlanifier[]> {
  const [delivrances, decisions] = await Promise.all([
    client.delivrance.findMany({
      where: { patientId, annuleeLe: null },
      select: { dateDelivrance: true, oreille: true },
    }),
    client.controleSuivi.findMany({ where: { patientId }, select: selectionDecision }),
  ]);
  return controlesAPlanifier(
    delivrances.map((d) => ({ ...d, dateDelivrance: depuisDate(d.dateDelivrance) })),
    parametres,
    controlesTraites(decisions),
    jour,
  );
}

export function controlesDuPatient(
  acteur: UtilisateurConnecte,
  patientId: string,
): Promise<ControleAPlanifier[]> {
  const client = base(acteur);
  return exigerPatient(client, acteur, patientId).then(async () =>
    controlesDe(
      client,
      patientId,
      await parametresSav(client, acteur.organisationId),
      aujourdhui(),
    ),
  );
}

export interface ControleListe extends ControleAPlanifier {
  patientId: string;
  patient: string;
  centreId: string;
  centre: string;
}

/**
 * Contrôles à planifier du périmètre, centre de rattachement du patient. Calculés en mémoire, depuis les délivrances
 * de la page en cours : quelques milliers de patients au plus par client (à revoir si un réseau dépasse cet ordre).
 */
export async function listerControles(
  acteur: UtilisateurConnecte,
  perimetre: Perimetre,
  parametres: { page?: string | undefined },
): Promise<{ lignes: ControleListe[]; pagination: Pagination }> {
  verifierPerimetre(acteur, perimetre);
  const centres = centresDuPerimetre(acteur, perimetre);
  const client = base(acteur);
  const patients = await client.patient.findMany({
    where: {
      organisationId: acteur.organisationId,
      fusionneDansId: null,
      ...(centres === null ? {} : { centreId: { in: [...centres] } }),
      delivrances: { some: { annuleeLe: null } },
    },
    select: {
      id: true,
      nomNaissance: true,
      nomUsage: true,
      prenoms: true,
      centreId: true,
      centre: { select: { nom: true } },
      delivrances: {
        where: { annuleeLe: null },
        select: { dateDelivrance: true, oreille: true },
      },
    },
  });
  const decisions = await client.controleSuivi.findMany({
    where: { patientId: { in: patients.map((p) => p.id) } },
    select: selectionDecision,
  });
  const reglages = await parametresSav(client, acteur.organisationId);
  const jour = aujourdhui();
  const tous = patients
    .flatMap((p) =>
      controlesAPlanifier(
        p.delivrances.map((d) => ({ ...d, dateDelivrance: depuisDate(d.dateDelivrance) })),
        reglages,
        controlesTraites(decisions.filter((c) => c.patientId === p.id)),
        jour,
      ).map((controle) => ({
        ...controle,
        patientId: p.id,
        patient: `${p.nomUsage ?? p.nomNaissance} ${p.prenoms}`,
        centreId: p.centreId,
        centre: p.centre.nom,
      })),
    )
    .sort((a, b) => a.datePrevue.localeCompare(b.datePrevue));
  const pagination = calculerPagination(
    tous.length,
    pageSchema.parse(parametres.page),
    LIGNES_PAR_PAGE_SAV,
  );
  return {
    lignes: tous.slice(pagination.decalage, pagination.decalage + LIGNES_PAR_PAGE_SAV),
    pagination,
  };
}

export interface CreneauControle {
  clef: string;
  date: string;
  heure: string;
  praticien: string | null;
}

/**
 * Créneaux libres à partir de l'échéance, ou d'aujourd'hui si elle est passée. Le type se nomme « Suivi » par défaut
 * (`types-defaut.ts`) : une organisation peut l'avoir renommé, l'écran laisse donc le choix.
 */
export async function creneauxPourControle(
  acteur: UtilisateurConnecte,
  patientId: string,
  saisie: { datePrevue: string; typeRdvId: string | undefined; centreId: string | undefined },
): Promise<{
  creneaux: CreneauControle[];
  types: { id: string; nom: string; dureeMinutes: number }[];
  typeRdvId: string;
  centreId: string;
}> {
  const client = base(acteur);
  await exigerPatient(client, acteur, patientId);
  const { centreId: centrePatient } = await client.patient.findUniqueOrThrow({
    where: { id: patientId },
    select: { centreId: true },
  });
  const centreId = saisie.centreId ?? centrePatient;
  verifierAccesCentre(acteur, centreId);
  const types = await client.typeRdv.findMany({
    where: { actif: true, natureEssai: null },
    select: { id: true, nom: true, dureeMinutes: true },
    orderBy: { nom: 'asc' },
  });
  const typeRdvId =
    types.find((t) => t.id === saisie.typeRdvId)?.id ??
    types.find((t) => t.nom === 'Suivi')?.id ??
    types[0]?.id;
  if (typeRdvId === undefined) {
    return { creneaux: [], types, typeRdvId: '', centreId };
  }
  const jour = aujourdhui();
  const depuis = saisie.datePrevue > jour ? saisie.datePrevue : jour;
  const creneaux = await chercherCreneaux(acteur, {
    centreId,
    typeRdvId,
    praticienId: '',
    depuis,
  });
  return {
    creneaux: creneaux.map((c) => ({
      clef: clefCreneau(c),
      date: c.date,
      heure: c.heure,
      praticien: c.praticien,
    })),
    types,
    typeRdvId,
    centreId,
  };
}

async function verifierControle(
  client: Client,
  acteur: UtilisateurConnecte,
  patientId: string,
  dateReference: string,
): Promise<void> {
  await exigerPatient(client, acteur, patientId);
  const trouve = await client.delivrance.count({
    where: { patientId, annuleeLe: null, dateDelivrance: versDate(dateReference) },
  });
  if (trouve === 0) {
    throw new ErreurSaisie({}, 'Aucune délivrance à cette date pour ce patient.');
  }
}

/** Le rendez-vous passe par `creerRdv` : ses contrôles d'agenda et son événement `RDV_CREE` restent les mêmes. */
export async function planifierControle(
  acteur: UtilisateurConnecte,
  saisie: unknown,
): Promise<string> {
  if (!peutSuivreSav(acteur.role)) {
    throw new AccesRefuseError();
  }
  const { patientId, dateReference, rang, centreId, typeRdvId, creneau } = valider(
    planificationControleSchema,
    saisie,
  );
  const client = base(acteur);
  await verifierControle(client, acteur, patientId, dateReference);
  const type = await client.typeRdv.findFirst({
    where: { id: typeRdvId, actif: true },
    select: { dureeMinutes: true },
  });
  if (!type) {
    throw ErreurSaisie.surChamp('typeRdvId', 'Type de rendez-vous inconnu.');
  }
  const { date, heure, praticienId, cabineId } = lireCreneau(creneau);
  const rendezVousId = await creerRdv(acteur, {
    date,
    heure,
    dureeMinutes: type.dureeMinutes,
    centreId,
    typeRdvId,
    patientId,
    prospectNom: '',
    prospectTelephone: '',
    dossierId: '',
    praticienId,
    cabineId,
    origine: 'INTERNE',
    notes: '',
  });
  const reference = versDate(dateReference);
  const decision = {
    centreId,
    statut: 'PLANIFIE',
    rendezVousId,
    motif: null,
    createdById: acteur.id,
  } as const;
  await withAudit(
    acteur,
    (tx) =>
      tx.controleSuivi.upsert({
        where: { patientId_dateReference_rang: { patientId, dateReference: reference, rang } },
        create: {
          ...decision,
          organisationId: acteur.organisationId,
          patientId,
          dateReference: reference,
          rang,
        },
        update: decision,
        select: { id: true },
      }),
    ({ id }) => ({
      action: 'UPDATE',
      entiteType: 'CONTROLE_SUIVI',
      entiteId: id,
      patientId,
      centreId,
      details: { rang, rendezVousId },
    }),
  );
  return rendezVousId;
}

/** Le patient décline, ou le contrôle n'a plus lieu d'être : l'art. 19 ne l'impose pas à chacun. */
export async function ignorerControle(acteur: UtilisateurConnecte, saisie: unknown): Promise<void> {
  if (!peutSuivreSav(acteur.role)) {
    throw new AccesRefuseError();
  }
  const { patientId, dateReference, rang, motif } = valider(ignoranceControleSchema, saisie);
  const client = base(acteur);
  await verifierControle(client, acteur, patientId, dateReference);
  const { centreId } = await client.patient.findUniqueOrThrow({
    where: { id: patientId },
    select: { centreId: true },
  });
  const reference = versDate(dateReference);
  const decision = {
    centreId,
    statut: 'IGNORE',
    rendezVousId: null,
    motif,
    createdById: acteur.id,
  } as const;
  await withAudit(
    acteur,
    async (tx) => {
      const existant = await tx.controleSuivi.findUnique({
        where: { patientId_dateReference_rang: { patientId, dateReference: reference, rang } },
        select: { id: true },
      });
      if (existant) {
        await tx.controleSuivi.update({ where: { id: existant.id }, data: decision });
        return existant;
      }
      return tx.controleSuivi.create({
        data: {
          ...decision,
          organisationId: acteur.organisationId,
          patientId,
          dateReference: reference,
          rang,
        },
        select: { id: true },
      });
    },
    ({ id }) => ({
      action: 'UPDATE',
      entiteType: 'CONTROLE_SUIVI',
      entiteId: id,
      patientId,
      centreId,
      details: { rang, statut: 'IGNORE' },
    }),
  );
}
