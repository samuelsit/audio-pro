import { peutActerAppareillage, type Role } from '../acces/roles';

/** L'achat prolonge la signature : même partage (ADR-012). Le reste de l'essai suit le stock (ADR-010). */
export function peutConfirmerAchat(role: Role): boolean {
  return peutActerAppareillage(role);
}
