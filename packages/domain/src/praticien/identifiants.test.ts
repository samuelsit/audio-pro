import { describe, expect, it } from 'vitest';

import { adeliOptionnelSchema, estRppsValide, rppsSchema } from './identifiants';

describe('rppsSchema', () => {
  it.each([
    { saisie: '10000000001', attendu: '10000000001' },
    { saisie: '100 000 000 01', attendu: '10000000001' },
    { saisie: ' 10000000001 ', attendu: '10000000001' },
    { saisie: '00000000000', attendu: '00000000000' },
  ])('accepte « $saisie »', ({ saisie, attendu }) => {
    expect(rppsSchema.parse(saisie)).toBe(attendu);
    expect(estRppsValide(saisie)).toBe(true);
  });

  it.each([
    { cas: 'vide', saisie: '' },
    { cas: '10 chiffres', saisie: '1000000000' },
    { cas: '12 chiffres', saisie: '100000000012' },
    { cas: 'lettre', saisie: '1000000000A' },
    { cas: 'tiret', saisie: '10000-000001' },
    { cas: 'chiffres non ASCII', saisie: '١٠٠٠٠٠٠٠٠٠١' },
  ])('refuse : $cas', ({ saisie }) => {
    expect(rppsSchema.safeParse(saisie).error?.issues[0]?.message).toBe(
      'Le numéro RPPS doit comporter exactement 11 chiffres.',
    );
    expect(estRppsValide(saisie)).toBe(false);
  });

  it('exige une valeur', () => {
    expect(rppsSchema.safeParse(undefined).error?.issues[0]?.message).toBe(
      'Le numéro RPPS est obligatoire.',
    );
  });
});

describe('adeliOptionnelSchema', () => {
  it.each([
    { saisie: undefined, attendu: null },
    { saisie: '', attendu: null },
    { saisie: '  ', attendu: null },
    { saisie: '594600001', attendu: '594600001' },
    { saisie: '2a 46 0000 1', attendu: '2A4600001' },
  ])('« $saisie » → $attendu', ({ saisie, attendu }) => {
    expect(adeliOptionnelSchema.parse(saisie)).toBe(attendu);
  });

  it.each(['59460000', '5946000012', '59460000X'])('refuse « %s »', (saisie) => {
    expect(adeliOptionnelSchema.safeParse(saisie).error?.issues[0]?.message).toBe(
      'Le numéro ADELI doit comporter 9 caractères.',
    );
  });
});
