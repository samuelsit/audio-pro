import { estDeplacable, type StatutRdv } from '../agenda/etats';

const MS_PAR_HEURE = 3_600_000;

export const VALIDATIONS_RESERVATION = ['AUTOMATIQUE', 'MANUELLE'] as const;
export type ValidationReservation = (typeof VALIDATIONS_RESERVATION)[number];

export const LIBELLES_VALIDATIONS_RESERVATION: Readonly<Record<ValidationReservation, string>> = {
  AUTOMATIQUE: 'Automatique',
  MANUELLE: 'Manuelle',
};

export interface ModificationEnLigne {
  readonly statut: StatutRdv;
  readonly debut: number;
  readonly maintenant: number;
  readonly delaiModificationHeures: number;
}

/**
 * Annulation ou déplacement par le lien du patient : seulement un rendez-vous encore à venir, à plus du délai
 * fixé par le centre. Un patient en salle d'attente n'annule pas depuis son téléphone.
 */
export function peutModifierEnLigne(modification: ModificationEnLigne): boolean {
  const { statut, debut, maintenant, delaiModificationHeures } = modification;
  return (
    estDeplacable(statut) &&
    debut > maintenant &&
    debut - maintenant >= delaiModificationHeures * MS_PAR_HEURE
  );
}

/** Statut initial d'une réservation en ligne : `PLANIFIE` signifie « à valider » pour une origine `EN_LIGNE`. */
export function statutReservationEnLigne(validation: ValidationReservation): StatutRdv {
  return validation === 'MANUELLE' ? 'PLANIFIE' : 'CONFIRME';
}

/**
 * Après un déplacement par le patient. Le centre qui valide à la main revalide le nouvel horaire : sans quoi
 * un patient accepté une fois se placerait ensuite où il veut.
 */
export function statutApresDeplacementEnLigne(
  statut: StatutRdv,
  validation: ValidationReservation,
): StatutRdv {
  return validation === 'MANUELLE' ? 'PLANIFIE' : statut;
}
