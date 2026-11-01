import { describe, expect, it } from 'vitest';

import type { QuantitesLigne, StatutCommande } from './etats';
import {
  ecartsDuPointage,
  ecartTraitable,
  filtreEcartsSchema,
  pointageSaisieSchema,
  receptionPossible,
  STATUTS_ECART_ACHAT,
  traitementEcartSchema,
} from './reception';

const ID = '019a8000-0000-7000-8000-000000000001';

const ligne: QuantitesLigne = {
  quantite: 5,
  quantiteRecue: 2,
  quantiteFacturee: 0,
  quantiteAbandonnee: 0,
  enConsignation: false,
};

describe('ecartsDuPointage', () => {
  it.each([
    ['livraison partielle : aucun écart', 1, 0, []],
    ['le reste exact : aucun écart', 3, 0, []],
    ['surplus', 4, 0, [{ type: 'SURPLUS', quantiteAttendue: 3, quantiteConstatee: 4 }]],
    [
      'non conforme',
      0,
      1,
      [{ type: 'PRODUIT_NON_CONFORME', quantiteAttendue: 3, quantiteConstatee: 1 }],
    ],
    [
      'les deux',
      4,
      2,
      [
        { type: 'SURPLUS', quantiteAttendue: 3, quantiteConstatee: 4 },
        { type: 'PRODUIT_NON_CONFORME', quantiteAttendue: 3, quantiteConstatee: 2 },
      ],
    ],
  ])('%s', (_, quantite, quantiteNonConforme, attendu) => {
    expect(ecartsDuPointage(ligne, { quantite, quantiteNonConforme })).toEqual(attendu);
  });

  it('une ligne soldée rend toute quantité excédentaire', () => {
    const soldee = { ...ligne, quantiteRecue: 5 };
    expect(ecartsDuPointage(soldee, { quantite: 1, quantiteNonConforme: 0 })).toEqual([
      { type: 'SURPLUS', quantiteAttendue: 0, quantiteConstatee: 1 },
    ]);
  });
});

describe('receptionPossible', () => {
  it.each<[StatutCommande, boolean]>([
    ['APPROUVEE', false],
    ['ENVOYEE', true],
    ['PARTIELLEMENT_RECUE', true],
    ['RECUE', false],
  ])('%s', (statut, attendu) => {
    expect(receptionPossible(statut)).toBe(attendu);
  });
});

describe('saisies', () => {
  const pointage = {
    ligneId: ID,
    quantite: '1',
    numerosSerie: [],
    quantiteNonConforme: '0',
    commentaire: '',
  };
  const saisie = {
    dateReception: '2030-01-07',
    referenceBonLivraison: 'BL-1',
    lignes: [pointage],
  };

  it('lit un pointage', () => {
    expect(pointageSaisieSchema.parse(saisie).lignes[0]).toMatchObject({
      quantite: 1,
      commentaire: null,
    });
  });

  it('refuse une ligne pointée deux fois, ou un bon de livraison absent', () => {
    expect(
      pointageSaisieSchema.safeParse({ ...saisie, lignes: [pointage, pointage] }).success,
    ).toBe(false);
    expect(pointageSaisieSchema.safeParse({ ...saisie, referenceBonLivraison: ' ' }).success).toBe(
      false,
    );
  });

  it('un traitement exige un commentaire', () => {
    expect(traitementEcartSchema.safeParse({ statut: 'ACCEPTE', commentaire: '' }).success).toBe(
      false,
    );
    expect(traitementEcartSchema.safeParse({ statut: 'OUVERT', commentaire: 'x' }).success).toBe(
      false,
    );
  });

  it('un filtre invalide est ignoré', () => {
    expect(filtreEcartsSchema.parse({ statut: 'X', type: 'Y' })).toEqual({ page: 1 });
  });

  it('seuls les écarts ouverts ou contestés se traitent', () => {
    expect(STATUTS_ECART_ACHAT.filter(ecartTraitable)).toEqual(['OUVERT', 'CONTESTE']);
  });
});
