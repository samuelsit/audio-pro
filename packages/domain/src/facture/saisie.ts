import { z } from 'zod';

import { dateCalendaireSchema } from '../commun/date';
import { pageSchema } from '../commun/pagination';
import { texteOptionnelSchema } from '../commun/texte';
import { additionnerCentimes, centimes, centimesDepuisSaisieEuros, type Centimes } from '../money';
import { NATURES_PIECE, STATUTS_FACTURE } from './types';

export const STATUTS_PEC = [
  'A_DEMANDER',
  'DEMANDEE',
  'ACCORDEE',
  'PARTIELLE',
  'REFUSEE',
  'EXPIREE',
  'SANS_TIERS_PAYANT',
] as const;
export type StatutPec = (typeof STATUTS_PEC)[number];

export const LIBELLES_STATUTS_PEC: Readonly<Record<StatutPec, string>> = {
  A_DEMANDER: 'À demander',
  DEMANDEE: 'Demandée',
  ACCORDEE: 'Accordée',
  PARTIELLE: 'Accordée en partie',
  REFUSEE: 'Refusée',
  EXPIREE: 'Expirée',
  SANS_TIERS_PAYANT: 'Sans tiers payant',
};

function additionner(lignes: readonly { readonly montantDemandeCentimes: Centimes }[]): Centimes {
  return additionnerCentimes(...lignes.map((l) => l.montantDemandeCentimes));
}

function montantDepuisSaisie(saisie: string | null): Centimes | null | undefined {
  if (saisie === null) {
    return null;
  }
  const montant = centimesDepuisSaisieEuros(saisie);
  return montant === null ? undefined : centimes(montant);
}

const texteCourtSchema = texteOptionnelSchema.pipe(
  z.string().max(100, '100 caractères au maximum.').nullable(),
);

/** Ligne de la demande : l'offre du devis l'a préremplie, seul le montant demandé se saisit. */
const ligneDemandeSaisieSchema = z.object({
  libelle: z.string().trim().min(1).max(200),
  codeLpp: texteOptionnelSchema,
  prixTtcCentimes: z.coerce.number().int().nonnegative(),
  amoCentimes: z.coerce.number().int().nonnegative(),
  montant: z.string(),
});

/** Choix applicatif (R23) : rien n'est imposé par docs/ref sur le contenu d'une prise en charge. */
export const pecSaisieSchema = z
  .object({
    statut: z.enum(STATUTS_PEC, { error: 'Choisir le statut.' }),
    organisme: texteOptionnelSchema.pipe(
      z.string().max(200, '200 caractères au maximum.').nullable(),
    ),
    plateforme: texteCourtSchema,
    numeroAdherent: texteCourtSchema,
    numeroAccord: texteCourtSchema,
    montantAccorde: texteOptionnelSchema,
    datePec: texteOptionnelSchema.pipe(dateCalendaireSchema.nullable()),
    validiteFin: texteOptionnelSchema.pipe(dateCalendaireSchema.nullable()),
    complementaireId: texteOptionnelSchema.pipe(z.uuid().nullable()),
    devisId: texteOptionnelSchema.pipe(z.string().max(64).nullable()),
    offre: texteOptionnelSchema.pipe(z.string().max(30).nullable()),
    demande: z.array(ligneDemandeSaisieSchema).max(50).default([]),
  })
  .transform((saisie, ctx) => {
    const { statut, organisme, datePec, numeroAccord, validiteFin } = saisie;
    const manquant = (champ: string, message: string) => {
      ctx.addIssue({ code: 'custom', path: [champ], message });
    };
    if (statut === 'SANS_TIERS_PAYANT') {
      return {
        statut,
        organisme: null,
        plateforme: null,
        numeroAdherent: null,
        numeroAccord: null,
        montantAccordeCentimes: null,
        datePec: null,
        validiteFin: null,
        complementaireId: null,
        devisId: null,
        offre: null,
        demande: null,
        montantDemandeCentimes: null,
      };
    }
    if (organisme === null && saisie.complementaireId === null) {
      manquant('organisme', 'L’organisme est obligatoire.');
    }
    if (datePec === null && statut !== 'A_DEMANDER') {
      manquant('datePec', 'La date est obligatoire.');
    }
    if (validiteFin !== null && datePec !== null && validiteFin < datePec) {
      manquant('validiteFin', 'La validité finit avant la date de la prise en charge.');
    }
    const lignes = saisie.demande.map(({ montant: saisi, ...ligne }) => {
      const demande = montantDepuisSaisie(saisi === '' ? null : saisi);
      if (demande === undefined) {
        manquant('demande', 'Montant demandé invalide (exemple : 710,00).');
      }
      return { ...ligne, montantDemandeCentimes: demande ?? centimes(0) };
    });
    const demande = lignes.length > 0 ? lignes : null;
    const montantDemande = demande && additionner(lignes);
    const accordee = statut === 'ACCORDEE' || statut === 'PARTIELLE';
    const montant = accordee ? montantDepuisSaisie(saisie.montantAccorde) : null;
    if (accordee && numeroAccord === null) {
      manquant('numeroAccord', 'Le numéro d’accord est obligatoire.');
    }
    if (montant === undefined) {
      manquant('montantAccorde', 'Montant invalide (exemple : 710,00).');
    } else if (accordee && montant === null) {
      manquant('montantAccorde', 'Le montant accordé est obligatoire.');
    } else if (statut === 'PARTIELLE' && montant) {
      if (montantDemande === null) {
        manquant('demande', 'Renseigner la demande : un accord partiel se compare à elle.');
      } else if (montant >= montantDemande) {
        manquant('montantAccorde', 'Un accord partiel est inférieur au montant demandé.');
      }
    } else if (statut === 'ACCORDEE' && montant && montantDemande && montant < montantDemande) {
      manquant('statut', 'Montant inférieur à la demande : choisir « Accordée en partie ».');
    }
    return {
      statut,
      organisme,
      plateforme: saisie.plateforme,
      numeroAdherent: saisie.numeroAdherent,
      numeroAccord,
      montantAccordeCentimes: montant ?? null,
      datePec,
      validiteFin,
      complementaireId: saisie.complementaireId,
      devisId: saisie.devisId,
      offre: saisie.offre,
      demande,
      montantDemandeCentimes: montantDemande,
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
