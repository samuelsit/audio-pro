import { describe, expect, it } from 'vitest';

import { relanceDue } from './relance';

const ENVOI = '2030-01-07T09:00:00.000Z';
const regles = { delaiJours: 3, relancesMax: 2 };

describe('relanceDue', () => {
  it.each<[string, string | null, number, string, boolean]>([
    ['avant le délai', ENVOI, 0, '2030-01-10T08:59:59.000Z', false],
    ['au délai', ENVOI, 0, '2030-01-10T09:00:00.000Z', true],
    ['rien n’est parti', null, 0, '2030-02-01T00:00:00.000Z', false],
    ['plafond atteint', ENVOI, 2, '2030-02-01T00:00:00.000Z', false],
    ['seconde relance', ENVOI, 1, '2030-02-01T00:00:00.000Z', true],
  ])('%s', (_, dernierEnvoi, relances, maintenant, attendu) => {
    expect(relanceDue({ dernierEnvoi, relances }, regles, maintenant)).toBe(attendu);
  });
});
