import { z } from 'zod';

import { LIBELLES_OREILLES, type Oreille } from '../audio-rules/code-prestation';
import { FREQUENCES_AUDIOGRAMME, type FrequenceAudiogramme } from './frequences';

export const NIVEAU_MIN_DB = -10;
export const NIVEAU_MAX_DB = 120;
export const PAS_NIVEAU_DB = 5;

/** Une conduction osseuse moins bonne que l'aérienne au-delà de cet écart signale une erreur probable. */
export const ECART_OSSEUX_SUSPECT_DB = 10;

/**
 * À VÉRIFIER : bornes et pas d'usage courant, absents de docs/ref (R25).
 */
const niveauSchema = z
  .number({ error: 'Saisir un niveau en dB.' })
  .int('Saisir un nombre entier de dB.')
  .min(NIVEAU_MIN_DB, `${String(NIVEAU_MIN_DB)} dB au minimum.`)
  .max(NIVEAU_MAX_DB, `${String(NIVEAU_MAX_DB)} dB au maximum.`)
  .refine(
    (valeur) => valeur % PAS_NIVEAU_DB === 0,
    `Saisir un multiple de ${String(PAS_NIVEAU_DB)} dB.`,
  );

const frequenceSchema = z.literal(FREQUENCES_AUDIOGRAMME, { error: 'Fréquence inconnue.' });

const pointSchema = z.object({
  frequence: frequenceSchema,
  /** `null` : pas de réponse. */
  seuil: niveauSchema.nullable(),
  /** Niveau de masquage controlatéral ; `null` : sans masquage. */
  masque: niveauSchema.nullable(),
});
export type PointAudiogramme = z.output<typeof pointSchema>;

const pointInconfortSchema = z.object({ frequence: frequenceSchema, seuil: niveauSchema });
export type PointInconfort = z.output<typeof pointInconfortSchema>;

function doublon(points: readonly { readonly frequence: FrequenceAudiogramme }[]): number {
  const vues = new Set<number>();
  return points.findIndex(({ frequence }) => {
    const deja = vues.has(frequence);
    vues.add(frequence);
    return deja;
  });
}

export const oreilleAudiogrammeSchema = z
  .object({
    aerienne: z.array(pointSchema),
    osseuse: z.array(pointSchema),
    inconfort: z.array(pointInconfortSchema),
  })
  .superRefine(({ aerienne, osseuse, inconfort }, ctx) => {
    for (const [champ, points] of Object.entries({ aerienne, osseuse, inconfort })) {
      const indice = doublon(points);
      if (indice >= 0) {
        ctx.addIssue({
          code: 'custom',
          path: [champ, indice, 'frequence'],
          message: 'Une fréquence ne se saisit qu’une fois.',
        });
      }
    }
    inconfort.forEach(({ frequence, seuil }, indice) => {
      const point = aerienne.find((p) => p.frequence === frequence);
      if (point !== undefined && (point.seuil === null || seuil <= point.seuil)) {
        ctx.addIssue({
          code: 'custom',
          path: ['inconfort', indice, 'seuil'],
          message: `${String(frequence)} Hz : le seuil d’inconfort doit dépasser le seuil en conduction aérienne.`,
        });
      }
    });
  });
export type OreilleAudiogramme = z.output<typeof oreilleAudiogrammeSchema>;

/** Toujours sans appareil : le grade ne vaut que dans ces conditions (biap-rec-02-2-en.pdf p. 2). */
export const audiogrammeSaisieSchema = z
  .object({ droite: oreilleAudiogrammeSchema, gauche: oreilleAudiogrammeSchema })
  .refine(
    ({ droite, gauche }) =>
      [droite, gauche].some((o) => o.aerienne.length + o.osseuse.length + o.inconfort.length > 0),
    'Saisir au moins un seuil.',
  );
export type Audiogramme = z.output<typeof audiogrammeSaisieSchema>;

export const OREILLE_VIDE: OreilleAudiogramme = { aerienne: [], osseuse: [], inconfort: [] };

function ecartsSuspects(oreille: Oreille, courbes: OreilleAudiogramme): string[] {
  const messages: string[] = [];
  for (const { frequence, seuil } of courbes.osseuse) {
    const aerien = courbes.aerienne.find((p) => p.frequence === frequence)?.seuil ?? null;
    if (seuil !== null && aerien !== null && seuil - aerien > ECART_OSSEUX_SUSPECT_DB) {
      messages.push(
        `${LIBELLES_OREILLES[oreille]}, ${String(frequence)} Hz : conduction osseuse moins bonne que l’aérienne de plus de ${String(ECART_OSSEUX_SUSPECT_DB)} dB.`,
      );
    }
  }
  return messages;
}

/** Valeurs plausibles mais à relire : elles avertissent sans bloquer l'enregistrement. */
export function avertissementsAudiogramme(audiogramme: Audiogramme): string[] {
  return [
    ...ecartsSuspects('DROITE', audiogramme.droite),
    ...ecartsSuspects('GAUCHE', audiogramme.gauche),
  ];
}
