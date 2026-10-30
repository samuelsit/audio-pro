import { describe, expect, it } from 'vitest';

import {
  additionnerCentimes,
  centimes,
  centimesDepuisSaisieEuros,
  decimalEnEntier,
  formatEuros,
} from './money';

// Intl.NumberFormat fr-FR utilise des espaces insécables (U+202F et U+00A0).
const normaliserEspaces = (texte: string): string => texte.replace(/[\u202f\u00a0]/g, ' ');

describe('centimes', () => {
  it.each([0, 1, 199_900, -500])('accepte l’entier %i', (valeur) => {
    expect(centimes(valeur)).toBe(valeur);
  });

  it.each([0.5, 12.34, Number.NaN, Number.POSITIVE_INFINITY])('refuse %d', (valeur) => {
    expect(() => centimes(valeur)).toThrow();
  });
});

describe('additionnerCentimes', () => {
  it.each([
    { montants: [], attendu: 0 },
    { montants: [100], attendu: 100 },
    { montants: [100, 250, 1], attendu: 351 },
    { montants: [1000, -300], attendu: 700 },
  ])('$montants → $attendu', ({ montants, attendu }) => {
    expect(additionnerCentimes(...montants.map(centimes))).toBe(attendu);
  });
});

describe('formatEuros', () => {
  it.each([
    { valeur: 0, attendu: '0,00 €' },
    { valeur: 5, attendu: '0,05 €' },
    { valeur: 123_456, attendu: '1 234,56 €' },
    { valeur: -1_050, attendu: '-10,50 €' },
  ])('$valeur → « $attendu »', ({ valeur, attendu }) => {
    expect(normaliserEspaces(formatEuros(centimes(valeur)))).toBe(attendu);
  });
});

describe('decimalEnEntier', () => {
  it.each([
    { texte: '819.41', decimales: 2, attendu: 81_941 },
    { texte: '950', decimales: 2, attendu: 95_000 },
    { texte: '1.5', decimales: 2, attendu: 150 },
    { texte: '0.07', decimales: 2, attendu: 7 },
    // 4,35 × 100 vaut 434,99… en flottant.
    { texte: '4.35', decimales: 2, attendu: 435 },
    { texte: '1.300', decimales: 3, attendu: 1_300 },
    { texte: '54', decimales: 0, attendu: 54 },
    { texte: '1.234', decimales: 2, attendu: null },
    { texte: '-1', decimales: 2, attendu: null },
    { texte: '12,5', decimales: 2, attendu: null },
    { texte: '', decimales: 2, attendu: null },
  ])('$texte ($decimales décimales) → $attendu', ({ texte, decimales, attendu }) => {
    expect(decimalEnEntier(texte, decimales)).toBe(attendu);
  });
});

describe('centimesDepuisSaisieEuros', () => {
  it.each([
    { saisie: '1 490,50', attendu: 149_050 },
    { saisie: '1 490,50 €', attendu: 149_050 },
    { saisie: '1490.5', attendu: 149_050 },
    { saisie: '1490', attendu: 149_000 },
    { saisie: '0', attendu: 0 },
    { saisie: '', attendu: null },
    { saisie: 'abc', attendu: null },
    { saisie: '1,2,3', attendu: null },
  ])('« $saisie » → $attendu', ({ saisie, attendu }) => {
    expect(centimesDepuisSaisieEuros(saisie)).toBe(attendu);
  });
});
