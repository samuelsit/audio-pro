import { gereLeCentre, peutActerAppareillage, type Role } from '../acces/roles';

/** Valider vend l'appareil : même partage que l'achat (ADR-012). */
export function peutValiderFacture(role: Role): boolean {
  return peutActerAppareillage(role);
}

/** Un avoir peut annuler une vente : même partage que `peutAnnulerVente` (ADR-010). */
export function peutEmettreAvoir(role: Role): boolean {
  return gereLeCentre(role);
}

/** Le préfixe de la série se règle avec les identifiants de l'entreprise. */
export function peutGererSerie(role: Role): boolean {
  return role === 'ADMIN_CLIENT';
}
