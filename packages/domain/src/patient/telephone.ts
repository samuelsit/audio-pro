import { z } from 'zod';

const SEPARATEURS = /[\s.-]/g;

/**
 * Forme unique d'un numéro français (+33…) : `telephoneSchema` conserve `0…` et `+33…`, deux écritures du
 * même numéro. `null` pour une valeur qui n'est pas un numéro français.
 */
export function telephoneCanonique(valeur: string): string | null {
  const numero = /^(?:\+33|0)([1-9]\d{8})$/.exec(valeur.replace(SEPARATEURS, ''));
  return numero ? `+33${numero[1] as string}` : null;
}

/** Un code SMS ne part que vers un mobile : un fixe ne le recevrait jamais. Rendu sous forme canonique. */
export const telephoneMobileSchema = z
  .string({ error: 'Le téléphone mobile est obligatoire.' })
  .transform((valeur) => valeur.replace(SEPARATEURS, ''))
  .pipe(
    z.string().regex(/^(?:\+33|0)[67]\d{8}$/, 'Saisir un numéro de mobile (ex. 06 12 34 56 78).'),
  )
  .transform((valeur) => `+33${valeur.slice(-9)}`);
