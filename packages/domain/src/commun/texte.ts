import { z } from 'zod';

/** Champ texte obligatoire : espaces de bord retirés, non vide. */
export function texteObligatoire(message: string, longueurMax = 200) {
  return z
    .string({ error: message })
    .trim()
    .min(1, message)
    .max(longueurMax, `${longueurMax} caractères au maximum.`);
}

/** Champ texte facultatif : une saisie vide (ou absente) devient `null`, pour pouvoir effacer en base. */
export const texteOptionnelSchema = z
  .string()
  .nullish()
  .transform((valeur) => {
    const nettoye = valeur?.trim() ?? '';
    return nettoye === '' ? null : nettoye;
  });

export function retirerEspaces(valeur: string): string {
  return valeur.replace(/\s+/g, '');
}
