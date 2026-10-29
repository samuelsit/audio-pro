import type { Perimetre } from '@ha/domain';

import type { UtilisateurConnecte } from './auth/acces';

/**
 * Ids des centres visibles dans le périmètre : `null` signifie « tous les centres de l'organisation »
 * (ADMIN uniquement, déjà vérifié par `verifierPerimetre`).
 */
export function centresDuPerimetre(
  acteur: UtilisateurConnecte,
  perimetre: Perimetre,
): readonly string[] | null {
  if (perimetre.type === 'centre') {
    return [perimetre.centreId];
  }
  return acteur.role === 'ADMIN' ? null : acteur.centreIds;
}

/** Clause Prisma « rattaché à un centre du périmètre » pour une relation n–n vers Centre. */
export function filtreParCentre(
  acteur: UtilisateurConnecte,
  perimetre: Perimetre,
): { some: { centreId: { in: string[] } } } | undefined {
  const ids = centresDuPerimetre(acteur, perimetre);
  return ids === null ? undefined : { some: { centreId: { in: [...ids] } } };
}
