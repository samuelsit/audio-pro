import { describe, expect, it } from 'vitest';

import { centimes } from '../money';
import {
  imputerAvoir,
  MESSAGES_REFUS_LETTRAGE,
  CODES_REFUS_LETTRAGE,
  resteDuReglement,
  verifierLettrage,
  type CreanceALettrer,
} from './lettrage';

const reglement = {
  centreId: 'a',
  reste: { AMO: centimes(100_000), AMC: centimes(20_000) },
};

const creances: readonly CreanceALettrer[] = [
  { id: 'amo1', centreId: 'a', type: 'AMO', soldeCentimes: 60_000 },
  { id: 'amo2', centreId: 'a', type: 'AMO', soldeCentimes: 70_000 },
  { id: 'amc1', centreId: 'a', type: 'AMC', soldeCentimes: 30_000 },
  { id: 'ailleurs', centreId: 'b', type: 'AMO', soldeCentimes: 10_000 },
];

const demande = (creanceId: string, montantCentimes: number) => ({ creanceId, montantCentimes });

describe('resteDuReglement', () => {
  it('déduit par part, contre-passations comprises', () => {
    expect(
      resteDuReglement({ partAmoCentimes: 100_000, partAmcCentimes: 20_000 }, [
        { type: 'AMO', montantCentimes: 30_000 },
        { type: 'AMO', montantCentimes: -10_000 },
        { type: 'AMC', montantCentimes: 5_000 },
      ]),
    ).toEqual({ AMO: 80_000, AMC: 15_000 });
  });
});

describe('verifierLettrage', () => {
  it('lettrage partiel : une partie du solde d’une créance', () => {
    expect(verifierLettrage(reglement, creances, [demande('amo1', 25_000)])).toEqual({
      accepte: true,
      lignes: [{ creanceId: 'amo1', montantCentimes: 25_000, type: 'AMO' }],
    });
  });

  it('lettrage multiple : plusieurs créances et les deux parts d’un virement', () => {
    const resultat = verifierLettrage(reglement, creances, [
      demande('amo1', 60_000),
      demande('amo2', 40_000),
      demande('amc1', 20_000),
    ]);
    expect(resultat).toMatchObject({ accepte: true });
    expect(resultat.accepte && resultat.lignes.map((l) => l.type)).toEqual(['AMO', 'AMO', 'AMC']);
  });

  it.each([
    ['rien à lettrer', [], 'AUCUNE_IMPUTATION'],
    ['créance inconnue', [demande('x', 100)], 'CREANCE_INCONNUE'],
    ['autre centre', [demande('ailleurs', 100)], 'AUTRE_CENTRE'],
    ['plus que le solde', [demande('amo1', 60_001)], 'DEPASSE_SOLDE'],
    [
      'plus que la part AMO du règlement',
      [demande('amo1', 60_000), demande('amo2', 40_001)],
      'DEPASSE_REGLEMENT',
    ],
    ['plus que la part AMC du règlement', [demande('amc1', 20_001)], 'DEPASSE_REGLEMENT'],
  ])('refuse : %s', (_, demandes, code) => {
    expect(verifierLettrage(reglement, creances, demandes)).toEqual({ accepte: false, code });
  });

  it('a un message pour chaque refus', () => {
    for (const code of CODES_REFUS_LETTRAGE) {
      expect(MESSAGES_REFUS_LETTRAGE[code]).not.toBe('');
    }
  });
});

describe('imputerAvoir', () => {
  it.each([
    [
      'créance ouverte',
      40_000,
      { soldeCentimes: 40_000, transfertsCentimes: 0, pertesCentimes: 0 },
      { surSolde: 40_000, transfert: 0, perte: 0, indu: 0, nouveauSolde: 0 },
    ],
    [
      'avoir partiel sur créance ouverte',
      10_000,
      { soldeCentimes: 40_000, transfertsCentimes: 0, pertesCentimes: 0 },
      { surSolde: 10_000, transfert: 0, perte: 0, indu: 0, nouveauSolde: 30_000 },
    ],
    [
      'créance lettrée : indu',
      40_000,
      { soldeCentimes: 0, transfertsCentimes: 0, pertesCentimes: 0 },
      { surSolde: 0, transfert: 0, perte: 0, indu: 40_000, nouveauSolde: -40_000 },
    ],
    [
      'créance transférée au patient : contre-passation',
      40_000,
      { soldeCentimes: 0, transfertsCentimes: 40_000, pertesCentimes: 0 },
      { surSolde: 0, transfert: 40_000, perte: 0, indu: 0, nouveauSolde: 0 },
    ],
    [
      'créance en perte : contre-passation',
      40_000,
      { soldeCentimes: 0, transfertsCentimes: 0, pertesCentimes: 40_000 },
      { surSolde: 0, transfert: 0, perte: 40_000, indu: 0, nouveauSolde: 0 },
    ],
    [
      'tout à la fois, dans l’ordre',
      100,
      { soldeCentimes: 10, transfertsCentimes: 20, pertesCentimes: 30 },
      { surSolde: 10, transfert: 20, perte: 30, indu: 40, nouveauSolde: -40 },
    ],
    [
      'indu déjà présent : il s’ajoute',
      100,
      { soldeCentimes: -50, transfertsCentimes: 0, pertesCentimes: 0 },
      { surSolde: 0, transfert: 0, perte: 0, indu: 100, nouveauSolde: -150 },
    ],
  ])('%s', (_, part, creance, attendu) => {
    expect(imputerAvoir(part, creance)).toEqual(attendu);
  });
});
