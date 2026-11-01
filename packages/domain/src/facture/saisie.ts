import { z } from 'zod';

import { dateCalendaireSchema } from '../commun/date';
import { pageSchema } from '../commun/pagination';
import { texteOptionnelSchema } from '../commun/texte';
import { centimes, centimesDepuisSaisieEuros, type Centimes } from '../money';
import { NATURES_PIECE, STATUTS_FACTURE } from './types';

export const STATUTS_PEC = ['DEMANDEE', 'ACCORDEE', 'REFUSEE', 'SANS_TIERS_PAYANT'] as const;
export type StatutPec = (typeof STATUTS_PEC)[number];

export const LIBELLES_STATUTS_PEC: Readonly<Record<StatutPec, string>> = {
  DEMANDEE: 'Demandée',
  ACCORDEE: 'Accordée',
  REFUSEE: 'Refusée',
  SANS_TIERS_PAYANT: 'Sans tiers payant',
};

function montantDepuisSaisie(saisie: string | null): Centimes | null | undefined {
  if (saisie === null) {
    return null;
  }
  const montant = centimesDepuisSaisieEuros(saisie);
  return montant === null ? undefined : centimes(montant);
}

/** Choix applicatif (R23) : rien n'est imposé par docs/ref sur le contenu d'une prise en charge. */
export const pecSaisieSchema = z
  .object({
    statut: z.enum(STATUTS_PEC, { error: 'Choisir le statut.' }),
    organisme: texteOptionnelSchema.pipe(
      z.string().max(200, '200 caractères au maximum.').nullable(),
    ),
    plateforme: texteOptionnelSchema.pipe(
      z.string().max(100, '100 caractères au maximum.').nullable(),
    ),
    numeroAccord: texteOptionnelSchema.pipe(
      z.string().max(100, '100 caractères au maximum.').nullable(),
    ),
    montantAccorde: texteOptionnelSchema,
    datePec: texteOptionnelSchema.pipe(dateCalendaireSchema.nullable()),
  })
  .transform((saisie, ctx) => {
    const { statut, organisme, datePec, numeroAccord } = saisie;
    const manquant = (champ: string, message: string) => {
      ctx.addIssue({ code: 'custom', path: [champ], message });
    };
    if (statut === 'SANS_TIERS_PAYANT') {
      return {
        statut,
        organisme: null,
        plateforme: null,
        numeroAccord: null,
        montantAccordeCentimes: null,
        datePec: null,
      };
    }
    if (organisme === null) {
      manquant('organisme', 'L’organisme est obligatoire.');
    }
    if (datePec === null) {
      manquant('datePec', 'La date est obligatoire.');
    }
    const accordee = statut === 'ACCORDEE';
    const montant = accordee ? montantDepuisSaisie(saisie.montantAccorde) : null;
    if (accordee && numeroAccord === null) {
      manquant('numeroAccord', 'Le numéro d’accord est obligatoire.');
    }
    if (montant === undefined) {
      manquant('montantAccorde', 'Montant invalide (exemple : 710,00).');
    } else if (accordee && montant === null) {
      manquant('montantAccorde', 'Le montant accordé est obligatoire.');
    }
    return {
      statut,
      organisme,
      plateforme: saisie.plateforme,
      numeroAccord,
      montantAccordeCentimes: montant ?? null,
      datePec,
    };
  });
export type PecSaisie = z.output<typeof pecSaisieSchema>;

export const ETATS_FACTURE = ['PRET', 'BLOQUE'] as const;
export type EtatFacture = (typeof ETATS_FACTURE)[number];

export const LIBELLES_ETATS_FACTURE: Readonly<Record<EtatFacture, string>> = {
  PRET: 'Prêts à facturer',
  BLOQUE: 'Bloqués',
};

/** Paramètres d'URL de la file « À facturer ». Le centre vient du périmètre courant. */
export const filtreAFacturerSchema = z.object({
  page: pageSchema,
  etat: z.enum(ETATS_FACTURE).catch('PRET'),
});
export type FiltreAFacturer = z.output<typeof filtreAFacturerSchema>;

/** Paramètres d'URL de la liste des factures. Le centre vient du périmètre courant. */
export const filtreFacturesSchema = z.object({
  page: pageSchema,
  nature: z.enum(NATURES_PIECE).optional().catch(undefined),
  statut: z.enum(STATUTS_FACTURE).optional().catch(undefined),
});
export type FiltreFactures = z.output<typeof filtreFacturesSchema>;

export const NATURES_LIGNE_SAISIE = ['ACCESSOIRE', 'PILE', 'ENTRETIEN'] as const;

/** Ligne saisie au brouillon : un article du catalogue ou un entretien libre. */
export const ligneBrouillonSaisieSchema = z
  .object({
    nature: z.enum(NATURES_LIGNE_SAISIE, { error: 'Choisir le type de ligne.' }),
    accessoireId: texteOptionnelSchema,
    libelle: z
      .string({ error: 'Le libellé est obligatoire.' })
      .trim()
      .min(1, 'Le libellé est obligatoire.')
      .max(200, '200 caractères au maximum.'),
    quantite: z.coerce
      .number({ error: 'Quantité invalide.' })
      .int('Quantité invalide.')
      .min(1, 'Quantité invalide.')
      .max(999, 'Quantité invalide.'),
    prixUnitaire: z.string({ error: 'Le prix est obligatoire.' }).transform((saisie, ctx) => {
      const montant = centimesDepuisSaisieEuros(saisie);
      if (montant === null) {
        ctx.addIssue({ code: 'custom', message: 'Prix invalide (exemple : 12,50).' });
        return z.NEVER;
      }
      return centimes(montant);
    }),
  })
  .superRefine(({ nature, accessoireId }, ctx) => {
    if (nature !== 'ENTRETIEN' && accessoireId === null) {
      ctx.addIssue({ code: 'custom', path: ['accessoireId'], message: 'Choisir un article.' });
    }
    if (nature === 'ENTRETIEN' && accessoireId !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['accessoireId'],
        message: 'Un entretien ne porte pas d’article.',
      });
    }
  });
export type LigneBrouillonSaisie = z.output<typeof ligneBrouillonSaisieSchema>;

export const venteDirecteSaisieSchema = z.object({
  patientId: z.string({ error: 'Choisir un patient.' }).min(1, 'Choisir un patient.'),
  centreId: z.string({ error: 'Choisir un centre.' }).min(1, 'Choisir un centre.'),
  /** Facultative : ouvre le remboursement des lignes LPP (R30). */
  prescriptionId: texteOptionnelSchema,
});
export type VenteDirecteSaisie = z.output<typeof venteDirecteSaisieSchema>;
