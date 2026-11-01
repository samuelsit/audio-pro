import { gereLeCentre, peutActerAppareillage, ROLES, type Role } from '../acces/roles';

/** Recevoir un patient au guichet, ouvrir un ticket, noter une assurance : tout rôle, dans ses centres. */
export function peutSuivreSav(role: Role): boolean {
  return ROLES.includes(role);
}

/** Le diagnostic et le choix de l'action sont des actes d'audioprothésiste. */
export function peutDiagnostiquerSav(role: Role): boolean {
  return peutActerAppareillage(role);
}

/** Durées et rythmes : réglages du client, comme les paramètres de commande. */
export function peutParametrerSav(role: Role): boolean {
  return role === 'ADMIN_CLIENT';
}

/** Affecter un appareil au parc de prêt retire un appareil de la vente : décision de gestion. */
export function peutGererParcPret(role: Role): boolean {
  return gereLeCentre(role);
}
