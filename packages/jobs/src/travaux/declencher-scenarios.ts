import type { EmpreinteAdresse } from '@ha/adapters';
import {
  ecrireMessage,
  lireParametresCommunication,
  modelesDesScenarios,
  type EntreeMessage,
  type TxCommunication,
} from '@ha/communication';
import { clientPlateforme } from '@ha/db';
import {
  ajouterJours,
  anniversaireAppareillage,
  bornesJourMs,
  controlesAAnnoncer,
  controlesAPlanifier,
  controlesTraites,
  echeanceEssaiProche,
  FINALITE_SCENARIO,
  finGarantieProche,
  jourOuvertEnvoi,
  localDepuisInstant,
  PARAMETRES_SAV_DEFAUT,
  rangRelanceDevis,
  rappelRdvDu,
  renouvellementsPossibles,
  type CanalMessage,
  type Oreille,
  type ParametresCommunication,
  type ScenarioCommunication,
} from '@ha/domain';
import { z } from 'zod';

import type { FileTravaux } from '../file';
import {
  definirTravail,
  enTransactionChiffree,
  type ContexteTravail,
  type Travail,
} from '../travail';

const charge = z.object({});
type Charge = typeof charge;

/** Un jour : le rapport est plat, et une date Prisma `@db.Date` se lit en UTC. */
function jourDe(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export const SELECTION_PATIENT_MESSAGE = {
  id: true,
  centreId: true,
  prenoms: true,
  telephone: true,
  email: true,
  adresseLigne1: true,
  codePostal: true,
  ville: true,
  fusionneDansId: true,
  consentementSms: true,
  consentementEmail: true,
  consentementCourrier: true,
  consentementSmsCommercial: true,
  consentementEmailCommercial: true,
  consentementCourrierCommercial: true,
} as const;

export interface DependancesScenarios {
  readonly empreinte: EmpreinteAdresse;
  readonly urlPublique: string;
  readonly maintenant?: () => Date;
}

interface Evenement {
  readonly patientId: string;
  readonly cle: string;
  readonly centreId?: string;
  readonly rdv?: EntreeMessage['rdv'];
  readonly entiteId?: string;
  readonly expireLe?: Date;
}

type ContexteScenario = ContexteTravail & {
  readonly jour: string;
  readonly parametres: ParametresCommunication;
};

async function rappels(ctx: ContexteScenario, ecart: number, code: string): Promise<Evenement[]> {
  const dateRdv = ajouterJours(ctx.jour, ecart);
  const { debut, fin } = bornesJourMs(dateRdv);
  const rdvs = await ctx.client.rendezVous.findMany({
    where: {
      debut: { gte: new Date(debut), lt: new Date(fin) },
      statut: { in: ['PLANIFIE', 'CONFIRME'] },
      patientId: { not: null },
    },
    select: { id: true, debut: true, patientId: true, centreId: true },
  });
  return rdvs.flatMap((rdv) => {
    const local = localDepuisInstant(rdv.debut.getTime());
    return rappelRdvDu(local.date, ctx.jour, ecart)
      ? [
          {
            patientId: rdv.patientId as string,
            centreId: rdv.centreId,
            cle: `${code}:${rdv.id}:${rdv.debut.toISOString()}`,
            rdv: { id: rdv.id, debut: rdv.debut, ...local },
            expireLe: rdv.debut,
          },
        ]
      : [];
  });
}

async function relancesDevis({ client, jour, parametres }: ContexteScenario): Promise<Evenement[]> {
  const devis = await client.devis.findMany({
    where: { statut: 'EMIS', dateEmission: { not: null }, dateFinValidite: { not: null } },
    select: {
      id: true,
      dateEmission: true,
      dateFinValidite: true,
      dossier: { select: { patientId: true, centreId: true } },
    },
  });
  return devis.flatMap((d) => {
    const rang = rangRelanceDevis({
      dateEmission: jourDe(d.dateEmission as Date),
      dateFinValidite: jourDe(d.dateFinValidite as Date),
      delaiJours: parametres.devisDelaiJours,
      relancesMax: parametres.devisRelancesMax,
      jour,
    });
    return rang === null
      ? []
      : [
          {
            patientId: d.dossier.patientId,
            centreId: d.dossier.centreId,
            cle: `RELANCE_DEVIS:${d.id}:${String(rang)}`,
            entiteId: d.id,
          },
        ];
  });
}

async function finsEssai({ client, jour, parametres }: ContexteScenario): Promise<Evenement[]> {
  const essais = await client.essai.findMany({
    where: { issue: null },
    select: {
      id: true,
      dateDebut: true,
      prolongation: { select: { jours: true } },
      dossier: { select: { patientId: true, centreId: true } },
    },
  });
  return essais.flatMap((e) => {
    const echeance = echeanceEssaiProche({
      debut: jourDe(e.dateDebut),
      // Une prolongation enregistrée porte sa demande écrite : le justificatif est obligatoire.
      prolongation: e.prolongation ? { jours: e.prolongation.jours, demandeEcrite: true } : null,
      jour,
      avanceJours: parametres.finEssaiAvanceJours,
    });
    return echeance === null
      ? []
      : [
          {
            patientId: e.dossier.patientId,
            centreId: e.dossier.centreId,
            cle: `FIN_ESSAI:${e.id}:${echeance}`,
            entiteId: e.id,
          },
        ];
  });
}

async function delivrancesParPatient(
  client: ContexteTravail['client'],
): Promise<Map<string, { dateDelivrance: string; oreille: Oreille }[]>> {
  const lignes = await client.delivrance.findMany({
    where: { annuleeLe: null },
    select: { patientId: true, dateDelivrance: true, oreille: true },
  });
  const parPatient = new Map<string, { dateDelivrance: string; oreille: Oreille }[]>();
  for (const { patientId, dateDelivrance, oreille } of lignes) {
    parPatient.set(patientId, [
      ...(parPatient.get(patientId) ?? []),
      { dateDelivrance: jourDe(dateDelivrance), oreille },
    ]);
  }
  return parPatient;
}

async function controles(ctx: ContexteScenario): Promise<Evenement[]> {
  const { client, organisationId, jour, parametres } = ctx;
  const sav =
    (await client.parametresSav.findUnique({ where: { organisationId } })) ?? PARAMETRES_SAV_DEFAUT;
  const decisions = await client.controleSuivi.findMany({
    select: {
      patientId: true,
      dateReference: true,
      rang: true,
      statut: true,
      rendezVous: { select: { statut: true } },
    },
  });
  const delivrances = await delivrancesParPatient(client);
  return [...delivrances].flatMap(([patientId, liste]) => {
    const traites = controlesTraites(
      decisions
        .filter((d) => d.patientId === patientId)
        .map((d) => ({ ...d, dateReference: jourDe(d.dateReference) })),
    );
    return controlesAAnnoncer(
      controlesAPlanifier(liste, sav, traites, jour),
      jour,
      parametres.controleAvanceJours,
    ).map((c) => ({
      patientId,
      cle: `CONTROLE_ANNUEL:${patientId}:${c.dateReference}:${String(c.rang)}`,
    }));
  });
}

async function renouvellements({
  client,
  jour,
  parametres,
}: ContexteScenario): Promise<Evenement[]> {
  const delivrances = await delivrancesParPatient(client);
  return [...delivrances].flatMap(([patientId, liste]) =>
    renouvellementsPossibles(liste, jour, parametres.renouvellementFenetreJours).map((date) => ({
      patientId,
      cle: `RENOUVELLEMENT:${patientId}:${date}`,
    })),
  );
}

async function garanties({ client, jour, parametres }: ContexteScenario): Promise<Evenement[]> {
  const lignes = await client.garantieAppareil.findMany({
    where: {
      dateFin: {
        gte: new Date(jour),
        lte: new Date(ajouterJours(jour, parametres.garantieAvanceJours)),
      },
      appareil: { statut: { not: 'REMPLACE' } },
    },
    select: {
      id: true,
      dateFin: true,
      patientId: true,
      appareil: { select: { patientId: true } },
    },
  });
  return lignes
    .filter(
      (g) =>
        g.appareil.patientId === g.patientId &&
        finGarantieProche(jourDe(g.dateFin), jour, parametres.garantieAvanceJours),
    )
    .map((g) => ({ patientId: g.patientId, cle: `FIN_GARANTIE:${g.id}:${jourDe(g.dateFin)}` }));
}

async function anniversaires({ client, jour }: ContexteScenario): Promise<Evenement[]> {
  const delivrances = await delivrancesParPatient(client);
  return [...delivrances].flatMap(([patientId, liste]) => {
    const derniere = liste
      .map((d) => d.dateDelivrance)
      .sort()
      .at(-1) as string;
    const annees = anniversaireAppareillage(derniere, jour);
    return annees === null
      ? []
      : [{ patientId, cle: `ANNIVERSAIRE:${patientId}:${derniere}:${String(annees)}` }];
  });
}

const DECLENCHEURS: Partial<
  Record<ScenarioCommunication, (ctx: ContexteScenario) => Promise<Evenement[]>>
> = {
  RAPPEL_RDV_J2: (ctx) => rappels(ctx, 2, 'RAPPEL_RDV_J2'),
  RAPPEL_RDV_J1: (ctx) => rappels(ctx, 1, 'RAPPEL_RDV_J1'),
  RELANCE_DEVIS: relancesDevis,
  FIN_ESSAI: finsEssai,
  CONTROLE_ANNUEL: controles,
  RENOUVELLEMENT: renouvellements,
  FIN_GARANTIE: garanties,
  ANNIVERSAIRE: anniversaires,
};

/** Coordonnées des centres, et page de réservation de ceux qui en ont une. */
export async function centresDuClient(
  client: ContexteTravail['client'],
  organisationId: string,
  urlPublique: string,
): Promise<Map<string, { id: string; nom: string; telephone: string; lien?: string }>> {
  const { slug } = await client.organisation.findUniqueOrThrow({
    where: { id: organisationId },
    select: { slug: true },
  });
  const centres = await client.centre.findMany({
    select: { id: true, nom: true, telephone: true, slug: true },
  });
  const ouverts = await client.parametresReservation.findMany({
    where: { actif: true },
    select: { centreId: true },
  });
  return new Map(
    centres.map((c) => [
      c.id,
      {
        id: c.id,
        nom: c.nom,
        telephone: c.telephone,
        ...(ouverts.some((o) => o.centreId === c.id)
          ? { lien: `${urlPublique}/rdv/${slug}/${c.slug}` }
          : {}),
      },
    ]),
  );
}

/** Écrit les messages dus d'un scénario. La clé d'idempotence fait qu'un rejeu n'en ajoute aucun. */
export async function ecrireEvenements(
  contexte: ContexteTravail,
  scenario: ScenarioCommunication,
  canaux: readonly CanalMessage[],
  evenements: readonly Evenement[],
  { empreinte, urlPublique }: DependancesScenarios,
): Promise<void> {
  if (evenements.length === 0) {
    return;
  }
  const { client, organisationId } = contexte;
  const modeles = await modelesDesScenarios(client as unknown as TxCommunication);
  const { textes, version } = modeles(scenario);
  const centres = await centresDuClient(client, organisationId, urlPublique);
  const patients = await client.patient.findMany({
    where: {
      id: { in: [...new Set(evenements.map((e) => e.patientId))] },
      fusionneDansId: null,
    },
    select: SELECTION_PATIENT_MESSAGE,
  });
  const fiches = new Map(patients.map((p) => [p.id, p]));
  for (const evenement of evenements) {
    const patient = fiches.get(evenement.patientId);
    const centre = patient && centres.get(evenement.centreId ?? patient.centreId);
    if (patient === undefined || centre === undefined) {
      continue;
    }
    await enTransactionChiffree(organisationId, (tx) =>
      ecrireMessage(
        tx,
        {
          organisationId,
          centre,
          patient,
          canaux,
          finalite: FINALITE_SCENARIO[scenario],
          scenario,
          textes,
          modeleVersion: version,
          cleIdempotence: `scenario:${evenement.cle}`,
          ...(evenement.rdv ? { rdv: evenement.rdv } : {}),
          ...(evenement.entiteId === undefined ? {} : { entiteId: evenement.entiteId }),
          ...(evenement.expireLe === undefined ? {} : { expireLe: evenement.expireLe }),
          ...(centre.lien === undefined ? {} : { lien: centre.lien }),
        },
        { empreinte, urlPublique },
      ),
    );
  }
}

/**
 * Déclenche les scénarios actifs d'un client. Un jour fermé n'écrit rien : un rappel n'est pas reporté, le
 * reste part le jour ouvert suivant, dans la tolérance de son déclencheur. Sans rattrapage de l'arriéré.
 */
export function travailScenarios(dependances: DependancesScenarios): Travail<Charge> {
  const { maintenant = () => new Date() } = dependances;
  return definirTravail({
    nom: 'declencher-scenarios',
    charge,
    async executer(contexte) {
      const { client, organisationId } = contexte;
      const jour = localDepuisInstant(maintenant().getTime()).date;
      const parametres = await lireParametresCommunication(
        client as unknown as TxCommunication,
        organisationId,
      );
      if (!jourOuvertEnvoi(parametres, jour)) {
        return;
      }
      const reglages = await client.reglageScenario.findMany({ where: { actif: true } });
      for (const { scenario, canaux } of reglages) {
        const declencheur = DECLENCHEURS[scenario];
        if (declencheur !== undefined) {
          const evenements = await declencheur({ ...contexte, jour, parametres });
          await ecrireEvenements(contexte, scenario, canaux, evenements, dependances);
        }
      }
    },
  });
}

/** Met en file les seuls clients qui ont activé un scénario. */
export async function repartirScenarios(
  file: FileTravaux,
  travail: Travail<Charge>,
): Promise<void> {
  const actifs = await clientPlateforme().$queryRaw<{ organisationId: string }[]>`
    SELECT DISTINCT organisation_id AS "organisationId" FROM reglage_scenario WHERE actif`;
  for (const { organisationId } of actifs) {
    await file.envoyer(travail, { organisationId, cleIdempotence: 'scenarios', charge: {} });
  }
}
