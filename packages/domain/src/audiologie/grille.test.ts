import { describe, expect, it } from 'vitest';

import { AUDIOGRAMME, point } from './fixtures.test-support';
import {
  cellulesInvalides,
  GRILLE_VIDE,
  grilleDepuisOreille,
  oreilleDepuisGrille,
  type GrilleOreille,
} from './grille';

function grille(partiel: Partial<GrilleOreille>): GrilleOreille {
  return { ...GRILLE_VIDE, ...partiel };
}

describe('oreilleDepuisGrille', () => {
  it('lit seuils, masquage, absence de réponse et inconfort', () => {
    expect(
      oreilleDepuisGrille(
        grille({
          aerienne: { 1000: '40', 2000: ' NR ', 500: '' },
          masqueAerienne: { 1000: '60' },
          osseuse: { 1000: '35' },
          inconfort: { 1000: '100' },
        }),
      ),
    ).toEqual({
      aerienne: [point(1000, 40, 60), point(2000, null)],
      osseuse: [point(1000, 35)],
      inconfort: [{ frequence: 1000, seuil: 100 }],
    });
  });

  it('écarte les cellules illisibles', () => {
    expect(
      oreilleDepuisGrille(
        grille({
          aerienne: { 1000: 'abc' },
          inconfort: { 1000: 'nr', 2000: 'abc' },
          masqueOsseuse: { 500: 'x' },
          osseuse: { 500: '10' },
        }),
      ),
    ).toEqual({ aerienne: [], osseuse: [point(500, 10)], inconfort: [] });
  });
});

describe('cellulesInvalides', () => {
  it.each([
    { cas: 'grille vide', g: grille({}), attendu: [] },
    { cas: 'valeurs lisibles', g: grille({ aerienne: { 1000: '40' } }), attendu: [] },
    { cas: 'pas de réponse', g: grille({ osseuse: { 500: 'nr' } }), attendu: [] },
    {
      cas: 'masquage avec seuil',
      g: grille({ aerienne: { 500: '40' }, masqueAerienne: { 500: '60' } }),
      attendu: [],
    },
    {
      cas: 'texte',
      g: grille({ aerienne: { 1000: '4O' } }),
      attendu: [{ ligne: 'aerienne', frequence: 1000 }],
    },
    {
      cas: 'pas de réponse à l’inconfort',
      g: grille({ inconfort: { 1000: 'nr' } }),
      attendu: [{ ligne: 'inconfort', frequence: 1000 }],
    },
    {
      cas: 'pas de réponse au masquage',
      g: grille({ aerienne: { 1000: '40' }, masqueAerienne: { 1000: 'nr' } }),
      attendu: [{ ligne: 'masqueAerienne', frequence: 1000 }],
    },
    {
      cas: 'masquage sans seuil',
      g: grille({ masqueOsseuse: { 2000: '60' } }),
      attendu: [{ ligne: 'masqueOsseuse', frequence: 2000 }],
    },
  ])('$cas', ({ g, attendu }) => {
    expect(cellulesInvalides(g)).toEqual(attendu);
  });
});

describe('aller-retour', () => {
  it.each(['droite', 'gauche'] as const)('%s', (cote) => {
    expect(oreilleDepuisGrille(grilleDepuisOreille(AUDIOGRAMME[cote]))).toEqual(AUDIOGRAMME[cote]);
  });
});
