import { ageAt } from '../patient/age';
import { AGE_SEUIL_TRANCHE } from './constantes';

export const TRANCHES_AGE = ['MOINS_DE_20', 'VINGT_ET_PLUS'] as const;
export type TrancheAge = (typeof TRANCHES_AGE)[number];

/**
 * Tranche d'un âge en années révolues.
 * Source : ameli-100-sante-audio.pdf p. 1 (« 20 ans et plus », « Moins de 20 ans »).
 * À VÉRIFIER : la LPP 908 écrit « > 20 ANS » et « <= A 20 ANS » sur les aides auditives (R1). Lecture
 * d'ameli retenue, validée le 2026-10-30 (ADR-009).
 */
export function trancheDepuisAge(age: number): TrancheAge {
  return age >= AGE_SEUIL_TRANCHE.valeur ? 'VINGT_ET_PLUS' : 'MOINS_DE_20';
}

/**
 * Tranche d'âge à `dateReference`.
 * À VÉRIFIER : aucun texte ne fixe la date de référence (R2). Choix validé : la date de délivrance,
 * où se lisent déjà le tarif (ameli-100-sante-audio.pdf p. 2) et les droits
 * (convention-audioprothesistes.pdf, art. 27, p. 26).
 */
export function trancheAge(dateNaissance: string, dateReference: string): TrancheAge {
  return trancheDepuisAge(ageAt(dateNaissance, dateReference));
}
