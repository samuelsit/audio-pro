import { describe, expect, it } from 'vitest';

import { agregerAchats, agregerDelais, filtreStatistiquesSchema } from './statistiques';

describe('agregerAchats', () => {
  it('additionne par fournisseur et par centre, le plus gros d’abord', () => {
    expect(
      agregerAchats([
        { fournisseur: 'Acoustia', centre: 'Nord', montantHtCentimes: 100 },
        { fournisseur: 'Sonora', centre: 'Nord', montantHtCentimes: 500 },
        { fournisseur: 'Acoustia', centre: 'Nord', montantHtCentimes: 200 },
        { fournisseur: 'Acoustia', centre: 'Sud', montantHtCentimes: 300 },
      ]),
    ).toEqual([
      { fournisseur: 'Sonora', centre: 'Nord', factures: 1, montantHtCentimes: 500 },
      { fournisseur: 'Acoustia', centre: 'Nord', factures: 2, montantHtCentimes: 300 },
      { fournisseur: 'Acoustia', centre: 'Sud', factures: 1, montantHtCentimes: 300 },
    ]);
  });

  it('à montant égal, l’ordre reste stable par fournisseur', () => {
    const [premiere] = agregerAchats([
      { fournisseur: 'Sonora', centre: 'Nord', montantHtCentimes: 100 },
      { fournisseur: 'Acoustia', centre: 'Nord', montantHtCentimes: 100 },
    ]);
    expect(premiere?.fournisseur).toBe('Acoustia');
  });
});

describe('agregerDelais', () => {
  it('calcule la moyenne et le maximum, en jours calendaires', () => {
    expect(
      agregerDelais([
        { fournisseur: 'Sonora', envoyeeLe: '2030-01-01T23:00:00.000Z', recueLe: '2030-01-03' },
        { fournisseur: 'Acoustia', envoyeeLe: '2030-01-01T08:00:00.000Z', recueLe: '2030-01-03' },
        { fournisseur: 'Acoustia', envoyeeLe: '2030-01-01T08:00:00.000Z', recueLe: '2030-01-04' },
        { fournisseur: 'Acoustia', envoyeeLe: '2030-01-01T08:00:00.000Z', recueLe: '2030-01-03' },
      ]),
    ).toEqual([
      { fournisseur: 'Acoustia', commandes: 3, delaiMoyenJours: 2.3, delaiMaxJours: 3 },
      { fournisseur: 'Sonora', commandes: 1, delaiMoyenJours: 2, delaiMaxJours: 2 },
    ]);
  });

  it('une réception datée avant l’envoi compte pour zéro', () => {
    expect(
      agregerDelais([{ fournisseur: 'A', envoyeeLe: '2030-01-03', recueLe: '2030-01-01' }])[0]
        ?.delaiMaxJours,
    ).toBe(0);
  });
});

describe('filtreStatistiquesSchema', () => {
  it('valide la période', () => {
    expect(filtreStatistiquesSchema.safeParse({ du: '2030-01-01', au: '2030-01-31' }).success).toBe(
      true,
    );
    expect(filtreStatistiquesSchema.safeParse({ du: '2030-02-01', au: '2030-01-31' }).success).toBe(
      false,
    );
  });
});
