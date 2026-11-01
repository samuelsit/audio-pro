import { z } from 'zod';

import { pageSchema } from '../commun/pagination';
import { parametreOptionnel, texteObligatoire, texteOptionnelSchema } from '../commun/texte';
import { QUANTITE_MAX_MOUVEMENT, prixAchatSchema } from '../stock/saisie';
import { DECISIONS_REGLE, TYPES_PRODUIT_COMMANDE } from './approbation';
import { STATUTS_COMMANDE } from './etats';

export const OREILLES_COMMANDE = ['DROITE', 'GAUCHE'] as const;
export type OreilleCommande = (typeof OREILLES_COMMANDE)[number];

const idOptionnelSchema = texteOptionnelSchema.pipe(z.uuid('Sélection invalide.').nullable());
const motifSchema = texteObligatoire('Le motif est obligatoire.', 500);

export const commandeCreationSchema = z.object({
  centreId: z.uuid('Choisir un centre.'),
  fournisseurId: z.uuid('Choisir un fournisseur.'),
});
export type CommandeCreation = z.output<typeof commandeCreationSchema>;

const quantiteSchema = z.coerce
  .number({ error: 'Quantité invalide.' })
  .int('Quantité invalide.')
  .min(1, 'Au moins 1.')
  .max(QUANTITE_MAX_MOUVEMENT, 'Quantité trop élevée.');

/** Le produit vient d'une seule liste : `modele:<id>` ou `accessoire:<id>`. */
export const ligneCommandeSaisieSchema = z
  .object({
    produit: z
      .string({ error: 'Choisir un produit.' })
      .regex(/^(modele|accessoire):[0-9a-f-]{36}$/, 'Choisir un produit.'),
    quantite: quantiteSchema,
    prixAchatCentimes: prixAchatSchema,
    enConsignation: z.boolean(),
    patientId: idOptionnelSchema,
    oreille: texteOptionnelSchema.pipe(
      z.enum(OREILLES_COMMANDE, { error: 'Oreille invalide.' }).nullable(),
    ),
  })
  .superRefine((saisie, ctx) => {
    if (saisie.oreille !== null && saisie.patientId === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['oreille'],
        message: 'L’oreille ne vaut que pour une commande nominative.',
      });
    }
  })
  .transform(({ produit, ...saisie }) => {
    const [genre, id] = produit.split(':') as [string, string];
    return {
      ...saisie,
      modeleId: genre === 'modele' ? id : null,
      accessoireId: genre === 'accessoire' ? id : null,
    };
  });
export type LigneCommandeSaisie = z.output<typeof ligneCommandeSaisieSchema>;

export const prixLigneSaisieSchema = z.object({ prixAchatCentimes: prixAchatSchema });

export const motifCommandeSchema = z.object({ motif: motifSchema });

export const regleCommandeSaisieSchema = z.object({
  libelle: texteObligatoire('Le libellé est obligatoire.', 100),
  priorite: z.coerce
    .number({ error: 'Priorité invalide.' })
    .int('Priorité invalide.')
    .min(0, 'Priorité invalide.')
    .max(9999, 'Priorité invalide.'),
  montantMaxCentimes: prixAchatSchema,
  typeProduit: texteOptionnelSchema.pipe(z.enum(TYPES_PRODUIT_COMMANDE).nullable()),
  fournisseurId: idOptionnelSchema,
  centreId: idOptionnelSchema,
  decision: z.enum(DECISIONS_REGLE, { error: 'Choisir la décision.' }),
  actif: z.boolean(),
});
export type RegleCommandeSaisie = z.output<typeof regleCommandeSaisieSchema>;

export const filtreCommandesSchema = z.object({
  page: pageSchema,
  statut: z.enum(STATUTS_COMMANDE).optional().catch(undefined),
  fournisseurId: parametreOptionnel(z.uuid()).catch(undefined),
});
export type FiltreCommandes = z.output<typeof filtreCommandesSchema>;

const ALPHABET_REFERENCE = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const OCTETS_REFERENCE_PATIENT = 8;

/** Code sans lien avec l'identité : seules des données aléatoires y entrent. Base 32, sans lettre ambiguë. */
export function referencePatientDepuis(octets: Uint8Array): string {
  const code = Array.from(octets, (octet) => ALPHABET_REFERENCE[octet % 32]).join('');
  return `PT-${code}`;
}
