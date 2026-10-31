import { describe, expect, it } from 'vitest';

import { slugDepuisNom, slugDisponible, slugSchema } from './slug';

describe('slugDepuisNom', () => {
  it.each([
    { nom: 'Centre Nord', attendu: 'centre-nord' },
    { nom: 'Audition d’Évreux – Sœur', attendu: 'audition-d-evreux-soeur' },
    { nom: '  Saint-Étienne  ', attendu: 'saint-etienne' },
    { nom: 'A & B', attendu: 'a-b' },
    { nom: '***', attendu: 'repli' },
    { nom: `${'a'.repeat(59)} b c`, attendu: `${'a'.repeat(59)}` },
  ])('$nom → $attendu', ({ nom, attendu }) => {
    expect(slugDepuisNom(nom, 'repli')).toBe(attendu);
  });
});

describe('slugDisponible', () => {
  it.each([
    { base: 'nord', pris: [], attendu: 'nord' },
    { base: 'nord', pris: ['nord'], attendu: 'nord-2' },
    { base: 'nord', pris: ['nord', 'nord-2'], attendu: 'nord-3' },
    { base: 'lien', pris: [], attendu: 'lien-2' },
  ])('$base parmi $pris → $attendu', ({ base, pris, attendu }) => {
    expect(slugDisponible(base, new Set(pris))).toBe(attendu);
  });
});

describe('slugSchema', () => {
  it('normalise la casse et les espaces', () => {
    expect(slugSchema.parse(' Centre-Nord ')).toBe('centre-nord');
  });

  it.each(['', 'centre nord', 'é', '-nord', 'nord-', 'a--b', 'lien', 'a'.repeat(61), undefined])(
    'refuse %s',
    (valeur) => {
      expect(slugSchema.safeParse(valeur).success).toBe(false);
    },
  );
});
