import { gereLeCentre, ROLES, type Role } from '../acces/roles';

/** Le guichet : tous les rôles encaissent, ouvrent et comptent la caisse (ADR-029). */
export function peutEncaisser(role: Role): boolean {
  return ROLES.includes(role);
}

/** Rendre de l'argent ou annuler : même partage qu'un avoir, `peutEmettreAvoir`. */
export function peutRembourser(role: Role): boolean {
  return gereLeCentre(role);
}

/** Clôtures, archives, vérification, journal et exports. */
export function peutGererCaisse(role: Role): boolean {
  return gereLeCentre(role);
}
