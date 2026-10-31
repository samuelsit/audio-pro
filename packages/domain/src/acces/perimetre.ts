import { peutChoisirTousLesCentres, type Role } from './roles';

/**
 * Ce qui détermine les droits d'un utilisateur sur les centres.
 * `centreIds` ne contient que les rattachements à des centres actifs (calculé côté serveur).
 */
export interface ProfilAcces {
  readonly role: Role;
  readonly centreIds: readonly string[];
}

/** Périmètre de travail courant : un centre, ou tous les centres accessibles (« Tous mes centres »). */
export type Perimetre =
  { readonly type: 'tous' } | { readonly type: 'centre'; readonly centreId: string };

/** Valeur du sélecteur de centre courant pour « Tous mes centres ». */
export const CHOIX_TOUS_LES_CENTRES = 'tous';

export class AucunCentreAccessibleError extends Error {
  constructor() {
    super('Aucun centre actif n’est rattaché à ce compte. Contactez l’administrateur.');
    this.name = 'AucunCentreAccessibleError';
  }
}

export function peutAccederAuCentre(profil: ProfilAcces, centreId: string): boolean {
  return profil.role === 'ADMIN_CLIENT' || profil.centreIds.includes(centreId);
}

/** Centres qu'un profil peut voir ou choisir, dans l'ordre fourni. */
export function centresAccessibles<C extends { readonly id: string }>(
  profil: ProfilAcces,
  centres: readonly C[],
): C[] {
  return centres.filter((centre) => peutAccederAuCentre(profil, centre.id));
}

/**
 * Résout le choix du sélecteur (cookie, donc non fiable) en un périmètre autorisé.
 * `centresSelectionnables` : ids des centres actifs accessibles au profil.
 * Un choix invalide ou interdit est ignoré : on retombe sur « tous » ou sur le premier centre.
 */
export function resoudrePerimetre(
  profil: ProfilAcces,
  choix: string | undefined,
  centresSelectionnables: readonly string[],
): Perimetre {
  const autorises = centresSelectionnables.filter((id) => peutAccederAuCentre(profil, id));
  if (choix !== undefined && autorises.includes(choix)) {
    return { type: 'centre', centreId: choix };
  }
  if (profil.role === 'ADMIN_CLIENT') {
    return { type: 'tous' };
  }
  if (peutChoisirTousLesCentres(profil.role) && autorises.length > 0) {
    return { type: 'tous' };
  }
  const premier = autorises[0];
  if (premier === undefined) {
    throw new AucunCentreAccessibleError();
  }
  return { type: 'centre', centreId: premier };
}
