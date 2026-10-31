import { z } from 'zod';

export const JOURS_SEMAINE = [
  'lundi',
  'mardi',
  'mercredi',
  'jeudi',
  'vendredi',
  'samedi',
  'dimanche',
] as const;
export type JourSemaine = (typeof JOURS_SEMAINE)[number];

export const LIBELLES_JOURS: Readonly<Record<JourSemaine, string>> = {
  lundi: 'Lundi',
  mardi: 'Mardi',
  mercredi: 'Mercredi',
  jeudi: 'Jeudi',
  vendredi: 'Vendredi',
  samedi: 'Samedi',
  dimanche: 'Dimanche',
};

/** Matin et après-midi : deux plages par jour au plus. */
export const PLAGES_PAR_JOUR = 2;

export const heureSchema = z
  .string({ error: 'Heure invalide (HH:MM).' })
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Heure invalide (HH:MM).');

const plageSchema = z
  .object({ debut: heureSchema, fin: heureSchema })
  .refine(({ debut, fin }) => debut < fin, {
    path: ['fin'],
    message: 'La fin doit suivre le début.',
  });

const plagesDuJourSchema = z
  .array(plageSchema)
  .max(PLAGES_PAR_JOUR, `Au plus ${PLAGES_PAR_JOUR} plages par jour.`)
  .refine(
    (plages) =>
      plages.every((plage, i) => {
        const precedente = plages[i - 1];
        return precedente === undefined || precedente.fin <= plage.debut;
      }),
    'Les plages doivent se suivre sans se chevaucher.',
  );

/** Horaires d'ouverture par jour ; un jour sans plage est fermé. Heures locales, Europe/Paris. */
export const horairesOuvertureSchema = z.object({
  lundi: plagesDuJourSchema,
  mardi: plagesDuJourSchema,
  mercredi: plagesDuJourSchema,
  jeudi: plagesDuJourSchema,
  vendredi: plagesDuJourSchema,
  samedi: plagesDuJourSchema,
  dimanche: plagesDuJourSchema,
});
export type HorairesOuverture = z.infer<typeof horairesOuvertureSchema>;

/** Centre sans horaires renseignés : fermé tous les jours. */
export const HORAIRES_VIDES: HorairesOuverture = {
  lundi: [],
  mardi: [],
  mercredi: [],
  jeudi: [],
  vendredi: [],
  samedi: [],
  dimanche: [],
};
