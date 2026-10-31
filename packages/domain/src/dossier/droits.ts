import { peutActerAppareillage, type Role } from '../acces/roles';

/** Passer outre une erreur bloquante engage le client : réservé à l'ADMIN_CLIENT (ADR-011, ADR-016). */
export function peutForcerPrescription(role: Role): boolean {
  return role === 'ADMIN_CLIENT';
}

/** Abandonner est définitif : même partage que la fusion de patients (ADR-006). */
export function peutAbandonnerDossier(role: Role): boolean {
  return peutActerAppareillage(role);
}
