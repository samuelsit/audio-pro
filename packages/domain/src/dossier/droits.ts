import type { Role } from '../acces/roles';

/** Passer outre une erreur bloquante engage le réseau : réservé à l'ADMIN (ADR-011). */
export function peutForcerPrescription(role: Role): boolean {
  return role === 'ADMIN';
}

/** Abandonner est définitif : même partage que la fusion de patients (ADR-006). */
export function peutAbandonnerDossier(role: Role): boolean {
  return role === 'ADMIN' || role === 'AUDIO';
}
