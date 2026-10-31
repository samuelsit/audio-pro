import { describe, expect, it } from 'vitest';

import { meilleurPourcentage, niveauA50Pourcent, vocaleSaisieSchema, type Vocale } from './vocale';

function vocale(partiel: Record<string, unknown> = {}) {
  return {
    contexte: 'CALME',
    typeBruit: null,
    courbes: [
      {
        ecoute: 'DROITE',
        transducteur: 'CASQUE',
        appareille: false,
        liste: 'Lafon',
        points: [
          { niveau: 30, pourcentage: 20 },
          { niveau: 40, pourcentage: 60 },
        ],
      },
    ],
    ...partiel,
  };
}

function points(...valeurs: readonly (readonly [number, number])[]) {
  return valeurs.map(([niveau, pourcentage]) => ({ niveau, pourcentage }));
}

function courbeAvec(valeurs: readonly (readonly [number, number])[]) {
  const [courbe] = vocale().courbes;
  return { courbes: [{ ...courbe, points: points(...valeurs) }] };
}

describe('vocaleSaisieSchema', () => {
  it.each([
    { cas: 'calme', saisie: vocale(), valide: true },
    {
      cas: 'bruit, RSB négatif',
      saisie: vocale({
        contexte: 'BRUIT',
        typeBruit: 'Cocktail party',
        ...courbeAvec([
          [-10, 30],
          [5, 80],
        ]),
      }),
      valide: true,
    },
    { cas: 'pourcentage au-delà de 100', saisie: vocale(courbeAvec([[40, 101]])), valide: false },
    { cas: 'pourcentage négatif', saisie: vocale(courbeAvec([[40, -1]])), valide: false },
    { cas: 'niveau négatif dans le calme', saisie: vocale(courbeAvec([[-5, 10]])), valide: false },
    {
      cas: 'RSB hors plage',
      saisie: vocale({ contexte: 'BRUIT', ...courbeAvec([[40, 10]]) }),
      valide: false,
    },
    {
      cas: 'niveau en double',
      saisie: vocale(
        courbeAvec([
          [40, 10],
          [40, 20],
        ]),
      ),
      valide: false,
    },
    { cas: 'courbe sans point', saisie: vocale(courbeAvec([])), valide: false },
    { cas: 'aucune courbe', saisie: vocale({ courbes: [] }), valide: false },
    { cas: 'bruit dans le calme', saisie: vocale({ typeBruit: 'Blanc' }), valide: false },
  ])('$cas', ({ saisie, valide }) => {
    expect(vocaleSaisieSchema.safeParse(saisie).success).toBe(valide);
  });

  it('retourne un Vocale normalisé', () => {
    const lu: Vocale = vocaleSaisieSchema.parse(vocale({ typeBruit: '  ' }));
    expect(lu.typeBruit).toBeNull();
  });
});

describe('meilleurPourcentage', () => {
  it('prend le maximum, même sur une courbe en cloche', () => {
    expect(meilleurPourcentage(points([40, 40], [60, 90], [80, 70]))).toBe(90);
  });
});

describe('niveauA50Pourcent', () => {
  it.each([
    { cas: 'interpolation', courbe: points([30, 20], [40, 60]), attendu: 37.5 },
    { cas: 'point à 50 % exactement', courbe: points([30, 20], [40, 50]), attendu: 40 },
    { cas: 'points en désordre', courbe: points([40, 60], [30, 20]), attendu: 37.5 },
    { cas: 'jamais atteint', courbe: points([30, 10], [40, 40]), attendu: null },
    { cas: 'déjà dépassé au premier point', courbe: points([30, 70], [40, 90]), attendu: null },
    { cas: 'RSB négatif', courbe: points([-10, 0], [0, 100]), attendu: -5 },
  ])('$cas', ({ courbe, attendu }) => {
    expect(niveauA50Pourcent(courbe)).toBe(attendu);
  });
});
