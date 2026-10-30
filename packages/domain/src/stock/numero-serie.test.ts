import { describe, expect, it } from 'vitest';

import { doublonsDansLaSaisie, normaliserNumeroSerie, numeroSerieSchema } from './numero-serie';

describe('normaliserNumeroSerie', () => {
  it.each([
    { saisie: 'ab123', attendu: 'AB123' },
    { saisie: '  AB 12 3\n', attendu: 'AB123' },
    { saisie: 'ab-12/3', attendu: 'AB-12/3' },
    { saisie: '', attendu: '' },
  ])('« $saisie » → « $attendu »', ({ saisie, attendu }) => {
    expect(normaliserNumeroSerie(saisie)).toBe(attendu);
  });
});

describe('numeroSerieSchema', () => {
  it.each([
    { saisie: 'ab1', attendu: 'AB1' },
    { saisie: ' sn-2026/0001 ', attendu: 'SN-2026/0001' },
    { saisie: 'A'.repeat(64), attendu: 'A'.repeat(64) },
  ])('accepte « $saisie »', ({ saisie, attendu }) => {
    expect(numeroSerieSchema.parse(saisie)).toBe(attendu);
  });

  it.each([
    { cas: 'trop court', saisie: 'A1' },
    { cas: 'vide', saisie: '   ' },
    { cas: 'trop long', saisie: 'A'.repeat(65) },
    { cas: 'accent', saisie: 'ÉTÉ123' },
    { cas: 'caractère de contrôle GS1', saisie: 'AB\u001d123' },
  ])('refuse : $cas', ({ saisie }) => {
    const resultat = numeroSerieSchema.safeParse(saisie);
    expect(resultat.success).toBe(false);
    expect(resultat.error?.issues[0]?.message).toContain('Numéro de série invalide');
  });

  it('refuse une valeur qui n’est pas un texte', () => {
    expect(numeroSerieSchema.safeParse(12).error?.issues[0]?.message).toBe(
      'Le numéro de série est obligatoire.',
    );
  });
});

describe('doublonsDansLaSaisie', () => {
  it.each([
    { numeros: [], attendu: [] },
    { numeros: ['A', 'B'], attendu: [] },
    { numeros: ['A', 'B', 'A'], attendu: ['A'] },
    { numeros: ['B', 'A', 'B', 'A', 'B'], attendu: ['B', 'A'] },
  ])('$numeros → $attendu', ({ numeros, attendu }) => {
    expect(doublonsDansLaSaisie(numeros)).toEqual(attendu);
  });
});
