import { z } from 'zod';

import { dateCalendaireSchema } from '../commun/date';
import { CANAUX_NOTIFICATION, type CanalNotification } from '../notification/gabarits';

/** Choix d'organisation : assez pour que le patient lise son message, sans laisser un lien traîner. */
export const DUREE_LIEN_DOCUMENT_JOURS = 7;
export const TENTATIVES_MAX_LIEN_DOCUMENT = 5;

export const CIBLES_LIEN_DOCUMENT = ['DEVIS', 'COMPTE_RENDU_ESSAI', 'FACTURE'] as const;
export type CibleLienDocument = (typeof CIBLES_LIEN_DOCUMENT)[number];

export const LIBELLES_CIBLES_LIEN: Readonly<Record<CibleLienDocument, string>> = {
  DEVIS: 'Devis',
  COMPTE_RENDU_ESSAI: 'Compte rendu d’essai',
  FACTURE: 'Facture',
};

export const DESTINATAIRES_LIEN = ['PATIENT', 'PRESCRIPTEUR'] as const;
export type DestinataireLien = (typeof DESTINATAIRES_LIEN)[number];

export const LIBELLES_DESTINATAIRES_LIEN: Readonly<Record<DestinataireLien, string>> = {
  PATIENT: 'Patient',
  PRESCRIPTEUR: 'Prescripteur',
};

export interface EtatLienDocument {
  /** Instants en millisecondes. */
  readonly expireLe: number;
  readonly revoqueLe: number | null;
  readonly bloqueLe: number | null;
}

export function lienOuvert(lien: EtatLienDocument, instant: number): boolean {
  return lien.revoqueLe === null && lien.bloqueLe === null && instant < lien.expireLe;
}

export const envoiDocumentSaisieSchema = z.object({
  canal: z.enum(CANAUX_NOTIFICATION, { error: 'Choisir un canal.' }),
});

export const ouvertureLienSaisieSchema = z.object({ dateNaissance: dateCalendaireSchema });

export interface CoordonneesPatient {
  readonly telephone: string | null;
  readonly email: string | null;
  readonly consentementSms: boolean;
  readonly consentementEmail: boolean;
}

/**
 * Adresse du patient sur ce canal, `null` s'il n'en a pas ou n'y consent pas.
 * À VÉRIFIER : base légale de ces envois, absente de docs/ref ; le consentement est appliqué par prudence.
 */
export function adresseDuCanal(
  patient: CoordonneesPatient,
  canal: CanalNotification,
): string | null {
  return canal === 'SMS'
    ? patient.consentementSms
      ? patient.telephone
      : null
    : patient.consentementEmail
      ? patient.email
      : null;
}

export function canauxDisponibles(patient: CoordonneesPatient): CanalNotification[] {
  return CANAUX_NOTIFICATION.filter((canal) => adresseDuCanal(patient, canal) !== null);
}
