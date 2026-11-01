import { z } from 'zod';

import { pageSchema } from '../commun/pagination';
import { parametreOptionnel, texteObligatoire, texteOptionnelSchema } from '../commun/texte';
import { centimesDepuisSaisieEuros } from '../money';
import { normaliserNumeroSerie } from '../stock/numero-serie';
import { MOTIFS_SAV } from './garantie';
import { ACTIONS_SAV, STATUTS_TICKET } from './ticket';

const motifSavSchema = z.enum(MOTIFS_SAV, { error: 'Choisir le motif.' });
const texteLibreSchema = texteOptionnelSchema.pipe(
  z.string().max(2000, '2000 caractères au maximum.').nullable(),
);

export const numeroSerieRechercheSchema = texteObligatoire(
  'Saisir le numéro de série.',
  60,
).transform(normaliserNumeroSerie);

export const ouvertureTicketSchema = z.object({
  numeroSerie: numeroSerieRechercheSchema,
  motif: motifSavSchema,
  description: texteLibreSchema,
});

/** Montant facultatif en euros : vide, aucun coût connu. */
const coutSchema = z.string().transform((saisie, ctx) => {
  if (saisie.trim() === '') {
    return null;
  }
  const montant = centimesDepuisSaisieEuros(saisie);
  if (montant === null) {
    ctx.addIssue({ code: 'custom', message: 'Montant invalide (exemple : 45,00).' });
    return z.NEVER;
  }
  return montant;
});

export const diagnosticTicketSchema = z.object({
  motif: motifSavSchema,
  diagnostic: texteObligatoire('Le diagnostic est obligatoire.', 2000),
  action: z.enum(ACTIONS_SAV, { error: 'Choisir l’action.' }),
  cout: coutSchema,
});

export const motifObligatoireSchema = z.object({
  motif: texteObligatoire('Le motif est obligatoire.', 500),
});

export const filtreTicketsSchema = z.object({
  page: pageSchema,
  statut: z.enum(STATUTS_TICKET).optional().catch(undefined),
  motif: parametreOptionnel(motifSavSchema).catch(undefined),
});
export type FiltreTickets = z.output<typeof filtreTicketsSchema>;

const lignesComptoirSchema = z.array(
  z.object({
    accessoireId: z.uuid('Article inconnu.'),
    quantite: z.coerce
      .number({ error: 'Quantité invalide.' })
      .int('Quantité invalide.')
      .min(1, 'Quantité invalide.')
      .max(999, 'Quantité invalide.'),
  }),
);

/** Vente au comptoir : articles du catalogue, plus un entretien libre. La fiche patient reste requise (R30). */
export const venteComptoirSchema = z
  .object({
    patientId: z.uuid('Choisir un patient.'),
    centreId: z.uuid('Choisir un centre.'),
    prescriptionId: texteOptionnelSchema,
    lignes: lignesComptoirSchema,
    entretienLibelle: texteOptionnelSchema,
    entretienPrix: coutSchema,
  })
  .superRefine(({ lignes, entretienLibelle, entretienPrix }, ctx) => {
    if ((entretienLibelle === null) !== (entretienPrix === null)) {
      ctx.addIssue({
        code: 'custom',
        path: ['entretienPrix'],
        message: 'Saisir le libellé et le prix de l’entretien.',
      });
    }
    if (lignes.length === 0 && entretienLibelle === null) {
      ctx.addIssue({ code: 'custom', path: ['lignes'], message: 'Choisir au moins un article.' });
    }
  });
