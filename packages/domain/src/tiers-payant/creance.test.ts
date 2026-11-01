import { describe, expect, it } from 'vitest';

import { centimes } from '../money';
import {
  ajouterJoursOuvres,
  bornesTranche,
  creancesDeFacture,
  echeanceAmc,
  echeanceAmo,
  ORGANISME_AMO_INCONNU,
  statutCreance,
  syntheseCreances,
  trancheAnciennete,
  type EntreeCreances,
} from './creance';

describe('ajouterJoursOuvres', () => {
  it.each([
    ['du lundi au mardi', '2026-11-02', 1, '2026-11-03'],
    ['saute le week-end', '2026-11-06', 1, '2026-11-09'],
    ['part d’un samedi', '2026-11-07', 1, '2026-11-09'],
    ['cinq jours depuis un lundi', '2026-11-02', 5, '2026-11-09'],
    ['cinq jours depuis un vendredi', '2026-11-06', 5, '2026-11-13'],
    ['zéro jour', '2026-11-07', 0, '2026-11-07'],
  ])('%s', (_, date, jours, attendu) => {
    expect(ajouterJoursOuvres(date, jours)).toBe(attendu);
  });
});

describe('échéances', () => {
  it('AMO : cinq jours ouvrés', () => {
    expect(echeanceAmo('2026-11-02')).toBe('2026-11-09');
  });

  it.each([
    ['délai de la complémentaire', 15, '2026-11-17'],
    ['défaut sans délai connu', null, '2026-12-02'],
  ])('AMC : %s', (_, delai, attendu) => {
    expect(echeanceAmc('2026-11-02', delai)).toBe(attendu);
  });
});

describe('creancesDeFacture', () => {
  const entree: EntreeCreances = {
    dateFacture: '2026-11-02',
    tiersPayantAmo: true,
    amo: centimes(24_000),
    amc: centimes(30_000),
    c2s: false,
    caisse: 'CPAM démo',
    regime: '01',
    complementaire: {
      organisme: 'Mutuelle Démo',
      complementaireId: 'c1',
      numeroAccord: 'ACC-1',
      delaiPaiementJours: 15,
    },
  };

  it('une créance AMO et une créance AMC', () => {
    expect(creancesDeFacture(entree)).toEqual([
      {
        type: 'AMO',
        organisme: 'CPAM démo',
        regime: '01',
        complementaireId: null,
        numeroAccord: null,
        montant: 24_000,
        echeanceAttendue: '2026-11-09',
      },
      {
        type: 'AMC',
        organisme: 'Mutuelle Démo',
        regime: null,
        complementaireId: 'c1',
        numeroAccord: 'ACC-1',
        montant: 30_000,
        echeanceAttendue: '2026-11-17',
      },
    ]);
  });

  it.each([
    ['sans tiers payant AMO', { tiersPayantAmo: false }, ['AMC']],
    ['part AMO nulle', { amo: centimes(0) }, ['AMC']],
    ['part AMC nulle', { amc: centimes(0) }, ['AMO']],
    ['rien à percevoir', { amo: centimes(0), amc: centimes(0) }, []],
  ])('%s', (_, surcharge, attendu) => {
    const types = creancesDeFacture({ ...entree, ...surcharge }).map((c) => c.type);
    expect(types).toEqual(attendu);
  });

  it('C2S : la caisse paie aussi la part AMC, au même délai', () => {
    const [, amc] = creancesDeFacture({ ...entree, c2s: true, complementaire: null });
    expect(amc).toMatchObject({
      organisme: 'CPAM démo',
      regime: '01',
      complementaireId: null,
      echeanceAttendue: '2026-11-09',
    });
  });

  it('se replie sur un libellé si la caisse est inconnue', () => {
    const [amo] = creancesDeFacture({ ...entree, caisse: null });
    expect(amo?.organisme).toBe(ORGANISME_AMO_INCONNU);
  });
});

describe('statutCreance', () => {
  it.each([
    ['ouverte', 1000, 1000, false, 'OUVERTE'],
    ['partielle', 1000, 400, false, 'PARTIELLE'],
    ['soldée', 1000, 0, false, 'SOLDEE'],
    ['rejet à traiter', 1000, 1000, true, 'REJETEE'],
    ['rejet sur une créance soldée', 1000, 0, true, 'REJETEE'],
    ['indu', 1000, -200, false, 'INDU'],
  ])('%s', (_, montantCentimes, soldeCentimes, rejetATraiter, attendu) => {
    expect(statutCreance({ montantCentimes, soldeCentimes, rejetATraiter })).toBe(attendu);
  });
});

describe('trancheAnciennete', () => {
  it.each([
    ['le jour même', '2026-12-31', 'J0_30'],
    ['30 jours', '2026-12-01', 'J0_30'],
    ['31 jours', '2026-11-30', 'J31_60'],
    ['60 jours', '2026-11-01', 'J31_60'],
    ['61 jours', '2026-10-31', 'J61_90'],
    ['90 jours', '2026-10-02', 'J61_90'],
    ['91 jours', '2026-10-01', 'J91_PLUS'],
    ['un an', '2025-12-31', 'J91_PLUS'],
  ])('%s', (_, emission, attendu) => {
    expect(trancheAnciennete(emission, '2026-12-31')).toBe(attendu);
  });

  it.each([
    ['J0_30', '2026-12-01', '2026-12-31'],
    ['J31_60', '2026-11-01', '2026-11-30'],
    ['J61_90', '2026-10-02', '2026-10-31'],
    ['J91_PLUS', null, '2026-10-01'],
  ] as const)('bornes de %s', (tranche, depuis, jusqua) => {
    expect(bornesTranche(tranche, '2026-12-31')).toEqual({ depuis, jusqua });
  });
});

describe('syntheseCreances', () => {
  it('regroupe par organisme et par ancienneté, plus gros encours d’abord', () => {
    const lignes = syntheseCreances(
      [
        { organisme: 'CPAM démo', dateEmission: '2026-12-20', soldeCentimes: 1_000 },
        { organisme: 'Mutuelle Démo', dateEmission: '2026-12-20', soldeCentimes: 2_000 },
        { organisme: 'Mutuelle Démo', dateEmission: '2026-09-01', soldeCentimes: 500 },
        { organisme: 'Autre', dateEmission: '2026-11-15', soldeCentimes: 1_000 },
      ],
      '2026-12-31',
    );
    expect(lignes.map((l) => l.organisme)).toEqual(['Mutuelle Démo', 'Autre', 'CPAM démo']);
    expect(lignes[0]).toEqual({
      organisme: 'Mutuelle Démo',
      nombre: 2,
      total: 2_500,
      parTranche: { J0_30: 2_000, J31_60: 0, J61_90: 0, J91_PLUS: 500 },
    });
  });

  it('rien à regrouper', () => {
    expect(syntheseCreances([], '2026-12-31')).toEqual([]);
  });
});
