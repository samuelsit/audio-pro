import { gereLeCentre, ROLES, type Role } from '../acces/roles';

/** Le suivi des envois n'expose que des statuts : tout rôle, dans ses centres. */
export function peutConsulterCommunication(role: Role): boolean {
  return ROLES.includes(role);
}

/** Écrire à tout un segment engage le centre : décision de gestion. */
export function peutGererCampagnes(role: Role): boolean {
  return gereLeCentre(role);
}

export function peutGererCourriers(role: Role): boolean {
  return gereLeCentre(role);
}

/** Plages, tarif, scénarios et modèles sont des réglages du client, comme les paramètres de commande. */
export function peutParametrerCommunication(role: Role): boolean {
  return role === 'ADMIN_CLIENT';
}

/** Noter un nouveau consentement se fait au contact du patient : tout rôle, dans ses centres. */
export function peutNoterConsentement(role: Role): boolean {
  return ROLES.includes(role);
}
