import { describe, expect, it } from 'vitest';

import {
  additionnerTotaux,
  chargeCloture,
  CUMULS_INITIAUX,
  cumulsSuivants,
  exerciceDe,
  exercicesACloturer,
  maillonDActivite,
  moisACloturer,
  moisDe,
  TOTAUX_VIDES,
  totauxClotureSchema,
  totauxDepuisMaillons,
  VERSION_CAISSE,
  type MaillonCloture,
} from './cloture';

const ligne = (prixTTC: number, tauxTva: number | null, montantHT: number) => ({
  prixTTC,
  tauxTva,
  montantHT,
  montantTva: prixTTC - montantHT,
});

function piece(nature: 'FACTURE' | 'AVOIR', lignes: ReturnType<typeof ligne>[]): MaillonCloture {
  const prixTTC = lignes.reduce((t, l) => t + l.prixTTC, 0);
  const ht = lignes.reduce((t, l) => t + l.montantHT, 0);
  return {
    type: nature === 'FACTURE' ? 'FACTURE_VALIDEE' : 'AVOIR_VALIDE',
    charge: { nature, totaux: { prixTTC, ht, tva: prixTTC - ht }, lignes },
  };
}

function mouvement(
  nature: 'ENCAISSEMENT' | 'REMBOURSEMENT' | 'ANNULATION',
  mode: string,
  montantCentimes: number,
  devisId: string | null = null,
): MaillonCloture {
  const type = {
    ENCAISSEMENT: 'ENCAISSEMENT',
    REMBOURSEMENT: 'REMBOURSEMENT',
    ANNULATION: 'ANNULATION_ENCAISSEMENT',
  } as const;
  return { type: type[nature], charge: { nature, mode, montantCentimes, devisId } };
}

describe('totauxDepuisMaillons', () => {
  const totaux = totauxDepuisMaillons([
    piece('FACTURE', [ligne(105_500, 550, 100_000), ligne(1_200, 2000, 1_000)]),
    piece('FACTURE', [ligne(5_275, 550, 5_000)]),
    piece('AVOIR', [ligne(5_275, 550, 5_000)]),
    mouvement('ENCAISSEMENT', 'CB', 50_000),
    mouvement('ENCAISSEMENT', 'ESPECES', 4_000),
    mouvement('ENCAISSEMENT', 'CHEQUE', 10_000, 'd1'),
    mouvement('REMBOURSEMENT', 'CB', 1_000),
    mouvement('ANNULATION', 'CHEQUE', 2_000, 'd1'),
    { type: 'DUPLICATA_EMIS', charge: { numero: 'FA-1' } },
  ]);

  it('additionne factures et déduit les avoirs', () => {
    expect(totaux).toMatchObject({
      factures: 2,
      avoirs: 1,
      ttc: 106_700,
      ht: 101_000,
      tva: 5_700,
    });
  });

  it('ventile par taux, nets d’avoirs', () => {
    expect(totaux.parTaux).toEqual([
      { taux: 550, ttc: 105_500, ht: 100_000, tva: 5_500 },
      { taux: 2000, ttc: 1_200, ht: 1_000, tva: 200 },
    ]);
  });

  it('ventile par mode et met les acomptes à part', () => {
    expect(totaux.parMode).toEqual([
      { mode: 'CB', encaisse: 50_000, rendu: 1_000 },
      { mode: 'ESPECES', encaisse: 4_000, rendu: 0 },
      { mode: 'CHEQUE', encaisse: 10_000, rendu: 2_000 },
    ]);
    expect(totaux.encaissementsNets).toBe(61_000);
    expect(totaux.acomptesNets).toBe(8_000);
  });

  it('une ligne sans taux reste visible', () => {
    expect(
      totauxDepuisMaillons([piece('FACTURE', [ligne(1_055, 550, 1_000), ligne(100, null, 100)])])
        .parTaux,
    ).toEqual([
      { taux: null, ttc: 100, ht: 100, tva: 0 },
      { taux: 550, ttc: 1_055, ht: 1_000, tva: 55 },
    ]);
  });

  it('se relit depuis la base', () => {
    expect(totauxClotureSchema.parse(JSON.parse(JSON.stringify(totaux)))).toEqual(totaux);
  });

  it('une période vide donne des zéros', () => {
    expect(totauxDepuisMaillons([])).toEqual(TOTAUX_VIDES);
  });

  it('additionner des journées revient à totaliser leurs maillons', () => {
    const jour1 = [
      piece('FACTURE', [ligne(1_055, 550, 1_000)]),
      mouvement('ENCAISSEMENT', 'CB', 500),
    ];
    const jour2 = [
      piece('AVOIR', [ligne(1_055, 550, 1_000)]),
      mouvement('REMBOURSEMENT', 'CB', 500),
    ];
    expect(additionnerTotaux([totauxDepuisMaillons(jour1), totauxDepuisMaillons(jour2)])).toEqual(
      totauxDepuisMaillons([...jour1, ...jour2]),
    );
  });
});

describe('maillonDActivite', () => {
  it.each([
    ['ENCAISSEMENT', true],
    ['DUPLICATA_EMIS', true],
    ['CLOTURE', false],
    ['ARCHIVAGE', false],
    ['VERIFICATION_ECHEC', false],
  ] as const)('%s', (type, attendu) => {
    expect(maillonDActivite(type)).toBe(attendu);
  });
});

describe('cumulsSuivants', () => {
  const totaux = { ...TOTAUX_VIDES, ttc: 1_000, encaissementsNets: 400 };

  it('cumule d’un jour à l’autre', () => {
    const premier = cumulsSuivants(CUMULS_INITIAUX, totaux, true);
    expect(cumulsSuivants(premier, totaux, true)).toEqual({
      grandTotalCentimes: 2_000,
      perpetuelCentimes: 2_000,
      encaissePerpetuelCentimes: 800,
    });
  });

  it('remet le grand total à zéro à l’ouverture de l’exercice, jamais le perpétuel', () => {
    const avant = {
      grandTotalCentimes: 9_000,
      perpetuelCentimes: 50_000,
      encaissePerpetuelCentimes: 40_000,
    };
    expect(cumulsSuivants(avant, totaux, false)).toEqual({
      grandTotalCentimes: 1_000,
      perpetuelCentimes: 51_000,
      encaissePerpetuelCentimes: 40_400,
    });
  });

  it('une journée négative fait reculer le cumul sans le remettre à zéro', () => {
    expect(
      cumulsSuivants(
        { grandTotalCentimes: 100, perpetuelCentimes: 100, encaissePerpetuelCentimes: 100 },
        { ...TOTAUX_VIDES, ttc: -300, encaissementsNets: -50 },
        true,
      ),
    ).toEqual({
      grandTotalCentimes: -200,
      perpetuelCentimes: -200,
      encaissePerpetuelCentimes: 50,
    });
  });
});

describe('périodes', () => {
  it.each([
    ['2026-02-15', '2026-02-01', '2026-02-28'],
    ['2028-02-29', '2028-02-01', '2028-02-29'],
    ['2026-12-31', '2026-12-01', '2026-12-31'],
  ])('mois de %s', (date, debut, fin) => {
    expect(moisDe(date)).toEqual({ debut, fin });
  });

  it.each([
    ['2026-03-15', 12, '2026-01-01', '2026-12-31'],
    ['2026-12-31', 12, '2026-01-01', '2026-12-31'],
    ['2026-06-30', 6, '2025-07-01', '2026-06-30'],
    ['2026-07-01', 6, '2026-07-01', '2027-06-30'],
    ['2026-03-01', 2, '2026-03-01', '2027-02-28'],
    ['2028-02-29', 2, '2027-03-01', '2028-02-29'],
  ])('exercice de %s, clos fin %i', (date, moisCloture, debut, fin) => {
    expect(exerciceDe(date, moisCloture)).toEqual({ debut, fin });
  });

  it('ne clôture un mois qu’une fois écoulé, et une seule fois', () => {
    expect(
      moisACloturer(
        ['2026-11-03', '2026-09-30', '2026-10-01', '2026-10-31', '2026-08-02'],
        ['2026-08-01'],
        '2026-11-04',
      ),
    ).toEqual([
      { debut: '2026-09-01', fin: '2026-09-30' },
      { debut: '2026-10-01', fin: '2026-10-31' },
    ]);
  });

  it('ne clôture pas un mois le dernier jour', () => {
    expect(moisACloturer(['2026-10-05'], [], '2026-10-31')).toEqual([]);
  });

  it('ne clôture un exercice qu’une fois écoulé, et une seule fois', () => {
    expect(
      exercicesACloturer(
        ['2026-11-01', '2025-11-01', '2024-05-01', '2025-01-01'],
        ['2024-01-01'],
        12,
        '2026-11-20',
      ),
    ).toEqual([{ debut: '2025-01-01', fin: '2025-12-31' }]);
    expect(exercicesACloturer(['2025-07-01', '2024-07-01'], [], 6, '2026-11-20')).toEqual([
      { debut: '2024-07-01', fin: '2025-06-30' },
      { debut: '2025-07-01', fin: '2026-06-30' },
    ]);
  });
});

describe('chargeCloture', () => {
  it('porte la version et les cumuls', () => {
    const cloture = {
      id: 'c1',
      portee: 'JOUR',
      debut: '2026-11-02',
      fin: '2026-11-02',
      rangDebut: 1,
      rangFin: 9,
      totaux: TOTAUX_VIDES,
      versionCaisse: VERSION_CAISSE,
      ...CUMULS_INITIAUX,
    } as const;
    expect(chargeCloture(cloture)).toEqual(cloture);
  });
});
