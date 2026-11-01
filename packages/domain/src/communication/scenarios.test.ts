import { describe, expect, it } from 'vitest';

import type { ControleAPlanifier } from '../sav/suivi';
import {
  anniversaireAppareillage,
  controlesAAnnoncer,
  echeanceEssaiProche,
  finGarantieProche,
  rangRelanceDevis,
  rappelRdvDu,
  renouvellementsPossibles,
} from './scenarios';

describe('rappelRdvDu', () => {
  it.each([
    ['J-2', '2027-02-03', '2027-02-01', 2, true],
    ['J-1', '2027-02-02', '2027-02-01', 1, true],
    ['trop tôt', '2027-02-04', '2027-02-01', 2, false],
    ['passé', '2027-01-31', '2027-02-01', 1, false],
  ])('%s', (_, rdv, jour, ecart, attendu) => {
    expect(rappelRdvDu(rdv, jour, ecart)).toBe(attendu);
  });
});

describe('rangRelanceDevis', () => {
  const entree = {
    dateEmission: '2027-02-01',
    dateFinValidite: '2027-04-01',
    delaiJours: 7,
    relancesMax: 2,
  };

  it.each([
    ['avant le délai', '2027-02-07', null],
    ['au délai', '2027-02-08', 1],
    ['rattrapage après un jour fermé', '2027-02-11', 1],
    ['hors rattrapage', '2027-02-12', null],
    ['seconde relance', '2027-02-15', 2],
    ['plafond dépassé', '2027-02-22', null],
    ['le jour de l’émission', '2027-02-01', null],
  ])('%s', (_, jour, attendu) => {
    expect(rangRelanceDevis({ ...entree, jour })).toBe(attendu);
  });

  it('ne relance plus un devis expiré', () => {
    const expire = { ...entree, dateFinValidite: '2027-02-05', jour: '2027-02-08' };
    expect(rangRelanceDevis(expire)).toBeNull();
  });
});

describe('echeanceEssaiProche', () => {
  const entree = { debut: '2027-01-01', prolongation: null, avanceJours: 7 };

  it.each([
    ['trop tôt', '2027-01-23', null],
    ['à l’avance voulue', '2027-01-24', '2027-01-31'],
    ['à l’échéance', '2027-01-31', '2027-01-31'],
    ['passée', '2027-02-01', null],
  ])('%s', (_, jour, attendu) => {
    expect(echeanceEssaiProche({ ...entree, jour })).toBe(attendu);
  });

  it('tient compte de la prolongation', () => {
    const prolonge = {
      ...entree,
      prolongation: { jours: 15, demandeEcrite: true },
      jour: '2027-02-08',
    };
    expect(echeanceEssaiProche(prolonge)).toBe('2027-02-15');
  });
});

describe('controlesAAnnoncer', () => {
  const controle = (datePrevue: string, enRetard: boolean): ControleAPlanifier => ({
    dateReference: '2026-02-01',
    rang: 1,
    datePrevue,
    enRetard,
    mois: 12,
  });

  it('écarte les retards et ce qui est trop loin', () => {
    const controles = [
      controle('2027-01-15', true),
      controle('2027-02-10', false),
      controle('2027-03-20', false),
    ];
    expect(controlesAAnnoncer(controles, '2027-02-01', 14).map((c) => c.datePrevue)).toEqual([
      '2027-02-10',
    ]);
  });
});

describe('renouvellementsPossibles', () => {
  it.each([
    ['moins de 4 ans', [['DROITE', '2024-02-01']], '2027-02-01', []],
    ['à l’échéance', [['DROITE', '2023-02-01']], '2027-02-01', ['2027-02-01']],
    ['dans la fenêtre', [['DROITE', '2023-01-15']], '2027-02-01', ['2027-01-15']],
    ['arriéré ignoré', [['DROITE', '2022-02-01']], '2027-02-01', []],
    [
      'deux oreilles, une seule date',
      [
        ['DROITE', '2023-02-01'],
        ['GAUCHE', '2023-02-01'],
      ],
      '2027-02-01',
      ['2027-02-01'],
    ],
    ['aucune délivrance', [], '2027-02-01', []],
    [
      'un appareil plus récent ferme l’oreille',
      [
        ['DROITE', '2023-02-01'],
        ['DROITE', '2026-02-01'],
      ],
      '2027-02-01',
      [],
    ],
  ] as const)('%s', (_, lignes, jour, attendu) => {
    const historique = lignes.map(([oreille, dateDelivrance]) => ({ oreille, dateDelivrance }));
    expect(renouvellementsPossibles(historique, jour, 30)).toEqual(attendu);
  });
});

describe('finGarantieProche', () => {
  it.each([
    ['dans la fenêtre', '2027-03-01', true],
    ['trop loin', '2027-06-01', false],
    ['passée', '2027-01-01', false],
  ])('%s', (_, dateFin, attendu) => {
    expect(finGarantieProche(dateFin, '2027-02-01', 60)).toBe(attendu);
  });
});

describe('anniversaireAppareillage', () => {
  it.each([
    ['le jour même', '2025-02-01', '2027-02-01', 2],
    ['rattrapage', '2025-02-01', '2027-02-04', 2],
    ['hors rattrapage', '2025-02-01', '2027-02-05', null],
    ['la veille', '2025-02-01', '2027-01-31', null],
    ['année de délivrance', '2027-02-01', '2027-02-01', null],
    ['rattrapage en janvier', '2024-12-31', '2027-01-02', 2],
    ['29 février', '2024-02-29', '2027-02-28', 3],
  ])('%s', (_, delivrance, jour, attendu) => {
    expect(anniversaireAppareillage(delivrance, jour)).toBe(attendu);
  });
});
