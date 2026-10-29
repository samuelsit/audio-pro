import { z } from 'zod';

/** Montant en centimes d'euro : toujours un entier. */
export const centimesSchema = z.number().int().brand<'Centimes'>();
export type Centimes = z.infer<typeof centimesSchema>;

export function centimes(valeur: number): Centimes {
  return centimesSchema.parse(valeur);
}

export function additionnerCentimes(...montants: readonly Centimes[]): Centimes {
  return centimes(montants.reduce<number>((total, montant) => total + montant, 0));
}

const formatEurosFr = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

/** Formate un montant pour l'affichage : 123456 → « 1 234,56 € ». */
export function formatEuros(montant: Centimes): string {
  return formatEurosFr.format(montant / 100);
}
