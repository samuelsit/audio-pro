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

/** Date calendaire déjà validée → [année, mois, jour]. */
export function decomposerDate(date: string): [number, number, number] {
  const [annee = 0, mois = 0, jour = 0] = date.split('-').map(Number);
  return [annee, mois, jour];
}

function formaterDate(annee: number, mois: number, jour: number): string {
  const mm = String(mois).padStart(2, '0');
  const jj = String(jour).padStart(2, '0');
  return `${String(annee)}-${mm}-${jj}`;
}

/** `date` + `jours` jours calendaires, négatif pour reculer. */
export function ajouterJours(date: string, jours: number): string {
  const [debutAnnee, debutMois, debutJour] = decomposerDate(date);
  let annee = debutAnnee;
  let mois = debutMois;
  let jour = debutJour + jours;
  while (jour > joursDansLeMois(annee, mois)) {
    jour -= joursDansLeMois(annee, mois);
    mois = mois === 12 ? 1 : mois + 1;
    annee = mois === 1 ? annee + 1 : annee;
  }
  while (jour < 1) {
    mois = mois === 1 ? 12 : mois - 1;
    annee = mois === 12 ? annee - 1 : annee;
    jour += joursDansLeMois(annee, mois);
  }
  return formaterDate(annee, mois, jour);
}

/**
 * `date` + `mois` mois calendaires (positif ou nul). Si le jour n'existe pas dans le mois d'arrivée,
 * on prend le dernier jour de ce mois.
 */
export function ajouterMois(date: string, mois: number): string {
  const [annee, moisDepart, jour] = decomposerDate(date);
  const total = moisDepart - 1 + mois;
  const anneeArrivee = annee + Math.floor(total / 12);
  const moisArrivee = (total % 12) + 1;
  const dernierJour = joursDansLeMois(anneeArrivee, moisArrivee);
  return formaterDate(anneeArrivee, moisArrivee, Math.min(jour, dernierJour));
}

const MS_PAR_JOUR = 86_400_000;

function numeroDeJour(date: string): number {
  const [annee, mois, jour] = decomposerDate(date);
  return Date.UTC(annee, mois - 1, jour) / MS_PAR_JOUR;
}

/** Nombre de jours calendaires de `debut` à `fin`, négatif si `fin` précède `debut`. */
export function joursEntre(debut: string, fin: string): number {
  return numeroDeJour(fin) - numeroDeJour(debut);
}
