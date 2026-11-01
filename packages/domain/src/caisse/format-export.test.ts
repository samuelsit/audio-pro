import { describe, expect, it } from 'vitest';

import type { Ecriture } from './ecritures';
import {
  COLONNES_FEC,
  descriptionFec,
  formaterEcritures,
  nomFichierFec,
  numeroterEcritures,
  PROFIL_ECRITURES_DEFAUT,
  PROFIL_FEC,
  profilExportSchema,
  sirenDepuisSiret,
} from './format-export';

const ecriture = (journal: string, debit = 123_456): Ecriture => ({
  journal,
  journalLibelle: `Journal ${journal}`,
  date: '2026-11-02',
  pieceRef: 'FA-000001',
  libelle: 'Facture FA-000001',
  lignes: [
    { compte: '411000', debit, credit: 0 },
    { compte: '707000', debit: 0, credit: debit },
  ],
});

describe('numeroterEcritures', () => {
  it('numérote sans trou, journal par journal', () => {
    expect(
      numeroterEcritures([ecriture('VE'), ecriture('CA'), ecriture('VE')]).map((e) => [
        e.journal,
        e.numero,
      ]),
    ).toEqual([
      ['VE', 1],
      ['CA', 1],
      ['VE', 2],
    ]);
  });
});

describe('formaterEcritures', () => {
  const numerotees = numeroterEcritures([ecriture('VE')]);

  it('FEC : 18 champs, noms en première ligne', () => {
    const [entete, premiere] = formaterEcritures(numerotees, PROFIL_FEC, { '411000': 'Clients' });
    expect(entete?.split('\t')).toEqual([...COLONNES_FEC]);
    expect(premiere?.split('\t')).toEqual([
      'VE',
      'Journal VE',
      '1',
      '20261102',
      '411000',
      'Clients',
      '',
      '',
      'FA-000001',
      '20261102',
      'Facture FA-000001',
      '1234,56',
      '0,00',
      '',
      '',
      '20261102',
      '',
      '',
    ]);
  });

  it('un intitulé absent retombe sur le numéro de compte', () => {
    expect(formaterEcritures(numerotees, PROFIL_FEC)[2]).toContain('707000\t707000');
  });

  it('profil paramétrable : colonnes, date, décimale, sans en-tête', () => {
    const lignes = formaterEcritures(numerotees, {
      ...PROFIL_ECRITURES_DEFAUT,
      decimale: '.',
      entete: false,
      colonnes: ['EcritureDate', 'Debit'],
    });
    expect(lignes).toEqual(['02/11/2026;1234.56', '02/11/2026;0.00']);
  });

  it('format de date ISO', () => {
    expect(
      formaterEcritures(numerotees, {
        ...PROFIL_ECRITURES_DEFAUT,
        formatDate: 'AAAA-MM-JJ',
        entete: false,
        colonnes: ['EcritureDate'],
      })[0],
    ).toBe('2026-11-02');
  });

  it('garde les zéros des centimes', () => {
    const [ligne] = formaterEcritures(numeroterEcritures([ecriture('VE', 105)]), {
      ...PROFIL_ECRITURES_DEFAUT,
      entete: false,
      colonnes: ['Debit'],
    });
    expect(ligne).toBe('1,05');
  });

  it('retire le séparateur et les sauts de ligne des libellés', () => {
    const [ligne] = formaterEcritures(
      numeroterEcritures([{ ...ecriture('VE'), libelle: 'a;b\nc' }]),
      { ...PROFIL_ECRITURES_DEFAUT, entete: false, colonnes: ['EcritureLib'] },
    );
    expect(ligne).toBe('a b c');
  });
});

describe('profilExportSchema', () => {
  it('accepte les profils fournis', () => {
    expect(profilExportSchema.parse(PROFIL_FEC)).toEqual(PROFIL_FEC);
    expect(profilExportSchema.parse(PROFIL_ECRITURES_DEFAUT)).toEqual(PROFIL_ECRITURES_DEFAUT);
  });

  it('refuse un profil sans colonne ou une colonne inconnue', () => {
    expect(profilExportSchema.safeParse({ ...PROFIL_FEC, colonnes: [] }).success).toBe(false);
    expect(profilExportSchema.safeParse({ ...PROFIL_FEC, colonnes: ['Autre'] }).success).toBe(
      false,
    );
  });
});

describe('FEC', () => {
  it('nomme le fichier', () => {
    expect(nomFichierFec('123456789', '2026-12-31')).toBe('123456789FEC20261231');
  });

  it.each([
    ['123 456 789 00012', '123456789'],
    ['12345678900012', '123456789'],
    ['123', null],
    [null, null],
  ])('SIREN de %s', (siret, siren) => {
    expect(sirenDepuisSiret(siret)).toBe(siren);
  });

  it('décrit le fichier et son périmètre', () => {
    const description = descriptionFec('123456789', '2026-01-01', '2026-12-31');
    expect(description).toContain('SIREN 123456789');
    expect(description).toContain('ne\nremplace pas la comptabilité');
  });
});
