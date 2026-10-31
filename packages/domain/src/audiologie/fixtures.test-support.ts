import type { Audiogramme, OreilleAudiogramme, PointAudiogramme } from './audiogramme';
import type { FrequenceAudiogramme } from './frequences';

export function point(
  frequence: FrequenceAudiogramme,
  seuil: number | null,
  masque: number | null = null,
): PointAudiogramme {
  return { frequence, seuil, masque };
}

/** Courbe aérienne aux quatre fréquences de la perte moyenne. */
export function aerienne(a: number | null, b: number | null, c: number | null, d: number | null) {
  return [point(500, a), point(1000, b), point(2000, c), point(4000, d)];
}

export function oreille(partiel: Partial<OreilleAudiogramme> = {}): OreilleAudiogramme {
  return { aerienne: [], osseuse: [], inconfort: [], ...partiel };
}

/** Audiogramme fictif : presbyacousie symétrique discrète, masquage et absence de réponse. */
export const AUDIOGRAMME: Audiogramme = {
  droite: oreille({
    aerienne: [
      point(250, 20),
      point(500, 25),
      point(1000, 35),
      point(2000, 45),
      point(4000, 60, 70),
      point(8000, null),
    ],
    osseuse: [point(500, 20), point(1000, 30, 50), point(2000, null)],
    inconfort: [point(1000, 100), point(2000, 105)].map(({ frequence, seuil }) => ({
      frequence,
      seuil: seuil ?? 0,
    })),
  }),
  gauche: oreille({
    aerienne: [
      point(250, 15),
      point(500, 20, 60),
      point(1000, 30),
      point(2000, 40),
      point(4000, 55),
    ],
    osseuse: [point(500, 15, 50), point(1000, 25), point(4000, null, 80)],
    inconfort: [{ frequence: 1000, seuil: 95 }],
  }),
};
