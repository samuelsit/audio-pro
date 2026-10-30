import { z } from 'zod';

import { retirerEspaces, texteOptionnelSchema } from '../commun/texte';

/**
 * Numéro RPPS de l'audioprothésiste : 11 chiffres, espaces de saisie ignorés.
 * Source : docs/ref/convention-audioprothesistes.pdf, conditions d'exercice (« numéro identifiant au
 * répertoire partagé des professionnels de santé (RPPS) ») et annexe devis (« Nom et n° RPPS »).
 * À VÉRIFIER : la longueur de 11 chiffres vient de la spécification de l'étape 1 et ne figure pas
 * dans docs/ref ; la clé de contrôle (Luhn) n'est pas vérifiée faute de source.
 */
export const rppsSchema = z
  .string({ error: 'Le numéro RPPS est obligatoire.' })
  .transform(retirerEspaces)
  .pipe(z.string().regex(/^\d{11}$/, 'Le numéro RPPS doit comporter exactement 11 chiffres.'))
  .brand<'Rpps'>();
export type Rpps = z.infer<typeof rppsSchema>;

/** RPPS d'un prescripteur, facultatif : mêmes règles que `rppsSchema`, saisie vide → `null`. */
export const rppsOptionnelSchema = texteOptionnelSchema.pipe(rppsSchema.nullable());

export function estRppsValide(saisie: string): boolean {
  return rppsSchema.safeParse(saisie).success;
}

/**
 * Numéro ADELI, facultatif.
 * Source : docs/ref/modele-devis-audio.pdf, en-tête (« N° d'identification ADELI ou RPPS »).
 * À VÉRIFIER : le format (9 caractères, chiffres et lettres A/B pour la Corse) ne figure pas dans docs/ref.
 */
export const adeliOptionnelSchema = texteOptionnelSchema.pipe(
  z
    .string()
    .transform((valeur) => retirerEspaces(valeur).toUpperCase())
    .pipe(z.string().regex(/^[0-9AB]{9}$/, 'Le numéro ADELI doit comporter 9 caractères.'))
    .nullable(),
);
