import { z } from 'zod';

import { dateCalendaireSchema } from '../commun/date';
import { decimalEnEntier } from '../money';
import { NATURES_LIGNE_FACTURE, type NatureLigneFacture } from './types';

/** La TVA se paramètre par type de produit : les natures de ligne de facture. */
export type TypeProduitTva = NatureLigneFacture;

/** Taux en pour dix mille, 550 pour 5,5 %, applicable à partir de `debut`. */
export interface TauxTvaDate {
  readonly type: TypeProduitTva;
  readonly taux: number;
  readonly debut: string;
}

/**
 * Taux d'un type de produit à une date : celui dont le début est le plus récent sans dépasser la date.
 * `null` si aucun taux ne couvre la date. Un changement ajoute une ligne, l'historique ne se réécrit pas.
 * À VÉRIFIER : aucun document de docs/ref ne donne de taux ni de fait générateur (R18).
 */
export function tauxTvaEnVigueur(
  taux: readonly TauxTvaDate[],
  type: TypeProduitTva,
  date: string,
): number | null {
  const applicables = taux
    .filter((t) => t.type === type && t.debut <= date)
    .sort((a, b) => b.debut.localeCompare(a.debut));
  return applicables[0]?.taux ?? null;
}

/** Saisie en pourcentage (« 5,5 ») ; 100 % reste la borne, sans valeur réglementaire. */
export const tauxTvaSaisieSchema = z.object({
  type: z.enum(NATURES_LIGNE_FACTURE, { error: 'Choisir le type de produit.' }),
  taux: z
    .string({ error: 'Le taux est obligatoire.' })
    .trim()
    .transform((saisie, ctx) => {
      const valeur = decimalEnEntier(saisie.replace(',', '.'), 2);
      if (valeur === null || valeur > 10_000) {
        ctx.addIssue({ code: 'custom', message: 'Taux invalide (exemple : 5,5).' });
        return z.NEVER;
      }
      return valeur;
    }),
  debut: dateCalendaireSchema,
});
export type TauxTvaSaisie = z.output<typeof tauxTvaSaisieSchema>;
