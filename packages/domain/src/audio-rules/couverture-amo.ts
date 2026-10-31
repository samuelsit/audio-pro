import { joursEntre } from '../commun/date';
import type { OrigineDonnee } from '../patient/patient';
import { FRAICHEUR_LECTURE_VITALE_JOURS } from './constantes';

export interface EntreeCouvertureAmo {
  readonly origine: OrigineDonnee;
  /** Jour de la dernière lecture de la carte. */
  readonly derniereLectureVitale: string | null;
  readonly dateDelivrance: string;
  /** Instants ISO, comparables entre eux. */
  readonly modifieeLe: string;
  readonly confirmeeLe: string | null;
}

/**
 * Couverture AMO à jour pour préparer la facture : lecture récente, ou saisie confirmée depuis sa dernière
 * modification. `SAISIE` écarte une lecture : la fiche a été retouchée après la carte (ADR-006, ADR-007).
 * Source : convention-audioprothesistes.pdf, art. 27, p. 26 (droits vérifiés sur la carte et appréciés à
 * la date de délivrance).
 * À VÉRIFIER : le délai de la lecture et la confirmation manuelle ne sont dans aucun texte (R22).
 */
export function couvertureAmoAJour({
  origine,
  derniereLectureVitale,
  dateDelivrance,
  modifieeLe,
  confirmeeLe,
}: EntreeCouvertureAmo): boolean {
  const lectureRecente =
    origine === 'VITALE' &&
    derniereLectureVitale !== null &&
    joursEntre(derniereLectureVitale, dateDelivrance) <= FRAICHEUR_LECTURE_VITALE_JOURS.valeur;
  return lectureRecente || (confirmeeLe !== null && confirmeeLe >= modifieeLe);
}
