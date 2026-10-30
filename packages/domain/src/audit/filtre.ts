import { z } from 'zod';

import { dateCalendaireSchema } from '../commun/date';
import { pageSchema } from '../commun/pagination';
import { parametreOptionnel } from '../commun/texte';

/** Filtres de l'écran « Journal d'audit » (paramètres d'URL). Période en dates Europe/Paris, bornes incluses. */
export const filtreJournalSchema = z
  .object({
    utilisateurId: parametreOptionnel(z.uuid('Utilisateur inconnu.')),
    patientId: parametreOptionnel(z.uuid('Identifiant patient invalide.')),
    du: parametreOptionnel(dateCalendaireSchema),
    au: parametreOptionnel(dateCalendaireSchema),
    page: pageSchema,
  })
  .refine((f) => f.du === undefined || f.au === undefined || f.du <= f.au, {
    path: ['au'],
    message: 'La date de fin doit être postérieure ou égale à la date de début.',
  });

export type FiltreJournal = z.output<typeof filtreJournalSchema>;
