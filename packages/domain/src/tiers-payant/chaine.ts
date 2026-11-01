import { empreinteTexte } from '../caisse/encaissement';
import type { Hacheur } from '../ports/hacheur';
import type { TypeCreance } from './creance';
import type { NatureRegularisation, OrigineReglement } from './saisie';

export const TYPE_MAILLON_REGLEMENT = {
  RECU: 'REGLEMENT_ORGANISME',
  ANNULE: 'ANNULATION_REGLEMENT_ORGANISME',
} as const;

/** Règlement d'organisme ou sa contre-passation, tel que chaîné. */
export interface ReglementAChainer {
  readonly id: string;
  readonly origineId: string | null;
  readonly organisme: string;
  readonly complementaireId: string | null;
  readonly dateReglement: string;
  readonly reference: string;
  /** Négatifs sur une contre-passation. */
  readonly partAmoCentimes: number;
  readonly partAmcCentimes: number;
  readonly origine: OrigineReglement;
  readonly identifiantExterne: string | null;
  readonly motif: string | null;
}

/** Charge d'un maillon de règlement, recalculée à la vérification depuis la ligne elle-même. */
export function chargeReglement(r: ReglementAChainer, hacheur: Hacheur): unknown {
  return {
    id: r.id,
    origineId: r.origineId,
    organisme: r.organisme,
    complementaireId: r.complementaireId,
    dateReglement: r.dateReglement,
    reference: r.reference,
    partAmoCentimes: r.partAmoCentimes,
    partAmcCentimes: r.partAmcCentimes,
    origine: r.origine,
    identifiantExterne: r.identifiantExterne,
    motifEmpreinte: empreinteTexte(r.motif, hacheur),
  };
}

/** Écart, transfert au patient ou leur contre-passation, tel que chaîné. */
export interface RegularisationAChainer {
  readonly id: string;
  readonly origineId: string | null;
  readonly creanceId: string | null;
  readonly reglementId: string | null;
  readonly type: TypeCreance;
  readonly nature: NatureRegularisation;
  /** Signé : négatif sur une contre-passation. */
  readonly montantCentimes: number;
  readonly motif: string;
}

export function chargeRegularisation(r: RegularisationAChainer, hacheur: Hacheur): unknown {
  return {
    id: r.id,
    origineId: r.origineId,
    creanceId: r.creanceId,
    reglementId: r.reglementId,
    type: r.type,
    nature: r.nature,
    montantCentimes: r.montantCentimes,
    motifEmpreinte: empreinteTexte(r.motif, hacheur),
  };
}
