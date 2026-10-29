import { describe, expect, it } from 'vitest';

import { cleNir, estNirValide, formaterNir, nirSansCle, nirSchema, normaliserNir } from './nir';

// NIR fictifs ; clés calculées indépendamment (97 − N mod 97, 2A → 19, 2B → 18).
describe('cleNir', () => {
  it.each([
    { nir13: '1850578006048', cle: 30 },
    { nir13: '2690149999123', cle: 39 },
    { nir13: '1940399999456', cle: 26 },
    { nir13: '4021199999888', cle: 6 },
    { nir13: '185052A999123', cle: 82 },
    { nir13: '292032B999045', cle: 53 },
  ])('$nir13 → $cle', ({ nir13, cle }) => {
    expect(cleNir(nir13)).toBe(cle);
  });
});

describe('nirSchema', () => {
  it.each([
    { cas: 'homme né en métropole', saisie: '185057800604830', attendu: '185057800604830' },
    { cas: 'femme', saisie: '269014999912339', attendu: '269014999912339' },
    { cas: 'clé commençant par 0', saisie: '402119999988806', attendu: '402119999988806' },
    { cas: 'espaces de saisie', saisie: '1 85 05 78 006 048 30', attendu: '185057800604830' },
    { cas: 'NIR provisoire (7)', saisie: '760019999901258', attendu: '760019999901258' },
    { cas: 'NIR provisoire (8)', saisie: '801019999932168', attendu: '801019999932168' },
    { cas: 'Corse-du-Sud (2A)', saisie: '185052A99912382', attendu: '185052A99912382' },
    { cas: 'Haute-Corse (2B)', saisie: '292032B99904553', attendu: '292032B99904553' },
    { cas: 'Corse en minuscules', saisie: '1 85 05 2a 999 123 82', attendu: '185052A99912382' },
  ])('accepte : $cas', ({ saisie, attendu }) => {
    expect(nirSchema.parse(saisie)).toBe(attendu);
    expect(estNirValide(saisie)).toBe(true);
  });

  it.each([
    { cas: 'vide', saisie: '' },
    { cas: '13 caractères sans clé', saisie: '1850578006048' },
    { cas: '16 caractères', saisie: '1850578006048301' },
    { cas: 'premier chiffre 5', saisie: '585057800604830' },
    { cas: 'premier chiffre 0', saisie: '085057800604830' },
    { cas: 'lettre hors Corse', saisie: '18505780060X830' },
    { cas: '2C', saisie: '185052C99912382' },
    { cas: '2A hors du département', saisie: '12A057800604830' },
    { cas: 'clé non numérique', saisie: '1850578006048AB' },
    { cas: 'tiret', saisie: '185-0578006048-30' },
  ])('refuse le format : $cas', ({ saisie }) => {
    expect(nirSchema.safeParse(saisie).error?.issues).toEqual([
      expect.objectContaining({
        message: 'Le NIR doit comporter 13 caractères suivis d’une clé de 2 chiffres.',
      }),
    ]);
    expect(estNirValide(saisie)).toBe(false);
  });

  it.each([
    { cas: 'clé fausse', saisie: '185057800604831' },
    { cas: 'chiffre inversé', saisie: '185057800640830' },
    { cas: 'Corse : clé calculée sans substitution', saisie: '185052A99912300' },
    { cas: '2A avec la clé du 2B', saisie: '185052A99912383' },
    { cas: '2B avec la clé du 2A', saisie: '292032B99904554' },
  ])('refuse la clé : $cas', ({ saisie }) => {
    expect(nirSchema.safeParse(saisie).error?.issues[0]?.message).toBe(
      'La clé du NIR ne correspond pas au numéro : vérifiez la saisie.',
    );
  });

  it('exige une valeur', () => {
    expect(nirSchema.safeParse(undefined).error?.issues[0]?.message).toBe(
      'Le NIR est obligatoire.',
    );
  });
});

describe('outils NIR', () => {
  it('normalise la saisie', () => {
    expect(normaliserNir(' 1 85 05 2a 999 123 82 ')).toBe('185052A99912382');
  });

  it('retire la clé', () => {
    expect(nirSansCle(nirSchema.parse('185052A99912382'))).toBe('185052A999123');
  });

  it.each([
    { nir: '185052A99912382', attendu: '1 85 05 2A 999 123 82' },
    { nir: '1850578006048', attendu: '1 85 05 78 006 048' },
  ])('formate $nir', ({ nir, attendu }) => {
    expect(formaterNir(nir)).toBe(attendu);
  });
});
