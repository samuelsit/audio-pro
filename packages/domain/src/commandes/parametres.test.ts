import { describe, expect, it } from 'vitest';

import { parametresCommandeSaisieSchema } from './parametres';

const base = { delaiRelanceJours: '3', relancesMax: '2', tolerancePrix: '1,50' };

describe('parametresCommandeSaisieSchema', () => {
  it('lit la tolérance en euros', () => {
    expect(parametresCommandeSaisieSchema.parse(base)).toEqual({
      delaiRelanceJours: 3,
      relancesMax: 2,
      tolerancePrix: 150,
      adresseBoiteFactures: null,
    });
  });

  it('une tolérance vide vaut zéro', () => {
    const { tolerancePrix } = parametresCommandeSaisieSchema.parse({
      ...base,
      tolerancePrix: ' ',
    });
    expect(tolerancePrix).toBe(0);
  });

  it.each([
    ['délai nul', { delaiRelanceJours: '0' }],
    ['délai non entier', { delaiRelanceJours: '1,5' }],
    ['trop de relances', { relancesMax: '11' }],
    ['tolérance illisible', { tolerancePrix: 'abc' }],
    ['adresse invalide', { adresseBoiteFactures: 'pas-une-adresse' }],
  ])('refuse : %s', (_, modification) => {
    expect(parametresCommandeSaisieSchema.safeParse({ ...base, ...modification }).success).toBe(
      false,
    );
  });
});
