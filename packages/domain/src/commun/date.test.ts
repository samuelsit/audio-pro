import { describe, expect, it } from 'vitest';

import { ajouterJours, ajouterMois, dateCalendaireSchema, joursEntre } from './date';

describe('dateCalendaireSchema', () => {
  it.each(['2026-10-29', '2024-02-29', '2000-02-29', '2026-12-31', '2026-01-01'])(
    'accepte %s',
    (date) => {
      expect(dateCalendaireSchema.parse(date)).toBe(date);
    },
  );

  it.each([
    { date: '2026-02-29', message: 'Cette date n’existe pas.' },
    { date: '1900-02-29', message: 'Cette date n’existe pas.' },
    { date: '2026-04-31', message: 'Cette date n’existe pas.' },
    { date: '2026-13-01', message: 'Cette date n’existe pas.' },
    { date: '2026-00-10', message: 'Cette date n’existe pas.' },
    { date: '2026-10-00', message: 'Cette date n’existe pas.' },
    { date: '2026-1-5', message: 'Date invalide (format AAAA-MM-JJ).' },
    { date: 12, message: 'Date invalide.' },
  ])('refuse $date', ({ date, message }) => {
    const resultat = dateCalendaireSchema.safeParse(date);
    expect(resultat.success).toBe(false);
    expect(resultat.error?.issues.map((i) => i.message)).toEqual([message]);
  });
});

describe('ajouterJours', () => {
  it.each([
    { date: '2026-10-30', jours: 0, attendu: '2026-10-30', cas: 'zéro jour' },
    { date: '2026-01-01', jours: 30, attendu: '2026-01-31', cas: 'même mois' },
    { date: '2026-01-02', jours: 30, attendu: '2026-02-01', cas: 'changement de mois' },
    { date: '2026-12-15', jours: 30, attendu: '2027-01-14', cas: 'changement d’année' },
    { date: '2024-02-01', jours: 29, attendu: '2024-03-01', cas: 'février bissextile' },
    { date: '2026-02-01', jours: 45, attendu: '2026-03-18', cas: 'février ordinaire' },
    { date: '2026-01-01', jours: 400, attendu: '2027-02-05', cas: 'plusieurs mois' },
  ])('$cas', ({ date, jours, attendu }) => {
    expect(ajouterJours(date, jours)).toBe(attendu);
  });
});

describe('ajouterMois', () => {
  it.each([
    { date: '2026-10-30', mois: 2, attendu: '2026-12-30', cas: 'même année' },
    { date: '2026-11-15', mois: 2, attendu: '2027-01-15', cas: 'changement d’année' },
    { date: '2026-12-31', mois: 2, attendu: '2027-02-28', cas: 'jour absent : fin de mois' },
    { date: '2024-02-29', mois: 48, attendu: '2028-02-29', cas: '29 février, 4 ans plus tard' },
    { date: '2096-02-29', mois: 48, attendu: '2100-02-28', cas: '2100 n’est pas bissextile' },
    { date: '2026-12-01', mois: 12, attendu: '2027-12-01', cas: 'décembre reste décembre' },
  ])('$cas', ({ date, mois, attendu }) => {
    expect(ajouterMois(date, mois)).toBe(attendu);
  });
});

describe('joursEntre', () => {
  it.each([
    { debut: '2026-10-30', fin: '2026-10-30', attendu: 0, cas: 'même jour' },
    { debut: '2026-01-01', fin: '2026-01-31', attendu: 30, cas: 'même mois' },
    { debut: '2024-02-28', fin: '2024-03-01', attendu: 2, cas: 'année bissextile' },
    { debut: '2026-03-28', fin: '2026-03-30', attendu: 2, cas: 'passage à l’heure d’été' },
    { debut: '2026-10-30', fin: '2026-10-29', attendu: -1, cas: 'fin avant le début' },
  ])('$cas', ({ debut, fin, attendu }) => {
    expect(joursEntre(debut, fin)).toBe(attendu);
  });
});
