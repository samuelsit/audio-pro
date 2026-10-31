import { describe, expect, it } from 'vitest';

import { aerienne, oreille, point } from './fixtures.test-support';
import {
  ecartSurFrequencesConsecutives,
  gradeAudiometrique,
  GRADES_AUDIOMETRIQUES,
  LIBELLES_GRADES,
  perteGlobaleAsymetrique,
  syntheseTonale,
} from './grade';

describe('gradeAudiometrique', () => {
  it.each([
    { perte: -10, grade: 0 },
    { perte: 0, grade: 0 },
    { perte: 19.9, grade: 0 },
    { perte: 20, grade: 1 },
    { perte: 34.9, grade: 1 },
    { perte: 35, grade: 2 },
    { perte: 49.9, grade: 2 },
    { perte: 50, grade: 3 },
    { perte: 64.9, grade: 3 },
    { perte: 65, grade: 4 },
    { perte: 79.9, grade: 4 },
    { perte: 80, grade: 5 },
    { perte: 94.9, grade: 5 },
    { perte: 95, grade: 6 },
    { perte: 120, grade: 6 },
  ])('$perte dB HL : grade $grade', ({ perte, grade }) => {
    expect(gradeAudiometrique(perte)).toBe(grade);
  });

  it('n’arrondit pas avant de classer', () => {
    expect(gradeAudiometrique(19.75)).toBe(0);
  });

  it.each(GRADES_AUDIOMETRIQUES)('le grade %i a un libellé', (grade) => {
    expect(LIBELLES_GRADES[grade]).not.toBe('');
  });
});

describe('perteGlobaleAsymetrique', () => {
  it.each([
    { meilleure: 30, moinsBonne: 70, attendu: 42 },
    { meilleure: 0, moinsBonne: 100, attendu: 30 },
    { meilleure: 40, moinsBonne: 40, attendu: 40 },
  ])('$meilleure et $moinsBonne', ({ meilleure, moinsBonne, attendu }) => {
    expect(perteGlobaleAsymetrique(meilleure, moinsBonne)).toBe(attendu);
  });
});

describe('ecartSurFrequencesConsecutives', () => {
  const droite = oreille({
    aerienne: [point(500, 20), point(1000, 20), point(2000, 20), point(4000, 20), point(8000, 20)],
  });

  it.each([
    {
      cas: 'trois fréquences consécutives',
      gauche: [point(500, 40), point(1000, 40), point(2000, 40), point(4000, 20)],
      attendu: true,
    },
    {
      cas: 'deux seulement',
      gauche: [point(500, 40), point(1000, 40), point(2000, 20), point(4000, 40)],
      attendu: false,
    },
    {
      cas: 'exactement 15 dB ne compte pas',
      gauche: [point(500, 35), point(1000, 35), point(2000, 35)],
      attendu: false,
    },
    {
      cas: 'une fréquence non mesurée n’interrompt pas la suite',
      gauche: [point(500, 40), point(1000, 40), point(2000, 40)],
      attendu: true,
    },
    {
      cas: 'pas de réponse compté 120 dB',
      gauche: [point(500, null), point(1000, null), point(2000, null)],
      attendu: true,
    },
    {
      cas: 'fréquence absente à droite ignorée',
      gauche: [point(250, 90), point(500, 20), point(1000, 20)],
      attendu: false,
    },
  ])('$cas', ({ gauche, attendu }) => {
    expect(ecartSurFrequencesConsecutives(droite, oreille({ aerienne: gauche }))).toBe(attendu);
  });
});

describe('syntheseTonale', () => {
  it('perte symétrique : pas de grade global', () => {
    const synthese = syntheseTonale({
      droite: oreille({ aerienne: aerienne(30, 40, 50, 60) }),
      gauche: oreille({ aerienne: aerienne(35, 40, 50, 60) }),
    });
    expect(synthese).toEqual({
      droite: { perteMoyenne: 45, grade: 2 },
      gauche: { perteMoyenne: 46.25, grade: 2 },
      asymetrique: false,
      unilaterale: false,
      meilleureOreille: 'DROITE',
      global: null,
    });
  });

  it('asymétrie par la moyenne : grade global pondéré 7/3', () => {
    const synthese = syntheseTonale({
      droite: oreille({ aerienne: aerienne(70, 70, 70, 70) }),
      gauche: oreille({ aerienne: aerienne(30, 30, 30, 30) }),
    });
    expect(synthese.asymetrique).toBe(true);
    expect(synthese.meilleureOreille).toBe('GAUCHE');
    expect(synthese.global).toEqual({ perteMoyenne: 42, grade: 2 });
  });

  it('écart de 15 dB exactement : pas d’asymétrie', () => {
    const synthese = syntheseTonale({
      droite: oreille({ aerienne: aerienne(30, 30, 30, 30) }),
      gauche: oreille({ aerienne: aerienne(45, 45, 45, 45) }),
    });
    expect(synthese.asymetrique).toBe(false);
    expect(synthese.global).toBeNull();
  });

  it('asymétrie par trois fréquences, moyennes proches', () => {
    const synthese = syntheseTonale({
      droite: oreille({ aerienne: aerienne(20, 20, 20, 80) }),
      gauche: oreille({ aerienne: aerienne(40, 40, 40, 20) }),
    });
    expect(synthese.asymetrique).toBe(true);
    expect(synthese.global).not.toBeNull();
  });

  it('perte unilatérale', () => {
    const synthese = syntheseTonale({
      droite: oreille({ aerienne: aerienne(10, 10, 15, 15) }),
      gauche: oreille({ aerienne: aerienne(60, 60, 60, 60) }),
    });
    expect(synthese.unilaterale).toBe(true);
    expect(synthese.asymetrique).toBe(true);
  });

  it('meilleure oreille indéterminée à égalité', () => {
    const courbes = oreille({ aerienne: aerienne(30, 30, 30, 30) });
    expect(syntheseTonale({ droite: courbes, gauche: courbes }).meilleureOreille).toBeNull();
  });

  it('une oreille non calculable : pas de grade global, l’autre reste gradée', () => {
    const synthese = syntheseTonale({
      droite: oreille({ aerienne: aerienne(30, 30, 30, 30) }),
      gauche: oreille({ aerienne: [point(500, 90)] }),
    });
    expect(synthese).toEqual({
      droite: { perteMoyenne: 30, grade: 1 },
      gauche: { perteMoyenne: null, grade: null },
      asymetrique: false,
      unilaterale: false,
      meilleureOreille: null,
      global: null,
    });
  });

  it('droite non calculable aussi', () => {
    const synthese = syntheseTonale({
      droite: oreille(),
      gauche: oreille({ aerienne: aerienne(30, 30, 30, 30) }),
    });
    expect(synthese.droite.grade).toBeNull();
    expect(synthese.gauche.grade).toBe(1);
  });
});
