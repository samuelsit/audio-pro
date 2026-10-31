import { z } from 'zod';

import { emailSchema } from '../acces/utilisateur';
import { dateCalendaireSchema } from '../commun/date';
import { texteObligatoire, texteOptionnelSchema } from '../commun/texte';
import { dateSaisieSchema } from '../patient/recherche';
import { telephoneMobileSchema } from '../patient/telephone';
import { VALIDATIONS_RESERVATION } from './modification';
import { slugSchema } from './slug';

/** Durée de tenue d'un créneau pendant la saisie. Réglage produit, pas une règle réglementaire. */
export const DUREE_VERROU_MINUTES = 15;
export const LONGUEUR_CODE_SMS = 6;
export const TENTATIVES_CODE_MAX = 5;
export const ENVOIS_CODE_MAX = 3;
/** Réservation possible jusqu'à un an : au-delà, une date d'agenda n'a pas de sens pour un patient. */
const HORIZON_MAX_JOURS = 365;
const DELAI_MAX_MINUTES = 60 * 24 * 60;
const DELAI_MAX_HEURES = 60 * 24;

export const PARAMETRES_RESERVATION_DEFAUT = {
  actif: false,
  delaiMinimalMinutes: 1440,
  horizonJours: 60,
  validation: 'AUTOMATIQUE',
  delaiModificationHeures: 24,
} as const;

// À VÉRIFIER : texte du consentement et mentions d'information absents de docs/ref, à faire relire par le
// responsable de traitement. Toute révision du texte change `VERSION_CONSENTEMENT`, conservée avec la preuve.
export const VERSION_CONSENTEMENT = '2026-11';
export const TEXTE_CONSENTEMENT_RGPD =
  'J’accepte que mes données soient utilisées par ce centre pour gérer ce rendez-vous.';
export const TEXTE_CONSENTEMENT_SMS = 'J’accepte de recevoir des rappels de rendez-vous par SMS.';

const identifiant = (message: string) => z.string({ error: message }).min(1, message);

/** Types, praticien et jours consultés sur la page publique. */
export const lectureCreneauxSchema = z.object({
  typeRdvId: identifiant('Choisir le type de rendez-vous.'),
  praticienId: texteOptionnelSchema,
  depuis: dateCalendaireSchema,
});

export const choixCreneauSchema = z.object({
  typeRdvId: identifiant('Choisir le type de rendez-vous.'),
  /** `null` : peu importe. */
  praticienId: texteOptionnelSchema,
  debut: z.coerce.number({ error: 'Choisir un créneau.' }).int('Choisir un créneau.').positive(),
  captcha: identifiant('Validez la vérification anti-robot.'),
});

export const coordonneesReservationSchema = z.object({
  nom: texteObligatoire('Le nom est obligatoire.', 100),
  prenom: texteObligatoire('Le prénom est obligatoire.', 100),
  dateNaissance: z
    .string({ error: 'La date de naissance est obligatoire.' })
    .trim()
    .min(1, { error: 'La date de naissance est obligatoire.', abort: true })
    .pipe(dateSaisieSchema),
  telephone: telephoneMobileSchema,
  email: texteOptionnelSchema.pipe(emailSchema.nullable()),
  motif: texteOptionnelSchema.pipe(z.string().max(500, '500 caractères au maximum.').nullable()),
  consentementRgpd: z.literal(true, { error: 'Votre accord est nécessaire pour réserver.' }),
  consentementSms: z.boolean(),
});
export type CoordonneesReservation = z.output<typeof coordonneesReservationSchema>;

export const codeSmsSchema = z
  .string({ error: 'Saisir le code reçu par SMS.' })
  .trim()
  .regex(new RegExp(`^\\d{${String(LONGUEUR_CODE_SMS)}}$`), 'Saisir le code à 6 chiffres.');

export const parametresReservationSchema = z.object({
  actif: z.boolean(),
  delaiMinimalMinutes: z.coerce
    .number({ error: 'Saisir le délai minimal.' })
    .int('Saisir un délai en minutes.')
    .min(0, 'Le délai ne peut pas être négatif.')
    .max(DELAI_MAX_MINUTES, 'Délai trop long.'),
  horizonJours: z.coerce
    .number({ error: 'Saisir l’horizon.' })
    .int('Saisir un nombre de jours.')
    .min(1, 'Au moins 1 jour.')
    .max(HORIZON_MAX_JOURS, `Au plus ${String(HORIZON_MAX_JOURS)} jours.`),
  validation: z.enum(VALIDATIONS_RESERVATION, { error: 'Mode de validation inconnu.' }),
  delaiModificationHeures: z.coerce
    .number({ error: 'Saisir le délai de modification.' })
    .int('Saisir un délai en heures.')
    .min(0, 'Le délai ne peut pas être négatif.')
    .max(DELAI_MAX_HEURES, 'Délai trop long.'),
  typeRdvIds: z.array(z.string().min(1)),
  slug: slugSchema,
});
export type ParametresReservationSaisie = z.output<typeof parametresReservationSchema>;

export const deplacementEnLigneSchema = z.object({
  debut: z.coerce.number({ error: 'Choisir un créneau.' }).int('Choisir un créneau.').positive(),
  /** `null` : peu importe. */
  praticienId: texteOptionnelSchema,
});
