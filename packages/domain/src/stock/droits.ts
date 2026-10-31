import { gereLeCentre, type Role } from '../acces/roles';

/** Annuler une vente touche la traçabilité d'un appareil délivré : réservé aux rôles de gestion (ADR-010, ADR-016). */
export function peutAnnulerVente(role: Role): boolean {
  return gereLeCentre(role);
}

/** Le prix d'achat est une donnée commerciale du client : fiche, saisie et CSV réservés aux rôles de gestion. */
export function peutVoirPrixAchat(role: Role): boolean {
  return gereLeCentre(role);
}

/** Corriger une faute de saisie (numéro de série, modèle) : rôles de gestion, tant que l'appareil n'a pas bougé. */
export function peutCorrigerIdentite(role: Role): boolean {
  return gereLeCentre(role);
}
