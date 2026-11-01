import { localDepuisInstant, type Clock } from '@ha/domain';

/** Colonne `@db.Date` ↔ date calendaire ISO (minuit UTC, sans fuseau). */
export function versDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function depuisDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Jour de Paris d'un instant : une journée de caisse suit le fuseau du centre, pas UTC. */
export function jourParis(instant: Date): string {
  return localDepuisInstant(instant.getTime()).date;
}

export function aujourdhuiParis(horloge: Clock): string {
  return jourParis(new Date(horloge.now()));
}
