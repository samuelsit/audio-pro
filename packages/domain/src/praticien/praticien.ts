import { z } from 'zod';

import type { RoleCompte } from '../acces/roles';
import { adeliOptionnelSchema, rppsSchema } from './identifiants';

/** Seul un utilisateur AUDIO peut porter une fiche praticien (audioprothésiste). */
export function peutEtrePraticien(role: RoleCompte): boolean {
  return role === 'AUDIO';
}

/** Centres d'exercice qui ne font pas partie des rattachements de l'utilisateur (doit être vide). */
export function centresExerciceHorsRattachement(
  centresExercice: readonly string[],
  centresRattachement: readonly string[],
): string[] {
  return centresExercice.filter((id) => !centresRattachement.includes(id));
}

export const praticienSaisieSchema = z.object({
  utilisateurId: z
    .string({ error: 'Choisir un audioprothésiste.' })
    .min(1, 'Choisir un audioprothésiste.'),
  rpps: rppsSchema,
  adeli: adeliOptionnelSchema,
  centreIds: z
    .array(z.string().min(1))
    .transform((ids) => [...new Set(ids)])
    .pipe(z.array(z.string()).min(1, 'Choisir au moins un centre d’exercice.')),
});
export type PraticienSaisie = z.infer<typeof praticienSaisieSchema>;
