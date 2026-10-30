import type { ClasseLpp } from '../catalogue';
import type { Centimes } from '../money';
import { centimes } from '../money';
import { PLAFOND_C2S_MOINS_DE_20, PLAFOND_C2S_VINGT_ET_PLUS } from './constantes';
import { trancheDepuisAge, type TrancheAge } from './tranche-age';

/** Montants LPP d'une tranche d'âge, résolus à la date de délivrance par l'appelant. */
export interface TarifAudio {
  readonly baseRemboursement: Centimes;
  readonly prixLimiteClasseI: Centimes;
}
export type TarifsAudio = Readonly<Record<TrancheAge, TarifAudio>>;

export interface LigneTarifAudio {
  readonly baseRemboursementCentimes: number;
  readonly prixLimiteVenteCentimes: number | null;
}

/**
 * Code de référence de chaque tranche : classe I, oreille droite. La base est la même en classes I et
 * II et des deux côtés.
 * Source : ameli-100-sante-audio.pdf p. 1 ; docs/ref/lpp/908/lpp_histo_tot908.dbf.
 */
export const CODES_LPP_TARIFS_AUDIO = {
  VINGT_ET_PLUS: '2351057',
  MOINS_DE_20: '2325120',
} as const satisfies Readonly<Record<TrancheAge, string>>;

function tarifAudio(ligne: LigneTarifAudio | null | undefined): TarifAudio | null {
  if (!ligne || ligne.prixLimiteVenteCentimes === null) {
    return null;
  }
  return {
    baseRemboursement: centimes(ligne.baseRemboursementCentimes),
    prixLimiteClasseI: centimes(ligne.prixLimiteVenteCentimes),
  };
}

/**
 * Tarifs des deux tranches à partir des lignes LPP en vigueur, par code ; `null` s'il en manque, par
 * exemple avant le 07/07/2023, date de la première ligne de ces codes dans la base 908.
 */
export function tarifsAudioDepuisLpp(
  lignes: ReadonlyMap<string, LigneTarifAudio | null>,
): TarifsAudio | null {
  const vingtEtPlus = tarifAudio(lignes.get(CODES_LPP_TARIFS_AUDIO.VINGT_ET_PLUS));
  const moinsDe20 = tarifAudio(lignes.get(CODES_LPP_TARIFS_AUDIO.MOINS_DE_20));
  if (!vingtEtPlus || !moinsDe20) {
    return null;
  }
  return { VINGT_ET_PLUS: vingtEtPlus, MOINS_DE_20: moinsDe20 };
}

/**
 * Prix maximal de vente pour un bénéficiaire de la C2S, absent de la LPP.
 * Source : ameli-100-sante-audio.pdf p. 2 ; convention-audioprothesistes.pdf, art. 29, p. 27.
 */
export function plafondC2S(entree: {
  readonly age: number;
  readonly surdicecite: boolean;
}): Centimes {
  return trancheDepuisAge(entree.age) === 'MOINS_DE_20' || entree.surdicecite
    ? PLAFOND_C2S_MOINS_DE_20.valeur
    : PLAFOND_C2S_VINGT_ET_PLUS.valeur;
}

export interface EntreePlafondPrixVente {
  readonly classe: ClasseLpp;
  readonly age: number;
  readonly c2s: boolean;
  /** Le bénéficiaire refuse l'offre à prix maximal C2S : le plafond général s'applique. */
  readonly refusOffreC2S?: boolean;
  /** Personne sourde et aveugle : plafond C2S de 1 400 € à tout âge. */
  readonly surdicecite?: boolean;
}

/**
 * Plafond de vente par oreille, en centimes, ou `null` si le prix est libre.
 * Source : convention-audioprothesistes.pdf, art. 25, p. 24 (classe I, prix limite) et art. 29 § 2,
 * p. 27 (C2S, refus de l'offre) ; ameli-100-sante-audio.pdf p. 1 et 2.
 * À VÉRIFIER : les textes ne disent pas « TTC » (R3) ; le plafond s'applique au prix payé.
 */
export function plafondPrixVente(
  { classe, age, c2s, refusOffreC2S = false, surdicecite = false }: EntreePlafondPrixVente,
  tarifs: TarifsAudio,
): Centimes | null {
  if (c2s && !refusOffreC2S) {
    return plafondC2S({ age, surdicecite });
  }
  return classe === 'CLASSE_I' ? tarifs[trancheDepuisAge(age)].prixLimiteClasseI : null;
}

/**
 * Base de remboursement par oreille.
 * Source : ameli-100-sante-audio.pdf p. 1 ; fr201-codes-prestation.pdf, tests n° 6 et 7.
 * À VÉRIFIER : base applicable en cas de cécité à 20 ans et plus (R4).
 */
export function baseRemboursement(entree: { readonly age: number }, tarifs: TarifsAudio): Centimes {
  return tarifs[trancheDepuisAge(entree.age)].baseRemboursement;
}
