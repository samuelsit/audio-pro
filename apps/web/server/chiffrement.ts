import {
  chargerTrousseau,
  ChiffreurAesGcm,
  extensionChampsChiffres,
  type ConfigurationChampsChiffres,
} from '@ha/adapters';
import { prisma } from '@ha/db';

/**
 * Champs chiffrés en base, par modèle Prisma, avec leur contexte (voir ADR-005).
 * Rempli à partir de l'étape 3 (patients) ; chaque colonne ajoutée ici reçoit aussi une contrainte
 * `CHECK (colonne LIKE 'v1.%')` dans sa migration.
 */
export const CHAMPS_CHIFFRES: ConfigurationChampsChiffres = {};

let instanceChiffreur: ChiffreurAesGcm | undefined;

/** Chiffreur créé au premier appel, depuis CHIFFREMENT_CLES et CHIFFREMENT_CLE_ACTIVE. */
export function chiffreur(): ChiffreurAesGcm {
  instanceChiffreur ??= new ChiffreurAesGcm(chargerTrousseau(process.env));
  return instanceChiffreur;
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
