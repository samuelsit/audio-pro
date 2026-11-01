import { describe, expect, it } from 'vitest';

import { brouillonsReapproSchema, quantiteAReapprovisionner, seuilSaisieSchema } from './reappro';

const ID = '019a8000-0000-7000-8000-000000000001';

describe('quantiteAReapprovisionner', () => {
  const seuil = { minimum: 2, cible: 5 };

  it.each([
    ['au-dessus du minimum', 3, 0, 0],
    ['au minimum', 2, 0, 0],
    ['sous le minimum', 1, 0, 4],
    ['stock vide', 0, 0, 5],
    ['une commande en cours couvre le minimum', 1, 1, 0],
    ['une commande en cours réduit la proposition', 0, 1, 4],
  ])('%s', (_, stock, enCommande, attendu) => {
    expect(quantiteAReapprovisionner(seuil, { stock, enCommande })).toBe(attendu);
  });
});

describe('seuilSaisieSchema', () => {
  const saisie = { centreId: ID, produit: `modele:${ID}`, minimum: '2', cible: '5' };

  it('sépare modèle et accessoire', () => {
    expect(seuilSaisieSchema.parse(saisie)).toMatchObject({
      modeleId: ID,
      accessoireId: null,
      minimum: 2,
      cible: 5,
    });
    expect(seuilSaisieSchema.parse({ ...saisie, produit: `accessoire:${ID}` })).toMatchObject({
      modeleId: null,
      accessoireId: ID,
    });
  });

  it.each([
    ['cible sous le minimum', { minimum: '5', cible: '2' }],
    ['cible nulle', { minimum: '0', cible: '0' }],
    ['produit invalide', { produit: 'x' }],
    ['minimum négatif', { minimum: '-1' }],
  ])('refuse : %s', (_, modification) => {
    expect(seuilSaisieSchema.safeParse({ ...saisie, ...modification }).success).toBe(false);
  });
});

it('lit les quantités retenues', () => {
  expect(brouillonsReapproSchema.parse([{ produit: `modele:${ID}`, quantite: '3' }])).toEqual([
    { produit: `modele:${ID}`, quantite: 3 },
  ]);
});
