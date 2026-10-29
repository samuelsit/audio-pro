import type { Qualite } from './patient';
import { normaliserPourRecherche } from './recherche';

/**
 * Motifs de doublon possible. Un doublon possible ne bloque jamais la création : l'utilisateur
 * confirme ou ouvre la fiche existante.
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
  /** Qualité et rang de naissance de la couverture AMO, `null` sans couverture. */
  readonly qualite: Qualite | null;
  readonly rangNaissance: number | null;
}

function noms(identite: IdentiteComparable): string[] {
  return [identite.nomNaissance, identite.nomUsage]
    .filter((nom): nom is string => nom !== null)
    .map(normaliserPourRecherche)
    .filter((nom) => nom !== '');
}

/**
 * Même NIR et même bénéficiaire. Un ayant droit porte le NIR de l'assuré ouvrant droit : deux fiches de
 * même NIR désignent la même personne si ce sont deux assurés, ou deux ayants droit nés le même jour
 * avec le même rang de naissance (les jumeaux ont des rangs différents). Un assuré et un ayant droit de
 * même NIR sont deux personnes d'une même famille.
 * Source : spécification de l'étape 3 (« même NIR » ; NIR, rang de naissance et qualité de la couverture AMO).
 * À VÉRIFIER : l'usage du NIR de l'ouvrant droit pour les ayants droit n'est pas décrit dans docs/ref.
 */
function memeBeneficiaire(a: IdentiteComparable, b: IdentiteComparable): boolean {
  if (a.nirEmpreinte === null || a.nirEmpreinte !== b.nirEmpreinte) {
    return false;
  }
  if (a.qualite === 'ASSURE' && b.qualite === 'ASSURE') {
    return true;
  }
  return (
    a.qualite === 'AYANT_DROIT' &&
    b.qualite === 'AYANT_DROIT' &&
    a.dateNaissance === b.dateNaissance &&
    a.rangNaissance === b.rangNaissance
  );
}

/**
 * Motifs pour lesquels `existant` peut être la même personne que `candidat` :
 * même NIR pour le même bénéficiaire (voir `memeBeneficiaire`), ou même date de naissance avec un nom
 * (de naissance ou d'usage) en commun, comparé sans accents ni casse. Le nom d'usage de l'un peut
 * correspondre au nom de naissance de l'autre.
 */
export function motifsDoublon(
  candidat: IdentiteComparable,
  existant: IdentiteComparable,
): MotifDoublon[] {
  const motifs: MotifDoublon[] = [];
  if (memeBeneficiaire(candidat, existant)) {
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

/** Doublon dans un centre accessible à l'utilisateur : identité affichée, fiche ouvrable. */
export interface DoublonVisible {
  readonly id: string;
  readonly nomNaissance: string;
  readonly nomUsage: string | null;
  readonly prenoms: string;
  readonly dateNaissance: string;
  readonly centreNom: string;
  readonly motifs: readonly MotifDoublon[];
  readonly qualite: Qualite | null;
  readonly rangNaissance: number | null;
}

/** Doublon hors du périmètre de l'utilisateur : seul le centre est révélé, jamais l'identité. */
export interface DoublonHorsPerimetre {
  readonly centreNom: string;
  readonly motifs: readonly MotifDoublon[];
}

export interface DoublonsPossibles {
  readonly visibles: readonly DoublonVisible[];
  readonly horsPerimetre: readonly DoublonHorsPerimetre[];
}
