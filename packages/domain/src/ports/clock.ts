/**
 * Source unique du temps pour le domaine (jamais `new Date()` dans packages/domain).
 * `now()` renvoie un instant ISO 8601 avec décalage, exprimé dans le fuseau Europe/Paris
 * (ex. « 2026-10-29T14:30:00.000+01:00 »).
 */
export interface Clock {
  now(): string;
}

export const FUSEAU_HORAIRE = 'Europe/Paris';
