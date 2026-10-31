import { describe, expect, it } from 'vitest';

import { centimes } from '../money';
import { partAMCC2S, partAMO, ventilation } from './ventilation';

describe('partAMO', () => {
  it.each([
    { base: 40_000, taux: 60, attendu: 24_000, cas: 'adulte, 60 %' },
    { base: 140_000, taux: 60, attendu: 84_000, cas: 'moins de 20 ans, 60 %' },
    { base: 40_000, taux: 85, attendu: 34_000, cas: 'CRPCEN, 85 %' },
    { base: 40_000, taux: 100, attendu: 40_000, cas: 'AME, 100 %' },
    { base: 150, taux: 60, attendu: 90, cas: 'piles (FR 201, test n° 8)' },
    { base: 491, taux: 60, attendu: 295, cas: 'arrondi supérieur (FR 201, test n° 9)' },
    { base: 533, taux: 60, attendu: 320, cas: 'arrondi inférieur (319,8)' },
    { base: 25, taux: 50, attendu: 13, cas: 'exactement ,5 : au supérieur' },
    { base: 40_000, taux: 0, attendu: 0, cas: 'taux nul' },
    { base: 0, taux: 60, attendu: 0, cas: 'base nulle' },
  ])('$cas', ({ base, taux, attendu }) => {
    expect(partAMO({ baseRemboursement: centimes(base), tauxAMO: taux })).toBe(attendu);
  });

  it.each([-1, 101])('refuse le taux %d', (taux) => {
    expect(() => partAMO({ baseRemboursement: centimes(100), tauxAMO: taux })).toThrow(RangeError);
  });
});

describe('ventilation', () => {
  it.each([
    { cas: 'FR 201 n° 6', prix: 95_000, base: 40_000, amc: 0, attendu: [24_000, 0, 71_000] },
    { cas: 'FR 201 n° 7', prix: 150_000, base: 140_000, amc: 0, attendu: [84_000, 0, 66_000] },
    { cas: 'FR 201 n° 8', prix: 150, base: 150, amc: 0, attendu: [90, 0, 60] },
    { cas: 'FR 201 n° 9', prix: 491, base: 491, amc: 0, attendu: [295, 0, 196] },
    {
      cas: 'FR 201 n° 10, C2S et refus',
      prix: 150_000,
      base: 140_000,
      amc: 56_000,
      attendu: [84_000, 56_000, 10_000],
    },
    {
      cas: 'classe I sans reste à charge',
      prix: 95_000,
      base: 40_000,
      amc: 71_000,
      attendu: [24_000, 71_000, 0],
    },
    {
      cas: 'C2S, 20 ans et plus',
      prix: 80_000,
      base: 40_000,
      amc: 56_000,
      attendu: [24_000, 56_000, 0],
    },
    {
      cas: 'C2S, refus à 20 ans et plus',
      prix: 120_000,
      base: 40_000,
      amc: 56_000,
      attendu: [24_000, 56_000, 40_000],
    },
    {
      cas: 'AMC supérieure au restant : écrêtée',
      prix: 95_000,
      base: 40_000,
      amc: 200_000,
      attendu: [24_000, 71_000, 0],
    },
    {
      cas: 'prix inférieur à la base',
      prix: 100_000,
      base: 140_000,
      amc: 0,
      attendu: [60_000, 0, 40_000],
    },
    { cas: 'prix nul', prix: 0, base: 40_000, amc: 10_000, attendu: [0, 0, 0] },
  ])('$cas', ({ prix, base, amc, attendu }) => {
    const [amo, amcAttendue, reste] = attendu;
    expect(
      ventilation({
        prixTTC: centimes(prix),
        baseRemboursement: centimes(base),
        tauxAMO: 60,
        priseEnChargeAMC: centimes(amc),
      }),
    ).toEqual({ amo, amc: amcAttendue, resteACharge: reste });
  });

  it('couvre intégralement à 100 % un prix inférieur à la base', () => {
    expect(
      ventilation({
        prixTTC: centimes(30_000),
        baseRemboursement: centimes(40_000),
        tauxAMO: 100,
        priseEnChargeAMC: centimes(5_000),
      }),
    ).toEqual({ amo: 30_000, amc: 0, resteACharge: 0 });
  });

  it.each([
    { cas: 'prix négatif', prix: -1, base: 0, amc: 0 },
    { cas: 'base négative', prix: 0, base: -1, amc: 0 },
    { cas: 'AMC négative', prix: 0, base: 0, amc: -1 },
  ])('refuse : $cas', ({ prix, base, amc }) => {
    expect(() =>
      ventilation({
        prixTTC: centimes(prix),
        baseRemboursement: centimes(base),
        tauxAMO: 60,
        priseEnChargeAMC: centimes(amc),
      }),
    ).toThrow(RangeError);
  });
});

describe('partAMCC2S', () => {
  it.each([
    { cas: '20 ans et plus', prix: 80_000, plafond: 80_000, amo: 24_000, attendu: 56_000 },
    { cas: 'FR 201 n° 10, refus', prix: 150_000, plafond: 140_000, amo: 84_000, attendu: 56_000 },
    { cas: 'prix sous le plafond', prix: 60_000, plafond: 80_000, amo: 24_000, attendu: 36_000 },
    { cas: 'piles (100 % du tarif)', prix: 150, plafond: 150, amo: 90, attendu: 60 },
    { cas: 'jamais négative', prix: 100, plafond: 0, amo: 50, attendu: 0 },
  ])('$cas', ({ prix, plafond, amo, attendu }) => {
    const entree = {
      prixTTC: centimes(prix),
      plafond: centimes(plafond),
      amo: centimes(amo),
    };
    expect(partAMCC2S(entree)).toBe(attendu);
  });
});
