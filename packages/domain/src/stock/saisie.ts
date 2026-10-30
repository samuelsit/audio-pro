import { z } from 'zod';

import { dateCalendaireSchema } from '../commun/date';
import { texteObligatoire, texteOptionnelSchema } from '../commun/texte';
import { centimesDepuisSaisieEuros } from '../money';
import { STATUTS_APPAREIL } from './etats';
import { doublonsDansLaSaisie, numeroSerieSchema } from './numero-serie';

/** Taille maximale d'une réception : une livraison, pas un import de masse. */
export const NUMEROS_MAX_PAR_RECEPTION = 200;
export const QUANTITE_MAX_MOUVEMENT = 100_000;

const motifSchema = texteObligatoire('Le motif est obligatoire.', 500);
const referenceSchema = (message: string) => texteObligatoire(message, 100);
const identifiantSchema = (message: string) => z.uuid({ error: message });

const prixAchatSchema = texteOptionnelSchema.transform((saisie, ctx) => {
  if (saisie === null) {
    return null;
  }
  const prix = centimesDepuisSaisieEuros(saisie);
  if (prix === null) {
    ctx.addIssue({ code: 'custom', message: 'Prix invalide (exemple : 650,00).' });
    return z.NEVER;
  }
  return prix;
});

const referenceFactureSchema = texteOptionnelSchema.pipe(
  z.string().max(100, '100 caractères au maximum.').nullable(),
);

export const receptionSaisieSchema = z.object({
  centreId: identifiantSchema('Choisir un centre.'),
  modeleId: identifiantSchema('Choisir un modèle.'),
  numerosSerie: z
    .array(numeroSerieSchema, { error: 'Saisir au moins un numéro de série.' })
    .min(1, 'Saisir au moins un numéro de série.')
    .max(
      NUMEROS_MAX_PAR_RECEPTION,
      `${NUMEROS_MAX_PAR_RECEPTION} numéros au maximum par réception.`,
    )
    .superRefine((numeros, ctx) => {
      for (const numero of doublonsDansLaSaisie(numeros)) {
        ctx.addIssue({ code: 'custom', message: `Numéro saisi deux fois : ${numero}.` });
      }
    }),
  referenceBonLivraison: referenceSchema('La référence du bon de livraison est obligatoire.'),
  referenceFactureFabricant: referenceFactureSchema,
  dateReception: dateCalendaireSchema,
  prixAchatCentimes: prixAchatSchema,
  enConsignation: z.boolean(),
});
export type ReceptionSaisie = z.infer<typeof receptionSaisieSchema>;

export const changementStatutSaisieSchema = z.object({
  statut: z.enum(STATUTS_APPAREIL, { error: 'Choisir un statut.' }),
  patientId: texteOptionnelSchema.pipe(identifiantSchema('Patient inconnu.').nullable()),
  motif: motifSchema,
});
export type ChangementStatutSaisie = z.infer<typeof changementStatutSaisieSchema>;

export const transfertSaisieSchema = z.object({
  centreDestinationId: identifiantSchema('Choisir le centre de destination.'),
  motif: motifSchema,
});
export type TransfertSaisie = z.infer<typeof transfertSaisieSchema>;

export const annulationVenteSaisieSchema = z.object({ motif: motifSchema });
export type AnnulationVenteSaisie = z.infer<typeof annulationVenteSaisieSchema>;

/** `numeroSerie` et `modeleId` ne sont fournis que par une correction de l'ADMIN. */
export const modificationAppareilSaisieSchema = z.object({
  referenceBonLivraison: referenceSchema('La référence du bon de livraison est obligatoire.'),
  referenceFactureFabricant: referenceFactureSchema,
  prixAchatCentimes: prixAchatSchema,
  enConsignation: z.boolean(),
  numeroSerie: numeroSerieSchema.optional(),
  modeleId: identifiantSchema('Choisir un modèle.').optional(),
});
export type ModificationAppareilSaisie = z.infer<typeof modificationAppareilSaisieSchema>;

const quantiteSchema = z.coerce
  .number({ error: 'Quantité invalide.' })
  .int('La quantité doit être un nombre entier.')
  .min(1, 'La quantité doit être au moins de 1.')
  .max(QUANTITE_MAX_MOUVEMENT, `${QUANTITE_MAX_MOUVEMENT} au maximum.`);

export const mouvementAccessoireSaisieSchema = z.object({
  centreId: identifiantSchema('Choisir un centre.'),
  accessoireId: identifiantSchema('Choisir un accessoire.'),
  quantite: quantiteSchema,
  motif: motifSchema,
});
export type MouvementAccessoireSaisie = z.infer<typeof mouvementAccessoireSaisieSchema>;

export const transfertAccessoireSaisieSchema = mouvementAccessoireSaisieSchema
  .extend({ centreDestinationId: identifiantSchema('Choisir le centre de destination.') })
  .refine((s) => s.centreId !== s.centreDestinationId, {
    path: ['centreDestinationId'],
    message: 'Choisir un autre centre.',
  });
export type TransfertAccessoireSaisie = z.infer<typeof transfertAccessoireSaisieSchema>;

/** Une réception se déclare au plus tard le jour même. */
export function dateReceptionValide(dateReception: string, aujourdhui: string): boolean {
  return dateReception <= aujourdhui;
}
