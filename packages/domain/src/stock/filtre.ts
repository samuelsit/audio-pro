import { z } from 'zod';

import { pageSchema } from '../commun/pagination';
import { parametreOptionnel } from '../commun/texte';
import { STATUTS_APPAREIL } from './etats';

/** Filtres de la liste du stock (paramètres d'URL). Le centre vient du périmètre courant. */
export const filtreStockSchema = z.object({
  statut: parametreOptionnel(z.enum(STATUTS_APPAREIL, { error: 'Statut inconnu.' })),
  modeleId: parametreOptionnel(z.uuid('Modèle inconnu.')),
  fabricantId: parametreOptionnel(z.uuid('Fabricant inconnu.')),
  page: pageSchema,
});
export type FiltreStock = z.output<typeof filtreStockSchema>;
