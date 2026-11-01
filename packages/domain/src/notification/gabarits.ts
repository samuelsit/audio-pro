import { z } from 'zod';

import { dateCalendaireSchema } from '../commun/date';

export const CANAUX_NOTIFICATION = ['SMS', 'EMAIL'] as const;
export type CanalNotification = (typeof CANAUX_NOTIFICATION)[number];

export const GABARITS_NOTIFICATION = [
  'RDV_CONFIRME',
  'RDV_DEMANDE_RECUE',
  'RDV_ACCEPTE',
  'RDV_REFUSE',
  'RDV_DEPLACE',
  'RDV_ANNULE',
  'DOCUMENT_A_CONSULTER',
  'BON_COMMANDE',
  'RELANCE_COMMANDE',
] as const;
export type GabaritNotification = (typeof GABARITS_NOTIFICATION)[number];
export type GabaritCommande = Extract<GabaritNotification, 'BON_COMMANDE' | 'RELANCE_COMMANDE'>;
export type GabaritRdv = Exclude<GabaritNotification, 'DOCUMENT_A_CONSULTER' | GabaritCommande>;

/** Seuls les messages aux fournisseurs portent une pièce jointe : un patient reçoit un lien (CLAUDE.md). */
export function gabaritAvecPieceJointe(gabarit: GabaritNotification): boolean {
  return gabarit === 'BON_COMMANDE' || gabarit === 'RELANCE_COMMANDE';
}

// Ni type de rendez-vous, ni motif, ni nom : le schéma ne laisse passer que ce qu'un message peut dire
// (CLAUDE.md, aucune donnée de santé). « Fin d'essai » dans un SMS en serait déjà une.
export const parametresGabaritSchema = z.strictObject({
  centre: z.string().min(1),
  telephoneCentre: z.string().min(1),
  date: dateCalendaireSchema,
  heure: z.string().min(1),
});
export type ParametresGabarit = z.output<typeof parametresGabaritSchema>;

// Aucune nature de document : « votre devis d'appareillage » dans un SMS serait une donnée de santé.
export const parametresDocumentSchema = z.strictObject({ centre: z.string().min(1) });
export type ParametresDocument = z.output<typeof parametresDocumentSchema>;

const formatDate = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** « mardi 3 novembre » : date d'un message au patient. */
export function dateLongue(date: string): string {
  return formatDate.format(Date.parse(`${date}T12:00:00Z`));
}

interface Texte {
  readonly sujet: string;
  readonly corps: string;
}

function texte(gabarit: GabaritRdv, p: ParametresGabarit): Texte {
  const quand = `le ${dateLongue(p.date)} à ${p.heure.replace(':', 'h')}`;
  switch (gabarit) {
    case 'RDV_CONFIRME':
    case 'RDV_ACCEPTE':
      return {
        sujet: 'Votre rendez-vous est confirmé',
        corps: `Votre rendez-vous chez ${p.centre} est confirmé ${quand}.`,
      };
    case 'RDV_DEMANDE_RECUE':
      return {
        sujet: 'Votre demande de rendez-vous',
        corps: `Votre demande de rendez-vous chez ${p.centre} ${quand} est bien reçue. Le centre vous confirmera ce créneau.`,
      };
    case 'RDV_REFUSE':
      return {
        sujet: 'Votre demande de rendez-vous',
        corps: `Votre demande de rendez-vous chez ${p.centre} ${quand} n’a pas pu être retenue. Contactez le centre au ${p.telephoneCentre}.`,
      };
    case 'RDV_DEPLACE':
      return {
        sujet: 'Votre rendez-vous a changé',
        corps: `Votre rendez-vous chez ${p.centre} a lieu ${quand}.`,
      };
    case 'RDV_ANNULE':
      return {
        sujet: 'Votre rendez-vous est annulé',
        corps: `Votre rendez-vous chez ${p.centre} ${quand} est annulé.`,
      };
  }
}

/** Le lien de gestion ne vaut plus pour un rendez-vous clos. */
function avecLien(gabarit: GabaritRdv): boolean {
  return gabarit !== 'RDV_REFUSE' && gabarit !== 'RDV_ANNULE';
}

export interface MessageRendu {
  readonly sujet: string;
  readonly corps: string;
}

/** Texte d'un message au patient. `lien` : adresse de gestion du rendez-vous. */
export function rendreMessage(
  gabarit: GabaritRdv,
  parametres: ParametresGabarit,
  lien: string,
): MessageRendu {
  const { sujet, corps } = texte(gabarit, parametres);
  return {
    sujet,
    corps: avecLien(gabarit) ? `${corps} Annuler ou déplacer : ${lien}` : corps,
  };
}

/** Message vers un document : ni sa nature, ni le patient. Le lien exige ensuite sa date de naissance. */
export function rendreMessageDocument(
  { centre }: ParametresDocument,
  lien: string,
  dureeJours: number,
): MessageRendu {
  return {
    sujet: 'Un document est à votre disposition',
    corps: `${centre} met un document à votre disposition. Lien sécurisé, valable ${String(dureeJours)} jours : ${lien}`,
  };
}

// Adressé au fournisseur : le numéro et le centre suffisent. Le contenu est dans le bon, sans identité de patient.
export const parametresCommandeMessageSchema = z.strictObject({
  numero: z.string().min(1),
  centre: z.string().min(1),
});
export type ParametresCommandeMessage = z.output<typeof parametresCommandeMessageSchema>;

/** Message au fournisseur. `lienAccuse` : page de confirmation, sans authentification. */
export function rendreMessageCommande(
  gabarit: GabaritCommande,
  { numero, centre }: ParametresCommandeMessage,
  lienAccuse: string,
): MessageRendu {
  const relance = gabarit === 'RELANCE_COMMANDE';
  return {
    sujet: `${relance ? 'Relance : bon' : 'Bon'} de commande ${numero}`,
    corps: `${relance ? `Sauf erreur, nous n’avons pas reçu d’accusé pour le bon de commande ${numero} de ${centre}, de nouveau joint à ce message.` : `Veuillez trouver ci-joint le bon de commande ${numero} de ${centre}.`} Merci d’en accuser réception : ${lienAccuse}`,
  };
}

/** SMS de vérification du téléphone : le centre n'y figure pas, le code seul suffit. */
export function messageCodeSms(code: string): string {
  return `Votre code de vérification : ${code}. Ne le communiquez à personne.`;
}
