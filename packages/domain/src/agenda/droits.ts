import { gereLeCentre, type Role } from '../acces/roles';

/** Cabines, horaires et exceptions : rôles de gestion, sur leurs centres. Les rendez-vous sont ouverts à tous. */
export function peutGererAgenda(role: Role): boolean {
  return gereLeCentre(role);
}

/** Les types de rendez-vous valent pour tout le client. */
export function peutGererTypesRdv(role: Role): boolean {
  return role === 'ADMIN_CLIENT';
}
