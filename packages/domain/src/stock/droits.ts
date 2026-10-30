import type { Role } from '../acces/roles';

/** Annuler une vente touche la traçabilité d'un appareil délivré : réservé à l'ADMIN (ADR-010). */
export function peutAnnulerVente(role: Role): boolean {
  return role === 'ADMIN';
}

/** Le prix d'achat est une donnée commerciale du réseau : fiche, saisie et CSV réservés à l'ADMIN. */
export function peutVoirPrixAchat(role: Role): boolean {
  return role === 'ADMIN';
}

/** Corriger une faute de saisie (numéro de série, modèle) : ADMIN, tant que l'appareil n'a pas bougé. */
export function peutCorrigerIdentite(role: Role): boolean {
  return role === 'ADMIN';
}
