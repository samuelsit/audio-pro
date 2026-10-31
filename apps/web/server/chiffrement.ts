import {
  chargerCleEmpreinte,
  chargerTrousseau,
  ChiffreurAesGcm,
  EmpreinteHmac,
  extensionChampsChiffres,
  type ConfigurationChampsChiffres,
} from '@ha/adapters';
import { clientApplication, clientOrganisation, poserContexte } from '@ha/db';
import { nirSansCle, type Nir } from '@ha/domain';

/**
 * Champs chiffrés en base, par modèle Prisma, avec leur contexte (voir ADR-005).
 * Chaque colonne ajoutée ici reçoit aussi une contrainte `CHECK (colonne LIKE 'v1.%')` dans sa migration.
 */
export const CHAMPS_CHIFFRES: ConfigurationChampsChiffres = {
  Patient: { notes: 'patient.notes' },
  CouvertureAmo: { nir: 'couverture_amo.nir', ald: 'couverture_amo.ald' },
  MouvementAppareil: { motif: 'mouvement_appareil.motif' },
  MouvementAccessoire: { motif: 'mouvement_accessoire.motif' },
  Dossier: { surdicecite: 'dossier.surdicecite' },
  TransitionDossier: { motif: 'transition_dossier.motif' },
  Prescription: { motifForcage: 'prescription.motif_forcage' },
  EssaiAppareil: { motifRetrait: 'essai_appareil.motif_retrait' },
  EssaiRdv: { compteRendu: 'essai_rdv.compte_rendu' },
  ProlongationEssai: { motif: 'prolongation_essai.motif' },
};

let instanceChiffreur: ChiffreurAesGcm | undefined;

/** Chiffreur créé au premier appel, depuis CHIFFREMENT_CLES et CHIFFREMENT_CLE_ACTIVE. */
export function chiffreur(): ChiffreurAesGcm {
  instanceChiffreur ??= new ChiffreurAesGcm(chargerTrousseau(process.env));
  return instanceChiffreur;
}

let instanceEmpreinte: EmpreinteHmac | undefined;

/** Empreinte HMAC du NIR (13 caractères, sans la clé) : recherche exacte et doublons (ADR-006). */
export function empreinteNir(nir: Nir): string {
  instanceEmpreinte ??= new EmpreinteHmac(chargerCleEmpreinte(process.env));
  return instanceEmpreinte.calculer(nirSansCle(nir), 'couverture_amo.nir');
}

function creerBase(organisationId: string) {
  return clientOrganisation(organisationId).$extends(
    extensionChampsChiffres(chiffreur(), CHAMPS_CHIFFRES),
  );
}

const instancesBase = new Map<string, ReturnType<typeof creerBase>>();

/** Ce qui désigne le client de l'éditeur : en pratique, l'acteur connecté. */
export interface ContexteClient {
  readonly organisationId: string;
}

/**
 * Client Prisma du client de l'acteur, soumis à la RLS (ADR-016), qui chiffre et déchiffre les champs de
 * CHAMPS_CHIFFRES. C'est le seul accès des services aux données métier.
 */
export function base(contexte: ContexteClient): ReturnType<typeof creerBase> {
  let instance = instancesBase.get(contexte.organisationId);
  if (!instance) {
    instance = creerBase(contexte.organisationId);
    instancesBase.set(contexte.organisationId, instance);
  }
  return instance;
}

function creerClientTransactions() {
  return clientApplication().$extends(extensionChampsChiffres(chiffreur(), CHAMPS_CHIFFRES));
}

let instanceTransactions: ReturnType<typeof creerClientTransactions> | undefined;

/** Client des transactions interactives : toujours avec `poserContexte`, voir `enTransaction`. */
export function clientTransactions(): ReturnType<typeof creerClientTransactions> {
  instanceTransactions ??= creerClientTransactions();
  return instanceTransactions;
}

/** Client reçu dans une transaction interactive. */
export type ClientTransaction = Parameters<
  Parameters<ReturnType<typeof creerClientTransactions>['$transaction']>[0]
>[0];

/** Transaction interactive dans le contexte du client : `withAudit` passe par ici. */
export function enTransaction<T>(
  contexte: ContexteClient,
  operation: (tx: ClientTransaction) => Promise<T>,
): Promise<T> {
  return clientTransactions().$transaction(async (tx) => {
    await poserContexte(tx, contexte.organisationId);
    return operation(tx);
  });
}
