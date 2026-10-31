import { z } from 'zod';

import { TYPES_APPAREILLAGE } from '../audio-rules/prescription';
import { dateCalendaireSchema } from '../commun/date';
import { texteObligatoire, texteOptionnelSchema } from '../commun/texte';
import { STATUTS_DOSSIER } from './etats';
import { OREILLES_DOSSIER, oreillesConcernees } from './oreilles';

const identifiantSchema = (message: string) => z.uuid({ error: message });

const typeOreilleSchema = texteOptionnelSchema.pipe(
  z.enum(TYPES_APPAREILLAGE, { error: 'Type d’appareillage inconnu.' }).nullable(),
);

export const dossierSaisieSchema = z
  .object({
    centreId: identifiantSchema('Choisir un centre.'),
    praticienId: identifiantSchema('Choisir un audioprothésiste.'),
    oreilles: z.enum(OREILLES_DOSSIER, { error: 'Choisir les oreilles à appareiller.' }),
    typeDroite: typeOreilleSchema,
    typeGauche: typeOreilleSchema,
    surdicecite: z.boolean(),
  })
  .superRefine(({ oreilles, typeDroite, typeGauche }, ctx) => {
    const concernees = oreillesConcernees(oreilles);
    if (concernees.includes('DROITE') && typeDroite === null) {
      ctx.addIssue({ code: 'custom', path: ['typeDroite'], message: 'Choisir le type.' });
    }
    if (concernees.includes('GAUCHE') && typeGauche === null) {
      ctx.addIssue({ code: 'custom', path: ['typeGauche'], message: 'Choisir le type.' });
    }
  })
  // Le type d'une oreille écartée après coup dans le formulaire ne compte pas.
  .transform(({ oreilles, typeDroite, typeGauche, ...reste }) => {
    const concernees = oreillesConcernees(oreilles);
    return {
      ...reste,
      oreilles,
      typeDroite: concernees.includes('DROITE') ? typeDroite : null,
      typeGauche: concernees.includes('GAUCHE') ? typeGauche : null,
    };
  });
export type DossierSaisie = z.output<typeof dossierSaisieSchema>;

export const prescriptionSaisieSchema = z.object({
  prescripteurId: identifiantSchema('Choisir un prescripteur.'),
  datePrescription: dateCalendaireSchema,
  oreilles: z.enum(OREILLES_DOSSIER, { error: 'Choisir les oreilles prescrites.' }),
  mentionRenouvellement: z.boolean(),
  /** Statut affiché à l'utilisateur : s'il a changé entre-temps, l'opération est refusée. */
  statutAttendu: z.enum(STATUTS_DOSSIER, { error: 'Statut actuel inconnu.' }),
  forcer: z.boolean(),
  motifForcage: texteOptionnelSchema.pipe(
    z.string().max(500, '500 caractères au maximum.').nullable(),
  ),
});
export type PrescriptionSaisie = z.output<typeof prescriptionSaisieSchema>;

export const abandonDossierSaisieSchema = z.object({
  /** Statut affiché à l'utilisateur : s'il a changé entre-temps, l'opération est refusée. */
  statutAttendu: z.enum(STATUTS_DOSSIER, { error: 'Statut actuel inconnu.' }),
  motif: texteObligatoire('Le motif est obligatoire.', 500),
});
export type AbandonDossierSaisie = z.output<typeof abandonDossierSaisieSchema>;
