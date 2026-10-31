import type { Oreille } from '../audio-rules/code-prestation';
import { ESSAI_RDV_MINIMUM } from '../audio-rules/constantes';
import type { EtatEssai } from '../audio-rules/essai';

export const CODES_BLOCAGE_SIGNATURE = [
  'ESSAI_ABSENT',
  'DUREE_NON_ATTEINTE',
  'RDV_MANQUANTS',
  'MODELE_HORS_OFFRE',
] as const;
export type CodeBlocageSignature = (typeof CODES_BLOCAGE_SIGNATURE)[number];

export const MESSAGES_BLOCAGE_SIGNATURE: Readonly<Record<CodeBlocageSignature, string>> = {
  ESSAI_ABSENT: 'Aucun essai n’est en cours sur ce dossier.',
  DUREE_NON_ATTEINTE: 'La signature se recueille à l’issue de la période d’essai.',
  RDV_MANQUANTS: 'L’essai doit comporter au moins 2 rendez-vous avant la signature.',
  MODELE_HORS_OFFRE:
    'Un appareil en essai n’est pas celui de l’offre retenue : changer l’appareil ou émettre une nouvelle version du devis.',
};

export interface AppareilPose {
  readonly oreille: Oreille;
  readonly modeleId: string;
}

export interface EntreeSignature {
  /** État de l'essai à la date de signature, `null` s'il n'y a pas d'essai ouvert. */
  readonly etat: EtatEssai | null;
  readonly appareils: readonly AppareilPose[];
  /** Modèle de l'offre retenue pour chaque oreille appareillée. */
  readonly modelesOffre: Readonly<Partial<Record<Oreille, string>>>;
}

/**
 * Motifs qui interdisent de recueillir la signature. La durée et les rendez-vous sont des minimums du
 * texte, sans forçage possible.
 * Source : modele-devis-audio.pdf p. 2 § 3 et § 5 ; convention-audioprothesistes.pdf, art. 18 3°, p. 20.
 * Le contrôle du modèle est de cohérence, ce n'est pas une règle.
 */
export function blocagesSignature({
  etat,
  appareils,
  modelesOffre,
}: EntreeSignature): CodeBlocageSignature[] {
  if (etat === null) {
    return ['ESSAI_ABSENT'];
  }
  const blocages: CodeBlocageSignature[] = [];
  if (etat.joursRestants > 0) {
    blocages.push('DUREE_NON_ATTEINTE');
  }
  if (etat.rdvRealises < ESSAI_RDV_MINIMUM.valeur) {
    blocages.push('RDV_MANQUANTS');
  }
  if (appareils.some((a) => modelesOffre[a.oreille] !== a.modeleId)) {
    blocages.push('MODELE_HORS_OFFRE');
  }
  return blocages;
}
