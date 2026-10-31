import { z } from 'zod';

import { emailSchema } from '../acces/utilisateur';
import { retirerEspaces, texteObligatoire, texteOptionnelSchema } from '../commun/texte';

// Format postal (pas une règle réglementaire) : 5 chiffres.
export const codePostalSchema = z
  .string({ error: 'Le code postal est obligatoire.' })
  .transform(retirerEspaces)
  .pipe(z.string().regex(/^\d{5}$/, 'Le code postal doit comporter 5 chiffres.'));

// Numéro français, saisi avec ou sans séparateurs ; stocké sans séparateurs.
export const telephoneSchema = z
  .string({ error: 'Le téléphone est obligatoire.' })
  .transform((valeur) => valeur.replace(/[\s.-]/g, ''))
  .pipe(
    z
      .string()
      .regex(/^(?:\+33|0)[1-9]\d{8}$/, 'Numéro de téléphone invalide (ex. 01 23 45 67 89).'),
  );

/**
 * Identifiants administratifs facultatifs du centre.
 * Source : docs/ref/convention-audioprothesistes.pdf, titre « Conditions d'exercice » (identification au FNPS) :
 * l'organisme de rattachement attribue un identifiant de facturation par établissement.
 * À VÉRIFIER : formats du n° FINESS et du n° de facturation absents de docs/ref, donc aucun contrôle
 * de format ici (texte libre, espaces retirés).
 */
const identifiantAdministratifSchema = texteOptionnelSchema.transform((valeur) =>
  valeur === null ? null : retirerEspaces(valeur),
);

export const centreSaisieSchema = z.object({
  nom: texteObligatoire('Le nom du centre est obligatoire.', 100),
  adresseLigne1: texteObligatoire('L’adresse est obligatoire.'),
  adresseLigne2: texteOptionnelSchema,
  codePostal: codePostalSchema,
  ville: texteObligatoire('La ville est obligatoire.', 100),
  finess: identifiantAdministratifSchema,
  numeroFacturationAm: identifiantAdministratifSchema,
  raisonSociale: texteOptionnelSchema,
  siret: identifiantAdministratifSchema,
  rcs: texteOptionnelSchema,
  tvaIntracommunautaire: identifiantAdministratifSchema,
  email: emailSchema,
  telephone: telephoneSchema,
  actif: z.boolean(),
});
export type CentreSaisie = z.infer<typeof centreSaisieSchema>;
