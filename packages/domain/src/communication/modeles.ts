import { z } from 'zod';

import { texteObligatoire } from '../commun/texte';
import { dateLongue } from '../notification/gabarits';
import { normaliserPourRecherche } from '../patient/recherche';
import { estScenarioRdv, SCENARIOS_COMMUNICATION, type ScenarioCommunication } from './catalogue';

export const VARIABLES_MESSAGE = [
  'prenom',
  'centre',
  'telephoneCentre',
  'dateRdv',
  'heureRdv',
  'lien',
] as const;
export type VariableMessage = (typeof VARIABLES_MESSAGE)[number];

export const LIBELLES_VARIABLES: Readonly<Record<VariableMessage, string>> = {
  prenom: 'Prénom du patient',
  centre: 'Nom du centre',
  telephoneCentre: 'Téléphone du centre',
  dateRdv: 'Date du rendez-vous',
  heureRdv: 'Heure du rendez-vous',
  lien: 'Lien',
};

const VARIABLE = /\{(\w+)\}/g;
/** Sujet minimal de Scaleway. Source : docs/vendor/scaleway-tem/README.md, « Envoi ». */
const SUJET_MINIMUM = 10;
const SMS_MAXIMUM = 459;

/** Noms de variables cités par un texte, dans l'ordre. */
export function variablesDuTexte(texte: string): string[] {
  return [...texte.matchAll(VARIABLE)].map((m) => m[1] as string);
}

/** Les dates d'un rendez-vous n'ont de sens que pour les scénarios de rendez-vous. */
export function variablesAdmises(scenario: ScenarioCommunication | null): VariableMessage[] {
  return scenario !== null && estScenarioRdv(scenario)
    ? [...VARIABLES_MESSAGE]
    : VARIABLES_MESSAGE.filter((v) => v !== 'dateRdv' && v !== 'heureRdv');
}

// Choix applicatif, absent de docs/ref : ces mots disent, à qui lit l'écran du téléphone, de quoi il retourne.
// « Fin d'essai » dans un SMS est déjà une donnée de santé (gabarits.ts). Le nom du centre, lui, est une variable.
const TERMES_REFUSES =
  /\b(APPAREIL\w*|AUDITI\w*|AUDITION\w*|AUDIOPROTH\w*|AUDIOGRAMME\w*|SURDITE\w*|SOURD\w*|PROTHES\w*|ESSAI\w*|GARANTIE\w*|RENOUVELLEMENT\w*|DEVIS|ORDONNANCE\w*|PRESCRI\w*|ORL|ACOUPHENE\w*|OUIE|OREILLE\w*|EMBOUT\w*)\b/g;

/** Termes interdits d'un texte de SMS ou d'e-mail, hors variables, normalisés. */
export function termesRefuses(texte: string): string[] {
  const sansVariables = texte.replace(VARIABLE, ' ');
  return [...normaliserPourRecherche(sansVariables).matchAll(TERMES_REFUSES)].map(
    (m) => m[0] as string,
  );
}

export type ValeursMessage = Readonly<Partial<Record<VariableMessage, string>>>;

/** Remplace les variables. Une variable sans valeur s'efface : la saisie a déjà refusé les inconnues. */
export function rendreTexte(texte: string, valeurs: ValeursMessage): string {
  return texte.replace(VARIABLE, (_, nom: string) => valeurs[nom as VariableMessage] ?? '');
}

export interface EntreeValeurs {
  readonly prenoms: string;
  readonly centre: string;
  readonly telephoneCentre: string;
  /** Sans page de réservation ni lien de gestion, le téléphone du centre en tient lieu. */
  readonly lien: string | null;
  readonly rdv: { readonly date: string; readonly heure: string } | null;
}

/** Le seul nom admis dans un message est le premier prénom. */
export function valeursMessage(entree: EntreeValeurs): ValeursMessage {
  const { prenoms, centre, telephoneCentre, lien, rdv } = entree;
  return {
    prenom: prenoms.trim().split(/\s+/)[0] as string,
    centre,
    telephoneCentre,
    lien: lien ?? telephoneCentre,
    ...(rdv === null
      ? {}
      : { dateRdv: dateLongue(rdv.date), heureRdv: rdv.heure.replace(':', 'h') }),
  };
}

export interface TextesModele {
  readonly sujet: string;
  readonly corpsEmail: string;
  readonly corpsSms: string;
  /** Une lettre fermée peut nommer son objet. Sans texte propre, le corps de l'e-mail sert. */
  readonly corpsCourrier: string | null;
}

const INVITATION_EMAIL =
  'Bonjour {prenom},\n\n{centre} vous invite à le contacter pour convenir d’un rendez-vous.\n\nÀ bientôt.\n{telephoneCentre}';
const INVITATION_SMS = '{prenom}, {centre} vous invite a le contacter. Contact : {lien}';

function invitation(sujet: string, corpsCourrier: string | null = null): TextesModele {
  return { sujet, corpsEmail: INVITATION_EMAIL, corpsSms: INVITATION_SMS, corpsCourrier };
}

function messageRdv(sujet: string, phrase: string, phraseSms: string): TextesModele {
  return {
    sujet,
    corpsEmail: `Bonjour {prenom},\n\n${phrase}\n\nContact : {telephoneCentre}`,
    corpsSms: `{prenom}, ${phraseSms} Contact : {telephoneCentre}`,
    corpsCourrier: null,
  };
}

const RAPPEL = messageRdv(
  'Rappel de votre rendez-vous',
  'Nous vous rappelons votre rendez-vous chez {centre} le {dateRdv} à {heureRdv}.',
  'rappel : RDV chez {centre} le {dateRdv} a {heureRdv}.',
);

/**
 * Textes neutres : aucune nature de rendez-vous, de document ou d'équipement (CLAUDE.md).
 * Lettre de renouvellement : le délai de 4 ans vise la prise en charge et le téléservice fait foi.
 * Source : convention-audioprothesistes.pdf, art. 22 § 1, p. 22 ; art. 15 § 1, p. 16 (communication loyale et
 * objective). À VÉRIFIER : droit d'informer le patient avant l'échéance, absent de docs/ref (R59).
 */
export const MODELES_DEFAUT: Readonly<Record<ScenarioCommunication, TextesModele>> = {
  RAPPEL_RDV_J2: RAPPEL,
  RAPPEL_RDV_J1: RAPPEL,
  CONFIRMATION_RDV: messageRdv(
    'Votre rendez-vous est confirmé',
    'Votre rendez-vous chez {centre} est confirmé le {dateRdv} à {heureRdv}.',
    'RDV chez {centre} confirme le {dateRdv} a {heureRdv}.',
  ),
  DEPLACEMENT_RDV: messageRdv(
    'Votre rendez-vous a changé',
    'Votre rendez-vous chez {centre} a lieu le {dateRdv} à {heureRdv}.',
    'votre RDV chez {centre} a lieu le {dateRdv} a {heureRdv}.',
  ),
  ANNULATION_RDV: messageRdv(
    'Votre rendez-vous est annulé',
    'Votre rendez-vous chez {centre} du {dateRdv} à {heureRdv} est annulé.',
    'votre RDV chez {centre} du {dateRdv} a {heureRdv} est annule.',
  ),
  RELANCE_DEVIS: invitation('Votre centre vous invite à le contacter'),
  FIN_ESSAI: invitation('Votre centre vous invite à le contacter'),
  CONTROLE_ANNUEL: invitation('Prenons rendez-vous'),
  RENOUVELLEMENT: invitation(
    'Votre centre vous invite à le contacter',
    'Votre dernier appareillage date de plus de quatre ans. Selon votre situation, un renouvellement peut être pris en charge, sous réserve de la vérification de vos droits. Nous vous invitons à prendre rendez-vous avec votre centre pour en parler.',
  ),
  FIN_GARANTIE: invitation('Votre centre vous invite à le contacter'),
  ANNIVERSAIRE: invitation('Des nouvelles de votre centre'),
};

function verifierTexte(
  ctx: z.RefinementCtx,
  champ: string,
  texte: string,
  admises: readonly string[],
  neutre: boolean,
): void {
  const inconnues = variablesDuTexte(texte).filter((v) => !admises.includes(v));
  if (inconnues.length > 0) {
    ctx.addIssue({
      code: 'custom',
      path: [champ],
      message: `Variable inconnue ici : ${inconnues.join(', ')}.`,
    });
  }
  const termes = neutre ? termesRefuses(texte) : [];
  if (termes.length > 0) {
    ctx.addIssue({
      code: 'custom',
      path: [champ],
      message: `Un message ne dit rien de la santé du patient. Terme à retirer : ${termes.join(', ').toLowerCase()}.`,
    });
  }
}

export const modeleMessageSaisieSchema = z
  .object({
    nom: texteObligatoire('Nommer ce modèle.'),
    scenario: z.enum(SCENARIOS_COMMUNICATION).nullable(),
    sujet: texteObligatoire('Saisir le sujet.').min(
      SUJET_MINIMUM,
      `${String(SUJET_MINIMUM)} caractères au minimum.`,
    ),
    corpsEmail: texteObligatoire('Saisir le texte de l’e-mail.', 5000),
    corpsSms: texteObligatoire('Saisir la version SMS.', SMS_MAXIMUM),
    corpsCourrier: z
      .string()
      .trim()
      .max(10_000)
      .nullish()
      .transform((v) => v || null),
  })
  .superRefine((modele, ctx) => {
    const admises = variablesAdmises(modele.scenario);
    verifierTexte(ctx, 'sujet', modele.sujet, admises, true);
    verifierTexte(ctx, 'corpsEmail', modele.corpsEmail, admises, true);
    verifierTexte(ctx, 'corpsSms', modele.corpsSms, admises, true);
    if (modele.corpsCourrier !== null) {
      verifierTexte(ctx, 'corpsCourrier', modele.corpsCourrier, admises, false);
    }
  });
export type ModeleMessageSaisie = z.output<typeof modeleMessageSaisieSchema>;

/** Toujours en fin d'e-mail, jamais dans le modèle : le client ne peut pas l'oublier. */
export function piedEmail(corps: string, centre: string, lienDesinscription: string): string {
  return `${corps}\n\n--\n${centre}\nPour ne plus recevoir nos messages : ${lienDesinscription}`;
}
