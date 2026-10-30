import { ajouterMois } from '../commun/date';
import type { Oreille } from './code-prestation';
import { DELAI_RENOUVELLEMENT_ANNEES } from './constantes';

export const MOTIFS_RENOUVELLEMENT = [
  'PREMIER_APPAREILLAGE',
  'DELAI_ECOULE',
  'DELAI_NON_ECOULE',
] as const;
export type MotifRenouvellement = (typeof MOTIFS_RENOUVELLEMENT)[number];

export const LIBELLES_MOTIFS_RENOUVELLEMENT: Readonly<Record<MotifRenouvellement, string>> = {
  PREMIER_APPAREILLAGE:
    'Aucune délivrance connue sur cette oreille. À confirmer sur le téléservice.',
  DELAI_ECOULE: 'Délai de 4 ans écoulé. À confirmer sur le téléservice.',
  DELAI_NON_ECOULE:
    'Moins de 4 ans depuis la dernière délivrance sur cette oreille : pas de prise en charge, sauf renouvellement anticipé accepté par la caisse.',
};

export interface Delivrance {
  readonly oreille: Oreille;
  /** Date de délivrance, qui est aussi la date de facturation. */
  readonly dateDelivrance: string;
}

export interface EntreeRenouvellement {
  readonly historiqueDelivrances: readonly Delivrance[];
  readonly oreille: Oreille;
  readonly date: string;
}

export interface EligibiliteRenouvellement {
  readonly eligible: boolean;
  /** Première date de prise en charge ; `null` sans délivrance connue sur cette oreille. */
  readonly dateEligibilite: string | null;
  readonly motif: MotifRenouvellement;
}

/**
 * Prise en charge d'une aide auditive au regard de la dernière délivrance sur la même oreille.
 * Indicatif : l'historique local ignore les délivrances d'autres entreprises, le téléservice fait foi.
 * Source : convention-audioprothesistes.pdf, art. 22 § 1, p. 22 ; art. 27, p. 26 et
 * modele-devis-audio.pdf p. 2 § 5 (date de délivrance et de facturation).
 * À VÉRIFIER : éligibilité dès le jour anniversaire (R8).
 */
export function eligibiliteRenouvellement({
  historiqueDelivrances,
  oreille,
  date,
}: EntreeRenouvellement): EligibiliteRenouvellement {
  const derniere = historiqueDelivrances
    .filter((d) => d.oreille === oreille)
    .map((d) => d.dateDelivrance)
    .sort()
    .at(-1);
  if (derniere === undefined) {
    return { eligible: true, dateEligibilite: null, motif: 'PREMIER_APPAREILLAGE' };
  }
  const dateEligibilite = ajouterMois(derniere, DELAI_RENOUVELLEMENT_ANNEES.valeur * 12);
  return date >= dateEligibilite
    ? { eligible: true, dateEligibilite, motif: 'DELAI_ECOULE' }
    : { eligible: false, dateEligibilite, motif: 'DELAI_NON_ECOULE' };
}
