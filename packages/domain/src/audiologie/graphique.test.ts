import { describe, expect, it } from 'vitest';

import { AUDIOGRAMME, oreille, point } from './fixtures.test-support';
import {
  COULEURS_OREILLES,
  rendreAudiogrammeSvg,
  rendreEvolutionSvg,
  rendreLegendeAudiogrammeSvg,
  rendreVocaleSvg,
} from './graphique';
import type { Vocale } from './vocale';

const VOCALE_CALME: Vocale = {
  contexte: 'CALME',
  typeBruit: null,
  courbes: [
    {
      ecoute: 'DROITE',
      transducteur: 'CASQUE',
      appareille: false,
      liste: 'Lafon',
      points: [
        { niveau: 60, pourcentage: 80 },
        { niveau: 40, pourcentage: 30 },
        { niveau: 80, pourcentage: 100 },
      ],
    },
    {
      ecoute: 'BINAURALE',
      transducteur: 'CHAMP_LIBRE',
      appareille: true,
      liste: null,
      points: [
        { niveau: 30, pourcentage: 30 },
        { niveau: 50, pourcentage: 90 },
      ],
    },
  ],
};

const VOCALE_BRUIT: Vocale = {
  contexte: 'BRUIT',
  typeBruit: 'Cocktail party',
  courbes: [
    {
      ecoute: 'GAUCHE',
      transducteur: 'CHAMP_LIBRE',
      appareille: false,
      liste: null,
      points: [
        { niveau: -10, pourcentage: 20 },
        { niveau: 10, pourcentage: 75 },
      ],
    },
  ],
};

const serie = (cote: 'droite' | 'gauche') => ({
  libelle: '02/11/2026',
  courbes: AUDIOGRAMME[cote],
});

describe('rendreAudiogrammeSvg', () => {
  it('oreille droite (instantané)', async () => {
    await expect(rendreAudiogrammeSvg('DROITE', serie('droite'))).toMatchFileSnapshot(
      '__snapshots__/audiogramme-droite.svg',
    );
  });

  it('oreille gauche (instantané)', async () => {
    await expect(rendreAudiogrammeSvg('GAUCHE', serie('gauche'))).toMatchFileSnapshot(
      '__snapshots__/audiogramme-gauche.svg',
    );
  });

  it('deux audiogrammes superposés (instantané)', async () => {
    const ancien = {
      libelle: '10/03/2024',
      courbes: oreille({ aerienne: [point(500, 15), point(1000, 20), point(2000, 25)] }),
    };
    await expect(rendreAudiogrammeSvg('DROITE', serie('droite'), ancien)).toMatchFileSnapshot(
      '__snapshots__/audiogramme-superpose.svg',
    );
  });

  it.each([
    { cote: 'DROITE', couleur: COULEURS_OREILLES.DROITE, autre: COULEURS_OREILLES.GAUCHE },
    { cote: 'GAUCHE', couleur: COULEURS_OREILLES.GAUCHE, autre: COULEURS_OREILLES.DROITE },
  ] as const)('$cote : une seule couleur', ({ cote, couleur, autre }) => {
    const svg = rendreAudiogrammeSvg(cote, { libelle: 'x', courbes: AUDIOGRAMME.droite });
    expect(svg).toContain(couleur);
    expect(svg).not.toContain(autre);
  });

  it('relie les points mesurés, sans passer par une absence de réponse', () => {
    const courbes = oreille({ aerienne: [point(1000, 40), point(2000, null), point(500, 30)] });
    const svg = rendreAudiogrammeSvg('DROITE', { libelle: 'x', courbes });
    expect(
      svg.match(/<polyline points="([^"]+)" fill="none" stroke/)?.[1]?.split(' '),
    ).toHaveLength(2);
  });

  it('ne trace aucune ligne pour un point isolé', () => {
    const courbes = oreille({ aerienne: [point(1000, 40)] });
    expect(rendreAudiogrammeSvg('DROITE', { libelle: 'x', courbes })).not.toContain('<polyline');
  });

  it('échappe les libellés de la légende', () => {
    const svg = rendreAudiogrammeSvg(
      'DROITE',
      { libelle: '<b>', courbes: oreille() },
      { libelle: 'a&b', courbes: oreille() },
    );
    expect(svg).toContain('&lt;b&gt;');
    expect(svg).toContain('a&amp;b');
  });
});

describe('légende', () => {
  it('symboles (instantané)', async () => {
    await expect(rendreLegendeAudiogrammeSvg()).toMatchFileSnapshot(
      '__snapshots__/legende-audiogramme.svg',
    );
  });
});

describe('rendreVocaleSvg', () => {
  it('calme (instantané)', async () => {
    await expect(rendreVocaleSvg(VOCALE_CALME)).toMatchFileSnapshot(
      '__snapshots__/vocale-calme.svg',
    );
  });

  it('bruit (instantané)', async () => {
    await expect(rendreVocaleSvg(VOCALE_BRUIT)).toMatchFileSnapshot(
      '__snapshots__/vocale-bruit.svg',
    );
  });
});

describe('rendreEvolutionSvg', () => {
  it('plusieurs bilans, valeur manquante (instantané)', async () => {
    await expect(
      rendreEvolutionSvg([
        { date: '2022-03-10', droite: 30, gauche: 35 },
        { date: '2024-06-01', droite: 37.5, gauche: null },
        { date: '2026-11-02', droite: 41.25, gauche: 45 },
      ]),
    ).toMatchFileSnapshot('__snapshots__/evolution.svg');
  });

  it('un seul bilan : centré', () => {
    const svg = rendreEvolutionSvg([{ date: '2026-11-02', droite: 30, gauche: 35 }]);
    expect(svg).toContain('cx="292"');
    expect(svg).toContain('text-anchor="middle">02/11/2026');
  });

  it('sans bilan : axes seuls', () => {
    expect(rendreEvolutionSvg([])).not.toContain('<circle');
  });
});
