import { describe, expect, it } from 'vitest';

import { interpreterCsv } from '../commun/csv';
import {
  accessoireSaisieSchema,
  ENTETES_CSV_ACCESSOIRES,
  ENTETES_CSV_MODELES,
  fabricantSaisieSchema,
  LIBELLES_CLASSES_LPP,
  LIBELLES_LIEUX_FABRICATION,
  LIBELLES_NATURES_ACCESSOIRE,
  LIBELLES_OPTIONS_AIDE_AUDITIVE,
  LIBELLES_TYPES_AIDE_AUDITIVE,
  ligneCsvAccessoireSchema,
  ligneCsvModeleSchema,
  modeleSaisieSchema,
  OPTIONS_AIDE_AUDITIVE,
} from './catalogue';

const MODELE = {
  fabricantId: 'f1',
  gamme: 'Aurore',
  nom: 'Aurore 3',
  type: 'RIC',
  classe: 'CLASSE_II',
  codesLpp: '2392530, 2341840',
  prixConseilleCentimes: '1 490,50',
  options: '',
  actif: true,
};

const FICHE_VIDE = {
  marque: null,
  referenceCommerciale: null,
  lieuFabrication: null,
  nombreCanaux: null,
  connectivite: null,
  antiLarsen: null,
  reducteurAcouphenes: null,
  bobineT: null,
  options: [],
};

describe('libellés', () => {
  it('couvrent chaque valeur', () => {
    expect(Object.keys(LIBELLES_TYPES_AIDE_AUDITIVE)).toEqual(['CONTOUR', 'INTRA', 'RIC']);
    expect(Object.keys(LIBELLES_CLASSES_LPP)).toEqual(['CLASSE_I', 'CLASSE_II']);
    expect(Object.keys(LIBELLES_NATURES_ACCESSOIRE)).toEqual(['ACCESSOIRE', 'PILE']);
    expect(Object.keys(LIBELLES_LIEUX_FABRICATION)).toEqual(['UE', 'HORS_UE']);
    expect(Object.keys(LIBELLES_OPTIONS_AIDE_AUDITIVE)).toEqual([...OPTIONS_AIDE_AUDITIVE]);
  });

  it('reprennent les 8 options du devis normalisé', () => {
    expect(OPTIONS_AIDE_AUDITIVE).toHaveLength(8);
  });
});

describe('fabricantSaisieSchema', () => {
  it('retire les espaces de bord et refuse un nom vide', () => {
    expect(fabricantSaisieSchema.parse({ nom: ' Acoustia ', actif: true }).nom).toBe('Acoustia');
    expect(fabricantSaisieSchema.safeParse({ nom: ' ', actif: true }).success).toBe(false);
  });
});

describe('modeleSaisieSchema', () => {
  it('convertit le prix en centimes et découpe les codes', () => {
    expect(modeleSaisieSchema.parse(MODELE)).toMatchObject({
      codesLpp: ['2392530', '2341840'],
      prixConseilleCentimes: 149_050,
    });
  });

  it('dédoublonne les codes et accepte une liste vide', () => {
    expect(modeleSaisieSchema.parse({ ...MODELE, codesLpp: '2392530|2392530 ' }).codesLpp).toEqual([
      '2392530',
    ]);
    expect(modeleSaisieSchema.parse({ ...MODELE, codesLpp: '' }).codesLpp).toEqual([]);
  });

  it.each([
    { cas: 'prix illisible', champs: { prixConseilleCentimes: 'beaucoup' } },
    { cas: 'prix absent', champs: { prixConseilleCentimes: undefined } },
    { cas: 'code mal formé', champs: { codesLpp: '2392530 12' } },
    { cas: 'type inconnu', champs: { type: 'BOITIER' } },
    { cas: 'classe inconnue', champs: { classe: 'III' } },
    { cas: 'fabricant absent', champs: { fabricantId: '' } },
  ])('refuse : $cas', ({ champs }) => {
    expect(modeleSaisieSchema.safeParse({ ...MODELE, ...champs }).success).toBe(false);
  });
});

describe('modeleSaisieSchema : mentions du devis normalisé', () => {
  it('laisse inconnu ce qui n’est pas renseigné', () => {
    expect(modeleSaisieSchema.parse(MODELE)).toMatchObject(FICHE_VIDE);
  });

  it('convertit les champs renseignés', () => {
    const r = modeleSaisieSchema.parse({
      ...MODELE,
      marque: ' Acoustia ',
      referenceCommerciale: 'AU3-R',
      lieuFabrication: 'hors ue',
      nombreCanaux: '16',
      connectivite: 'Bluetooth',
      antiLarsen: 'oui',
      reducteurAcouphenes: 'NON',
      bobineT: 'Oui',
      options: 'reducteur_acouphene, CONNECTIVITE_SANS_FIL;REDUCTEUR_ACOUPHENE',
    });
    expect(r).toMatchObject({
      marque: 'Acoustia',
      lieuFabrication: 'HORS_UE',
      nombreCanaux: 16,
      antiLarsen: true,
      reducteurAcouphenes: false,
      bobineT: true,
      options: ['REDUCTEUR_ACOUPHENE', 'CONNECTIVITE_SANS_FIL'],
    });
  });

  it.each([
    { cas: 'nombre de canaux nul', champs: { nombreCanaux: '0' } },
    { cas: 'lieu inconnu', champs: { lieuFabrication: 'Lune' } },
    { cas: 'oui/non illisible', champs: { antiLarsen: 'peut-être' } },
    { cas: 'option inconnue', champs: { options: 'TURBO' } },
  ])('refuse : $cas', ({ champs }) => {
    expect(modeleSaisieSchema.safeParse({ ...MODELE, ...champs }).success).toBe(false);
  });
});

describe('accessoireSaisieSchema', () => {
  it.each([
    { codeLpp: '', attendu: null },
    { codeLpp: '2332976', attendu: '2332976' },
  ])('code « $codeLpp »', ({ codeLpp, attendu }) => {
    const r = accessoireSaisieSchema.parse({
      nom: 'Piles 13',
      nature: 'PILE',
      codeLpp,
      prixCentimes: '1,50',
      actif: true,
    });
    expect(r).toMatchObject({ codeLpp: attendu, prixCentimes: 150 });
  });
});

describe('import CSV des modèles', () => {
  const ENTETE = ENTETES_CSV_MODELES.join(';');

  it.each([
    { classe: 'I', type: 'contour', attendu: { classe: 'CLASSE_I', type: 'CONTOUR' } },
    { classe: 'ii', type: 'ric', attendu: { classe: 'CLASSE_II', type: 'RIC' } },
  ])('lit classe $classe, type $type', ({ classe, type, attendu }) => {
    const { lignes, erreurs } = interpreterCsv(
      `${ENTETE}\nAcoustia;Aurore;Aurore 3;${type};${classe};2392530|2341840;"1 490,00";;;;;;;;;;Oui\n`,
      ENTETES_CSV_MODELES,
      ligneCsvModeleSchema,
    );
    expect(erreurs).toEqual([]);
    expect(lignes[0]?.valeur).toEqual({
      fabricant: 'Acoustia',
      gamme: 'Aurore',
      nom: 'Aurore 3',
      codesLpp: ['2392530', '2341840'],
      prixConseilleCentimes: 149_000,
      ...FICHE_VIDE,
      actif: true,
      ...attendu,
    });
  });

  it('liste les erreurs de chaque ligne', () => {
    const { erreurs } = interpreterCsv(
      `${ENTETE}\nAcoustia;Aurore;A;BOITIER;III;123;x;;;;;;;;;;peut-être\n`,
      ENTETES_CSV_MODELES,
      ligneCsvModeleSchema,
    );
    expect(erreurs.map((e) => e.message)).toEqual([
      'type : Type attendu : contour, intra ou RIC.',
      'classe : Classe attendue : I ou II.',
      'codes_lpp.0 : Un code LPP comporte 7 chiffres.',
      'prix_conseille : Prix invalide (exemple : 1 490,00).',
      'actif : Indiquer oui ou non.',
    ]);
  });
});

describe('import CSV des accessoires', () => {
  const ENTETE = ENTETES_CSV_ACCESSOIRES.join(';');

  it.each([
    { nature: 'piles', attendu: 'PILE' },
    { nature: 'PILE', attendu: 'PILE' },
    { nature: 'accessoire', attendu: 'ACCESSOIRE' },
  ])('lit la nature $nature', ({ nature, attendu }) => {
    const { lignes } = interpreterCsv(
      `${ENTETE}\nPiles 13;${nature};2332976;1,50;Rayonac;RAY-13;non\n`,
      ENTETES_CSV_ACCESSOIRES,
      ligneCsvAccessoireSchema,
    );
    expect(lignes[0]?.valeur).toEqual({
      nom: 'Piles 13',
      nature: attendu,
      codeLpp: '2332976',
      prixCentimes: 150,
      marque: 'Rayonac',
      referenceCommerciale: 'RAY-13',
      actif: false,
    });
  });

  it('refuse une nature inconnue', () => {
    const { erreurs } = interpreterCsv(
      `${ENTETE}\nPiles 13;bonbon;;1,50;;;oui\n`,
      ENTETES_CSV_ACCESSOIRES,
      ligneCsvAccessoireSchema,
    );
    expect(erreurs).toEqual([
      { ligne: 2, message: 'nature : Nature attendue : accessoire ou piles.' },
    ]);
  });
});
