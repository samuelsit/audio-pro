import { z } from 'zod';

import { GARANTIE_MINIMALE_ANNEES } from '../audio-rules/constantes';
import { ajouterMois, dateCalendaireSchema } from '../commun/date';
import { texteOptionnelSchema } from '../commun/texte';

export const MOTIFS_SAV = ['PANNE', 'CASSE', 'PERTE', 'VOL', 'ENTRETIEN', 'AUTRE'] as const;
export type MotifSav = (typeof MOTIFS_SAV)[number];

export const LIBELLES_MOTIFS_SAV: Readonly<Record<MotifSav, string>> = {
  PANNE: 'Panne',
  CASSE: 'Casse',
  PERTE: 'Perte',
  VOL: 'Vol',
  ENTRETIEN: 'Entretien',
  AUTRE: 'Autre',
};

export const COUVERTURES_SAV = ['GARANTIE', 'ASSURANCE', 'AUCUNE'] as const;
export type CouvertureSav = (typeof COUVERTURES_SAV)[number];

export const LIBELLES_COUVERTURES_SAV: Readonly<Record<CouvertureSav, string>> = {
  GARANTIE: 'Sous garantie',
  ASSURANCE: 'Assurance',
  AUCUNE: 'Hors garantie',
};

/** Durée minimale de la garantie du fabricant, plancher de la durée paramétrée. */
export const DUREE_GARANTIE_MINIMALE_MOIS = GARANTIE_MINIMALE_ANNEES.valeur * 12;

/**
 * Dernier jour couvert. Source : modele-devis-audio.pdf p. 2 § 4 (minimum de 4 ans).
 * À VÉRIFIER : le modèle ne fixe pas le point de départ, la délivrance est retenue (R19).
 */
export function finGarantie(dateDelivrance: string, dureeMois: number): string {
  return ajouterMois(dateDelivrance, dureeMois);
}

export interface GarantieSav {
  readonly dateFin: string;
  /** `null` : aucune assurance souscrite. */
  readonly assuranceFin: string | null;
}

/** Le dernier jour est couvert, comme le jour anniversaire de R8. */
export function periodeEnCours(dateFin: string | null, jour: string): boolean {
  return dateFin !== null && jour <= dateFin;
}

const MOTIFS_ASSURES: readonly MotifSav[] = ['CASSE', 'PERTE', 'VOL'];

/**
 * Ce qui prend en charge un ticket, à son ouverture.
 * Source : modele-devis-audio.pdf p. 2 § 4 : la garantie couvre les vices de forme, les défauts de fabrication
 * et les pannes d'un usage habituel ; l'assurance perte/vol/casse est une information « à part ».
 * À VÉRIFIER : l'étendue réelle d'une assurance dépend du contrat, tout motif assuré est supposé couvert (R52).
 */
export function couvertureTicket(
  motif: MotifSav,
  garantie: GarantieSav | null,
  jour: string,
): CouvertureSav {
  if (garantie === null) {
    return 'AUCUNE';
  }
  if (motif === 'PANNE') {
    return periodeEnCours(garantie.dateFin, jour) ? 'GARANTIE' : 'AUCUNE';
  }
  if (MOTIFS_ASSURES.includes(motif) && periodeEnCours(garantie.assuranceFin, jour)) {
    return 'ASSURANCE';
  }
  return 'AUCUNE';
}

const dateOptionnelleSchema = z.preprocess(
  (valeur) => (valeur === '' ? null : valeur),
  dateCalendaireSchema.nullable(),
);

/** Sans assureur, l'assurance est retirée : ses autres champs sont ignorés. */
export const assuranceSaisieSchema = z
  .object({
    assureur: texteOptionnelSchema,
    contrat: texteOptionnelSchema,
    assuranceFin: dateOptionnelleSchema,
  })
  .refine(({ assureur, assuranceFin }) => assureur === null || assuranceFin !== null, {
    path: ['assuranceFin'],
    message: 'Saisir la date de fin de l’assurance.',
  })
  .transform((saisie) =>
    saisie.assureur === null ? { assureur: null, contrat: null, assuranceFin: null } : saisie,
  );
