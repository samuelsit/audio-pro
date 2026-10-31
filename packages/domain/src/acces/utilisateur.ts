import { z } from 'zod';

import { texteObligatoire } from '../commun/texte';
import { rattachementObligatoire, roleSchema } from './roles';

/** Politique interne (non réglementaire) : longueur minimale du mot de passe. */
export const LONGUEUR_MIN_MOT_DE_PASSE = 12;
export const LONGUEUR_MAX_MOT_DE_PASSE = 128;

export const motDePasseSchema = z
  .string({ error: 'Le mot de passe est obligatoire.' })
  .min(
    LONGUEUR_MIN_MOT_DE_PASSE,
    `Le mot de passe doit comporter au moins ${LONGUEUR_MIN_MOT_DE_PASSE} caractères.`,
  )
  .max(
    LONGUEUR_MAX_MOT_DE_PASSE,
    `Le mot de passe doit comporter au plus ${LONGUEUR_MAX_MOT_DE_PASSE} caractères.`,
  );

export const emailSchema = z
  .string({ error: 'L’adresse e-mail est obligatoire.' })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'Adresse e-mail invalide.' }));

const idsCentresSchema = z.array(z.string().min(1)).transform((ids) => [...new Set(ids)]);

/** Données saisies par l'ADMIN_CLIENT pour créer ou modifier un utilisateur (hors mot de passe). */
export const utilisateurSaisieSchema = z
  .object({
    prenom: texteObligatoire('Le prénom est obligatoire.', 100),
    nom: texteObligatoire('Le nom est obligatoire.', 100),
    email: emailSchema,
    role: roleSchema,
    centreIds: idsCentresSchema,
    actif: z.boolean(),
  })
  .refine((u) => !rattachementObligatoire(u.role) || u.centreIds.length > 0, {
    path: ['centreIds'],
    message: 'Rattacher l’utilisateur à au moins un centre.',
  });
export type UtilisateurSaisie = z.infer<typeof utilisateurSaisieSchema>;

/** Nom affiché (champ `name` exigé par la bibliothèque d'authentification). */
export function nomAffiche(prenom: string, nom: string): string {
  return `${prenom} ${nom}`;
}
