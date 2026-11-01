import type { Centimes } from '../money';
import type { CouvertureSav } from './garantie';

export const STATUTS_TICKET = [
  'OUVERT',
  'EN_COURS',
  'CHEZ_FABRICANT',
  'A_RESTITUER',
  'CLOTURE',
  'ANNULE',
] as const;
export type StatutTicket = (typeof STATUTS_TICKET)[number];

export const LIBELLES_STATUTS_TICKET: Readonly<Record<StatutTicket, string>> = {
  OUVERT: 'Ouvert',
  EN_COURS: 'En cours',
  CHEZ_FABRICANT: 'Chez le fabricant',
  A_RESTITUER: 'À restituer',
  CLOTURE: 'Clôturé',
  ANNULE: 'Annulé',
};

export const ACTIONS_SAV = ['REPARATION_CENTRE', 'ENVOI_FABRICANT', 'ECHANGE'] as const;
export type ActionSav = (typeof ACTIONS_SAV)[number];

export const LIBELLES_ACTIONS_SAV: Readonly<Record<ActionSav, string>> = {
  REPARATION_CENTRE: 'Réparation au centre',
  ENVOI_FABRICANT: 'Envoi au fabricant',
  ECHANGE: 'Échange',
};

/** Choix d'organisation, sans texte de référence. Un refus du fabricant ramène le ticket en cours. */
const TRANSITIONS_TICKET: Readonly<Record<StatutTicket, readonly StatutTicket[]>> = {
  OUVERT: ['EN_COURS', 'ANNULE'],
  EN_COURS: ['CHEZ_FABRICANT', 'A_RESTITUER', 'ANNULE'],
  CHEZ_FABRICANT: ['A_RESTITUER', 'EN_COURS'],
  A_RESTITUER: ['CLOTURE'],
  CLOTURE: [],
  ANNULE: [],
};

export function ticketPeutPasser(de: StatutTicket, vers: StatutTicket): boolean {
  return TRANSITIONS_TICKET[de].includes(vers);
}

export const STATUTS_TICKET_OUVERTS: readonly StatutTicket[] = STATUTS_TICKET.filter(
  (statut) => TRANSITIONS_TICKET[statut].length > 0,
);

export const REFUS_FACTURATION_TICKET = [
  'SOUS_GARANTIE',
  'SOUS_ASSURANCE',
  'SANS_PATIENT',
  'SANS_COUT',
] as const;
export type RefusFacturationTicket = (typeof REFUS_FACTURATION_TICKET)[number];

export const MESSAGES_REFUS_FACTURATION: Readonly<Record<RefusFacturationTicket, string>> = {
  SOUS_GARANTIE:
    'Sous garantie : pièces, main-d’œuvre et transport ne se facturent pas au patient.',
  SOUS_ASSURANCE: 'Pris en charge par l’assurance : rien à facturer au patient.',
  SANS_PATIENT: 'Ce ticket ne concerne aucun patient.',
  SANS_COUT: 'Saisir d’abord le coût au diagnostic.',
};

/**
 * Rappel affiché avant de facturer un ticket hors garantie.
 * Source : modele-devis-audio.pdf p. 2 § 4 : « l'entretien et les réparations nécessaires » figurent parmi les
 * prestations comprises dans le prix, sans frais « avant, pendant ou après l'achat ».
 * À VÉRIFIER : portée exacte hors garantie, le motif saisi garde la justification (R53).
 */
export const AVERTISSEMENT_FACTURATION_SAV =
  'Le devis normalisé inclut l’entretien et les réparations nécessaires dans le prix de l’appareil. ' +
  'Facturez seulement ce qui en sort réellement, et indiquez pourquoi.';

/**
 * `null` si le ticket se facture.
 * Source : modele-devis-audio.pdf p. 2 § 4 (garantie : pièces, main-d'œuvre et transport).
 */
export function refusFacturationTicket(ticket: {
  readonly couverture: CouvertureSav;
  readonly coutCentimes: Centimes | number | null;
  readonly patientId: string | null;
}): RefusFacturationTicket | null {
  if (ticket.couverture === 'GARANTIE') {
    return 'SOUS_GARANTIE';
  }
  if (ticket.couverture === 'ASSURANCE') {
    return 'SOUS_ASSURANCE';
  }
  if (ticket.patientId === null) {
    return 'SANS_PATIENT';
  }
  return ticket.coutCentimes === null || ticket.coutCentimes <= 0 ? 'SANS_COUT' : null;
}
