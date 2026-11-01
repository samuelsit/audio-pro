import { z } from 'zod';

import { prixHT } from '../devis/calcul';
import { texteOptionnelSchema } from '../commun/texte';
import { additionnerCentimes, centimes, centimesDepuisSaisieEuros, type Centimes } from '../money';
import type { LigneFacture } from './preparation';

/** Montants d'une ligne, en facture ou déjà repris par des avoirs. */
export interface MontantsLigne {
  readonly prixTTC: Centimes;
  readonly montantHT: Centimes;
  readonly montantTva: Centimes;
  readonly baseRemboursement: Centimes;
  readonly amo: Centimes;
  readonly amc: Centimes;
  readonly resteACharge: Centimes;
}

export const MONTANTS_NULS: MontantsLigne = {
  prixTTC: centimes(0),
  montantHT: centimes(0),
  montantTva: centimes(0),
  baseRemboursement: centimes(0),
  amo: centimes(0),
  amc: centimes(0),
  resteACharge: centimes(0),
};

/** Ligne de la facture d'origine, avec le cumul de ses avoirs validés. */
export interface LigneAAvoir
  extends Omit<LigneFacture, 'appareilId' | 'accessoireId' | 'tauxTva'>, MontantsLigne {
  readonly id: string;
  readonly tauxTva: number;
  readonly dejaAvoir: MontantsLigne;
}

export interface RepriseLigne {
  readonly ligneId: string;
  /** Montant TTC crédité. */
  readonly montant: Centimes;
}

export interface LigneAvoir extends LigneAAvoir {
  readonly ligneOrigineId: string;
}

export const CODES_REFUS_AVOIR = ['AUCUNE_REPRISE', 'LIGNE_INCONNUE', 'MONTANT_EXCESSIF'] as const;
export type CodeRefusAvoir = (typeof CODES_REFUS_AVOIR)[number];

export const MESSAGES_REFUS_AVOIR: Readonly<Record<CodeRefusAvoir, string>> = {
  AUCUNE_REPRISE: 'Saisir au moins un montant à reprendre.',
  LIGNE_INCONNUE: 'Cette ligne n’appartient pas à la facture.',
  MONTANT_EXCESSIF: 'Le montant dépasse ce qui reste à créditer sur la ligne.',
};

export type ResultatAvoir =
  | {
      readonly accepte: true;
      readonly lignes: readonly LigneAvoir[];
      /** La facture est entièrement créditée, cet avoir compris. */
      readonly solde: boolean;
    }
  | { readonly accepte: false; readonly code: CodeRefusAvoir };

type Champ = keyof MontantsLigne;

function restant(ligne: LigneAAvoir, champ: Champ): Centimes {
  return centimes(ligne[champ] - ligne.dejaAvoir[champ]);
}

/**
 * Part d'un avoir sur une ligne, au prorata de ce qui reste. Une reprise de tout le restant le prend à
 * l'identique, pour que le cumul des avoirs retombe exactement sur la facture.
 * La somme AMO + AMC + reste suit le TTC : le reste à charge absorbe l'arrondi.
 * À VÉRIFIER : choix applicatif, aucun texte de docs/ref ne traite de l'avoir partiel (R29).
 */
function partsLigne(ligne: LigneAAvoir, montant: Centimes): MontantsLigne {
  const soldeTTC = restant(ligne, 'prixTTC');
  if (montant === soldeTTC) {
    return {
      prixTTC: montant,
      montantHT: restant(ligne, 'montantHT'),
      montantTva: restant(ligne, 'montantTva'),
      baseRemboursement: restant(ligne, 'baseRemboursement'),
      amo: restant(ligne, 'amo'),
      amc: restant(ligne, 'amc'),
      resteACharge: restant(ligne, 'resteACharge'),
    };
  }
  const prorata = (champ: Champ) =>
    centimes(Math.round((montant * restant(ligne, champ)) / soldeTTC));
  const amo = prorata('amo');
  const amc = prorata('amc');
  const montantHT = prixHT(montant, ligne.tauxTva);
  return {
    prixTTC: montant,
    montantHT,
    montantTva: centimes(montant - montantHT),
    baseRemboursement: prorata('baseRemboursement'),
    amo,
    amc,
    resteACharge: centimes(montant - amo - amc),
  };
}

/** Lignes d'un avoir. Un avoir ne dépasse jamais ce qui reste à créditer sur chaque ligne. */
export function calculerAvoir(
  lignes: readonly LigneAAvoir[],
  reprises: readonly RepriseLigne[],
): ResultatAvoir {
  const utiles = reprises.filter((r) => r.montant > 0);
  if (utiles.length === 0) {
    return { accepte: false, code: 'AUCUNE_REPRISE' };
  }
  const resultat: LigneAvoir[] = [];
  for (const { ligneId, montant } of utiles) {
    const ligne = lignes.find((l) => l.id === ligneId);
    if (!ligne) {
      return { accepte: false, code: 'LIGNE_INCONNUE' };
    }
    if (montant > restant(ligne, 'prixTTC')) {
      return { accepte: false, code: 'MONTANT_EXCESSIF' };
    }
    const entiere = montant === ligne.prixTTC;
    resultat.push({
      ...ligne,
      ...partsLigne(ligne, montant),
      ligneOrigineId: ligne.id,
      quantite: entiere ? ligne.quantite : 1,
      prixUnitaire: entiere ? ligne.prixUnitaire : montant,
      libelle: entiere ? ligne.libelle : `Reprise partielle : ${ligne.libelle}`,
    });
  }
  const credite = (ligne: LigneAAvoir) =>
    ligne.dejaAvoir.prixTTC + (utiles.find((r) => r.ligneId === ligne.id)?.montant ?? 0);
  return {
    accepte: true,
    lignes: resultat,
    solde: lignes.every((ligne) => credite(ligne) === ligne.prixTTC),
  };
}

/** Reprises d'un avoir total : tout ce qui reste sur chaque ligne. */
export function reprisesTotales(lignes: readonly LigneAAvoir[]): RepriseLigne[] {
  return lignes.map((ligne) => ({ ligneId: ligne.id, montant: restant(ligne, 'prixTTC') }));
}

export function totauxAvoir(lignes: readonly MontantsLigne[]) {
  const somme = (champ: Champ) => additionnerCentimes(...lignes.map((l) => l[champ]));
  return {
    prixTTC: somme('prixTTC'),
    ht: somme('montantHT'),
    tva: somme('montantTva'),
    amo: somme('amo'),
    amc: somme('amc'),
    resteACharge: somme('resteACharge'),
  };
}

export const MODES_AVOIR = ['TOTAL', 'PARTIEL'] as const;
export type ModeAvoir = (typeof MODES_AVOIR)[number];

const repriseSaisieSchema = z.object({
  ligneId: z.string().min(1),
  montant: z.string().transform((saisie, ctx): Centimes => {
    const valeur = saisie.trim() === '' ? 0 : centimesDepuisSaisieEuros(saisie);
    if (valeur === null) {
      ctx.addIssue({ code: 'custom', message: 'Montant invalide (exemple : 120,00).' });
      return z.NEVER;
    }
    return centimes(valeur);
  }),
});

export const avoirSaisieSchema = z.object({
  mode: z.enum(MODES_AVOIR, { error: 'Choisir le type d’avoir.' }),
  motif: texteOptionnelSchema.pipe(
    z.string({ error: 'Le motif est obligatoire.' }).min(1, 'Le motif est obligatoire.').max(500),
  ),
  reprises: z.array(repriseSaisieSchema).default([]),
});
export type AvoirSaisie = z.output<typeof avoirSaisieSchema>;
