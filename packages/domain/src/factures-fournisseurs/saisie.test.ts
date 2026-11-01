import { describe, expect, it } from 'vitest';

import {
  champsManquants,
  estUnPdf,
  factureFournisseurSaisieSchema,
  filtreFacturesFournisseurSchema,
  ligneFactureSaisieSchema,
} from './saisie';

const ligne = { designation: 'Aurore', quantite: '2', prixUnitaireCentimes: '600,00' };

describe('estUnPdf', () => {
  it.each([
    ['PDF', [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31], true],
    ['autre fichier', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a], false],
    ['vide', [], false],
    ['tronqué', [0x25, 0x50], false],
  ])('%s', (_, octets, attendu) => {
    expect(estUnPdf(Uint8Array.from(octets))).toBe(attendu);
  });
});

describe('ligneFactureSaisieSchema', () => {
  it('lit une ligne et normalise les numéros de série', () => {
    expect(
      ligneFactureSaisieSchema.parse({
        ...ligne,
        tauxTva: '20,00',
        numerosSerie: 'sn 1, SN2;sn3',
      }),
    ).toMatchObject({
      quantite: 2,
      prixUnitaireCentimes: 60_000,
      tauxTva: 2000,
      numerosSerie: ['SN', '1', 'SN2', 'SN3'],
    });
  });

  it('sans numéros ni taux', () => {
    expect(ligneFactureSaisieSchema.parse(ligne)).toMatchObject({
      numerosSerie: [],
      tauxTva: null,
      commandeLigneId: null,
    });
  });

  it.each([
    ['désignation vide', { designation: ' ' }],
    ['quantité nulle', { quantite: '0' }],
    ['prix illisible', { prixUnitaireCentimes: 'abc' }],
    ['taux illisible', { tauxTva: 'abc' }],
    ['commande invalide', { commandeLigneId: 'x' }],
  ])('refuse : %s', (_, modification) => {
    expect(ligneFactureSaisieSchema.safeParse({ ...ligne, ...modification }).success).toBe(false);
  });
});

describe('factureFournisseurSaisieSchema', () => {
  it('accepte un brouillon incomplet', () => {
    expect(factureFournisseurSaisieSchema.parse({ lignes: [] })).toMatchObject({
      numero: null,
      montantHt: null,
      dateFacture: null,
    });
  });

  it('lit les montants', () => {
    expect(
      factureFournisseurSaisieSchema.parse({
        montantHt: '1 200,00',
        dateFacture: '2030-01-07',
        lignes: [],
      }),
    ).toMatchObject({ montantHt: 120_000, dateFacture: '2030-01-07' });
  });

  it('refuse un montant illisible', () => {
    expect(
      factureFournisseurSaisieSchema.safeParse({ montantTtc: 'abc', lignes: [] }).success,
    ).toBe(false);
  });
});

describe('champsManquants', () => {
  const complete = {
    fournisseurId: 'f',
    centreId: 'c',
    numero: 'FA-1',
    dateFacture: '2030-01-07',
    montantHtCentimes: 100,
    montantTvaCentimes: 20,
    montantTtcCentimes: 120,
    nombreLignes: 1,
  };

  it('une facture complète ne manque de rien', () => {
    expect(champsManquants(complete)).toEqual({});
  });

  it('liste les champs vides', () => {
    expect(
      Object.keys(
        champsManquants({
          ...complete,
          fournisseurId: null,
          centreId: null,
          numero: null,
          dateFacture: null,
          montantHtCentimes: null,
          montantTvaCentimes: null,
          montantTtcCentimes: null,
          nombreLignes: 0,
        }),
      ),
    ).toEqual([
      'fournisseurId',
      'centreId',
      'numero',
      'dateFacture',
      'montantHt',
      'montantTva',
      'montantTtc',
      'lignes',
    ]);
  });
});

it('un filtre invalide est ignoré', () => {
  expect(filtreFacturesFournisseurSchema.parse({ statut: 'X' })).toEqual({ page: 1 });
});
