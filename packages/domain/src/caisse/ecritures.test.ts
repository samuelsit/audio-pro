import { describe, expect, it } from 'vitest';

import {
  ecritureEquilibree,
  ecrituresDepuisMaillon,
  PARAMETRES_COMPTABLES_DEFAUT as P,
  parametresComptablesSchema,
  type MaillonComptable,
} from './ecritures';

const facture = (
  nature: 'FACTURE' | 'AVOIR',
  acomptesDeduits?: number,
  tiersPayantAmo?: boolean,
) => ({
  nature,
  numero: 'FA-000001',
  acomptesDeduits,
  tiersPayantAmo,
  totaux: { amo: 24_000, amc: 30_000, resteACharge: 52_700 },
  lignes: [
    { nature: 'AIDE_AUDITIVE', montantHT: 100_000, montantTva: 5_500 },
    { nature: 'PILE', montantHT: 1_000, montantTva: 200 },
  ],
});

const maillon = (type: MaillonComptable['type'], charge: unknown): MaillonComptable => ({
  rang: 7,
  type,
  charge,
  date: '2026-11-02',
});

function comptes(m: MaillonComptable): Record<string, number> {
  const [ecriture] = ecrituresDepuisMaillon(m, P);
  return Object.fromEntries(ecriture?.lignes.map((l) => [l.compte, l.debit - l.credit]) ?? []);
}

describe('ecrituresDepuisMaillon', () => {
  it('facture : clients et organismes contre ventes et TVA', () => {
    expect(comptes(maillon('FACTURE_VALIDEE', facture('FACTURE')))).toEqual({
      '411000': 52_700,
      '411100': 24_000,
      '411200': 30_000,
      '707000': -100_000,
      '707100': -1_000,
      '445710': -5_700,
    });
  });

  it('avoir : retourne l’écriture', () => {
    expect(comptes(maillon('AVOIR_VALIDE', facture('AVOIR')))).toMatchObject({
      '411000': -52_700,
      '707000': 100_000,
      '445710': 5_700,
    });
  });

  it('acompte déduit : passe du compte d’acomptes au client', () => {
    expect(comptes(maillon('FACTURE_VALIDEE', facture('FACTURE', 10_000)))).toMatchObject({
      '411000': 42_700,
      '419100': 10_000,
    });
  });

  it('sans tiers payant AMO : la part AMO reste due par le patient', () => {
    expect(comptes(maillon('FACTURE_VALIDEE', facture('FACTURE', 0, false)))).toMatchObject({
      '411000': 76_700,
      '411200': 30_000,
    });
    expect(comptes(maillon('FACTURE_VALIDEE', facture('FACTURE', 0, false)))).not.toHaveProperty(
      '411100',
    );
  });

  it('avoir d’une facture sans tiers payant : retourne le même compte', () => {
    expect(comptes(maillon('AVOIR_VALIDE', facture('AVOIR', 0, false)))).toMatchObject({
      '411000': -76_700,
    });
  });

  it.each([
    [
      'REGLEMENT_ORGANISME',
      { partAmoCentimes: 10_000, partAmcCentimes: 2_000 },
      { '512000': 12_000, '411100': -10_000, '411200': -2_000 },
    ],
    [
      'REGLEMENT_ORGANISME',
      { partAmoCentimes: 0, partAmcCentimes: 2_000 },
      { '512000': 2_000, '411200': -2_000 },
    ],
    [
      'ANNULATION_REGLEMENT_ORGANISME',
      { partAmoCentimes: -10_000, partAmcCentimes: 0 },
      { '512000': -10_000, '411100': 10_000 },
    ],
  ] as const)('%s', (type, parts, attendu) => {
    const charge = { organisme: 'CPAM démo', reference: 'VIR-1', ...parts };
    expect(comptes(maillon(type, charge))).toEqual(attendu);
  });

  it.each([
    ['ECART_PERTE', 'AMC', 1_500, { '654000': 1_500, '411200': -1_500 }],
    ['ECART_PERTE', 'AMO', -1_500, { '654000': -1_500, '411100': 1_500 }],
    ['ECART_PROFIT', 'AMO', 200, { '411100': 200, '758000': -200 }],
    ['TRANSFERT_PATIENT', 'AMC', 3_000, { '411000': 3_000, '411200': -3_000 }],
    ['TRANSFERT_PATIENT', 'AMC', -3_000, { '411000': -3_000, '411200': 3_000 }],
  ] as const)('régularisation %s %s %i', (nature, type, montantCentimes, attendu) => {
    const charge = { nature, type, montantCentimes };
    const m = maillon('REGULARISATION_ORGANISME', charge);
    expect(comptes(m)).toEqual(attendu);
    const [ecriture] = ecrituresDepuisMaillon(m, P);
    expect(ecriture && ecritureEquilibree(ecriture)).toBe(true);
  });

  it('accepte des paramètres enregistrés avant le compte des créances irrécouvrables', () => {
    const anciens = Object.fromEntries(
      Object.entries(P).filter(([cle]) => cle !== 'compteCreancesIrrecouvrables'),
    );
    expect(parametresComptablesSchema.parse(anciens).compteCreancesIrrecouvrables).toBe('654000');
  });

  it.each([
    ['ENCAISSEMENT', 'ENCAISSEMENT', 'CB', null, { '511200': 5_000, '411000': -5_000 }],
    ['ENCAISSEMENT', 'ENCAISSEMENT', 'ESPECES', 'd1', { '530000': 5_000, '419100': -5_000 }],
    ['REMBOURSEMENT', 'REMBOURSEMENT', 'CHEQUE', null, { '511100': -5_000, '411000': 5_000 }],
    [
      'ANNULATION_ENCAISSEMENT',
      'ANNULATION',
      'FINANCEMENT',
      'd1',
      { '467000': -5_000, '419100': 5_000 },
    ],
  ] as const)('mouvement %s %s %s', (type, nature, mode, devisId, attendu) => {
    expect(comptes(maillon(type, { nature, mode, montantCentimes: 5_000, devisId }))).toEqual(
      attendu,
    );
  });

  it.each([
    [-300, { '530000': -300, '658000': 300 }],
    [200, { '530000': 200, '758000': -200 }],
  ])('écart de caisse de %i', (ecartCentimes, attendu) => {
    expect(comptes(maillon('CAISSE_COMPTEE', { journee: '2026-11-02', ecartCentimes }))).toEqual(
      attendu,
    );
  });

  it('un comptage sans écart et un événement sans effet ne font pas d’écriture', () => {
    expect(
      ecrituresDepuisMaillon(
        maillon('CAISSE_COMPTEE', { journee: '2026-11-02', ecartCentimes: 0 }),
        P,
      ),
    ).toEqual([]);
    expect(ecrituresDepuisMaillon(maillon('DUPLICATA_EMIS', {}), P)).toEqual([]);
  });

  it.each([
    ['facture', maillon('FACTURE_VALIDEE', facture('FACTURE', 10_000))],
    ['avoir', maillon('AVOIR_VALIDE', facture('AVOIR'))],
    ['écart', maillon('CAISSE_COMPTEE', { journee: '2026-11-02', ecartCentimes: -300 })],
  ])('équilibre : %s', (_, m) => {
    const [ecriture] = ecrituresDepuisMaillon(m, P);
    expect(ecriture && ecritureEquilibree(ecriture)).toBe(true);
  });

  it('détecte une écriture déséquilibrée', () => {
    expect(
      ecritureEquilibree({
        journal: 'VE',
        journalLibelle: 'Ventes',
        date: '2026-11-02',
        pieceRef: 'X',
        libelle: 'X',
        lignes: [{ compte: '411000', debit: 1, credit: 0 }],
      }),
    ).toBe(false);
  });
});

describe('parametresComptablesSchema', () => {
  it('accepte les valeurs par défaut', () => {
    expect(parametresComptablesSchema.parse(P)).toEqual(P);
  });

  it('refuse un compte qui n’est pas numérique', () => {
    expect(parametresComptablesSchema.safeParse({ ...P, compteTva: 'TVA' }).success).toBe(false);
  });
});
