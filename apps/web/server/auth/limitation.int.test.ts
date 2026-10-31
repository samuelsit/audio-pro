import { prisma } from '@ha/db/admin';
import { beforeEach, describe, expect, it } from 'vitest';

import { viderBase } from '@/test/donnees';

import { adresseClient, enregistrerTentative, reinitialiserTentatives } from './limitation';

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

describe('adresseClient', () => {
  it.each([
    { entete: '198.51.100.7', attendu: '198.51.100.7' },
    { entete: '1.2.3.4, 198.51.100.7', attendu: '198.51.100.7' },
    { entete: ' 1.2.3.4 ,198.51.100.7 ', attendu: '198.51.100.7' },
    { entete: '', attendu: 'inconnue' },
    { entete: null, attendu: 'inconnue' },
  ])('« $entete » → $attendu', ({ entete, attendu }) => {
    expect(adresseClient(entete)).toBe(attendu);
  });
});

describe('accès simultanés', () => {
  it('ne perd aucune tentative', async () => {
    const regle = { max: 100, fenetreSecondes: 60 };
    await Promise.all(
      Array.from({ length: 20 }, () => enregistrerTentative('connexion:simultane', regle)),
    );
    const ligne = await prisma().limitationDebit.findUniqueOrThrow({
      where: { key: 'connexion:simultane' },
    });
    expect(ligne.count).toBe(20);
  });

  it('survit à une connexion réussie qui remet le compteur à zéro au même moment', async () => {
    const regle = { max: 100, fenetreSecondes: 60 };
    for (let tour = 0; tour < 30; tour += 1) {
      await Promise.all([
        enregistrerTentative('connexion:course', regle),
        enregistrerTentative('connexion:course', regle),
        reinitialiserTentatives('connexion:course'),
        enregistrerTentative('connexion:course', regle),
      ]);
    }
  });
});
