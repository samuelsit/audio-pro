import { z } from 'zod';

import { dateCalendaireSchema } from '../commun/date';
import { pageSchema } from '../commun/pagination';
import { texteObligatoire, texteOptionnelSchema } from '../commun/texte';
import { QUANTITE_MAX_MOUVEMENT } from '../stock/saisie';
import type { QuantitesLigne, StatutCommande } from './etats';
import { resteARecevoir } from './etats';

export const TYPES_ECART_ACHAT = [
  'QUANTITE_MANQUANTE',
  'SURPLUS',
  'PRODUIT_NON_CONFORME',
  'PRIX',
  'QUANTITE_FACTUREE',
  'LIGNE_NON_COMMANDEE',
  'SERIE_INCONNUE',
  'SERIE_ABSENTE',
  'SERIE_DEJA_FACTUREE',
  'TOTAL_INCOHERENT',
] as const;
export type TypeEcartAchat = (typeof TYPES_ECART_ACHAT)[number];

export const LIBELLES_TYPE_ECART: Readonly<Record<TypeEcartAchat, string>> = {
  QUANTITE_MANQUANTE: 'Quantité manquante',
  SURPLUS: 'Surplus reçu',
  PRODUIT_NON_CONFORME: 'Produit non conforme',
  PRIX: 'Écart de prix',
  QUANTITE_FACTUREE: 'Quantité facturée supérieure à la reçue',
  LIGNE_NON_COMMANDEE: 'Ligne non commandée',
  SERIE_INCONNUE: 'Numéro de série inconnu',
  SERIE_ABSENTE: 'Numéro de série absent de la facture',
  SERIE_DEJA_FACTUREE: 'Numéro de série déjà facturé',
  TOTAL_INCOHERENT: 'Total incohérent',
};

export const STATUTS_ECART_ACHAT = ['OUVERT', 'ACCEPTE', 'CONTESTE', 'RESOLU'] as const;
export type StatutEcartAchat = (typeof STATUTS_ECART_ACHAT)[number];

export const LIBELLES_STATUT_ECART: Readonly<Record<StatutEcartAchat, string>> = {
  OUVERT: 'Ouvert',
  ACCEPTE: 'Accepté',
  CONTESTE: 'Contesté',
  RESOLU: 'Résolu',
};

/** Un écart contesté attend encore la réponse du fournisseur : il retient la clôture. */
export const STATUTS_ECART_A_TRAITER = [
  'OUVERT',
  'CONTESTE',
] as const satisfies readonly StatutEcartAchat[];

export function ecartTraitable(statut: StatutEcartAchat): boolean {
  return statut === 'OUVERT' || statut === 'CONTESTE';
}

function quantiteSchema(message: string) {
  return z.coerce
    .number({ error: message })
    .int(message)
    .min(0, message)
    .max(QUANTITE_MAX_MOUVEMENT, message);
}

export const pointageLigneSchema = z.object({
  ligneId: z.uuid('Ligne inconnue.'),
  /** Accessoires et piles. Pour un appareil, la quantité vient des numéros de série. */
  quantite: quantiteSchema('Quantité invalide.'),
  numerosSerie: z.array(z.string()),
  quantiteNonConforme: quantiteSchema('Quantité invalide.'),
  commentaire: texteOptionnelSchema.pipe(
    z.string().max(500, '500 caractères au maximum.').nullable(),
  ),
});

export const pointageSaisieSchema = z
  .object({
    dateReception: dateCalendaireSchema,
    referenceBonLivraison: texteObligatoire(
      'La référence du bon de livraison est obligatoire.',
      100,
    ),
    lignes: z.array(pointageLigneSchema),
  })
  .superRefine(({ lignes }, ctx) => {
    if (new Set(lignes.map((l) => l.ligneId)).size !== lignes.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['lignes'],
        message: 'Une ligne est pointée deux fois.',
      });
    }
  });
export type PointageSaisie = z.output<typeof pointageSaisieSchema>;

export const traitementEcartSchema = z.object({
  statut: z.enum(['ACCEPTE', 'CONTESTE', 'RESOLU'], { error: 'Choisir le traitement.' }),
  commentaire: texteObligatoire('Le commentaire est obligatoire.', 500),
});

export const filtreEcartsSchema = z.object({
  page: pageSchema,
  statut: z.enum(STATUTS_ECART_ACHAT).optional().catch(undefined),
  type: z.enum(TYPES_ECART_ACHAT).optional().catch(undefined),
});
export type FiltreEcarts = z.output<typeof filtreEcartsSchema>;

export function receptionPossible(statut: StatutCommande): boolean {
  return statut === 'ENVOYEE' || statut === 'PARTIELLEMENT_RECUE';
}

export interface PointageLigne {
  readonly quantite: number;
  readonly quantiteNonConforme: number;
}

export interface EcartReception {
  readonly type: 'SURPLUS' | 'PRODUIT_NON_CONFORME';
  readonly quantiteAttendue: number;
  readonly quantiteConstatee: number;
}

/**
 * Écarts d'une ligne pointée. Une livraison partielle n'en est pas un : le reste reste attendu, et le manque ne se
 * constate qu'à l'abandon du reliquat. Choix de gestion (ADR-031).
 */
export function ecartsDuPointage(ligne: QuantitesLigne, pointage: PointageLigne): EcartReception[] {
  const reste = resteARecevoir(ligne);
  return [
    ...(pointage.quantite > reste
      ? [
          {
            type: 'SURPLUS' as const,
            quantiteAttendue: reste,
            quantiteConstatee: pointage.quantite,
          },
        ]
      : []),
    ...(pointage.quantiteNonConforme > 0
      ? [
          {
            type: 'PRODUIT_NON_CONFORME' as const,
            quantiteAttendue: reste,
            quantiteConstatee: pointage.quantiteNonConforme,
          },
        ]
      : []),
  ];
}
