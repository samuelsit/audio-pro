import { gereLeCentre, ROLES, type Role } from '../acces/roles';

/** Fiches fournisseurs, centrales, règles et paramètres : réglages du client, comme le catalogue. */
export function peutGererFournisseurs(role: Role): boolean {
  return role === 'ADMIN_CLIENT';
}

/** Demander et pointer une réception : tout rôle, dans ses centres. */
export function peutDemanderCommande(role: Role): boolean {
  return ROLES.includes(role);
}

/** Le demandeur d'une commande peut être son approbateur : un centre indépendant n'a souvent qu'un gérant. */
export function peutApprouverCommande(role: Role): boolean {
  return gereLeCentre(role);
}

/** Factures, écarts, relevés, seuils et statistiques montrent des prix d'achat : même partage que `peutVoirPrixAchat`. */
export function peutGererAchats(role: Role): boolean {
  return gereLeCentre(role);
}
