import { z } from 'zod';

import { gereLeCentre, type Role } from '../acces/roles';
import { texteObligatoire } from '../commun/texte';
import type { StatutAppareil } from './etats';
import { numeroSerieSchema } from './numero-serie';
import { QUANTITE_MAX_MOUVEMENT } from './saisie';

export const STATUTS_INVENTAIRE = ['EN_COURS', 'CLOTURE'] as const;
export type StatutInventaire = (typeof STATUTS_INVENTAIRE)[number];

export const LIBELLES_STATUTS_INVENTAIRE: Readonly<Record<StatutInventaire, string>> = {
  EN_COURS: 'En cours',
  CLOTURE: 'Clôturé',
};

/** Un appareil en essai, prêté ou au SAV n'est pas sur l'étagère : on ne s'attend pas à le pointer. */
export const STATUTS_ATTENDUS_INVENTAIRE: readonly StatutAppareil[] = ['EN_STOCK', 'RESERVE'];

/** Ouvrir, justifier et clôturer engagent le centre : rôles de gestion. Le pointage reste ouvert à tous. */
export function peutGererInventaire(role: Role): boolean {
  return gereLeCentre(role);
}

export interface EcartsAppareils {
  /** Attendus, non pointés. */
  readonly manquants: readonly string[];
  /** Pointés, non attendus : numéro inconnu, autre centre ou appareil sorti du stock. */
  readonly excedents: readonly string[];
}

/** Deux fabricants peuvent partager un numéro : un même pointage vaut alors pour les deux appareils. */
export function ecartsAppareils(
  attendus: readonly string[],
  pointes: readonly string[],
): EcartsAppareils {
  const attendusUniques = new Set(attendus);
  const pointesUniques = new Set(pointes);
  return {
    manquants: [...attendusUniques].filter((numero) => !pointesUniques.has(numero)).sort(),
    excedents: [...pointesUniques].filter((numero) => !attendusUniques.has(numero)).sort(),
  };
}

/** Positif si le compte dépasse le stock théorique. */
export function ecartAccessoire(quantiteTheorique: number, quantiteComptee: number): number {
  return quantiteComptee - quantiteTheorique;
}

export const ouvertureInventaireSaisieSchema = z.object({
  centreId: z.uuid({ error: 'Choisir un centre.' }),
});

export const pointageAppareilSaisieSchema = z.object({ numeroSerie: numeroSerieSchema });

export const comptageAccessoireSaisieSchema = z.object({
  accessoireId: z.uuid({ error: 'Choisir un accessoire.' }),
  quantiteComptee: z.coerce
    .number({ error: 'Quantité invalide.' })
    .int('La quantité doit être un nombre entier.')
    .min(0, 'La quantité ne peut pas être négative.')
    .max(QUANTITE_MAX_MOUVEMENT, `${QUANTITE_MAX_MOUVEMENT} au maximum.`),
});

const justificationSchema = texteObligatoire('La justification est obligatoire.', 500);

/** Un écart porte soit sur un numéro de série, soit sur un accessoire. */
export const justificationEcartSaisieSchema = z.union([
  z.object({ numeroSerie: numeroSerieSchema, justification: justificationSchema }),
  z.object({
    accessoireId: z.uuid({ error: 'Choisir un accessoire.' }),
    justification: justificationSchema,
  }),
]);
