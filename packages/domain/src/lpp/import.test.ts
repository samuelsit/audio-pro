import { describe, expect, it } from 'vitest';

import { ErreurImportLpp, preparerImportLpp, resoudreFichiersLpp } from './import';
import { ficheBrute, histoBrut } from './test-outils';

const FICHIERS = [
  'LPPNOTE908.doc',
  'lpp_comp_tot908.dbf',
  'LPP_fiche_tot908.dbf',
  'lpp_histo_tot908.dbf',
  'lpp_incomp_tot908.dbf',
];

describe('resoudreFichiersLpp', () => {
  it('trouve les 4 fichiers sans tenir compte de la casse et ignore le reste', () => {
    expect(resoudreFichiersLpp('908', FICHIERS)).toEqual({
      version: 908,
      fichiers: {
        comp: 'lpp_comp_tot908.dbf',
        fiche: 'LPP_fiche_tot908.dbf',
        histo: 'lpp_histo_tot908.dbf',
        incomp: 'lpp_incomp_tot908.dbf',
      },
    });
  });

  it.each([
    { cas: 'dossier sans numéro', dossier: 'lpp', noms: FICHIERS, message: /numéro de version/ },
    {
      cas: 'fichier manquant',
      dossier: '908',
      noms: FICHIERS.slice(0, 3),
      message: /manquants : histo, incomp/,
    },
    { cas: 'autre version', dossier: '907', noms: FICHIERS, message: /version 907/ },
    {
      cas: 'fichier en double',
      dossier: '908',
      noms: [...FICHIERS, 'LPP_COMP_TOT908.DBF'],
      message: /Deux fichiers « comp »/,
    },
  ])('refuse : $cas', ({ dossier, noms, message }) => {
    expect(() => resoudreFichiersLpp(dossier, noms)).toThrow(message);
    expect(() => resoudreFichiersLpp(dossier, noms)).toThrow(ErreurImportLpp);
  });
});

const GENERIQUE = ficheBrute({ CODE_TIPS: '2351057', NOM_COURT: 'AIDE AUDITIVE, CLASSE I' });
const SPECIFIQUE = ficheBrute({ OLD_CODE: '2351057' });
const OPTIQUE = ficheBrute({ CODE_TIPS: '7214164', ARBO2: '2', NOM_COURT: 'OPTIQUE' });
const VIDE = { comp: [], incomp: [] };

describe('preparerImportLpp', () => {
  const base = {
    fiche: [GENERIQUE, SPECIFIQUE, OPTIQUE],
    histo: [
      histoBrut({ CODE_TIPS: '2351057', NAT_PREST: 'RJT', PUREGLEMEN: '0.00' }),
      histoBrut({ MT_MAX: '12.00' }),
      histoBrut({ DEBUTVALID: '20200101', FINHISTO: '20230706' }),
      histoBrut({ CODE_TIPS: '7214164' }),
    ],
    comp: [{ CODE1: '3100179', CODE2: '3104148' }],
    incomp: [{ CODE1: '2325090', CODE2: '2326941' }],
  };

  it('ne garde que le chapitre et relie le spécifique à son générique', () => {
    const { fiches, tarifs } = preparerImportLpp(base);
    expect(fiches.map((f) => [f.code, f.codeGenerique])).toEqual([
      ['2351057', null],
      ['7336200', '2351057'],
    ]);
    expect(tarifs.map((t) => t.code)).toEqual(['2351057', '7336200', '7336200']);
    expect(fiches[0]?.brut).toBe(GENERIQUE);
  });

  it('traduit les zéros en absence de plafond', () => {
    const { tarifs } = preparerImportLpp(base);
    expect(tarifs[0]).toMatchObject({ prixLimiteVenteCentimes: null, montantMaxCentimes: null });
    expect(tarifs[1]).toMatchObject({ prixLimiteVenteCentimes: 95_000, montantMaxCentimes: 1_200 });
  });

  it('garde comp et incomp en entier, sans filtre', () => {
    expect(preparerImportLpp(base).liens).toEqual([
      { type: 'COMPATIBLE', code1: '3100179', code2: '3104148' },
      { type: 'INCOMPATIBLE', code1: '2325090', code2: '2326941' },
    ]);
  });

  it.each([
    {
      cas: 'historique sans fiche',
      bruts: { fiche: [GENERIQUE], histo: [histoBrut()], ...VIDE },
      message: /Historique sans fiche : 7336200/,
    },
    {
      cas: 'aucun code du chapitre',
      bruts: { fiche: [OPTIQUE], histo: [], ...VIDE },
      message: /Aucun code du titre II/,
    },
    {
      cas: 'code en double',
      bruts: { fiche: [SPECIFIQUE, SPECIFIQUE], histo: [histoBrut()], ...VIDE },
      message: /Code en double : 7336200/,
    },
    {
      cas: 'code sans historique',
      bruts: { fiche: [SPECIFIQUE], histo: [], ...VIDE },
      message: /Code sans historique : 7336200/,
    },
    {
      cas: 'ligne d’historique en double',
      bruts: { fiche: [SPECIFIQUE], histo: [histoBrut(), histoBrut()], ...VIDE },
      message: /Ligne d’historique en double : 7336200@2023-07-07/,
    },
    {
      cas: 'fiche invalide',
      bruts: { fiche: [ficheBrute({ NOM_COURT: '' })], histo: [histoBrut()], ...VIDE },
      message: /fiche, ligne 7336200, NOM_COURT : Libellé vide/,
    },
    {
      cas: 'historique invalide',
      bruts: { fiche: [SPECIFIQUE], histo: [histoBrut({ TARIF: 'x' })], ...VIDE },
      message: /histo, ligne 7336200, TARIF/,
    },
    {
      cas: 'lien invalide',
      bruts: {
        fiche: [SPECIFIQUE],
        histo: [histoBrut()],
        comp: [{ CODE1: '', CODE2: '3104148' }],
        incomp: [],
      },
      message: /comp, ligne , CODE1/,
    },
    {
      cas: 'lien en double',
      bruts: {
        fiche: [SPECIFIQUE],
        histo: [histoBrut()],
        comp: [
          { CODE1: '3100179', CODE2: '3104148' },
          { CODE1: '3100179', CODE2: '3104148' },
        ],
        incomp: [],
      },
      message: /Lien en double : COMPATIBLE 3100179-3104148/,
    },
  ])('refuse : $cas', ({ bruts, message }) => {
    expect(() => preparerImportLpp(bruts)).toThrow(message);
  });
});
