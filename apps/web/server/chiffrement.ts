import {
  chargerCleEmpreinte,
  chargerTrousseau,
  ChiffreurAesGcm,
  EmpreinteHmac,
  extensionChampsChiffres,
  type ConfigurationChampsChiffres,
} from '@ha/adapters';
import { prisma } from '@ha/db';
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

function creerBase() {
  return prisma().$extends(extensionChampsChiffres(chiffreur(), CHAMPS_CHIFFRES));
}

let instanceBase: ReturnType<typeof creerBase> | undefined;

/** Client Prisma qui chiffre et déchiffre les champs de CHAMPS_CHIFFRES. */
export function base(): ReturnType<typeof creerBase> {
  instanceBase ??= creerBase();
  return instanceBase;
}

/** Client reçu dans une transaction interactive de `base()`. */
export type ClientTransaction = Parameters<
  Parameters<ReturnType<typeof creerBase>['$transaction']>[0]
>[0];
