import { normaliserPourRecherche } from './recherche';

/**
 * Motifs de doublon possible. Un doublon possible ne bloque jamais la création : l'utilisateur
 * confirme ou ouvre la fiche existante. Des ayants droit partagent le NIR de l'assuré : un même NIR
 * peut donc désigner deux personnes différentes (la qualité et le rang aident à trancher).
 */
export const MOTIFS_DOUBLON = ['MEME_NIR', 'MEME_IDENTITE'] as const;
export type MotifDoublon = (typeof MOTIFS_DOUBLON)[number];

export const LIBELLES_MOTIF_DOUBLON: Readonly<Record<MotifDoublon, string>> = {
  MEME_NIR: 'même NIR',
  MEME_IDENTITE: 'même nom et même date de naissance',
};

export interface IdentiteComparable {
  readonly nomNaissance: string;
  readonly nomUsage: string | null;
  readonly dateNaissance: string;
  /** Empreinte HMAC du NIR, `null` sans couverture AMO. */
  readonly nirEmpreinte: string | null;
}

function noms(identite: IdentiteComparable): string[] {
  return [identite.nomNaissance, identite.nomUsage]
    .filter((nom): nom is string => nom !== null)
    .map(normaliserPourRecherche)
    .filter((nom) => nom !== '');
}

/**
 * Motifs pour lesquels `existant` peut être la même personne que `candidat` :
 * même empreinte de NIR, ou même date de naissance avec un nom (de naissance ou d'usage) en commun,
 * comparé sans accents ni casse. Le nom d'usage de l'un peut correspondre au nom de naissance de l'autre.
 */
export function motifsDoublon(
  candidat: IdentiteComparable,
  existant: IdentiteComparable,
): MotifDoublon[] {
  const motifs: MotifDoublon[] = [];
  if (candidat.nirEmpreinte !== null && candidat.nirEmpreinte === existant.nirEmpreinte) {
    motifs.push('MEME_NIR');
  }
  const nomsExistant = noms(existant);
  if (
    candidat.dateNaissance === existant.dateNaissance &&
    noms(candidat).some((nom) => nomsExistant.includes(nom))
  ) {
    motifs.push('MEME_IDENTITE');
  }
  return motifs;
}
