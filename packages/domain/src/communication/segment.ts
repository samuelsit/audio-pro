import { z } from 'zod';

import { CLASSES_LPP } from '../catalogue/catalogue';
import { entierEntre } from '../commandes/parametres';
import { ajouterJours, ajouterMois, dateCalendaireSchema } from '../commun/date';
import { texteObligatoire } from '../commun/texte';
import { STATUTS_DOSSIER } from '../dossier/etats';
import { CANAUX_MESSAGE } from './catalogue';

const dateOptionnelle = dateCalendaireSchema.nullish().transform((v) => v ?? null);
const ageOptionnel = entierEntre(0, 130)
  .nullish()
  .transform((v) => v ?? null);

export const segmentSchema = z
  .object({
    centreIds: z.array(z.uuid()).min(1, 'Choisir au moins un centre.'),
    ageMin: ageOptionnel,
    ageMax: ageOptionnel,
    appareilleDepuis: dateOptionnelle,
    appareilleJusquAu: dateOptionnelle,
    /** À VÉRIFIER : la classe vient de l'appareil vendu ; sa reprise Cosium peut manquer (R60). */
    classes: z.array(z.enum(CLASSES_LPP)).default([]),
    statutsDossier: z.array(z.enum(STATUTS_DOSSIER)).default([]),
  })
  .refine((s) => s.ageMin === null || s.ageMax === null || s.ageMin <= s.ageMax, {
    error: 'L’âge minimum dépasse l’âge maximum.',
    path: ['ageMax'],
  })
  .refine(
    (s) =>
      s.appareilleDepuis === null ||
      s.appareilleJusquAu === null ||
      s.appareilleDepuis <= s.appareilleJusquAu,
    { error: 'La période d’appareillage est inversée.', path: ['appareilleJusquAu'] },
  );
export type Segment = z.output<typeof segmentSchema>;

export interface BornesNaissance {
  readonly neAuPlusTot: string | null;
  readonly neAuPlusTard: string | null;
}

/** Dates de naissance d'une tranche d'âge : avoir 80 ans au plus, c'est ne pas en avoir encore 81. */
export function bornesNaissance(
  { ageMin, ageMax }: Pick<Segment, 'ageMin' | 'ageMax'>,
  jour: string,
): BornesNaissance {
  return {
    neAuPlusTot: ageMax === null ? null : ajouterJours(ajouterMois(jour, -(ageMax + 1) * 12), 1),
    neAuPlusTard: ageMin === null ? null : ajouterMois(jour, -ageMin * 12),
  };
}

export const campagneSaisieSchema = z.object({
  nom: texteObligatoire('Nommer cette campagne.'),
  modeleId: z.uuid('Choisir un modèle.'),
  canal: z.enum(CANAUX_MESSAGE, { error: 'Choisir un canal.' }),
  segment: segmentSchema,
  /** Instant ISO 8601. Absent : à lancer maintenant. */
  programmeeLe: z.iso
    .datetime({ offset: true, error: 'Date invalide.' })
    .nullish()
    .transform((v) => v ?? null),
});
export type CampagneSaisie = z.output<typeof campagneSaisieSchema>;

export const comptesRendusSaisieSchema = z
  .object({
    centreId: z.uuid('Choisir un centre.'),
    du: dateCalendaireSchema,
    au: dateCalendaireSchema,
  })
  .refine((s) => s.du <= s.au, { error: 'La période est inversée.', path: ['au'] });
