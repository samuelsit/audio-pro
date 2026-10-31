import { describe, expect, it } from 'vitest';

import {
  bornesJourMs,
  decalageParisMs,
  heureDepuisMinutes,
  instantDePlage,
  instantSaisi,
  jourSemaine,
  localDepuisInstant,
  lundiDeLaSemaine,
  minutesDepuisMinuit,
} from './fuseau';

const HEURE = 3_600_000;
const iso = (utc: string) => Date.parse(utc);

describe('decalageParisMs', () => {
  it.each([
    { cas: 'hiver', utc: '2027-01-15T12:00:00Z', heures: 1 },
    { cas: 'été', utc: '2027-07-15T12:00:00Z', heures: 2 },
    { cas: 'juste avant le passage à l’été', utc: '2027-03-28T00:59:59Z', heures: 1 },
    { cas: 'au passage à l’été', utc: '2027-03-28T01:00:00Z', heures: 2 },
    { cas: 'juste avant le passage à l’hiver', utc: '2027-10-31T00:59:59Z', heures: 2 },
    { cas: 'au passage à l’hiver', utc: '2027-10-31T01:00:00Z', heures: 1 },
  ])('$cas', ({ utc, heures }) => {
    expect(decalageParisMs(iso(utc))).toBe(heures * HEURE);
  });

  it('lit un décalage historique sans heures pleines, ni décalage nul', () => {
    expect(decalageParisMs(iso('1900-01-01T00:00:00Z'))).toBe(9 * 60_000);
    expect(decalageParisMs(iso('1930-01-01T00:00:00Z'))).toBe(0);
  });
});

describe('instantSaisi', () => {
  it.each([
    { cas: 'hiver', date: '2027-01-15', heure: '09:30', utc: '2027-01-15T08:30:00Z' },
    { cas: 'été', date: '2027-07-15', heure: '09:30', utc: '2027-07-15T07:30:00Z' },
    {
      cas: 'avant le saut de printemps',
      date: '2027-03-28',
      heure: '01:59',
      utc: '2027-03-28T00:59:00Z',
    },
    {
      cas: 'après le saut de printemps',
      date: '2027-03-28',
      heure: '03:00',
      utc: '2027-03-28T01:00:00Z',
    },
    {
      cas: 'première occurrence d’automne',
      date: '2027-10-31',
      heure: '02:30',
      utc: '2027-10-31T00:30:00Z',
    },
    {
      cas: 'après l’heure doublée',
      date: '2027-10-31',
      heure: '03:00',
      utc: '2027-10-31T02:00:00Z',
    },
  ])('$cas', ({ date, heure, utc }) => {
    expect(instantSaisi(date, heure)).toBe(iso(utc));
  });

  it.each(['02:00', '02:30', '02:59'])('%s n’existe pas au passage à l’été', (heure) => {
    expect(instantSaisi('2027-03-28', heure)).toBeNull();
  });
});

describe('instantDePlage', () => {
  it.each([
    {
      cas: 'heure ordinaire',
      date: '2027-07-15',
      heure: '09:00',
      borne: 'FIN',
      utc: '2027-07-15T07:00:00Z',
    },
    {
      cas: 'heure inexistante en début',
      date: '2027-03-28',
      heure: '02:30',
      borne: 'DEBUT',
      utc: '2027-03-28T01:00:00Z',
    },
    {
      cas: 'heure inexistante en fin',
      date: '2027-03-28',
      heure: '02:30',
      borne: 'FIN',
      utc: '2027-03-28T01:00:00Z',
    },
    {
      cas: 'heure ambiguë en début',
      date: '2027-10-31',
      heure: '02:30',
      borne: 'DEBUT',
      utc: '2027-10-31T00:30:00Z',
    },
    {
      cas: 'heure ambiguë en fin',
      date: '2027-10-31',
      heure: '02:30',
      borne: 'FIN',
      utc: '2027-10-31T01:30:00Z',
    },
  ] as const)('$cas', ({ date, heure, borne, utc }) => {
    expect(instantDePlage(date, heure, borne)).toBe(iso(utc));
  });
});

describe('localDepuisInstant', () => {
  it.each([
    { utc: '2027-01-15T08:30:00Z', date: '2027-01-15', heure: '09:30' },
    { utc: '2027-07-15T07:30:00Z', date: '2027-07-15', heure: '09:30' },
    { utc: '2027-03-28T01:00:00Z', date: '2027-03-28', heure: '03:00' },
    { utc: '2027-10-31T00:30:00Z', date: '2027-10-31', heure: '02:30' },
    { utc: '2027-10-31T01:30:00Z', date: '2027-10-31', heure: '02:30' },
    { utc: '2027-12-31T23:30:00Z', date: '2028-01-01', heure: '00:30' },
  ])('$utc → $date $heure', ({ utc, date, heure }) => {
    expect(localDepuisInstant(iso(utc))).toEqual({ date, heure });
  });
});

describe('bornesJourMs', () => {
  it.each([
    { cas: 'journée ordinaire', date: '2027-01-15', heures: 24 },
    { cas: 'passage à l’été', date: '2027-03-28', heures: 23 },
    { cas: 'passage à l’hiver', date: '2027-10-31', heures: 25 },
  ])('$cas : $heures h', ({ date, heures }) => {
    const { debut, fin } = bornesJourMs(date);
    expect(fin - debut).toBe(heures * HEURE);
    expect(localDepuisInstant(debut)).toEqual({ date, heure: '00:00' });
  });
});

describe('jourSemaine et lundiDeLaSemaine', () => {
  it.each([
    { date: '2027-03-28', jour: 'dimanche', lundi: '2027-03-22' },
    { date: '2027-03-29', jour: 'lundi', lundi: '2027-03-29' },
    { date: '2026-10-31', jour: 'samedi', lundi: '2026-10-26' },
    { date: '2027-01-01', jour: 'vendredi', lundi: '2026-12-28' },
    { date: '1969-12-31', jour: 'mercredi', lundi: '1969-12-29' },
  ])('$date est un $jour', ({ date, jour, lundi }) => {
    expect(jourSemaine(date)).toBe(jour);
    expect(lundiDeLaSemaine(date)).toBe(lundi);
  });
});

describe('minutes', () => {
  it.each([
    { heure: '00:00', minutes: 0 },
    { heure: '09:05', minutes: 545 },
    { heure: '23:59', minutes: 1439 },
  ])('$heure ↔ $minutes', ({ heure, minutes }) => {
    expect(minutesDepuisMinuit(heure)).toBe(minutes);
    expect(heureDepuisMinutes(minutes)).toBe(heure);
  });
});
