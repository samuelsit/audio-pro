import { z } from 'zod';

const CHIFFRES_NUMERO = 6;

export const PREFIXE_SERIE_DEFAUT = 'FA';

/**
 * Numéro d'une pièce : préfixe du centre et rang dans la série, sans remise à zéro annuelle.
 * À VÉRIFIER : le format et la continuité viennent de CLAUDE.md, aucun texte de docs/ref ne les fixe.
 */
export function formaterNumero(prefixe: string, sequence: number): string {
  return `${prefixe}-${String(sequence).padStart(CHIFFRES_NUMERO, '0')}`;
}

export const prefixeSerieSchema = z.object({
  prefixe: z
    .string({ error: 'Le préfixe est obligatoire.' })
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{1,10}$/, 'De 1 à 10 lettres ou chiffres, sans espace.'),
});
export type PrefixeSerieSaisie = z.output<typeof prefixeSerieSchema>;
