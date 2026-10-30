import { describe, expect, it } from 'vitest';

import { cellulesCsvStock, entetesCsvStock, type LigneCsvStock } from './csv';

const ligne: LigneCsvStock = {
  centre: 'Centre A',
  fabricant: 'Fabricant',
  gamme: 'Gamme',
  modele: 'Modèle',
  numeroSerie: 'AB123',
  statut: 'EN_STOCK',
  dateReception: '2026-10-31',
  referenceBonLivraison: 'BL-1',
  referenceFactureFabricant: null,
  enConsignation: true,
  prixAchatCentimes: 65050,
};

describe('export CSV du stock', () => {
  it('sans droit, ni colonne ni valeur de prix', () => {
    expect(entetesCsvStock(false).join()).not.toContain('Prix');
    expect(cellulesCsvStock(ligne, false)).toEqual([
      'Centre A',
      'Fabricant',
      'Gamme',
      'Modèle',
      'AB123',
      'En stock',
      '2026-10-31',
      'BL-1',
      null,
      'oui',
    ]);
  });

  it('avec droit, le prix est en euros, virgule décimale', () => {
    expect(entetesCsvStock(true).at(-1)).toContain('Prix');
    expect(cellulesCsvStock(ligne, true).at(-1)).toBe('650,50');
  });

  it('avec droit, un prix inconnu reste vide, et une ligne a autant de cellules que d’en-têtes', () => {
    const sansPrix = cellulesCsvStock(
      { ...ligne, prixAchatCentimes: null, enConsignation: false },
      true,
    );
    expect(sansPrix.at(-1)).toBeNull();
    expect(sansPrix.at(-2)).toBe('non');
    expect(sansPrix).toHaveLength(entetesCsvStock(true).length);
  });
});
