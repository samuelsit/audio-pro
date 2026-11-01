import { z } from 'zod';

import { dateCalendaireSchema } from '../commun/date';

// Port de facturation SESAM-Vitale (FSE, DRE, NOEMIE, SCOR), réalisé par AreaFSE en mode masqué.
//
// Structure provisoire, définie pour FakeBillingEngine à l'étape 14. Elle sera alignée sur la documentation
// AreaFSE (docs/vendor/areafse) à l'étape 26 : noms et formats des champs, statuts, motifs de rejet.
// À VÉRIFIER : docs/vendor/areafse est vide ; aucun champ ci-dessous ne vient d'une documentation éditeur.
// Le brouillon porte le NIR : il ne se journalise pas et se stocke chiffré.

export const STATUTS_FSE = ['EN_ATTENTE', 'TRANSMISE', 'ACCEPTEE', 'REJETEE'] as const;
export type StatutFse = (typeof STATUTS_FSE)[number];

export const LIBELLES_STATUTS_FSE: Readonly<Record<StatutFse, string>> = {
  EN_ATTENTE: 'En attente',
  TRANSMISE: 'Transmise',
  ACCEPTEE: 'Acceptée',
  REJETEE: 'Rejetée',
};

const ligneFseSchema = z.object({
  codeLpp: z.string().min(1),
  codePrestation: z.string().min(1),
  oreille: z.enum(['GAUCHE', 'DROITE']).nullable(),
  numeroSerie: z.string().nullable(),
  quantite: z.number().int().positive(),
  montantFacture: z.number().int(),
  baseRemboursement: z.number().int(),
  amo: z.number().int(),
  amc: z.number().int(),
  resteACharge: z.number().int(),
});
export type LigneFse = z.output<typeof ligneFseSchema>;

export const fseDraftSchema = z.object({
  factureId: z.string().min(1),
  numeroFacture: z.string().min(1),
  dateFacture: dateCalendaireSchema,
  beneficiaire: z.object({
    nir: z.string().min(1),
    rangNaissance: z.number().int(),
    qualite: z.string(),
    nom: z.string().min(1),
    prenoms: z.string().min(1),
    dateNaissance: dateCalendaireSchema,
    regime: z.string().nullable(),
    caisse: z.string().nullable(),
    centreGestionnaire: z.string().nullable(),
  }),
  praticien: z.object({
    nom: z.string().min(1),
    prenom: z.string().min(1),
    rpps: z.string().min(1),
    adeli: z.string().nullable(),
    numeroFacturationAm: z.string().nullable(),
  }),
  prescripteur: z.object({
    nom: z.string().min(1),
    prenom: z.string().min(1),
    /** À VÉRIFIER : exigence du RPPS (R10), le blocage éventuel se décidera à l'étape 26. */
    rpps: z.string().nullable(),
    datePrescription: dateCalendaireSchema,
  }),
  lignes: z.array(ligneFseSchema).min(1),
  totaux: z.object({
    montantFacture: z.number().int(),
    amo: z.number().int(),
    amc: z.number().int(),
  }),
});
export type FseDraft = z.output<typeof fseDraftSchema>;

export const resultatFseSchema = z.object({
  reference: z.string().min(1),
  statut: z.enum(STATUTS_FSE),
  /** Renseigné sur un rejet : jamais de donnée du patient. */
  motif: z.string().nullable(),
});
export type ResultatFse = z.output<typeof resultatFseSchema>;

export interface BillingEngine {
  /** Dépose la FSE préparée. Un rejet immédiat est un statut, pas une erreur. */
  soumettre(draft: FseDraft): Promise<ResultatFse>;
  /** Statut courant d'une FSE déposée. */
  consulter(reference: string): Promise<ResultatFse>;
}
