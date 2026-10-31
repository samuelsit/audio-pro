import { z } from 'zod';

import type { Oreille } from '../audio-rules/code-prestation';
import type { RubriqueOffre } from '../audio-rules/controle-devis';
import {
  CLASSES_LPP,
  LIEUX_FABRICATION,
  NATURES_ACCESSOIRE,
  OPTIONS_AIDE_AUDITIVE,
  TYPES_AIDE_AUDITIVE,
  type ClasseLpp,
  type NatureAccessoire,
} from '../catalogue';
import type { Centimes } from '../money';

export const LIBELLES_RUBRIQUES_OFFRE: Readonly<Record<RubriqueOffre, string>> = {
  OFFRE_100_SANTE: 'Offre 100 % santé',
  AUTRE_OFFRE: 'Autre offre',
};

export const NATURES_LIGNE_DEVIS = ['AIDE_AUDITIVE', ...NATURES_ACCESSOIRE] as const;
export type NatureLigneDevis = (typeof NATURES_LIGNE_DEVIS)[number];

/** Instantané du catalogue à la rédaction : le devis ne suit plus les changements de la fiche. */
export const designationAideSchema = z.object({
  fabricant: z.string(),
  adresseFabricant: z.string().nullable(),
  mandataire: z.string().nullable(),
  marque: z.string().nullable(),
  gamme: z.string(),
  modele: z.string(),
  referenceCommerciale: z.string().nullable(),
  lieuFabrication: z.enum(LIEUX_FABRICATION).nullable(),
  type: z.enum(TYPES_AIDE_AUDITIVE),
  classe: z.enum(CLASSES_LPP),
  nombreCanaux: z.number().int().nullable(),
  connectivite: z.string().nullable(),
  antiLarsen: z.boolean().nullable(),
  reducteurAcouphenes: z.boolean().nullable(),
  bobineT: z.boolean().nullable(),
  options: z.array(z.enum(OPTIONS_AIDE_AUDITIVE)),
});
export type DesignationAide = z.output<typeof designationAideSchema>;

export const designationConsommableSchema = z.object({
  nom: z.string(),
  marque: z.string().nullable(),
  referenceCommerciale: z.string().nullable(),
});
export type DesignationConsommable = z.output<typeof designationConsommableSchema>;

/**
 * Mentions exigées par le tableau des offres. Le lieu de fabrication est facultatif, le mandataire ne
 * vaut que pour un fabricant hors UE.
 * Source : modele-devis-audio.pdf p. 1 (tableaux 1.1 et 1.2).
 */
export function ficheAideComplete(aide: DesignationAide): boolean {
  return [
    aide.adresseFabricant,
    aide.marque,
    aide.referenceCommerciale,
    aide.nombreCanaux,
    aide.connectivite,
    aide.antiLarsen,
    aide.reducteurAcouphenes,
    aide.bobineT,
  ].every((valeur) => valeur !== null);
}

/** Source : modele-devis-audio.pdf p. 1 (ligne « Consommables, piles et accessoires »). */
export function ficheConsommableComplete(consommable: DesignationConsommable): boolean {
  return consommable.marque !== null && consommable.referenceCommerciale !== null;
}

interface PrixLigne {
  /** Égal à `prixUnitaire` sans remise. */
  readonly prixUnitaireAvantRemise: Centimes;
  readonly prixUnitaire: Centimes;
  /** Taux en pour dix mille, conservé sur la ligne. */
  readonly tauxTVA: number;
}

export interface LigneAide extends PrixLigne {
  readonly oreille: Oreille;
  readonly classe: ClasseLpp;
  readonly designation: DesignationAide;
}

export interface LigneConsommable extends PrixLigne {
  readonly nature: NatureAccessoire;
  readonly quantite: number;
  readonly codeLpp: string | null;
  readonly designation: DesignationConsommable;
}

export interface OffreDonnees {
  readonly rubrique: RubriqueOffre;
  readonly aides: readonly LigneAide[];
  readonly consommables: readonly LigneConsommable[];
  /** Part AMC estimée, saisie à la main ; `null` si elle n'est pas connue. */
  readonly amcDroite: Centimes | null;
  readonly amcGauche: Centimes | null;
  readonly amcConsommables: Centimes | null;
}
