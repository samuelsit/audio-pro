import { gereLeCentre, peutActerAppareillage, ROLES, type Role } from '../acces/roles';

/** Valider vend l'appareil : même partage que l'achat (ADR-012). */
export function peutValiderFacture(role: Role): boolean {
  return peutActerAppareillage(role);
}

/**
 * Vente directe au comptoir : tout rôle. Un assistant y vend piles et accessoires sans audioprothésiste présent.
 * Source : convention-audioprothesistes.pdf, art. 16, p. 18 (« services annexes (vente de piles […] nettoyage »).
 */
export function peutVendreAuComptoir(role: Role): boolean {
  return ROLES.includes(role);
}

/** Une facture de dossier vend un appareil ; une vente directe, non (ADR-032). */
export function peutValiderPiece(role: Role, surDossier: boolean): boolean {
  return surDossier ? peutValiderFacture(role) : peutVendreAuComptoir(role);
}

/** Un avoir peut annuler une vente : même partage que `peutAnnulerVente` (ADR-010). */
export function peutEmettreAvoir(role: Role): boolean {
  return gereLeCentre(role);
}

/** Le préfixe de la série se règle avec les identifiants de l'entreprise. */
export function peutGererSerie(role: Role): boolean {
  return role === 'ADMIN_CLIENT';
}
