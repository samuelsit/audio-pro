import { describe, expect, it } from 'vitest';

import { additionnerCentimes, centimes, formatEuros } from './money';

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
