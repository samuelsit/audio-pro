import { beforeEach, describe, expect, it } from 'vitest';

import { viderBase } from '@/test/donnees';

import { enregistrerTentative, reinitialiserTentatives } from './limitation';

const regle = { max: 3, fenetreSecondes: 60 };
const t0 = 1_800_000_000_000;

beforeEach(viderBase);

describe('enregistrerTentative', () => {
  it('bloque au-delà du maximum dans la fenêtre, puis rouvre après', async () => {
    const resultats = [];
    for (let i = 0; i < 4; i++) {
      resultats.push(await enregistrerTentative('connexion:x', regle, t0 + i * 1000));
    }
    expect(resultats).toEqual([true, true, true, false]);
    expect(await enregistrerTentative('connexion:x', regle, t0 + 61_000)).toBe(true);
  });

  it('compte chaque clé séparément et se réinitialise', async () => {
    for (let i = 0; i < 3; i++) {
      await enregistrerTentative('connexion:a', regle, t0);
    }
    expect(await enregistrerTentative('connexion:b', regle, t0)).toBe(true);
    await reinitialiserTentatives('connexion:a');
    expect(await enregistrerTentative('connexion:a', regle, t0)).toBe(true);
  });
});
