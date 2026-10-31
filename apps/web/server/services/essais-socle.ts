import {
  etatEssai,
  MESSAGES_REFUS_APPAREIL_ESSAI,
  refusAppareilEssai,
  type AppareilPose,
  type EtatEssai,
  type IssueEssai,
  type Oreille,
} from '@ha/domain';

import type { UtilisateurConnecte } from '../auth/acces';
import type { EvenementAudit } from '../audit/journal';
import type { ClientTransaction } from '../chiffrement';
import { ErreurSaisie } from '../erreurs';
import { aujourdhui, type Client } from './patients';
import {
  appliquerMouvement,
  evenementMouvement,
  selectionAppareil,
  type AppareilLu,
  type Mouvement,
} from './stock';

// Socle partagé par le devis, l'abandon du dossier et le service de l'essai. Il ne dépend pas de
// `dossiers.ts`, qui l'appelle à l'abandon.

/** Colonne `@db.Date` ↔ date calendaire ISO (minuit UTC, sans fuseau). */
function versDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function depuisDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Dossier vu par l'essai : un sous-ensemble de `DossierLu`, sans dépendre de `dossiers.ts`. */
export interface DossierEssai {
  readonly id: string;
  readonly patientId: string;
  readonly centreId: string;
}

const selectionEssai = { id: true, dateDebut: true } as const;

export interface EssaiLu {
  readonly id: string;
  readonly dateDebut: Date;
}

/** L'essai en cours du dossier, `null` s'il n'y en a pas ou s'il est conclu. */
export async function lireEssaiOuvert(client: Client, dossierId: string): Promise<EssaiLu | null> {
  return client.essai.findFirst({ where: { dossierId, issue: null }, select: selectionEssai });
}

/** Lit les rendez-vous et la prolongation : l'échéance se recalcule toujours par `etatEssai`. */
export async function etatDeLEssai(
  client: Client,
  essai: EssaiLu,
  jour: string,
): Promise<EtatEssai> {
  const rdvs = await client.essaiRdv.findMany({
    where: { essaiId: essai.id },
    select: { date: true },
  });
  const prolongation = await client.prolongationEssai.findUnique({
    where: { essaiId: essai.id },
    select: { jours: true },
  });
  return etatEssai({
    debut: depuisDate(essai.dateDebut),
    // Le justificatif est obligatoire : une prolongation enregistrée a sa demande écrite.
    prolongation: prolongation && { jours: prolongation.jours, demandeEcrite: true },
    rdvs: rdvs.map((r) => depuisDate(r.date)),
    aujourdhui: jour,
  });
}

/** Appareils actuellement confiés, pour contrôler leur modèle. */
export async function appareilsActifs(client: Client, essaiId: string): Promise<AppareilPose[]> {
  const liens = await liensActifs(client, essaiId);
  return liens.map((l) => ({ oreille: l.oreille, modeleId: l.appareil.modeleId }));
}

export function evenementEssai(
  action: EvenementAudit['action'],
  essaiId: string,
  dossier: DossierEssai,
  details: Readonly<Record<string, unknown>> = {},
): EvenementAudit {
  return {
    action,
    entiteType: 'ESSAI',
    entiteId: essaiId,
    patientId: dossier.patientId,
    centreId: dossier.centreId,
    details: { dossierId: dossier.id, ...details },
  };
}

function mouvementEssai(
  dossier: DossierEssai,
  statut: 'EN_ESSAI' | 'EN_STOCK' | 'RESERVE',
  motif: string,
): Mouvement {
  return {
    type: 'CHANGEMENT_STATUT',
    statut,
    centreId: dossier.centreId,
    patientId: statut === 'EN_STOCK' ? null : dossier.patientId,
    motif,
    dossierId: dossier.id,
  };
}

async function deplacer(
  tx: ClientTransaction,
  acteur: UtilisateurConnecte,
  appareil: AppareilLu,
  mouvement: Mouvement,
): Promise<EvenementAudit> {
  await appliquerMouvement(tx, acteur, appareil, mouvement);
  return evenementMouvement(appareil, mouvement, appareil.centreId);
}

export interface PoseAppareil {
  readonly essaiId: string;
  readonly oreille: Oreille;
  readonly numeroSerie: string;
  /** `null` : tout modèle convient (changement en cours d'essai). */
  readonly modeleAttendu: string | null;
  readonly champ: string;
  readonly jour: string;
  readonly motif: string;
}

/** Un numéro peut exister chez deux fabricants : on préfère celui du centre, puis celui du modèle attendu. */
async function trouverAppareil(
  tx: ClientTransaction,
  acteur: UtilisateurConnecte,
  dossier: DossierEssai,
  { numeroSerie, modeleAttendu, champ }: PoseAppareil,
): Promise<AppareilLu> {
  const candidats = await tx.appareil.findMany({
    where: { organisationId: acteur.organisationId, numeroSerie },
    select: selectionAppareil,
  });
  const duCentre = candidats.filter((a) => a.centreId === dossier.centreId);
  const appareil =
    duCentre.find((a) => a.modeleId === modeleAttendu) ?? duCentre[0] ?? candidats[0];
  if (!appareil) {
    throw ErreurSaisie.surChamp(champ, 'Numéro de série inconnu.');
  }
  return appareil;
}

/** Confie un appareil : refus par `refusAppareilEssai`, puis mouvement lié au dossier et lien actif. */
export async function poserAppareil(
  tx: ClientTransaction,
  acteur: UtilisateurConnecte,
  dossier: DossierEssai,
  pose: PoseAppareil,
): Promise<EvenementAudit> {
  const appareil = await trouverAppareil(tx, acteur, dossier, pose);
  const refus = refusAppareilEssai(appareil, {
    centreId: dossier.centreId,
    patientId: dossier.patientId,
    modeleAttendu: pose.modeleAttendu,
  });
  if (refus !== null) {
    throw ErreurSaisie.surChamp(pose.champ, MESSAGES_REFUS_APPAREIL_ESSAI[refus]);
  }
  const evenement = await deplacer(
    tx,
    acteur,
    appareil,
    mouvementEssai(dossier, 'EN_ESSAI', pose.motif),
  );
  await tx.essaiAppareil.create({
    data: {
      essaiId: pose.essaiId,
      appareilId: appareil.id,
      oreille: pose.oreille,
      poseLe: versDate(pose.jour),
      poseParId: acteur.id,
    },
  });
  return evenement;
}

interface LienActif {
  readonly id: string;
  readonly oreille: Oreille;
  readonly appareil: AppareilLu;
}

/** En deux requêtes : une transaction ne charge pas de relation imbriquée (ADR-010). */
async function liensActifs(client: Client, essaiId: string): Promise<LienActif[]> {
  const liens = await client.essaiAppareil.findMany({
    where: { essaiId, retireLe: null },
    select: { id: true, oreille: true, appareilId: true },
    orderBy: { oreille: 'asc' },
  });
  const appareils = await client.appareil.findMany({
    where: { id: { in: liens.map((l) => l.appareilId) } },
    select: selectionAppareil,
  });
  return liens.flatMap(({ id, oreille, appareilId }) => {
    const appareil = appareils.find((a) => a.id === appareilId);
    return appareil ? [{ id, oreille, appareil }] : [];
  });
}

/** Rend un appareil au stock et ferme son lien. `motifRetrait` n'est écrit que pour un changement. */
async function retirer(
  tx: ClientTransaction,
  acteur: UtilisateurConnecte,
  dossier: DossierEssai,
  lien: LienActif,
  jour: string,
  motif: string,
  motifRetrait: string | null,
): Promise<EvenementAudit> {
  const evenement = await deplacer(
    tx,
    acteur,
    lien.appareil,
    mouvementEssai(dossier, 'EN_STOCK', motif),
  );
  await tx.essaiAppareil.update({
    where: { id: lien.id },
    data: { retireLe: versDate(jour), retireParId: acteur.id, motifRetrait },
  });
  return evenement;
}

/** Échange : l'ancien appareil de l'oreille revient en stock, l'essai continue sur le suivant. */
export async function retirerAppareilDeLOreille(
  tx: ClientTransaction,
  acteur: UtilisateurConnecte,
  dossier: DossierEssai,
  essaiId: string,
  oreille: Oreille,
  jour: string,
  motif: string,
): Promise<{ ancien: AppareilLu; evenement: EvenementAudit }> {
  const lien = (await liensActifs(tx, essaiId)).find((l) => l.oreille === oreille);
  if (!lien) {
    throw ErreurSaisie.surChamp('oreille', 'Aucun appareil n’est en essai sur cette oreille.');
  }
  return {
    ancien: lien.appareil,
    evenement: await retirer(tx, acteur, dossier, lien, jour, motif, motif),
  };
}

async function clore(
  tx: ClientTransaction,
  essaiId: string,
  issue: IssueEssai,
  jour: string,
): Promise<void> {
  await tx.essai.update({ where: { id: essaiId }, data: { issue, dateFin: versDate(jour) } });
}

/** Achat : les appareils restent liés à l'essai et passent réservés au patient, jusqu'à la vente. */
export async function conclureParAchat(
  tx: ClientTransaction,
  acteur: UtilisateurConnecte,
  dossier: DossierEssai,
  essaiId: string,
  jour: string,
): Promise<EvenementAudit[]> {
  const evenements: EvenementAudit[] = [];
  for (const { appareil } of await liensActifs(tx, essaiId)) {
    const mouvement = mouvementEssai(dossier, 'RESERVE', 'Achat confirmé à l’issue de l’essai');
    evenements.push(await deplacer(tx, acteur, appareil, mouvement));
  }
  await clore(tx, essaiId, 'ACHAT', jour);
  return evenements;
}

/** Abandon du dossier : ferme l'essai ouvert s'il y en a un et remet ses appareils en stock. */
export async function abandonnerEssaiOuvert(
  tx: ClientTransaction,
  acteur: UtilisateurConnecte,
  dossier: DossierEssai,
): Promise<EvenementAudit[]> {
  const essai = await lireEssaiOuvert(tx, dossier.id);
  if (!essai) {
    return [];
  }
  const jour = aujourdhui();
  const evenements: EvenementAudit[] = [];
  for (const lien of await liensActifs(tx, essai.id)) {
    evenements.push(await retirer(tx, acteur, dossier, lien, jour, 'Abandon du dossier', null));
  }
  await clore(tx, essai.id, 'ABANDON', jour);
  return [...evenements, evenementEssai('UPDATE', essai.id, dossier, { issue: 'ABANDON' })];
}
