import { describe, expect, it } from 'vitest';

import { extraireDepuisTexte, FACTURE_VIDE } from './extraction';

const FACTURE = `Acoustia Démo
SIRET : 123 456 789 00011
Facture n° FA-2030-117
Date de facture : 07/01/2030
N° client : CL-204
Votre commande CMD-2030-000012 et cmd-2030-000013
AU-1 Aurore Essentiel 2 600,00 1 200,00 €
S/N : SN1001, SN1002
Numéros de série SN1003
Livraison offerte 1 0,00 0,00
Piles 13 10 0,60 6,00
Total HT 1 206,00
TVA 20 % 241,20
Total TTC 1 447,20`;

describe('extraireDepuisTexte', () => {
  const extraite = extraireDepuisTexte(FACTURE);

  it('lit l’en-tête', () => {
    expect(extraite).toMatchObject({
      numero: 'FA-2030-117',
      dateFacture: '2030-01-07',
      sirets: ['12345678900011'],
      numerosClient: ['CL-204'],
      numerosCommande: ['CMD-2030-000012', 'CMD-2030-000013'],
    });
  });

  it('lit les totaux, séparateurs français compris', () => {
    expect(extraite).toMatchObject({
      montantHtCentimes: 120_600,
      montantTtcCentimes: 144_720,
    });
  });

  it('lit les lignes et rattache les numéros de série à la précédente', () => {
    expect(extraite.lignes[0]).toEqual({
      reference: 'AU-1',
      designation: 'Aurore Essentiel',
      quantite: 2,
      prixUnitaireCentimes: 60_000,
      numerosSerie: ['SN1001', 'SN1002', 'SN1003'],
    });
    expect(extraite.lignes.at(-1)).toMatchObject({
      reference: null,
      designation: 'Piles 13',
      quantite: 10,
      prixUnitaireCentimes: 60,
    });
  });

  it('écarte une ligne dont quantité × prix ne donne pas le total', () => {
    expect(extraireDepuisTexte('Remise 3 10,00 99,00').lignes).toEqual([]);
  });

  it('ignore un numéro de série sans ligne à laquelle le rattacher', () => {
    expect(extraireDepuisTexte('S/N : SN1001').lignes).toEqual([]);
  });

  it('écarte un numéro trop court pour en être un', () => {
    const { lignes } = extraireDepuisTexte('AU-1 Aurore 1 10,00 10,00\nS/N : A1 SN1001');
    expect(lignes[0]?.numerosSerie).toEqual(['SN1001']);
  });

  it('sans rien de reconnu, rend une facture vide plutôt qu’une invention', () => {
    expect(extraireDepuisTexte('Bonjour, voici un document.')).toEqual(FACTURE_VIDE);
    expect(extraireDepuisTexte('')).toEqual(FACTURE_VIDE);
  });
});
