import type { HorairesOuverture } from '../centre/horaires';
import { localDepuisInstant } from '../commun/fuseau';
import type { Occupation } from './creneaux';
import { plagesCabine, plagesPraticien, type ExceptionAgenda } from './disponibilites';
import { contient, seChevauchent, type Intervalle } from './intervalles';

export const CODES_CONFLIT = [
  'PRATICIEN_PRIS',
  'CABINE_PRISE',
  'HORS_DISPONIBILITES',
  'CENTRE_FERME',
] as const;
export type CodeConflit = (typeof CODES_CONFLIT)[number];

export const LIBELLES_CONFLITS: Readonly<Record<CodeConflit, string>> = {
  PRATICIEN_PRIS: 'Le praticien a déjà un rendez-vous sur ce créneau.',
  CABINE_PRISE: 'La cabine est déjà prise sur ce créneau.',
  HORS_DISPONIBILITES: 'Ce créneau est hors des disponibilités.',
  CENTRE_FERME: 'Le centre est fermé sur ce créneau.',
};

const BLOQUANTS: readonly CodeConflit[] = ['PRATICIEN_PRIS', 'CABINE_PRISE'];

/** Une ressource déjà prise ne se force jamais ; le reste se confirme en interne (ADR-020). */
export function estBloquant(code: CodeConflit): boolean {
  return BLOQUANTS.includes(code);
}

export interface Candidat extends Intervalle {
  readonly centreId: string;
  readonly praticienId: string | null;
  readonly cabineId: string | null;
}

export interface ContexteConflits {
  /** Sans le rendez-vous lui-même quand on le déplace. */
  readonly occupations: readonly Occupation[];
  /** Horaires du praticien sur le centre du candidat ; `null` pour ne pas exercer sur ce centre. */
  readonly horairesPraticien: HorairesOuverture | null;
  readonly horairesCentre: HorairesOuverture;
  readonly exceptions: readonly ExceptionAgenda[];
}

function horsDisponibilites(candidat: Candidat, contexte: ContexteConflits): boolean {
  const { centreId, praticienId, cabineId } = candidat;
  const { horairesPraticien, horairesCentre, exceptions } = contexte;
  const { date } = localDepuisInstant(candidat.debut);
  const praticienAbsent =
    praticienId !== null &&
    (horairesPraticien === null ||
      !contient(
        plagesPraticien({ date, centreId, praticienId, horaires: horairesPraticien, exceptions }),
        candidat,
      ));
  const cabineFermee =
    cabineId !== null &&
    !contient(plagesCabine({ date, centreId, cabineId, horairesCentre, exceptions }), candidat);
  return praticienAbsent || cabineFermee;
}

/** Conflits d'un créneau, bloquants d'abord. Liste vide : le créneau convient. */
export function detecterConflits(candidat: Candidat, contexte: ContexteConflits): CodeConflit[] {
  const { centreId, praticienId, cabineId } = candidat;
  const { occupations, exceptions } = contexte;
  const chevauchants = occupations.filter((o) => seChevauchent(o, candidat));
  const conflits: CodeConflit[] = [];
  if (praticienId !== null && chevauchants.some((o) => o.praticienId === praticienId)) {
    conflits.push('PRATICIEN_PRIS');
  }
  if (cabineId !== null && chevauchants.some((o) => o.cabineId === cabineId)) {
    conflits.push('CABINE_PRISE');
  }
  if (
    exceptions.some(
      (e) => e.type === 'FERMETURE_CENTRE' && e.centreId === centreId && seChevauchent(e, candidat),
    )
  ) {
    conflits.push('CENTRE_FERME');
  } else if (horsDisponibilites(candidat, contexte)) {
    conflits.push('HORS_DISPONIBILITES');
  }
  return conflits;
}
