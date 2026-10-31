import { JOURS_SEMAINE, type HorairesOuverture, type JourSemaine } from '../centre/horaires';
import { bornesJourMs, instantDePlage, jourSemaine } from '../commun/fuseau';
import { intersecter, soustraire, unir, type Intervalle } from './intervalles';

export const TYPES_EXCEPTION = [
  'DISPONIBILITE',
  'INDISPONIBILITE',
  'CONGE',
  'FERMETURE_CENTRE',
] as const;
export type TypeException = (typeof TYPES_EXCEPTION)[number];

export const LIBELLES_TYPES_EXCEPTION: Readonly<Record<TypeException, string>> = {
  DISPONIBILITE: 'Disponibilité exceptionnelle',
  INDISPONIBILITE: 'Indisponibilité',
  CONGE: 'Congé',
  FERMETURE_CENTRE: 'Fermeture du centre',
};

export interface ExceptionAgenda extends Intervalle {
  readonly type: TypeException;
  readonly praticienId: string | null;
  readonly cabineId: string | null;
  readonly centreId: string | null;
}

/** Plages hebdomadaires d'un jour, en instants réels. */
export function plagesDuJour(horaires: HorairesOuverture, date: string): Intervalle[] {
  return horaires[jourSemaine(date)].map(({ debut, fin }) => ({
    debut: instantDePlage(date, debut, 'DEBUT'),
    fin: instantDePlage(date, fin, 'FIN'),
  }));
}

function fermetures(exceptions: readonly ExceptionAgenda[], centreId: string): ExceptionAgenda[] {
  return exceptions.filter((e) => e.type === 'FERMETURE_CENTRE' && e.centreId === centreId);
}

/** Une indisponibilité sans centre vaut partout ; un congé vaut toujours partout. */
function retraitsDuPraticien(
  exceptions: readonly ExceptionAgenda[],
  praticienId: string,
  centreId: string,
): ExceptionAgenda[] {
  return exceptions.filter(
    (e) =>
      e.praticienId === praticienId &&
      (e.type === 'CONGE' ||
        (e.type === 'INDISPONIBILITE' && (e.centreId === null || e.centreId === centreId))),
  );
}

export interface PlagesPraticien {
  readonly date: string;
  readonly centreId: string;
  readonly praticienId: string;
  /** Horaires du praticien sur CE centre. */
  readonly horaires: HorairesOuverture;
  readonly exceptions: readonly ExceptionAgenda[];
}

/** Hebdomadaire, plus les disponibilités exceptionnelles, moins congés, indisponibilités et fermetures. */
export function plagesPraticien({
  date,
  centreId,
  praticienId,
  horaires,
  exceptions,
}: PlagesPraticien): Intervalle[] {
  const ajouts = exceptions.filter(
    (e) => e.type === 'DISPONIBILITE' && e.praticienId === praticienId && e.centreId === centreId,
  );
  const plages = unir([
    ...plagesDuJour(horaires, date),
    ...intersecter(ajouts, [bornesJourMs(date)]),
  ]);
  return soustraire(plages, [
    ...retraitsDuPraticien(exceptions, praticienId, centreId),
    ...fermetures(exceptions, centreId),
  ]);
}

export interface PlagesCabine {
  readonly date: string;
  readonly centreId: string;
  readonly cabineId: string;
  readonly horairesCentre: HorairesOuverture;
  readonly exceptions: readonly ExceptionAgenda[];
}

/** Une cabine suit l'ouverture du centre ; une disponibilité exceptionnelle du centre l'ouvre aussi. */
export function plagesCabine({
  date,
  centreId,
  cabineId,
  horairesCentre,
  exceptions,
}: PlagesCabine): Intervalle[] {
  const ajouts = exceptions.filter((e) => e.type === 'DISPONIBILITE' && e.centreId === centreId);
  const plages = unir([
    ...plagesDuJour(horairesCentre, date),
    ...intersecter(ajouts, [bornesJourMs(date)]),
  ]);
  return soustraire(plages, [
    ...exceptions.filter((e) => e.type === 'INDISPONIBILITE' && e.cabineId === cabineId),
    ...fermetures(exceptions, centreId),
  ]);
}

/**
 * Premier jour où les horaires d'un praticien se chevauchent sur deux centres, ou `null`.
 * Il faut au moins le temps d'aller de l'un à l'autre : deux plages qui se touchent passent.
 */
export function jourDeChevauchement(
  a: HorairesOuverture,
  b: HorairesOuverture,
): JourSemaine | null {
  const jour = JOURS_SEMAINE.find((j) =>
    a[j].some((x) => b[j].some((y) => x.debut < y.fin && y.debut < x.fin)),
  );
  return jour ?? null;
}
