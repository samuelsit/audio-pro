import { describe, expect, it } from 'vitest';

import { audiogrammeSaisieSchema, avertissementsAudiogramme } from './audiogramme';
import { AUDIOGRAMME, oreille, point } from './fixtures.test-support';

describe('audiogrammeSaisieSchema', () => {
  it('accepte un audiogramme complet', () => {
    expect(audiogrammeSaisieSchema.parse(AUDIOGRAMME)).toEqual(AUDIOGRAMME);
  });

  it.each([
    { cas: '−10 dB', seuil: -10, valide: true },
    { cas: '0 dB', seuil: 0, valide: true },
    { cas: '120 dB', seuil: 120, valide: true },
    { cas: 'pas de réponse', seuil: null, valide: true },
    { cas: 'sous le minimum', seuil: -15, valide: false },
    { cas: 'au-dessus du maximum', seuil: 125, valide: false },
    { cas: 'hors pas de 5 dB', seuil: 33, valide: false },
    { cas: 'décimal', seuil: 22.5, valide: false },
  ])('seuil : $cas', ({ seuil, valide }) => {
    const saisie = { droite: oreille({ aerienne: [point(1000, seuil)] }), gauche: oreille() };
    expect(audiogrammeSaisieSchema.safeParse(saisie).success).toBe(valide);
  });

  it('refuse une fréquence hors grille', () => {
    const saisie = {
      droite: { ...oreille(), aerienne: [{ frequence: 900, seuil: 20, masque: null }] },
      gauche: oreille(),
    };
    expect(audiogrammeSaisieSchema.safeParse(saisie).success).toBe(false);
  });

  it('refuse un audiogramme vide', () => {
    const resultat = audiogrammeSaisieSchema.safeParse({ droite: oreille(), gauche: oreille() });
    expect(resultat.error?.issues[0]?.message).toBe('Saisir au moins un seuil.');
  });

  it.each(['aerienne', 'osseuse'] as const)('refuse une fréquence saisie deux fois (%s)', (c) => {
    const saisie = {
      droite: oreille({ [c]: [point(1000, 20), point(1000, 30)] }),
      gauche: oreille(),
    };
    const resultat = audiogrammeSaisieSchema.safeParse(saisie);
    expect(resultat.error?.issues[0]?.message).toBe('Une fréquence ne se saisit qu’une fois.');
  });

  it.each([
    { cas: 'au-dessus du seuil', aerien: 40, inconfort: 95, valide: true },
    { cas: 'égal au seuil', aerien: 40, inconfort: 40, valide: false },
    { cas: 'sous le seuil', aerien: 40, inconfort: 35, valide: false },
    { cas: 'sans réponse en aérienne', aerien: null, inconfort: 100, valide: false },
  ])('inconfort : $cas', ({ aerien, inconfort, valide }) => {
    const saisie = {
      droite: oreille({
        aerienne: [point(1000, aerien)],
        inconfort: [{ frequence: 1000, seuil: inconfort }],
      }),
      gauche: oreille(),
    };
    expect(audiogrammeSaisieSchema.safeParse(saisie).success).toBe(valide);
  });

  it('accepte un seuil d’inconfort sans aérienne à cette fréquence', () => {
    const saisie = {
      droite: oreille({ inconfort: [{ frequence: 1000, seuil: 90 }] }),
      gauche: oreille(),
    };
    expect(audiogrammeSaisieSchema.safeParse(saisie).success).toBe(true);
  });
});

describe('avertissementsAudiogramme', () => {
  it.each([
    { cas: 'osseuse meilleure', osseux: 20, attendu: 0 },
    { cas: 'écart de 10 dB toléré', osseux: 40, attendu: 0 },
    { cas: 'écart de 15 dB', osseux: 45, attendu: 1 },
    { cas: 'sans réponse', osseux: null, attendu: 0 },
  ])('$cas', ({ osseux, attendu }) => {
    const courbes = oreille({ aerienne: [point(1000, 30)], osseuse: [point(1000, osseux)] });
    expect(avertissementsAudiogramme({ droite: courbes, gauche: oreille() })).toHaveLength(attendu);
  });

  it('ignore une osseuse sans aérienne et nomme l’oreille', () => {
    const avertissements = avertissementsAudiogramme({
      droite: oreille({ osseuse: [point(1000, 60)] }),
      gauche: oreille({ aerienne: [point(500, 10)], osseuse: [point(500, 30)] }),
    });
    expect(avertissements).toEqual([
      'Oreille gauche, 500 Hz : conduction osseuse moins bonne que l’aérienne de plus de 10 dB.',
    ]);
  });
});
