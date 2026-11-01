import { describe, expect, it } from 'vitest';

import {
  commandeCreationSchema,
  filtreCommandesSchema,
  ligneCommandeSaisieSchema,
  referencePatientDepuis,
  regleCommandeSaisieSchema,
} from './saisie';

const ID = '019a8000-0000-7000-8000-000000000001';
const ligne = { produit: `modele:${ID}`, quantite: '2', enConsignation: false };

describe('ligneCommandeSaisieSchema', () => {
  it('sépare modèle et accessoire', () => {
    expect(ligneCommandeSaisieSchema.parse(ligne)).toMatchObject({
      modeleId: ID,
      accessoireId: null,
      quantite: 2,
      prixAchatCentimes: null,
    });
    expect(
      ligneCommandeSaisieSchema.parse({ ...ligne, produit: `accessoire:${ID}` }),
    ).toMatchObject({ modeleId: null, accessoireId: ID });
  });

  it('lit une ligne nominative', () => {
    expect(
      ligneCommandeSaisieSchema.parse({ ...ligne, patientId: ID, oreille: 'DROITE' }),
    ).toMatchObject({ patientId: ID, oreille: 'DROITE' });
  });

  it.each([
    ['produit absent', { produit: '' }],
    ['quantité nulle', { quantite: '0' }],
    ['quantité décimale', { quantite: '1,5' }],
    ['oreille sans patient', { oreille: 'GAUCHE' }],
    ['oreille inconnue', { patientId: ID, oreille: 'AUTRE' }],
  ])('refuse : %s', (_, modification) => {
    expect(ligneCommandeSaisieSchema.safeParse({ ...ligne, ...modification }).success).toBe(false);
  });
});

describe('autres saisies', () => {
  it('création', () => {
    expect(commandeCreationSchema.safeParse({ centreId: ID, fournisseurId: 'x' }).success).toBe(
      false,
    );
  });

  it('règle', () => {
    expect(
      regleCommandeSaisieSchema.parse({
        libelle: 'Piles',
        priorite: '10',
        montantMaxCentimes: '500,00',
        typeProduit: 'PILE',
        decision: 'ENVOI_DIRECT',
        actif: true,
      }),
    ).toMatchObject({ priorite: 10, montantMaxCentimes: 50_000, fournisseurId: null });
    expect(
      regleCommandeSaisieSchema.safeParse({ libelle: 'X', priorite: '1', actif: true }).success,
    ).toBe(false);
  });

  it('un filtre invalide est ignoré', () => {
    expect(filtreCommandesSchema.parse({ statut: 'INCONNU', fournisseurId: 'x' })).toEqual({
      page: 1,
    });
  });
});

describe('referencePatientDepuis', () => {
  it('produit un code sans lettre ambiguë, tiré des seuls octets reçus', () => {
    const reference = referencePatientDepuis(Uint8Array.from([0, 1, 31, 32, 200, 255, 10, 20]));
    expect(reference).toMatch(/^PT-[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(reference).toBe('PT-01Z08ZAM');
  });
});
