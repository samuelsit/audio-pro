import type { ClasseLpp, NatureAccessoire } from '../catalogue';

export const OREILLES = ['GAUCHE', 'DROITE'] as const;
export type Oreille = (typeof OREILLES)[number];

export const CODES_PRESTATION = ['P1G', 'P1D', 'P2G', 'P2D', 'PIL', 'APA'] as const;
export type CodePrestation = (typeof CODES_PRESTATION)[number];

export type EntreeCodePrestation =
  | { readonly classe: ClasseLpp; readonly oreille: Oreille; readonly c2s: boolean }
  | { readonly nature: NatureAccessoire };

const PANIER_1: Readonly<Record<Oreille, CodePrestation>> = { GAUCHE: 'P1G', DROITE: 'P1D' };
const PANIER_2: Readonly<Record<Oreille, CodePrestation>> = { GAUCHE: 'P2G', DROITE: 'P2D' };

/**
 * Code prestation d'une aide auditive, de piles ou d'un accessoire. Bénéficiaire C2S : P2G/P2D quelle
 * que soit la classe, y compris s'il refuse l'offre à prix maximal (lecture d'ameli, R7).
 * Source : ameli-100-sante-audio.pdf p. 2 ; fr201-codes-prestation.pdf p. 1 ;
 * convention-audioprothesistes.pdf, art. 29 § 2, p. 27.
 */
export function codePrestation(entree: EntreeCodePrestation): CodePrestation {
  if ('nature' in entree) {
    return entree.nature === 'PILE' ? 'PIL' : 'APA';
  }
  const panier = entree.c2s || entree.classe === 'CLASSE_II' ? PANIER_2 : PANIER_1;
  return panier[entree.oreille];
}
