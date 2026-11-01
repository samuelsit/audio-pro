import { describe, expect, it } from 'vitest';

import {
  boitesRemboursees,
  etatQuotaPiles,
  quotaPilesEnVigueur,
  quotaPilesSaisieSchema,
} from './quota-piles';

describe('quotaPilesEnVigueur', () => {
  const QUOTAS = [
    { debut: '2026-01-01', boitesParAn: 10 },
    { debut: '2027-01-01', boitesParAn: 12 },
  ];

  it.each([
    { date: '2025-12-31', attendu: null },
    { date: '2026-01-01', attendu: 10 },
    { date: '2026-12-31', attendu: 10 },
    { date: '2027-06-01', attendu: 12 },
  ])('le $date : $attendu', ({ date, attendu }) => {
    expect(quotaPilesEnVigueur(QUOTAS, date)).toBe(attendu);
  });

  it('sans quota saisi, aucune limite', () => {
    expect(quotaPilesEnVigueur([], '2026-11-01')).toBeNull();
  });
});

describe('boitesRemboursees', () => {
  const ligne = { quantite: 4, prixTtcCentimes: 600, repriseTtcCentimes: 0 };

  it.each([
    { cas: 'aucune ligne', lignes: [], attendu: 0 },
    { cas: 'une ligne', lignes: [ligne], attendu: 4 },
    { cas: 'deux lignes', lignes: [ligne, { ...ligne, quantite: 2 }], attendu: 6 },
    { cas: 'avoir total', lignes: [{ ...ligne, repriseTtcCentimes: 600 }], attendu: 0 },
    { cas: 'avoir partiel exact', lignes: [{ ...ligne, repriseTtcCentimes: 300 }], attendu: 2 },
    { cas: 'avoir partiel arrondi', lignes: [{ ...ligne, repriseTtcCentimes: 100 }], attendu: 4 },
    { cas: 'ligne gratuite', lignes: [{ ...ligne, prixTtcCentimes: 0 }], attendu: 0 },
  ])('$cas : $attendu', ({ lignes, attendu }) => {
    expect(boitesRemboursees(lignes)).toBe(attendu);
  });
});

describe('etatQuotaPiles', () => {
  it.each([
    { boites: 3, quota: null, restant: null, depasse: false },
    { boites: 3, quota: 10, restant: 7, depasse: false },
    { boites: 10, quota: 10, restant: 0, depasse: false },
    { boites: 11, quota: 10, restant: 0, depasse: true },
  ])('$boites boîtes sur $quota', ({ boites, quota, restant, depasse }) => {
    expect(etatQuotaPiles(2026, boites, quota)).toEqual({
      annee: 2026,
      boites,
      quota,
      restant,
      depasse,
    });
  });
});

describe('quotaPilesSaisieSchema', () => {
  const valide = { boitesParAn: '10', debut: '2027-01-01', source: 'Arrêté fictif' };

  it('exige la source', () => {
    expect(quotaPilesSaisieSchema.parse(valide)).toMatchObject({ boitesParAn: 10 });
    expect(quotaPilesSaisieSchema.safeParse({ ...valide, source: ' ' }).success).toBe(false);
  });

  it('refuse un nombre négatif', () => {
    expect(quotaPilesSaisieSchema.safeParse({ ...valide, boitesParAn: '-1' }).success).toBe(false);
  });
});
