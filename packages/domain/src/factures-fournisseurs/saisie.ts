import { z } from 'zod';

import { pageSchema } from '../commun/pagination';
import { dateCalendaireSchema } from '../commun/date';
import { texteObligatoire, texteOptionnelSchema } from '../commun/texte';
import { centimesDepuisSaisieEuros } from '../money';
import { normaliserNumeroSerie } from '../stock/numero-serie';

export const STATUTS_FACTURE_FOURNISSEUR = ['A_VALIDER', 'VALIDEE', 'REJETEE'] as const;
export type StatutFactureFournisseur = (typeof STATUTS_FACTURE_FOURNISSEUR)[number];

export const LIBELLES_STATUT_FACTURE_FOURNISSEUR: Readonly<
  Record<StatutFactureFournisseur, string>
> = { A_VALIDER: 'À valider', VALIDEE: 'Validée', REJETEE: 'Rejetée' };

export const ORIGINES_FACTURE_FOURNISSEUR = ['EMAIL', 'DEPOT', 'PLATEFORME'] as const;
export type OrigineFactureFournisseur = (typeof ORIGINES_FACTURE_FOURNISSEUR)[number];

export const LIBELLES_ORIGINE_FACTURE: Readonly<Record<OrigineFactureFournisseur, string>> = {
  EMAIL: 'Boîte mail',
  DEPOT: 'Dépôt',
  PLATEFORME: 'Plateforme agréée',
};

/** Choix technique : au-delà, un PDF de facture est suspect. */
export const TAILLE_MAX_FACTURE_OCTETS = 10 * 1024 * 1024;

/** Contrôle des octets de signature : l'extension et le type annoncé se falsifient. */
export function estUnPdf(contenu: Uint8Array): boolean {
  const entete = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
  return contenu.length > entete.length && entete.every((octet, rang) => contenu[rang] === octet);
}

function montantSchema(message: string) {
  return z.string({ error: message }).transform((saisie, ctx) => {
    const centimes = centimesDepuisSaisieEuros(saisie);
    if (centimes === null) {
      ctx.addIssue({ code: 'custom', message });
      return z.NEVER;
    }
    return centimes;
  });
}

function montantOptionnelSchema(message: string) {
  return texteOptionnelSchema.transform((saisie, ctx) => {
    if (saisie === null) {
      return null;
    }
    const centimes = centimesDepuisSaisieEuros(saisie);
    if (centimes === null) {
      ctx.addIssue({ code: 'custom', message });
      return z.NEVER;
    }
    return centimes;
  });
}

const idOptionnelSchema = texteOptionnelSchema.pipe(z.uuid('Sélection invalide.').nullable());

export const ligneFactureSaisieSchema = z.object({
  commandeLigneId: idOptionnelSchema,
  reference: texteOptionnelSchema.pipe(z.string().max(100).nullable()),
  designation: texteObligatoire('La désignation est obligatoire.', 300),
  quantite: z.coerce
    .number({ error: 'Quantité invalide.' })
    .int('Quantité invalide.')
    .min(1, 'Quantité invalide.'),
  prixUnitaireCentimes: montantSchema('Prix invalide.'),
  tauxTva: montantOptionnelSchema('Taux invalide.'),
  /** Séparés par des espaces ou des virgules. */
  numerosSerie: z
    .string()
    .optional()
    .transform((valeur) =>
      (valeur ?? '')
        .split(/[,;\s]+/)
        .map(normaliserNumeroSerie)
        .filter((n) => n !== ''),
    ),
});
export type LigneFactureSaisie = z.output<typeof ligneFactureSaisieSchema>;

/** Brouillon : tout reste facultatif. C'est la validation qui exige une facture complète. */
export const factureFournisseurSaisieSchema = z.object({
  fournisseurId: idOptionnelSchema,
  centreId: idOptionnelSchema,
  numero: texteOptionnelSchema.pipe(z.string().max(100, '100 caractères au maximum.').nullable()),
  dateFacture: texteOptionnelSchema.pipe(dateCalendaireSchema.nullable()),
  montantHt: montantOptionnelSchema('Montant invalide.'),
  montantTva: montantOptionnelSchema('Montant invalide.'),
  montantTtc: montantOptionnelSchema('Montant invalide.'),
  lignes: z.array(ligneFactureSaisieSchema),
});
export type FactureFournisseurSaisie = z.output<typeof factureFournisseurSaisieSchema>;

export const filtreFacturesFournisseurSchema = z.object({
  page: pageSchema,
  statut: z.enum(STATUTS_FACTURE_FOURNISSEUR).optional().catch(undefined),
});
export type FiltreFacturesFournisseur = z.output<typeof filtreFacturesFournisseurSchema>;

export interface ChampsFactureAValider {
  readonly fournisseurId: string | null;
  readonly centreId: string | null;
  readonly numero: string | null;
  readonly dateFacture: unknown;
  readonly montantHtCentimes: number | null;
  readonly montantTvaCentimes: number | null;
  readonly montantTtcCentimes: number | null;
  readonly nombreLignes: number;
}

/** Ce qu'il manque pour valider : par champ du formulaire. */
export function champsManquants(facture: ChampsFactureAValider): Record<string, string> {
  const manquants: [string, boolean, string][] = [
    ['fournisseurId', facture.fournisseurId === null, 'Choisir le fournisseur.'],
    ['centreId', facture.centreId === null, 'Choisir le centre.'],
    ['numero', facture.numero === null, 'Saisir le numéro de facture.'],
    ['dateFacture', facture.dateFacture === null, 'Saisir la date.'],
    ['montantHt', facture.montantHtCentimes === null, 'Saisir le total HT.'],
    ['montantTva', facture.montantTvaCentimes === null, 'Saisir la TVA.'],
    ['montantTtc', facture.montantTtcCentimes === null, 'Saisir le total TTC.'],
    ['lignes', facture.nombreLignes === 0, 'Ajouter au moins une ligne.'],
  ];
  return Object.fromEntries(manquants.filter(([, manque]) => manque).map(([c, , m]) => [c, m]));
}
