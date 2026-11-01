import { z } from 'zod';

import { dateCalendaireSchema } from '../commun/date';
import { texteObligatoire } from '../commun/texte';

export interface QuotaPilesDate {
  readonly debut: string;
  readonly boitesParAn: number;
}

/**
 * Quota d'une date, `null` si aucun n'est saisi.
 * À VÉRIFIER : aucun texte de docs/ref ne fixe de quota, `QTE_MAX` vaut 0 sur les piles sans dictionnaire qui
 * en donne le sens (R15). La table reste vide tant qu'un texte n'est pas déposé : aucune valeur n'est inventée.
 */
export function quotaPilesEnVigueur(
  quotas: readonly QuotaPilesDate[],
  date: string,
): number | null {
  const applicables = quotas
    .filter((q) => q.debut <= date)
    .sort((a, b) => b.debut.localeCompare(a.debut));
  return applicables[0]?.boitesParAn ?? null;
}

export interface LignePilesVendue {
  readonly quantite: number;
  readonly prixTtcCentimes: number;
  /** Cumul TTC des avoirs validés sur cette ligne. */
  readonly repriseTtcCentimes: number;
}

/**
 * Boîtes remboursées, nettes d'avoirs. Un avoir partiel se prorate au montant, arrondi à la boîte supérieure : il
 * ne porte pas de quantité. Choix applicatif, À VÉRIFIER.
 */
export function boitesRemboursees(lignes: readonly LignePilesVendue[]): number {
  return lignes.reduce((total, { quantite, prixTtcCentimes, repriseTtcCentimes }) => {
    const reste = prixTtcCentimes === 0 ? 0 : 1 - repriseTtcCentimes / prixTtcCentimes;
    return total + Math.ceil(quantite * reste);
  }, 0);
}

export interface EtatQuotaPiles {
  readonly annee: number;
  readonly boites: number;
  /** `null` : aucun quota en vigueur, le compteur reste informatif. */
  readonly quota: number | null;
  readonly restant: number | null;
  readonly depasse: boolean;
}

/** Avertit sans bloquer : le quota n'est pas sourcé (R15, R56). Année civile, par patient : choix À VÉRIFIER. */
export function etatQuotaPiles(
  annee: number,
  boites: number,
  quota: number | null,
): EtatQuotaPiles {
  return {
    annee,
    boites,
    quota,
    restant: quota === null ? null : Math.max(quota - boites, 0),
    depasse: quota !== null && boites > quota,
  };
}

export const quotaPilesSaisieSchema = z.object({
  boitesParAn: z.coerce
    .number({ error: 'Nombre invalide.' })
    .int('Nombre invalide.')
    .min(0, 'Nombre invalide.')
    .max(999, 'Nombre invalide.'),
  debut: dateCalendaireSchema,
  source: texteObligatoire('Citer le texte qui fixe ce quota.', 300),
});
