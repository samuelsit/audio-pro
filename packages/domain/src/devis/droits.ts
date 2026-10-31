import { peutActerAppareillage, type Role } from '../acces/roles';

/** Le devis engage l'audioprothésiste qui l'a réalisé (modèle p. 2 § 5) ; choix d'organisation. */
export function peutEmettreDevis(role: Role): boolean {
  return peutActerAppareillage(role);
}

/** Même partage que l'émission. Le dépôt du scan, lui, reste ouvert aux assistantes (ADR-012). */
export function peutEnregistrerSignature(role: Role): boolean {
  return peutActerAppareillage(role);
}
