import { z } from 'zod';

import { texteOptionnelSchema } from '../commun/texte';
import { centimesDepuisSaisieEuros } from '../money';

export interface ParametresCommande {
  readonly delaiRelanceJours: number;
  readonly relancesMax: number;
  readonly tolerancePrixCentimes: number;
  readonly adresseBoiteFactures: string | null;
}

/** Choix de gestion, sans texte de référence (ADR-031). Sans tolérance, tout écart de prix se traite. */
export const PARAMETRES_COMMANDE_DEFAUT: ParametresCommande = {
  delaiRelanceJours: 3,
  relancesMax: 2,
  tolerancePrixCentimes: 0,
  adresseBoiteFactures: null,
};

export function entierEntre(minimum: number, maximum: number) {
  return z.coerce
    .number({ error: 'Valeur invalide.' })
    .int('Valeur invalide.')
    .min(minimum, `Au moins ${minimum}.`)
    .max(maximum, `Au plus ${maximum}.`);
}

export const parametresCommandeSaisieSchema = z.object({
  delaiRelanceJours: entierEntre(1, 90),
  relancesMax: entierEntre(0, 10),
  tolerancePrix: z.string().transform((saisie, ctx) => {
    const centimes = centimesDepuisSaisieEuros(saisie.trim() === '' ? '0' : saisie);
    if (centimes === null) {
      ctx.addIssue({ code: 'custom', message: 'Montant invalide.' });
      return z.NEVER;
    }
    return centimes;
  }),
  adresseBoiteFactures: texteOptionnelSchema.pipe(
    z.email('Adresse e-mail invalide.').max(200, '200 caractères au maximum.').nullable(),
  ),
});
export type ParametresCommandeSaisie = z.output<typeof parametresCommandeSaisieSchema>;
