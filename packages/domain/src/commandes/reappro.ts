import { z } from 'zod';

import { QUANTITE_MAX_MOUVEMENT } from '../stock/saisie';

function quantiteSchema(minimum: number) {
  return z.coerce
    .number({ error: 'Quantité invalide.' })
    .int('Quantité invalide.')
    .min(minimum, 'Quantité invalide.')
    .max(QUANTITE_MAX_MOUVEMENT, 'Quantité invalide.');
}

export const seuilSaisieSchema = z
  .object({
    centreId: z.uuid('Choisir un centre.'),
    produit: z
      .string({ error: 'Choisir un produit.' })
      .regex(/^(modele|accessoire):[0-9a-f-]{36}$/, 'Choisir un produit.'),
    minimum: quantiteSchema(0),
    cible: quantiteSchema(1),
  })
  .superRefine(({ minimum, cible }, ctx) => {
    if (cible < minimum) {
      ctx.addIssue({
        code: 'custom',
        path: ['cible'],
        message: 'La cible ne peut pas être sous le minimum.',
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
export type SeuilSaisie = z.output<typeof seuilSaisieSchema>;

/** Quantités retenues à l'écran : `produit:<valeur>` → quantité. Une quantité nulle écarte la ligne. */
export const brouillonsReapproSchema = z.array(
  z.object({
    produit: z.string().regex(/^(modele|accessoire):[0-9a-f-]{36}$/, 'Produit invalide.'),
    quantite: quantiteSchema(0),
  }),
);

export interface SeuilProduit {
  readonly minimum: number;
  readonly cible: number;
}

export interface NiveauProduit {
  /** En stock et libre : ni réservé, ni en essai. */
  readonly stock: number;
  /** Commandé pour le stock et non reçu. Une ligne nominative est déjà promise. */
  readonly enCommande: number;
}

/**
 * Quantité à commander : rien tant que stock et commandes en cours couvrent le minimum, sinon de quoi remonter à
 * la cible. Choix de gestion (ADR-031).
 */
export function quantiteAReapprovisionner(
  { minimum, cible }: SeuilProduit,
  { stock, enCommande }: NiveauProduit,
): number {
  const disponible = stock + enCommande;
  return disponible < minimum ? cible - disponible : 0;
}
