import { z } from 'zod';

import { dateCalendaireSchema } from '../commun/date';
import { texteObligatoire, texteOptionnelSchema } from '../commun/texte';
import { normaliserNumeroSerie } from '../stock/numero-serie';

export const STATUTS_RETOUR = [
  'PREPARE',
  'ENVOYE',
  'REPARE',
  'ECHANGE',
  'REFUSE',
  'ANNULE',
] as const;
export type StatutRetour = (typeof STATUTS_RETOUR)[number];

export const LIBELLES_STATUTS_RETOUR: Readonly<Record<StatutRetour, string>> = {
  PREPARE: 'Préparé',
  ENVOYE: 'Envoyé',
  REPARE: 'Réparé',
  ECHANGE: 'Échangé',
  REFUSE: 'Refusé',
  ANNULE: 'Annulé',
};

/** Un seul retour en cours par ticket : un refus du fabricant permet d'en préparer un autre. */
export const STATUTS_RETOUR_EN_COURS: readonly StatutRetour[] = ['PREPARE', 'ENVOYE'];

const idSchema = (message: string) => z.uuid(message);
const descriptionSchema = texteOptionnelSchema.pipe(
  z.string().max(500, '500 caractères au maximum.').nullable(),
);

/** Exactement une source : le ticket, un appareil en stock ou un écart de réception. */
export const preparationRetourSchema = z
  .object({
    fournisseurId: idSchema('Choisir le fournisseur.'),
    ticketId: texteOptionnelSchema,
    appareilId: texteOptionnelSchema,
    ecartId: texteOptionnelSchema,
    descriptionPanne: descriptionSchema,
  })
  .refine(
    ({ ticketId, appareilId, ecartId }) =>
      [ticketId, appareilId, ecartId].filter((source) => source !== null).length === 1,
    { path: ['fournisseurId'], message: 'Ce retour n’a pas de source.' },
  );

export const envoiRetourSchema = z.object({
  transporteur: texteOptionnelSchema,
  numeroSuivi: texteOptionnelSchema,
  dateEnvoi: dateCalendaireSchema,
});

export const issueRetourSchema = z.object({
  issue: z.enum(['REPARE', 'REFUSE'], { error: 'Choisir l’issue.' }),
});

const numeroSerieSchema = texteObligatoire('Saisir le numéro de série.', 60).transform(
  normaliserNumeroSerie,
);

/** La série se saisit deux fois : deux mouvements suffisent à la figer dans la fiche de l'appareil. */
export const remplacantSaisieSchema = z
  .object({
    modeleId: idSchema('Choisir le modèle.'),
    numeroSerie: numeroSerieSchema,
    confirmation: numeroSerieSchema,
    referenceBonLivraison: texteObligatoire(
      'La référence du bon de livraison est obligatoire.',
      100,
    ),
  })
  .refine(({ numeroSerie, confirmation }) => numeroSerie === confirmation, {
    path: ['confirmation'],
    message: 'Les deux numéros diffèrent.',
  });

export const correctionSerieSchema = z
  .object({ numeroSerie: numeroSerieSchema, confirmation: numeroSerieSchema })
  .refine(({ numeroSerie, confirmation }) => numeroSerie === confirmation, {
    path: ['confirmation'],
    message: 'Les deux numéros diffèrent.',
  });
