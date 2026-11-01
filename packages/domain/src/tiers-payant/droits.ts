import { gereLeCentre, ROLES, type Role } from '../acces/roles';

/** Consulter, saisir un virement, lettrer, noter un rejet ou une relance : même partage que le guichet. */
export function peutSuivreTiersPayant(role: Role): boolean {
  return ROLES.includes(role);
}

/** Écart, transfert au patient, délettrage, annulation : même partage qu'un avoir, `peutEmettreAvoir`. */
export function peutRegulariserTiersPayant(role: Role): boolean {
  return gereLeCentre(role);
}

export function peutGererComplementaires(role: Role): boolean {
  return gereLeCentre(role);
}
