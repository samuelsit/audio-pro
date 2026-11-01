import { describe, expect, it } from 'vitest';

import { tauxTvaEnVigueur, tauxTvaSaisieSchema, type TauxTvaDate } from './tva';

// Valeurs fictives : le test porte sur le choix de la date, pas sur un taux réel.
const TAUX: readonly TauxTvaDate[] = [
  { type: 'PILE', taux: 1000, debut: '2020-01-01' },
  { type: 'PILE', taux: 1500, debut: '2025-07-01' },
  { type: 'AIDE_AUDITIVE', taux: 300, debut: '2020-01-01' },
];

describe('tauxTvaEnVigueur', () => {
  it.each([
    { cas: 'avant le premier taux', type: 'PILE', date: '2019-12-31', attendu: null },
    { cas: 'le jour du début', type: 'PILE', date: '2020-01-01', attendu: 1000 },
    { cas: 'la veille d’un changement', type: 'PILE', date: '2025-06-30', attendu: 1000 },
    { cas: 'le jour d’un changement', type: 'PILE', date: '2025-07-01', attendu: 1500 },
    { cas: 'un autre type', type: 'AIDE_AUDITIVE', date: '2025-07-01', attendu: 300 },
    { cas: 'un type sans taux', type: 'ENTRETIEN', date: '2025-07-01', attendu: null },
  ] as const)('$cas', ({ type, date, attendu }) => {
    expect(tauxTvaEnVigueur(TAUX, type, date)).toBe(attendu);
  });
});

describe('tauxTvaSaisieSchema', () => {
  const saisie = { type: 'PILE', taux: '5,5', debut: '2027-01-01' };

  it('convertit le pourcentage en pour dix mille', () => {
    expect(tauxTvaSaisieSchema.parse(saisie).taux).toBe(550);
    expect(tauxTvaSaisieSchema.parse({ ...saisie, taux: '0' }).taux).toBe(0);
  });

  it.each(['abc', '101', '5,555'])('refuse %s', (taux) => {
    expect(tauxTvaSaisieSchema.safeParse({ ...saisie, taux }).success).toBe(false);
  });
});
