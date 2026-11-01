import { ajouterJours } from '../commun/date';

const FIXES = ['01-01', '05-01', '05-08', '07-14', '08-15', '11-01', '11-11', '12-25'];

/** Dimanche de Pâques, calendrier grégorien (algorithme de Butcher). */
export function dimanchePaques(annee: number): string {
  const a = annee % 19;
  const b = Math.floor(annee / 100);
  const c = annee % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return `${String(annee)}-${String(mois).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
}

/**
 * Jour férié national : les fixes, lundi de Pâques, Ascension, lundi de Pentecôte.
 * À VÉRIFIER : liste absente de docs/ref ; jours propres à l'Alsace-Moselle et aux outre-mer non couverts.
 */
export function estFerie(date: string): boolean {
  if (FIXES.includes(date.slice(5))) {
    return true;
  }
  const paques = dimanchePaques(Number(date.slice(0, 4)));
  return [1, 39, 50].some((decalage) => ajouterJours(paques, decalage) === date);
}
