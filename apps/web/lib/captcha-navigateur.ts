import type { Challenge } from 'altcha-lib';

/**
 * WebCrypto n'existe que dans un contexte sécurisé : un widget posé sur un site encore en HTTP n'en est pas un,
 * même servi en HTTPS. La page complète, ouverte à part, en est un.
 */
export class ContexteNonSecurise extends Error {
  constructor() {
    super('WebCrypto indisponible dans ce cadre.');
    this.name = 'ContexteNonSecurise';
  }
}

/**
 * Résout le défi dans le navigateur, sans case à cocher : le patient ne voit rien, seul un robot en série paie
 * le calcul. Chargé à la demande : le parcours n'en a besoin qu'au choix d'un créneau.
 */
export async function resoudreDefi(defi: string): Promise<string> {
  const lu = JSON.parse(defi) as { simulation?: string } & Challenge;
  if (lu.simulation !== undefined) {
    return `${lu.simulation}-${String(Date.now())}-${String(Math.random())}`;
  }
  // `typeof` et non `crypto?.subtle` : le type DOM déclare `subtle` toujours présent.
  if (typeof crypto === 'undefined' || typeof crypto.subtle === 'undefined') {
    throw new ContexteNonSecurise();
  }
  const { solveChallenge } = await import('altcha-lib');
  const { deriveKey } = await import('altcha-lib/algorithms/web/pbkdf2');
  const solution = await solveChallenge({ challenge: lu, deriveKey });
  return btoa(JSON.stringify({ challenge: lu, solution }));
}
