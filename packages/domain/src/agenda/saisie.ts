import { z } from 'zod';

import { telephoneSchema } from '../centre/centre';
import { heureSchema } from '../centre/horaires';
import { dateCalendaireSchema } from '../commun/date';
import { minutesDepuisMinuit } from '../commun/fuseau';
import { texteObligatoire, texteOptionnelSchema } from '../commun/texte';
import { TYPES_RDV_ESSAI } from '../essai/saisie';
import { civiliteSchema, sexeSchema } from '../patient/patient';
import { dateSaisieSchema } from '../patient/recherche';
import { TYPES_EXCEPTION } from './disponibilites';
import { ORIGINES_RDV } from './etats';

/** Finesse de la grille de l'agenda : une durée se règle à 5 minutes près. */
export const PAS_DUREE_MINUTES = 5;
const DUREE_MAX_MINUTES = 480;

const dureeSchema = z.coerce
  .number({ error: 'Saisir la durée.' })
  .int('Saisir une durée en minutes.')
  .min(PAS_DUREE_MINUTES, `Au moins ${String(PAS_DUREE_MINUTES)} minutes.`)
  .max(DUREE_MAX_MINUTES, `Au plus ${String(DUREE_MAX_MINUTES)} minutes.`)
  .multipleOf(PAS_DUREE_MINUTES, `Une durée se règle par ${String(PAS_DUREE_MINUTES)} minutes.`);

const identifiant = (message: string) => z.string({ error: message }).min(1, message);

/** Identifiant facultatif de formulaire : vide → `null`. */
const identifiantOptionnel = texteOptionnelSchema;

function apresMinuit(heure: string, dureeMinutes: number): boolean {
  return minutesDepuisMinuit(heure) + dureeMinutes > 24 * 60;
}

/** Heure de début et durée : un rendez-vous ne chevauche pas minuit (la grille dessine une journée). */
const horaireRdvSchema = z.object({
  date: dateCalendaireSchema,
  heure: heureSchema,
  dureeMinutes: dureeSchema,
});

export const rdvSaisieSchema = horaireRdvSchema
  .extend({
    centreId: identifiant('Le centre est obligatoire.'),
    typeRdvId: identifiant('Choisir le type de rendez-vous.'),
    patientId: identifiantOptionnel,
    prospectNom: texteOptionnelSchema.pipe(
      z.string().max(200, '200 caractères au maximum.').nullable(),
    ),
    prospectTelephone: texteOptionnelSchema.pipe(telephoneSchema.nullable()),
    dossierId: identifiantOptionnel,
    praticienId: identifiantOptionnel,
    cabineId: identifiantOptionnel,
    origine: z.enum(ORIGINES_RDV, { error: 'Origine inconnue.' }),
    notes: texteOptionnelSchema.pipe(
      z.string().max(2000, '2000 caractères au maximum.').nullable(),
    ),
    confirmerHorsDisponibilites: z.boolean().default(false),
  })
  .superRefine((s, ctx) => {
    if (apresMinuit(s.heure, s.dureeMinutes)) {
      ctx.addIssue({
        code: 'custom',
        path: ['dureeMinutes'],
        message: 'Un rendez-vous se termine le jour où il commence.',
      });
    }
    if (s.patientId !== null) {
      if (s.prospectNom !== null || s.prospectTelephone !== null) {
        ctx.addIssue({
          code: 'custom',
          path: ['prospectNom'],
          message: 'Choisir un patient ou un prospect, pas les deux.',
        });
      }
      return;
    }
    if (s.dossierId !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['dossierId'],
        message: 'Un dossier suppose un patient.',
      });
    }
    if (s.prospectNom === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['prospectNom'],
        message: 'Choisir un patient, ou saisir le nom du prospect.',
      });
    }
    if (s.prospectTelephone === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['prospectTelephone'],
        message: 'Le téléphone du prospect est obligatoire.',
      });
    }
  });
export type RdvSaisie = z.output<typeof rdvSaisieSchema>;

/** Verrou optimiste : version du rendez-vous affichée à l'utilisateur. */
export const versionRdvSchema = z.coerce
  .number({ error: 'Version inconnue.' })
  .int('Version inconnue.')
  .min(1, 'Version inconnue.');

export const deplacementRdvSchema = horaireRdvSchema
  .extend({
    version: versionRdvSchema,
    /** Absent : le rendez-vous garde son praticien. */
    praticienId: identifiantOptionnel.optional(),
    confirmerHorsDisponibilites: z.boolean().default(false),
  })
  .refine((s) => !apresMinuit(s.heure, s.dureeMinutes), {
    path: ['dureeMinutes'],
    message: 'Un rendez-vous se termine le jour où il commence.',
  });
export type DeplacementRdv = z.output<typeof deplacementRdvSchema>;

export const rattachementRdvSchema = z.object({
  version: z.number().int().min(1),
  dossierId: z.uuid({ error: 'Choisir un dossier.' }),
});

export const changementStatutRdvSchema = z.object({
  version: versionRdvSchema,
  // `ARRIVE` passe par `marquerArrivee` (un prospect s'y convertit), `ANNULE` par `annulerRdv` (événement).
  statut: z.enum(['CONFIRME', 'VU', 'ABSENT'], { error: 'Statut inconnu.' }),
});

/** Arrivée d'un prospect : fiche existante, ou identité minimale d'une fiche nouvelle. */
export const arriveeProspectSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('EXISTANT'),
    patientId: identifiant('Choisir le patient.'),
  }),
  z.object({
    mode: z.literal('NOUVEAU'),
    civilite: civiliteSchema,
    nomNaissance: texteObligatoire('Le nom de naissance est obligatoire.', 100),
    prenoms: texteObligatoire('Le prénom est obligatoire.', 200),
    dateNaissance: z
      .string({ error: 'La date de naissance est obligatoire.' })
      .trim()
      .min(1, { error: 'La date de naissance est obligatoire.', abort: true })
      .pipe(dateSaisieSchema),
    sexe: sexeSchema,
    confirmerDoublon: z.boolean().default(false),
  }),
]);
export type ArriveeProspect = z.output<typeof arriveeProspectSchema>;

export const cabineSaisieSchema = z.object({
  centreId: identifiant('Le centre est obligatoire.'),
  nom: texteObligatoire('Le nom de la cabine est obligatoire.', 100),
});

export const typeRdvSaisieSchema = z
  .object({
    nom: texteObligatoire('Le nom est obligatoire.', 100),
    dureeMinutes: dureeSchema,
    couleur: z
      .string({ error: 'Choisir une couleur.' })
      .regex(/^#[0-9a-f]{6}$/i, 'Couleur invalide (#RRVVBB).')
      .toLowerCase(),
    requierePraticien: z.boolean(),
    requiereCabine: z.boolean(),
    reservableEnLigne: z.boolean(),
    delaiMinimalMinutes: z.coerce
      .number({ error: 'Saisir le délai minimal.' })
      .int('Saisir un délai en minutes.')
      .min(0, 'Le délai ne peut pas être négatif.'),
    natureEssai: z.preprocess(
      (valeur) => (valeur === '' ? null : valeur),
      z.enum(TYPES_RDV_ESSAI, { error: 'Nature inconnue.' }).nullable(),
    ),
  })
  .refine((s) => s.requierePraticien || s.requiereCabine, {
    path: ['requierePraticien'],
    message: 'Un rendez-vous occupe un praticien, une cabine ou les deux.',
  });
export type TypeRdvSaisie = z.output<typeof typeRdvSaisieSchema>;

export const exceptionSaisieSchema = z
  .object({
    type: z.enum(TYPES_EXCEPTION, { error: 'Type d’exception inconnu.' }),
    praticienId: identifiantOptionnel,
    cabineId: identifiantOptionnel,
    centreId: identifiantOptionnel,
    du: dateCalendaireSchema,
    au: dateCalendaireSchema,
    // Sans heures, la période couvre des journées entières, de minuit à minuit.
    heureDebut: texteOptionnelSchema.pipe(heureSchema.nullable()),
    heureFin: texteOptionnelSchema.pipe(heureSchema.nullable()),
  })
  .superRefine((s, ctx) => {
    const debut = `${s.du} ${s.heureDebut ?? '00:00'}`;
    const fin = `${s.au} ${s.heureFin ?? '24:00'}`;
    if (debut >= fin) {
      ctx.addIssue({ code: 'custom', path: ['au'], message: 'La fin doit suivre le début.' });
    }
    if ((s.heureDebut === null) !== (s.heureFin === null)) {
      ctx.addIssue({
        code: 'custom',
        path: ['heureFin'],
        message: 'Saisir les deux heures, ou aucune.',
      });
    }
    const manquant = champManquant(s);
    if (manquant !== null) {
      ctx.addIssue({ code: 'custom', path: [manquant.champ], message: manquant.message });
    }
  });
export type ExceptionSaisie = z.output<typeof exceptionSaisieSchema>;

interface CiblesException {
  readonly type: (typeof TYPES_EXCEPTION)[number];
  readonly praticienId: string | null;
  readonly cabineId: string | null;
  readonly centreId: string | null;
}

/** Même règle que les CHECK de la table `exception_agenda`, avec un message pour le formulaire. */
function champManquant(s: CiblesException): { champ: string; message: string } | null {
  const praticien = { champ: 'praticienId', message: 'Choisir le praticien.' };
  const centre = { champ: 'centreId', message: 'Choisir le centre.' };
  switch (s.type) {
    case 'DISPONIBILITE':
      return s.praticienId === null ? praticien : s.centreId === null ? centre : null;
    case 'CONGE':
      return s.praticienId === null ? praticien : null;
    case 'INDISPONIBILITE':
      return (s.praticienId === null) === (s.cabineId === null)
        ? { champ: 'praticienId', message: 'Choisir un praticien ou une cabine.' }
        : null;
    case 'FERMETURE_CENTRE':
      return s.centreId === null ? centre : null;
  }
}

export const rechercheCreneauxSchema = z.object({
  centreId: identifiant('Le centre est obligatoire.'),
  typeRdvId: identifiant('Choisir le type de rendez-vous.'),
  praticienId: identifiantOptionnel,
  depuis: dateCalendaireSchema,
});
export type RechercheCreneauxSaisie = z.output<typeof rechercheCreneauxSchema>;
