import { describe, expect, it } from 'vitest';

import { codeLppSchema, resultatFiche, resultatLien, resultatTarif } from './lignes';
import { ficheBrute, histoBrut } from './test-outils';

describe('codeLppSchema', () => {
  it.each([
    { code: '2351057', valide: true },
    { code: '235105', valide: false },
    { code: '203C01A', valide: false },
    { code: '', valide: false },
  ])('$code', ({ code, valide }) => {
    expect(codeLppSchema.safeParse(code).success).toBe(valide);
  });
});

describe('resultatFiche', () => {
  it('convertit une ligne de la fiche', () => {
    const r = resultatFiche(
      ficheBrute({ DATE_FIN: '20040922', OLD_CODE: '203A', RMO2: 'R12', AGE_MAX: '19' }),
    );
    expect(r.data).toEqual({
      code: '7336200',
      libelle: 'AIDE AUDITIVE, CLASSE I, DROITE, > 20 ANS,SIVANTOS',
      dateFin: '2004-09-22',
      ageMax: 19,
      typePrestation: 'A',
      indication: 'N',
      prothese: null,
      oldCode: '203A',
      rmo: ['R12'],
      arbo: [2, 3, 7, 0, 0, 0, 0, 0, 0, 0],
    });
  });

  it('laisse vide ce qui est vide', () => {
    const r = resultatFiche(ficheBrute({ AGE_MAX: '', TYPE_PREST: '', OLD_CODE: '' }));
    expect(r.data).toMatchObject({
      dateFin: null,
      ageMax: null,
      typePrestation: null,
      oldCode: null,
    });
  });

  it.each([
    { cas: 'code mal formé', champs: { CODE_TIPS: '12' } },
    { cas: 'libellé vide', champs: { NOM_COURT: '' } },
    { cas: 'date impossible', champs: { DATE_FIN: '20261332' } },
    { cas: 'date mal formée', champs: { DATE_FIN: '2004' } },
    { cas: 'âge non numérique', champs: { AGE_MAX: 'x' } },
    { cas: 'arborescence vide', champs: { ARBO3: '' } },
  ])('refuse : $cas', ({ champs }) => {
    expect(resultatFiche(ficheBrute(champs)).success).toBe(false);
  });
});

describe('resultatTarif', () => {
  it('convertit une ligne d’historique, sans flottant', () => {
    const r = resultatTarif(
      histoBrut({ TARIF: '1024.46', FINHISTO: '20260702', PECP02: '12', MT_MAX: '36.59' }),
    );
    expect(r.data).toEqual({
      code: '7336200',
      debutValidite: '2023-07-07',
      finValidite: '2026-07-02',
      naturePrestation: 'P1D',
      entente: 'N',
      dateArrete: '2023-07-03',
      dateJo: '2023-07-06',
      puDevis: 0,
      baseRemboursementCentimes: 102_446,
      quantiteMax: 0,
      montantMaxBrutCentimes: 3_659,
      puReglementeCentimes: 95_000,
      majorationsDom: [1300, 1150, 9999, 1200, 1000, 1360],
      prisesEnCharge: ['00', '12', '00'],
    });
  });

  it.each([
    { cas: 'montant illisible', champs: { TARIF: '12,50' } },
    { cas: 'tarif absent', champs: { TARIF: '' } },
    { cas: 'début absent', champs: { DEBUTVALID: '' } },
    { cas: 'nature vide', champs: { NAT_PREST: '' } },
    { cas: 'trop de décimales', champs: { TARIF: '1.234' } },
    { cas: 'majoration absente', champs: { MAJO_DOM3: '' } },
  ])('refuse : $cas', ({ champs }) => {
    expect(resultatTarif(histoBrut(champs)).success).toBe(false);
  });
});

describe('resultatLien', () => {
  it('garde les deux codes tels quels', () => {
    expect(resultatLien({ CODE1: '2325090', CODE2: '2326941' }).data).toEqual({
      code1: '2325090',
      code2: '2326941',
    });
  });

  it('refuse un code mal formé', () => {
    expect(resultatLien({ CODE1: '', CODE2: '2326941' }).success).toBe(false);
  });
});
