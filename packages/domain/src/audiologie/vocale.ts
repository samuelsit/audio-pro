import { z } from 'zod';

import { texteOptionnelSchema } from '../commun/texte';

export const CONTEXTES_VOCALE = ['CALME', 'BRUIT'] as const;
export type ContexteVocale = (typeof CONTEXTES_VOCALE)[number];

export const ECOUTES_VOCALE = ['DROITE', 'GAUCHE', 'BINAURALE'] as const;
export type EcouteVocale = (typeof ECOUTES_VOCALE)[number];

export const LIBELLES_ECOUTES_VOCALE: Readonly<Record<EcouteVocale, string>> = {
  DROITE: 'Oreille droite',
  GAUCHE: 'Oreille gauche',
  BINAURALE: 'Binaural',
};

export const TRANSDUCTEURS_VOCALE = ['CASQUE', 'CHAMP_LIBRE'] as const;
export type TransducteurVocale = (typeof TRANSDUCTEURS_VOCALE)[number];

export const LIBELLES_TRANSDUCTEURS_VOCALE: Readonly<Record<TransducteurVocale, string>> = {
  CASQUE: 'Casque',
  CHAMP_LIBRE: 'Champ libre',
};

/** Abscisse d'une courbe : intensité dans le calme, rapport signal sur bruit dans le bruit. */
export const PLAGES_VOCALE: Readonly<
  Record<ContexteVocale, { readonly min: number; readonly max: number; readonly axe: string }>
> = {
  CALME: { min: 0, max: 120, axe: 'Intensité (dB)' },
  BRUIT: { min: -30, max: 30, axe: 'Rapport signal sur bruit (dB)' },
};

const pointVocaleSchema = z.object({
  niveau: z.number({ error: 'Saisir un niveau en dB.' }).int('Saisir un nombre entier de dB.'),
  pourcentage: z
    .number({ error: 'Saisir un pourcentage.' })
    .min(0, 'Le pourcentage va de 0 à 100.')
    .max(100, 'Le pourcentage va de 0 à 100.'),
});
export type PointVocale = z.output<typeof pointVocaleSchema>;

const courbeVocaleSchema = z
  .object({
    ecoute: z.enum(ECOUTES_VOCALE, { error: 'Choisir l’oreille testée.' }),
    transducteur: z.enum(TRANSDUCTEURS_VOCALE, { error: 'Choisir le mode d’écoute.' }),
    appareille: z.boolean(),
    liste: texteOptionnelSchema.pipe(z.string().max(120, '120 caractères au maximum.').nullable()),
    points: z.array(pointVocaleSchema).min(1, 'Saisir au moins un point.'),
  })
  .refine(({ points }) => new Set(points.map((p) => p.niveau)).size === points.length, {
    path: ['points'],
    message: 'Un niveau ne se saisit qu’une fois par courbe.',
  });
export type CourbeVocale = z.output<typeof courbeVocaleSchema>;

export const vocaleSaisieSchema = z
  .object({
    contexte: z.enum(CONTEXTES_VOCALE, { error: 'Contexte inconnu.' }),
    typeBruit: texteOptionnelSchema.pipe(
      z.string().max(120, '120 caractères au maximum.').nullable(),
    ),
    courbes: z.array(courbeVocaleSchema).min(1, 'Saisir au moins une courbe.'),
  })
  .superRefine(({ contexte, typeBruit, courbes }, ctx) => {
    const { min, max } = PLAGES_VOCALE[contexte];
    courbes.forEach(({ points }, c) => {
      points.forEach(({ niveau }, p) => {
        if (niveau < min || niveau > max) {
          ctx.addIssue({
            code: 'custom',
            path: ['courbes', c, 'points', p, 'niveau'],
            message: `Le niveau va de ${String(min)} à ${String(max)} dB.`,
          });
        }
      });
    });
    if (contexte === 'CALME' && typeBruit !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['typeBruit'],
        message: 'Aucun bruit dans le calme.',
      });
    }
  });
export type Vocale = z.output<typeof vocaleSaisieSchema>;

export function pointsTries(points: readonly PointVocale[]): PointVocale[] {
  return [...points].sort((a, b) => a.niveau - b.niveau);
}

export function meilleurPourcentage(points: readonly PointVocale[]): number {
  return Math.max(...points.map((p) => p.pourcentage));
}

const POURCENTAGE_REPERE = 50;

/**
 * Niveau où la courbe atteint 50 % pour la première fois, par interpolation linéaire entre deux points.
 * `null` si la courbe part au-dessus de 50 % ou ne l'atteint pas. Calcul d'affichage, sans portée réglementaire.
 */
export function niveauA50Pourcent(points: readonly PointVocale[]): number | null {
  const tries = pointsTries(points);
  const indice = tries.findIndex((p) => p.pourcentage >= POURCENTAGE_REPERE);
  const haut = tries[indice];
  if (haut === undefined) {
    return null;
  }
  if (haut.pourcentage === POURCENTAGE_REPERE) {
    return haut.niveau;
  }
  const bas = tries[indice - 1];
  if (bas === undefined) {
    return null;
  }
  const part = (POURCENTAGE_REPERE - bas.pourcentage) / (haut.pourcentage - bas.pourcentage);
  return bas.niveau + part * (haut.niveau - bas.niveau);
}
