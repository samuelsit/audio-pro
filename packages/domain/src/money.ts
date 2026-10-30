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

/**
 * Convertit un décimal écrit en texte (« 819.41 ») en entier à `decimales` chiffres, sans flottant.
 * `null` si le texte n'est pas un décimal positif ou s'il a trop de chiffres après la virgule.
 */
export function decimalEnEntier(texte: string, decimales: number): number | null {
  const correspondance = /^(\d+)(?:\.(\d+))?$/.exec(texte);
  if (!correspondance) {
    return null;
  }
  const [, entier = '', fraction = ''] = correspondance;
  return fraction.length > decimales ? null : Number(entier + fraction.padEnd(decimales, '0'));
}

/** Prix saisi en euros (« 1 490,50 », « 1490.5 », « 1490 € ») → centimes ; `null` si illisible. */
export function centimesDepuisSaisieEuros(saisie: string): number | null {
  const nettoye = saisie.replace(/[\s\u00a0\u202f€]/g, '').replace(',', '.');
  return decimalEnEntier(nettoye, 2);
}

const formatEurosFr = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

/** Formate un montant pour l'affichage : 123456 → « 1 234,56 € ». */
export function formatEuros(montant: Centimes): string {
  return formatEurosFr.format(montant / 100);
}
