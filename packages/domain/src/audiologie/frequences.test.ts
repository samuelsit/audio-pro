import { describe, expect, it } from 'vitest';

import { FREQUENCES_AUDIOGRAMME, FREQUENCES_PERTE_MOYENNE, libelleFrequence } from './frequences';

describe('fréquences', () => {
  it('couvre 125 à 8 000 Hz, dans l’ordre', () => {
    expect(FREQUENCES_AUDIOGRAMME[0]).toBe(125);
    expect(FREQUENCES_AUDIOGRAMME.at(-1)).toBe(8000);
    expect([...FREQUENCES_AUDIOGRAMME].sort((a, b) => a - b)).toEqual([...FREQUENCES_AUDIOGRAMME]);
  });

  it('contient les fréquences de la perte moyenne', () => {
    expect(FREQUENCES_AUDIOGRAMME).toEqual(expect.arrayContaining([...FREQUENCES_PERTE_MOYENNE]));
  });

  it.each([
    { frequence: 500, attendu: '500' },
    { frequence: 1000, attendu: '1 k' },
    { frequence: 1500, attendu: '1,5 k' },
  ] as const)('$frequence Hz', ({ frequence, attendu }) => {
    expect(libelleFrequence(frequence)).toBe(attendu);
  });
});
