import { z } from 'zod';

import { texteObligatoire, texteOptionnelSchema } from '../commun/texte';
import { centimes, centimesDepuisSaisieEuros, type Centimes } from '../money';
import type { Hacheur } from '../ports/hacheur';
import { empreinteTexte, encaisseNet, type Mouvement } from './encaissement';

const justificationSchema = texteOptionnelSchema.pipe(
  z.string().max(500, '500 caractères au maximum.').nullable(),
);

function montantOuZero(saisie: string, champ: string, ctx: z.RefinementCtx): Centimes {
  const montant = centimesDepuisSaisieEuros(saisie);
  if (montant === null) {
    ctx.addIssue({
      code: 'custom',
      path: [champ],
      message: 'Montant invalide (exemple : 150,00).',
    });
    return z.NEVER;
  }
  return centimes(montant);
}

export const ouvertureSaisieSchema = z
  .object({
    fond: texteObligatoire('Le fond de caisse est obligatoire.'),
    justification: justificationSchema,
  })
  .transform(({ fond, justification }, ctx) => ({
    fondCentimes: montantOuZero(fond, 'fond', ctx),
    justification,
  }));

export const comptageSaisieSchema = z
  .object({
    comptees: texteObligatoire('Le montant compté est obligatoire.'),
    remiseBanque: texteOptionnelSchema,
    justification: justificationSchema,
  })
  .transform(({ comptees, remiseBanque, justification }, ctx) => {
    const compteesCentimes = montantOuZero(comptees, 'comptees', ctx);
    const remiseCentimes = montantOuZero(remiseBanque ?? '0', 'remiseBanque', ctx);
    if (remiseCentimes > compteesCentimes) {
      ctx.addIssue({
        code: 'custom',
        path: ['remiseBanque'],
        message: 'La remise dépasse les espèces comptées.',
      });
    }
    return { compteesCentimes, remiseCentimes, justification };
  });

/** Fond de la veille, plus les espèces du jour : le rendu est déjà déduit du montant encaissé. */
export function especesTheoriques(fond: number, mouvements: readonly Mouvement[]): Centimes {
  return centimes(fond + encaisseNet(mouvements));
}

export function ecartDeCaisse(theorique: number, comptees: number): Centimes {
  return centimes(comptees - theorique);
}

/** Un écart de comptage doit être expliqué, et un fond différent de celui attendu aussi. */
export function justificationManquante(ecart: number, justification: string | null): boolean {
  return ecart !== 0 && justification === null;
}

/** Fond attendu à l'ouverture : ce qui reste dans le tiroir après la dernière remise en banque. */
export function fondAttendu(
  dernierComptage: {
    readonly compteesCentimes: number;
    readonly remiseCentimes: number;
  } | null,
): Centimes {
  return centimes(
    dernierComptage ? dernierComptage.compteesCentimes - dernierComptage.remiseCentimes : 0,
  );
}

export interface OuvertureAChainer {
  readonly id: string;
  readonly journee: string;
  readonly fondCentimes: number;
  readonly fondAttenduCentimes: number;
  readonly justification: string | null;
}

export function chargeOuverture(
  { justification, ...probant }: OuvertureAChainer,
  hacheur: Hacheur,
): unknown {
  return { ...probant, justificationEmpreinte: empreinteTexte(justification, hacheur) };
}

export interface ComptageAChainer {
  readonly id: string;
  readonly sessionId: string;
  readonly journee: string;
  readonly compteesCentimes: number;
  readonly theoriqueCentimes: number;
  readonly ecartCentimes: number;
  readonly remiseCentimes: number;
  readonly justification: string | null;
}

export function chargeComptage(
  { justification, ...probant }: ComptageAChainer,
  hacheur: Hacheur,
): unknown {
  return { ...probant, justificationEmpreinte: empreinteTexte(justification, hacheur) };
}
