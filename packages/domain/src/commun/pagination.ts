import { z } from 'zod';

/** Numéro de page issu d'un paramètre d'URL : toute valeur invalide ramène à la page 1. */
export const pageSchema = z.coerce.number().int().min(1).catch(1);

export interface Pagination {
  /** Page affichée, ramenée dans [1, nbPages]. */
  readonly page: number;
  readonly parPage: number;
  readonly total: number;
  /** Au moins 1, même sans résultat. */
  readonly nbPages: number;
  /** Nombre de lignes à sauter (`skip`). */
  readonly decalage: number;
}

export function calculerPagination(page: number, parPage: number, total: number): Pagination {
  const nbPages = Math.max(1, Math.ceil(total / parPage));
  const pageBornee = Math.min(Math.max(1, page), nbPages);
  return { page: pageBornee, parPage, total, nbPages, decalage: (pageBornee - 1) * parPage };
}
