import type { PointAudiogramme } from './audiogramme';
import { FREQUENCES_PERTE_MOYENNE } from './frequences';

/** Source : biap-rec-02-2-en.pdf p. 2. */
export const SEUIL_SANS_REPONSE_DB = 120;

export function seuilRetenu(point: Pick<PointAudiogramme, 'seuil'>): number {
  return point.seuil ?? SEUIL_SANS_REPONSE_DB;
}

/**
 * Perte moyenne d'une oreille, sur la conduction aérienne.
 * Source : biap-rec-02-2-en.pdf p. 2.
 * Une fréquence non saisie rend la moyenne non calculable : aucune estimation (ADR-022).
 */
export function perteMoyenneTonale(aerienne: readonly PointAudiogramme[]): number | null {
  let somme = 0;
  for (const frequence of FREQUENCES_PERTE_MOYENNE) {
    const point = aerienne.find((p) => p.frequence === frequence);
    if (point === undefined) {
      return null;
    }
    somme += seuilRetenu(point);
  }
  return somme / FREQUENCES_PERTE_MOYENNE.length;
}

/** Affichage à une décimale ; le classement, lui, n'arrondit pas (ADR-022). */
export function formaterDb(valeur: number): string {
  return `${valeur.toFixed(1).replace('.', ',')} dB HL`;
}
