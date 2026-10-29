import { describe, expect, it } from 'vitest';

import { ageAt } from './age';

describe('ageAt', () => {
  it.each([
    { cas: 'jour de naissance', naissance: '2026-10-29', reference: '2026-10-29', age: 0 },
    { cas: 'veille du 1er anniversaire', naissance: '2025-10-29', reference: '2026-10-28', age: 0 },
    { cas: 'jour du 1er anniversaire', naissance: '2025-10-29', reference: '2026-10-29', age: 1 },
    { cas: 'veille des 20 ans', naissance: '2006-10-29', reference: '2026-10-28', age: 19 },
    { cas: 'jour des 20 ans', naissance: '2006-10-29', reference: '2026-10-29', age: 20 },
    {
      cas: 'mois de naissance pas encore atteint',
      naissance: '2006-11-01',
      reference: '2026-10-31',
      age: 19,
    },
    { cas: 'mois de naissance dépassé', naissance: '2006-01-31', reference: '2026-02-01', age: 20 },
    {
      cas: '29/02, 28/02 d’une année non bissextile',
      naissance: '2008-02-29',
      reference: '2027-02-28',
      age: 18,
    },
    {
      cas: '29/02, 1er mars d’une année non bissextile',
      naissance: '2008-02-29',
      reference: '2027-03-01',
      age: 19,
    },
    {
      cas: '29/02, 29/02 d’une année bissextile',
      naissance: '2008-02-29',
      reference: '2028-02-29',
      age: 20,
    },
    { cas: 'centenaire', naissance: '1926-03-15', reference: '2026-10-29', age: 100 },
  ])('$cas → $age', ({ naissance, reference, age }) => {
    expect(ageAt(naissance, reference)).toBe(age);
  });

  it('refuse une date de référence antérieure à la naissance', () => {
    expect(() => ageAt('2026-10-29', '2026-10-28')).toThrow(
      'La date de référence précède la date de naissance.',
    );
  });
});
