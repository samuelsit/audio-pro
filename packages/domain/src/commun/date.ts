import { z } from 'zod';

function joursDansLeMois(annee: number, mois: number): number {
  if (mois === 2) {
    const bissextile = (annee % 4 === 0 && annee % 100 !== 0) || annee % 400 === 0;
    return bissextile ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(mois) ? 30 : 31;
}

function jourExiste(annee: number, mois: number, jour: number): boolean {
  return mois >= 1 && mois <= 12 && jour >= 1 && jour <= joursDansLeMois(annee, mois);
}

/** Date calendaire ISO 8601 (AAAA-MM-JJ), sans heure ni fuseau. */
export const dateCalendaireSchema = z
  .string({ error: 'Date invalide.' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Date invalide (format AAAA-MM-JJ).', abort: true })
  .refine((valeur) => {
    const [annee, mois, jour] = valeur.split('-').map(Number) as [number, number, number];
    return jourExiste(annee, mois, jour);
  }, 'Cette date n’existe pas.');
