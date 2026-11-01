import type { StatutPec } from '../facture/saisie';
import { centimes, type Centimes } from '../money';

export interface PecLue {
  readonly statut: StatutPec;
  readonly montantAccordeCentimes: number | null;
  readonly validiteFin: string | null;
}

/** Accord, total ou partiel : le montant accordé alimente la ventilation. */
export function pecAccordee(statut: StatutPec): boolean {
  return statut === 'ACCORDEE' || statut === 'PARTIELLE';
}

/**
 * Une PEC est expirée si elle est saisie comme telle, ou si un accord a dépassé sa validité à `date`.
 * À VÉRIFIER : validité appréciée à la délivrance par analogie avec les droits (art. 27), aucun document (R23).
 */
export function pecExpiree(pec: Pick<PecLue, 'statut' | 'validiteFin'>, date: string): boolean {
  return (
    pec.statut === 'EXPIREE' ||
    (pecAccordee(pec.statut) && pec.validiteFin !== null && pec.validiteFin < date)
  );
}

/**
 * Montant à répartir à `date`. Un refus ou une expiration valent 0 : le complément revient au patient. `null` : pas
 * de décision, la part estimée sur le devis reste valable.
 * À VÉRIFIER : aucun document de docs/ref ne décrit une PEC (R23).
 */
export function montantPecApplicable(pec: PecLue | null, date: string): Centimes | null {
  if (pec === null) {
    return null;
  }
  if (pec.statut === 'REFUSEE' || pecExpiree(pec, date)) {
    return centimes(0);
  }
  return pecAccordee(pec.statut) && pec.montantAccordeCentimes !== null
    ? centimes(pec.montantAccordeCentimes)
    : null;
}
