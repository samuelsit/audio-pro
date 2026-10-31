import { describe, expect, it } from 'vitest';

import { STATUTS_APPAREIL } from './etats';
import { appareilValorise, valeurStock } from './valeur';

describe('appareilValorise', () => {
  it.each(STATUTS_APPAREIL)('%s', (statut) => {
    const attendu = statut !== 'VENDU' && statut !== 'RETOUR_FABRICANT';
    expect(appareilValorise(statut, false)).toBe(attendu);
    expect(appareilValorise(statut, true)).toBe(false);
  });
});

describe('valeurStock', () => {
  it.each([
    { articles: [], valeurCentimes: 0, articlesSansPrix: 0 },
    {
      articles: [{ quantite: 1, prixAchatCentimes: 65000 }],
      valeurCentimes: 65000,
      articlesSansPrix: 0,
    },
    {
      articles: [
        { quantite: 3, prixAchatCentimes: 250 },
        { quantite: 2, prixAchatCentimes: 1000 },
      ],
      valeurCentimes: 2750,
      articlesSansPrix: 0,
    },
    {
      articles: [
        { quantite: 1, prixAchatCentimes: 65000 },
        { quantite: 4, prixAchatCentimes: null },
      ],
      valeurCentimes: 65000,
      articlesSansPrix: 4,
    },
    {
      articles: [{ quantite: 2, prixAchatCentimes: 0 }],
      valeurCentimes: 0,
      articlesSansPrix: 0,
    },
  ])('$valeurCentimes centimes, $articlesSansPrix sans prix', (cas) => {
    expect(valeurStock(cas.articles)).toEqual({
      valeurCentimes: cas.valeurCentimes,
      articlesSansPrix: cas.articlesSansPrix,
    });
  });
});
