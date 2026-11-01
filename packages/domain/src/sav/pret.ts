import { z } from 'zod';

import { ajouterJours, dateCalendaireSchema } from '../commun/date';
import { texteOptionnelSchema } from '../commun/texte';

export const ETATS_PRET = ['EN_COURS', 'A_ECHEANCE', 'EN_RETARD', 'RENDU'] as const;
export type EtatPret = (typeof ETATS_PRET)[number];

export const LIBELLES_ETATS_PRET: Readonly<Record<EtatPret, string>> = {
  EN_COURS: 'En cours',
  A_ECHEANCE: 'Bientôt dû',
  EN_RETARD: 'En retard',
  RENDU: 'Rendu',
};

/** Choix applicatif, comme l'alerte à 7 jours de l'essai : aucun texte sur le prêt d'un appareil (R55). */
export const ALERTE_PRET_JOURS = 3;

/** Calculé à la lecture : un prêt n'est en retard que le lendemain de la date prévue. */
export function etatPret(
  pret: { readonly dateRetourPrevue: string; readonly dateRetour: string | null },
  jour: string,
): EtatPret {
  if (pret.dateRetour !== null) {
    return 'RENDU';
  }
  if (jour > pret.dateRetourPrevue) {
    return 'EN_RETARD';
  }
  return ajouterJours(jour, ALERTE_PRET_JOURS) >= pret.dateRetourPrevue ? 'A_ECHEANCE' : 'EN_COURS';
}

const dateOptionnelleSchema = z.preprocess(
  (valeur) => (valeur === '' ? null : valeur),
  dateCalendaireSchema.nullable(),
);

export const pretSaisieSchema = z.object({
  appareilId: z.uuid('Choisir un appareil.'),
  patientId: z.uuid('Choisir un patient.'),
  /** Vide : la durée paramétrée. */
  dateRetourPrevue: dateOptionnelleSchema,
  ticketId: texteOptionnelSchema,
});

export const retourPretSaisieSchema = z.object({
  etatRetour: texteOptionnelSchema.pipe(
    z.string().max(500, '500 caractères au maximum.').nullable(),
  ),
});

export const parcPretSaisieSchema = z.object({ parcPret: z.boolean() });
