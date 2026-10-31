import type { Oreille } from '../audio-rules/code-prestation';
import type { Audiogramme, OreilleAudiogramme } from './audiogramme';
import { FREQUENCES_AUDIOGRAMME } from './frequences';
import { perteMoyenneTonale, seuilRetenu } from './perte-moyenne';

export const GRADES_AUDIOMETRIQUES = [0, 1, 2, 3, 4, 5, 6] as const;
export type GradeAudiometrique = (typeof GRADES_AUDIOMETRIQUES)[number];

/** Borne haute exclue de chaque grade. Source : biap-rec-02-2-en.pdf p. 3-4. */
const BORNES_GRADES: readonly { readonly grade: GradeAudiometrique; readonly sous: number }[] = [
  { grade: 0, sous: 20 },
  { grade: 1, sous: 35 },
  { grade: 2, sous: 50 },
  { grade: 3, sous: 65 },
  { grade: 4, sous: 80 },
  { grade: 5, sous: 95 },
];

/** Source : biap-rec-02-2-en.pdf p. 3-4. À VÉRIFIER : traduction, le texte lu est en anglais (R24). */
export const LIBELLES_GRADES: Readonly<Record<GradeAudiometrique, string>> = {
  0: 'Dans les limites de la normale',
  1: 'Atteinte légère',
  2: 'Atteinte modérée',
  3: 'Atteinte modérée à sévère',
  4: 'Atteinte sévère',
  5: 'Atteinte sévère à profonde',
  6: 'Atteinte profonde à totale',
};

/** Source : biap-rec-02-2-en.pdf p. 2-3. */
export const MENTION_GRADE =
  'Grade audiométrique selon la recommandation BIAP 02/2, calculé sur les seuils sans appareil. Indicateur descriptif : il ne mesure pas le handicap et ne détermine ni une éligibilité ni un choix d’appareillage.';

/** Source : biap-rec-02-2-en.pdf p. 3-4. La valeur n'est pas arrondie avant le classement (ADR-022). */
export function gradeAudiometrique(perteMoyenne: number): GradeAudiometrique {
  return BORNES_GRADES.find(({ sous }) => perteMoyenne < sous)?.grade ?? 6;
}

const ECART_ASYMETRIE_DB = 15;
const FREQUENCES_CONSECUTIVES_ASYMETRIE = 3;
const POIDS_MEILLEURE_OREILLE = 7;
const POIDS_MOINS_BONNE_OREILLE = 3;

/**
 * Plus de 15 dB d'écart sur trois fréquences consécutives.
 * Source : biap-rec-02-2-en.pdf p. 5.
 * À VÉRIFIER : la grille n'est pas précisée ; fréquences mesurées aux deux oreilles, dans l'ordre de la saisie (R24).
 */
export function ecartSurFrequencesConsecutives(
  droite: OreilleAudiogramme,
  gauche: OreilleAudiogramme,
): boolean {
  let suite = 0;
  for (const frequence of FREQUENCES_AUDIOGRAMME) {
    const d = droite.aerienne.find((p) => p.frequence === frequence);
    const g = gauche.aerienne.find((p) => p.frequence === frequence);
    if (d === undefined || g === undefined) {
      continue;
    }
    suite = Math.abs(seuilRetenu(d) - seuilRetenu(g)) > ECART_ASYMETRIE_DB ? suite + 1 : 0;
    if (suite === FREQUENCES_CONSECUTIVES_ASYMETRIE) {
      return true;
    }
  }
  return false;
}

/** Source : biap-rec-02-2-en.pdf p. 5. */
export function perteGlobaleAsymetrique(meilleure: number, moinsBonne: number): number {
  return (
    (POIDS_MEILLEURE_OREILLE * meilleure + POIDS_MOINS_BONNE_OREILLE * moinsBonne) /
    (POIDS_MEILLEURE_OREILLE + POIDS_MOINS_BONNE_OREILLE)
  );
}

export interface ResultatOreille {
  /** `null` : une des quatre fréquences manque. */
  readonly perteMoyenne: number | null;
  readonly grade: GradeAudiometrique | null;
}

export interface SyntheseTonale {
  readonly droite: ResultatOreille;
  readonly gauche: ResultatOreille;
  readonly asymetrique: boolean;
  readonly unilaterale: boolean;
  /** `null` si les deux moyennes ne sont pas calculables ou sont égales. */
  readonly meilleureOreille: Oreille | null;
  /** Le texte ne définit de grade global que pour une perte asymétrique. */
  readonly global: { readonly perteMoyenne: number; readonly grade: GradeAudiometrique } | null;
}

function resultatOreille(courbes: OreilleAudiogramme): ResultatOreille {
  const perteMoyenne = perteMoyenneTonale(courbes.aerienne);
  return { perteMoyenne, grade: perteMoyenne === null ? null : gradeAudiometrique(perteMoyenne) };
}

function meilleure(droite: number, gauche: number): Oreille | null {
  if (droite === gauche) {
    return null;
  }
  return droite < gauche ? 'DROITE' : 'GAUCHE';
}

/**
 * Grades par oreille et configuration de la perte.
 * Source : biap-rec-02-2-en.pdf p. 3-5.
 */
export function syntheseTonale(audiogramme: Audiogramme): SyntheseTonale {
  const droite = resultatOreille(audiogramme.droite);
  const gauche = resultatOreille(audiogramme.gauche);
  const parFrequences = ecartSurFrequencesConsecutives(audiogramme.droite, audiogramme.gauche);

  if (droite.perteMoyenne === null || gauche.perteMoyenne === null) {
    return {
      droite,
      gauche,
      asymetrique: parFrequences,
      unilaterale: false,
      meilleureOreille: null,
      global: null,
    };
  }

  const minimum = Math.min(droite.perteMoyenne, gauche.perteMoyenne);
  const maximum = Math.max(droite.perteMoyenne, gauche.perteMoyenne);
  const asymetrique = maximum - minimum > ECART_ASYMETRIE_DB || parFrequences;
  const perteGlobale = perteGlobaleAsymetrique(minimum, maximum);
  return {
    droite,
    gauche,
    asymetrique,
    unilaterale: gradeAudiometrique(minimum) === 0 && gradeAudiometrique(maximum) > 0,
    meilleureOreille: meilleure(droite.perteMoyenne, gauche.perteMoyenne),
    global: asymetrique
      ? { perteMoyenne: perteGlobale, grade: gradeAudiometrique(perteGlobale) }
      : null,
  };
}
