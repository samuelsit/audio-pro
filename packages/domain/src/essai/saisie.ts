import { z } from 'zod';

import { OREILLES } from '../audio-rules/code-prestation';
import { ESSAI_PROLONGATION_MAX_JOURS } from '../audio-rules/constantes';
import { dateCalendaireSchema } from '../commun/date';
import { pageSchema } from '../commun/pagination';
import { texteObligatoire } from '../commun/texte';
import { STATUTS_DOSSIER } from '../dossier/etats';
import { numeroSerieSchema } from '../stock/numero-serie';

export const TYPES_RDV_ESSAI = ['POSE', 'CONTROLE', 'FIN_ESSAI'] as const;
export type TypeRdvEssai = (typeof TYPES_RDV_ESSAI)[number];

export const LIBELLES_TYPES_RDV_ESSAI: Readonly<Record<TypeRdvEssai, string>> = {
  POSE: 'Pose',
  CONTROLE: 'Contrôle',
  FIN_ESSAI: 'Fin d’essai',
};

export const ISSUES_ESSAI = ['ACHAT', 'ABANDON'] as const;
export type IssueEssai = (typeof ISSUES_ESSAI)[number];

export const LIBELLES_ISSUES_ESSAI: Readonly<Record<IssueEssai, string>> = {
  ACHAT: 'Achat',
  ABANDON: 'Abandon',
};

const motifSchema = texteObligatoire('Le motif est obligatoire.', 500);

/** Verrou optimiste : statut du dossier affiché à l'utilisateur. */
const statutAttenduSchema = z.enum(STATUTS_DOSSIER, { error: 'Statut actuel inconnu.' });

export const rdvEssaiSaisieSchema = z.object({
  date: dateCalendaireSchema,
  type: z.enum(TYPES_RDV_ESSAI, { error: 'Choisir le type de rendez-vous.' }),
  compteRendu: texteObligatoire('Le compte rendu est obligatoire.', 500),
});
export type RdvEssaiSaisie = z.output<typeof rdvEssaiSaisieSchema>;

/**
 * Durée saisie d'après la demande du prescripteur, 15 jours au plus.
 * Source : convention-audioprothesistes.pdf, art. 18 3°, p. 20.
 */
export const prolongationEssaiSaisieSchema = z.object({
  dateDemande: dateCalendaireSchema,
  jours: z.coerce
    .number({ error: 'Saisir le nombre de jours.' })
    .int('Saisir un nombre entier de jours.')
    .min(1, 'Saisir au moins 1 jour.')
    .max(
      ESSAI_PROLONGATION_MAX_JOURS.valeur,
      `La prolongation est limitée à ${String(ESSAI_PROLONGATION_MAX_JOURS.valeur)} jours.`,
    ),
  motif: motifSchema,
});
export type ProlongationEssaiSaisie = z.output<typeof prolongationEssaiSaisieSchema>;

export const changementAppareilSaisieSchema = z.object({
  statutAttendu: statutAttenduSchema,
  oreille: z.enum(OREILLES, { error: 'Choisir l’oreille.' }),
  numeroSerie: numeroSerieSchema,
  motifRetrait: motifSchema,
});
export type ChangementAppareilSaisie = z.output<typeof changementAppareilSaisieSchema>;

export const achatEssaiSaisieSchema = z.object({ statutAttendu: statutAttenduSchema });
export type AchatEssaiSaisie = z.output<typeof achatEssaiSaisieSchema>;

/** Paramètres d'URL de l'écran « Essais en cours ». Le centre vient du périmètre courant. */
export const filtreEssaisSchema = z.object({ page: pageSchema });
export type FiltreEssais = z.output<typeof filtreEssaisSchema>;
