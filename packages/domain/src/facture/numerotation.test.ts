import { describe, expect, it } from 'vitest';

import { formaterNumero, prefixeSerieSchema } from './numerotation';

describe('formaterNumero', () => {
  it.each([
    { prefixe: 'PAR', sequence: 1, attendu: 'PAR-000001' },
    { prefixe: 'FA', sequence: 123, attendu: 'FA-000123' },
    { prefixe: 'FA', sequence: 1_234_567, attendu: 'FA-1234567' },
  ])('$prefixe, $sequence', ({ prefixe, sequence, attendu }) => {
    expect(formaterNumero(prefixe, sequence)).toBe(attendu);
  });
});

describe('prefixeSerieSchema', () => {
  it('met en majuscules', () => {
    expect(prefixeSerieSchema.parse({ prefixe: ' par1 ' }).prefixe).toBe('PAR1');
  });

  it.each(['', 'AVEC ESPACE', 'TROP-LONG', 'ABCDEFGHIJK'])('refuse « %s »', (prefixe) => {
    expect(prefixeSerieSchema.safeParse({ prefixe }).success).toBe(false);
  });
});
