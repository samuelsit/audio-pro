import { z } from 'zod';

import { dateCalendaireSchema } from '../commun/date';
import { pageSchema } from '../commun/pagination';

/** Paramètre de recherche facultatif : absent ou vide → `undefined`. */
function optionnel<S extends z.ZodType>(schema: S) {
  return z.preprocess(
    (valeur) => (typeof valeur === 'string' && valeur.trim() !== '' ? valeur.trim() : undefined),
    schema.optional(),
  );
}

/** Filtres de l'écran « Journal d'audit » (paramètres d'URL). Période en dates Europe/Paris, bornes incluses. */
export const filtreJournalSchema = z
  .object({
    utilisateurId: optionnel(z.uuid('Utilisateur inconnu.')),
    patientId: optionnel(z.uuid('Identifiant patient invalide.')),
    du: optionnel(dateCalendaireSchema),
    au: optionnel(dateCalendaireSchema),
    page: pageSchema,
  })
  .refine((f) => f.du === undefined || f.au === undefined || f.du <= f.au, {
    path: ['au'],
    message: 'La date de fin doit être postérieure ou égale à la date de début.',
  });

export type FiltreJournal = z.output<typeof filtreJournalSchema>;
