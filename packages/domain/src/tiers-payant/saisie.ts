import { z } from 'zod';

import { dateCalendaireSchema } from '../commun/date';
import { pageSchema } from '../commun/pagination';
import { parametreOptionnel, texteObligatoire, texteOptionnelSchema } from '../commun/texte';
import { centimes, centimesDepuisSaisieEuros } from '../money';
import { STATUTS_CREANCE, TRANCHES_ANCIENNETE, TYPES_CREANCE } from './creance';

export const MODES_PEC = ['PORTAIL', 'EDI'] as const;
export type ModePec = (typeof MODES_PEC)[number];

export const LIBELLES_MODES_PEC: Readonly<Record<ModePec, string>> = {
  PORTAIL: 'Portail',
  EDI: 'EDI',
};

export const ORIGINES_REGLEMENT = ['MANUEL', 'NOEMIE'] as const;
export type OrigineReglement = (typeof ORIGINES_REGLEMENT)[number];

export const NATURES_REGULARISATION = ['ECART_PERTE', 'ECART_PROFIT', 'TRANSFERT_PATIENT'] as const;
export type NatureRegularisation = (typeof NATURES_REGULARISATION)[number];

export const LIBELLES_NATURES_REGULARISATION: Readonly<Record<NatureRegularisation, string>> = {
  ECART_PERTE: 'Écart en perte',
  ECART_PROFIT: 'Écart en produit',
  TRANSFERT_PATIENT: 'Transfert au patient',
};

export const RESOLUTIONS_REJET = ['REPRESENTEE', 'TRANSFEREE_PATIENT', 'ABANDONNEE'] as const;
export type ResolutionRejet = (typeof RESOLUTIONS_REJET)[number];

export const LIBELLES_RESOLUTIONS_REJET: Readonly<Record<ResolutionRejet, string>> = {
  REPRESENTEE: 'Représentée à l’organisme',
  TRANSFEREE_PATIENT: 'Transférée au patient',
  ABANDONNEE: 'Abandonnée',
};

const MESSAGE_MONTANT = 'Montant invalide (exemple : 710,00).';

function montantEuros(saisie: string): number | null {
  const montant = centimesDepuisSaisieEuros(saisie);
  return montant === null ? null : centimes(montant);
}

/** Montant strictement positif, en euros : refuse le zéro. */
const montantPositifSchema = z.string({ error: MESSAGE_MONTANT }).transform((saisie, ctx) => {
  const montant = montantEuros(saisie);
  if (montant === null || montant <= 0) {
    ctx.addIssue({ code: 'custom', message: MESSAGE_MONTANT });
    return z.NEVER;
  }
  return montant;
});

/** Montant facultatif : vide vaut zéro. */
const montantOuZeroSchema = texteOptionnelSchema.transform((saisie, ctx) => {
  if (saisie === null) {
    return 0;
  }
  const montant = montantEuros(saisie);
  if (montant === null || montant < 0) {
    ctx.addIssue({ code: 'custom', message: MESSAGE_MONTANT });
    return z.NEVER;
  }
  return montant;
});

const motifSchema = texteObligatoire('Le motif est obligatoire.', 500);

const courrielOptionnelSchema = texteOptionnelSchema.pipe(
  z.email('Adresse e-mail invalide.').max(200).nullable(),
);

export const complementaireSaisieSchema = z.object({
  nom: texteObligatoire('Le nom est obligatoire.'),
  identifiant: texteObligatoire('L’identifiant est obligatoire.', 50),
  plateformeTiersPayant: texteOptionnelSchema.pipe(z.string().max(100).nullable()),
  telephone: texteOptionnelSchema.pipe(z.string().max(30).nullable()),
  email: courrielOptionnelSchema,
  adresse: texteOptionnelSchema.pipe(z.string().max(300).nullable()),
  modePec: z.enum(MODES_PEC, { error: 'Choisir le mode de PEC.' }),
  delaiPaiementJours: z.coerce
    .number({ error: 'Délai invalide.' })
    .int('Délai invalide.')
    .min(0, 'Délai invalide.')
    .max(365, '365 jours au maximum.'),
  actif: z.preprocess((valeur) => valeur === 'on' || valeur === true, z.boolean()),
});
export type ComplementaireSaisie = z.output<typeof complementaireSaisieSchema>;

/** Le payeur vient du référentiel, ou d'une saisie libre pour une caisse. */
export const reglementSaisieSchema = z
  .object({
    complementaireId: texteOptionnelSchema.pipe(z.uuid().nullable()),
    organisme: texteOptionnelSchema.pipe(
      z.string().max(200, '200 caractères au maximum.').nullable(),
    ),
    dateReglement: dateCalendaireSchema,
    reference: texteObligatoire('La référence est obligatoire.', 100),
    partAmo: montantOuZeroSchema,
    partAmc: montantOuZeroSchema,
  })
  .transform(({ partAmo, partAmc, ...saisie }, ctx) => {
    if (saisie.complementaireId === null && saisie.organisme === null) {
      ctx.addIssue({ code: 'custom', path: ['organisme'], message: 'Choisir l’organisme.' });
    }
    if (partAmo + partAmc === 0) {
      ctx.addIssue({ code: 'custom', path: ['partAmo'], message: 'Indiquer un montant.' });
    }
    return { ...saisie, partAmoCentimes: partAmo, partAmcCentimes: partAmc };
  });
export type ReglementSaisie = z.output<typeof reglementSaisieSchema>;

export const lettrageSaisieSchema = z.object({
  imputations: z
    .array(z.object({ creanceId: z.uuid(), montant: montantPositifSchema }))
    .max(200, '200 créances au maximum par lettrage.'),
});

export const motifSaisieSchema = z.object({ motif: motifSchema });

/** Une case à cocher n'arrive que cochée. */
export const tiersPayantSaisieSchema = z.object({
  tiersPayantAmo: z.preprocess((valeur) => valeur === 'on' || valeur === true, z.boolean()),
});

export const ecartSaisieSchema = z.object({
  montant: montantPositifSchema,
  motif: motifSchema,
});

/** Écart en produit : ce qu'un organisme a versé en trop, classé sur la part choisie. */
export const ecartReglementSaisieSchema = ecartSaisieSchema.extend({
  type: z.enum(TYPES_CREANCE, { error: 'Choisir la part.' }),
});

export const rejetSaisieSchema = z.object({
  dateRejet: dateCalendaireSchema,
  code: texteOptionnelSchema.pipe(z.string().max(30).nullable()),
  motif: motifSchema,
});

export const resolutionRejetSaisieSchema = z.object({
  resolution: z.enum(RESOLUTIONS_REJET, { error: 'Choisir la suite donnée.' }),
  motif: texteOptionnelSchema.pipe(z.string().max(500, '500 caractères au maximum.').nullable()),
});

/** Paramètres d'URL des créances. Le centre vient du périmètre courant. */
export const filtreCreancesSchema = z.object({
  page: pageSchema,
  organisme: parametreOptionnel(z.string().max(200)).catch(undefined),
  type: z.enum(TYPES_CREANCE).optional().catch(undefined),
  statut: z.enum(STATUTS_CREANCE).optional().catch(undefined),
  tranche: z.enum(TRANCHES_ANCIENNETE).optional().catch(undefined),
});
export type FiltreCreances = z.output<typeof filtreCreancesSchema>;

export const filtreReglementsSchema = z.object({
  page: pageSchema,
  aLettrer: z
    .preprocess((valeur) => valeur === 'oui', z.boolean())
    .optional()
    .catch(undefined),
});
export type FiltreReglements = z.output<typeof filtreReglementsSchema>;

export const filtreListeSchema = z.object({ page: pageSchema });
