import { describe, expect, it } from 'vitest';

import { aerienne, point } from './fixtures.test-support';
import { formaterDb, perteMoyenneTonale } from './perte-moyenne';

describe('perteMoyenneTonale', () => {
  it.each([
    { cas: 'moyenne simple', courbe: aerienne(20, 30, 40, 50), attendu: 35 },
    { cas: 'quart de dB', courbe: aerienne(20, 30, 40, 55), attendu: 36.25 },
    { cas: 'audition normale', courbe: aerienne(0, 5, 5, 10), attendu: 5 },
    { cas: 'seuils négatifs', courbe: aerienne(-10, -10, -5, -5), attendu: -7.5 },
    { cas: 'pas de réponse compté 120 dB', courbe: aerienne(60, 80, 100, null), attendu: 90 },
    { cas: 'aucune réponse', courbe: aerienne(null, null, null, null), attendu: 120 },
    {
      cas: 'seules les quatre fréquences comptent',
      courbe: [...aerienne(20, 20, 20, 20), point(250, 120), point(8000, 120)],
      attendu: 20,
    },
    { cas: 'fréquence manquante', courbe: aerienne(20, 30, 40, 50).slice(0, 3), attendu: null },
    { cas: 'courbe vide', courbe: [], attendu: null },
  ])('$cas', ({ courbe, attendu }) => {
    expect(perteMoyenneTonale(courbe)).toBe(attendu);
  });

  it('ne dépend pas de l’ordre des points', () => {
    expect(perteMoyenneTonale(aerienne(10, 20, 30, 40).reverse())).toBe(25);
  });
});

describe('formaterDb', () => {
  it.each([
    { valeur: 36.25, attendu: '36,3 dB HL' },
    { valeur: 35, attendu: '35,0 dB HL' },
  ])('$valeur', ({ valeur, attendu }) => {
    expect(formaterDb(valeur)).toBe(attendu);
  });
});
