import { describe, expect, it } from 'vitest';

import { trancheAge, trancheDepuisAge } from './tranche-age';

describe('trancheAge', () => {
  it.each([
    { naissance: '2006-10-31', reference: '2026-10-30', attendu: 'MOINS_DE_20', cas: 'veille' },
    {
      naissance: '2006-10-30',
      reference: '2026-10-30',
      attendu: 'VINGT_ET_PLUS',
      cas: 'jour même',
    },
    {
      naissance: '2005-11-30',
      reference: '2026-10-30',
      attendu: 'VINGT_ET_PLUS',
      cas: '20 ans et 11 mois',
    },
    { naissance: '2020-01-01', reference: '2026-10-30', attendu: 'MOINS_DE_20', cas: 'enfant' },
    { naissance: '1950-03-12', reference: '2026-10-30', attendu: 'VINGT_ET_PLUS', cas: 'adulte' },
    {
      naissance: '2004-02-29',
      reference: '2024-02-28',
      attendu: 'MOINS_DE_20',
      cas: 'né un 29 février, veille',
    },
    {
      naissance: '2004-02-29',
      reference: '2024-02-29',
      attendu: 'VINGT_ET_PLUS',
      cas: 'né un 29 février, année bissextile',
    },
    {
      naissance: '2006-02-28',
      reference: '2026-02-28',
      attendu: 'VINGT_ET_PLUS',
      cas: 'né un 28 février',
    },
  ])('$cas', ({ naissance, reference, attendu }) => {
    expect(trancheAge(naissance, reference)).toBe(attendu);
  });

  it('refuse une date de référence antérieure à la naissance', () => {
    expect(() => trancheAge('2020-01-02', '2020-01-01')).toThrow(RangeError);
  });
});

describe('trancheDepuisAge', () => {
  it.each([
    { age: 0, attendu: 'MOINS_DE_20' },
    { age: 19, attendu: 'MOINS_DE_20' },
    { age: 20, attendu: 'VINGT_ET_PLUS' },
    { age: 21, attendu: 'VINGT_ET_PLUS' },
  ])('$age ans', ({ age, attendu }) => {
    expect(trancheDepuisAge(age)).toBe(attendu);
  });
});
