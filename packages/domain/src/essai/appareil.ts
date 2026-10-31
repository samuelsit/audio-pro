import type { StatutAppareil } from '../stock/etats';

export const CODES_REFUS_APPAREIL_ESSAI = [
  'AUTRE_CENTRE',
  'DEJA_EN_ESSAI',
  'RESERVE_AUTRE_PATIENT',
  'INDISPONIBLE',
  'MODELE_DIFFERENT',
] as const;
export type CodeRefusAppareilEssai = (typeof CODES_REFUS_APPAREIL_ESSAI)[number];

export const MESSAGES_REFUS_APPAREIL_ESSAI: Readonly<Record<CodeRefusAppareilEssai, string>> = {
  AUTRE_CENTRE: 'Cet appareil n’est pas dans le stock du centre du dossier.',
  DEJA_EN_ESSAI: 'Cet appareil est déjà en essai.',
  RESERVE_AUTRE_PATIENT: 'Cet appareil est réservé à un autre patient.',
  INDISPONIBLE: 'Cet appareil n’est pas disponible : il doit être en stock ou réservé.',
  MODELE_DIFFERENT: 'Cet appareil n’est pas le modèle prévu au devis pour cette oreille.',
};

export interface AppareilCandidat {
  readonly statut: StatutAppareil;
  readonly centreId: string;
  readonly patientId: string | null;
  readonly modeleId: string;
}

export interface CibleEssai {
  readonly centreId: string;
  readonly patientId: string;
  /** `null` : tout modèle convient (changement d'appareil en cours d'essai). */
  readonly modeleAttendu: string | null;
}

/**
 * Motif de refus d'un appareil pour un essai, `null` s'il convient. Choix d'organisation, pas une règle.
 * Le centre passe en premier : le statut d'un appareil hors du centre n'est pas révélé (ADR-010).
 */
export function refusAppareilEssai(
  appareil: AppareilCandidat,
  cible: CibleEssai,
): CodeRefusAppareilEssai | null {
  if (appareil.centreId !== cible.centreId) {
    return 'AUTRE_CENTRE';
  }
  if (appareil.statut === 'EN_ESSAI') {
    return 'DEJA_EN_ESSAI';
  }
  if (appareil.statut === 'RESERVE' && appareil.patientId !== cible.patientId) {
    return 'RESERVE_AUTRE_PATIENT';
  }
  if (appareil.statut !== 'EN_STOCK' && appareil.statut !== 'RESERVE') {
    return 'INDISPONIBLE';
  }
  if (cible.modeleAttendu !== null && appareil.modeleId !== cible.modeleAttendu) {
    return 'MODELE_DIFFERENT';
  }
  return null;
}
