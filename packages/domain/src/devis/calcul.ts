import { z } from 'zod';

import type { Oreille } from '../audio-rules/code-prestation';
import { GARANTIE_MINIMALE_ANNEES } from '../audio-rules/constantes';
import { RUBRIQUES_OFFRE, type RubriqueOffre } from '../audio-rules/controle-devis';
import { baseRemboursement, plafondPrixVente, type TarifsAudio } from '../audio-rules/tarifs';
import { ventilation } from '../audio-rules/ventilation';
import { ajouterMois } from '../commun/date';
import { additionnerCentimes, centimes, centimesSchema, type Centimes } from '../money';
import { ageAt } from '../patient/age';
import type { LigneAide, LigneConsommable, OffreDonnees } from './types';

/**
 * Prix HT déduit du TTC, au centime le plus proche : le TTC reste la référence, seul à pouvoir atteindre
 * exactement le prix limite.
 * Source : modele-devis-audio.pdf p. 1 (colonnes Prix HT et Prix TTC).
 * À VÉRIFIER : taux de TVA absents de docs/ref (R18).
 */
export function prixHT(prixTTC: Centimes, tauxTVA: number): Centimes {
  const diviseur = 10_000 + tauxTVA;
  return centimes(Math.floor((2 * 10_000 * prixTTC + diviseur) / (2 * diviseur)));
}

/**
 * Dernier jour couvert par la garantie minimale du fabricant, à partir de la délivrance.
 * Source : modele-devis-audio.pdf p. 2 § 4.
 * À VÉRIFIER : le modèle ne fixe pas le point de départ, la délivrance est retenue.
 */
export function finGarantieMinimale(dateDelivrance: string): string {
  return ajouterMois(dateDelivrance, GARANTIE_MINIMALE_ANNEES.valeur * 12);
}

export interface PosteCalcule {
  readonly ht: Centimes;
  readonly htApresRemise: Centimes;
  readonly ttc: Centimes;
  readonly amo: Centimes;
  /** `null` si la part AMC n'est pas connue. */
  readonly amc: Centimes | null;
  /** `null` si la part AMC n'est pas connue. */
  readonly resteACharge: Centimes | null;
  /** Reste après la seule AMO, affiché à l'écran pendant que l'AMC est inconnue. */
  readonly resteApresAMO: Centimes;
}

export interface AideCalculee extends PosteCalcule {
  readonly base: Centimes;
  /** `null` si le prix est libre. */
  readonly plafond: Centimes | null;
}

export interface OffreCalculee {
  readonly rubrique: RubriqueOffre;
  readonly droite: AideCalculee | null;
  readonly gauche: AideCalculee | null;
  readonly consommables: PosteCalcule | null;
  readonly total: PosteCalcule;
}

export interface DevisCalcule {
  readonly offres: readonly OffreCalculee[];
  readonly dateDelivrancePrevue: string;
  readonly finGarantieMinimale: string;
}

const posteSchema = z.object({
  ht: centimesSchema,
  htApresRemise: centimesSchema,
  ttc: centimesSchema,
  amo: centimesSchema,
  amc: centimesSchema.nullable(),
  resteACharge: centimesSchema.nullable(),
  resteApresAMO: centimesSchema,
});
const aideCalculeeSchema = posteSchema.extend({
  base: centimesSchema,
  plafond: centimesSchema.nullable(),
});

/** Montants conservés sur un devis émis : un changement de tarif ne les modifie pas. */
export const devisCalculeSchema = z.object({
  offres: z.array(
    z.object({
      rubrique: z.enum(RUBRIQUES_OFFRE),
      droite: aideCalculeeSchema.nullable(),
      gauche: aideCalculeeSchema.nullable(),
      consommables: posteSchema.nullable(),
      total: posteSchema,
    }),
  ),
  dateDelivrancePrevue: z.string(),
  finGarantieMinimale: z.string(),
}) satisfies z.ZodType<DevisCalcule>;

export interface ContexteCalcul {
  readonly dateNaissance: string;
  /** Date de référence de l'âge (R2). */
  readonly dateDelivrancePrevue: string;
  readonly c2s: boolean;
  readonly refusOffreC2S: boolean;
  readonly surdicecite: boolean;
  readonly tauxAMO: number;
}

function resteSiAmcConnue(ttc: Centimes, amo: Centimes, amc: Centimes | null): Centimes | null {
  return amc === null ? null : centimes(ttc - amo - amc);
}

function posteAide(
  aide: LigneAide,
  amcSaisie: Centimes | null,
  contexte: ContexteCalcul,
  tarifs: TarifsAudio,
): AideCalculee {
  const age = ageAt(contexte.dateNaissance, contexte.dateDelivrancePrevue);
  const base = baseRemboursement({ age }, tarifs);
  const ttc = aide.prixUnitaire;
  const { amo, amc, resteACharge } = ventilation({
    prixTTC: ttc,
    baseRemboursement: base,
    tauxAMO: contexte.tauxAMO,
    priseEnChargeAMC: amcSaisie ?? centimes(0),
  });
  return {
    ht: prixHT(aide.prixUnitaireAvantRemise, aide.tauxTVA),
    htApresRemise: prixHT(ttc, aide.tauxTVA),
    ttc,
    amo,
    amc: amcSaisie === null ? null : amc,
    resteACharge: amcSaisie === null ? null : resteACharge,
    resteApresAMO: centimes(ttc - amo),
    base,
    plafond: plafondPrixVente({ ...contexte, classe: aide.classe, age }, tarifs),
  };
}

function montantLigne(prixUnitaire: Centimes, quantite: number): Centimes {
  return centimes(prixUnitaire * quantite);
}

/** AMO ligne par ligne (R5), sur le tarif LPP ; une ligne sans tarif n'est pas remboursée. */
function amoConsommable(
  ligne: LigneConsommable,
  tauxAMO: number,
  tarifs: ReadonlyMap<string, Centimes>,
): Centimes {
  const tarif = ligne.codeLpp === null ? undefined : tarifs.get(ligne.codeLpp);
  const { amo } = ventilation({
    prixTTC: montantLigne(ligne.prixUnitaire, ligne.quantite),
    baseRemboursement: montantLigne(tarif ?? centimes(0), ligne.quantite),
    tauxAMO,
    priseEnChargeAMC: centimes(0),
  });
  return amo;
}

function posteConsommables(
  lignes: readonly LigneConsommable[],
  amcSaisie: Centimes | null,
  tauxAMO: number,
  tarifs: ReadonlyMap<string, Centimes>,
): PosteCalcule | null {
  if (lignes.length === 0) {
    return null;
  }
  const somme = (montant: (ligne: LigneConsommable) => Centimes) =>
    additionnerCentimes(...lignes.map(montant));
  const ttc = somme((l) => montantLigne(l.prixUnitaire, l.quantite));
  const amo = somme((l) => amoConsommable(l, tauxAMO, tarifs));
  const amc = amcSaisie === null ? null : centimes(Math.min(amcSaisie, ttc - amo));
  return {
    ht: somme((l) => prixHT(montantLigne(l.prixUnitaireAvantRemise, l.quantite), l.tauxTVA)),
    htApresRemise: somme((l) => prixHT(montantLigne(l.prixUnitaire, l.quantite), l.tauxTVA)),
    ttc,
    amo,
    amc,
    resteACharge: resteSiAmcConnue(ttc, amo, amc),
    resteApresAMO: centimes(ttc - amo),
  };
}

/** Une part AMC inconnue compte pour zéro dès qu'un autre poste la renseigne. */
function totalOffre(postes: readonly PosteCalcule[]): PosteCalcule {
  const somme = (montant: (poste: PosteCalcule) => Centimes) =>
    additionnerCentimes(...postes.map(montant));
  const ttc = somme((p) => p.ttc);
  const amo = somme((p) => p.amo);
  const amc = postes.every((p) => p.amc === null) ? null : somme((p) => p.amc ?? centimes(0));
  return {
    ht: somme((p) => p.ht),
    htApresRemise: somme((p) => p.htApresRemise),
    ttc,
    amo,
    amc,
    resteACharge: resteSiAmcConnue(ttc, amo, amc),
    resteApresAMO: centimes(ttc - amo),
  };
}

function calculerOffre(
  offre: OffreDonnees,
  contexte: ContexteCalcul,
  tarifs: TarifsAudio,
  tarifsConsommables: ReadonlyMap<string, Centimes>,
): OffreCalculee {
  const aide = (oreille: Oreille, amc: Centimes | null) => {
    const ligne = offre.aides.find((a) => a.oreille === oreille);
    return ligne === undefined ? null : posteAide(ligne, amc, contexte, tarifs);
  };
  const droite = aide('DROITE', offre.amcDroite);
  const gauche = aide('GAUCHE', offre.amcGauche);
  const consommables = posteConsommables(
    offre.consommables,
    offre.amcConsommables,
    contexte.tauxAMO,
    tarifsConsommables,
  );
  const postes = [droite, gauche, consommables].filter((poste) => poste !== null);
  return {
    rubrique: offre.rubrique,
    droite,
    gauche,
    consommables,
    total: totalOffre(postes),
  };
}

/**
 * Montants du devis : plafond, base, AMO, AMC estimée, reste à charge et fin de garantie, offre par offre.
 * Source : voir `plafondPrixVente`, `baseRemboursement` et `ventilation` (R3 à R6, R13) ;
 * modele-devis-audio.pdf p. 1 (AMC et reste à charge « si connu »).
 * `tarifs` et `tarifsConsommables` (tarif LPP unitaire, par code) : résolus à `dateDelivrancePrevue`.
 */
export function calculerDevis(
  offres: readonly OffreDonnees[],
  contexte: ContexteCalcul,
  tarifs: TarifsAudio,
  tarifsConsommables: ReadonlyMap<string, Centimes>,
): DevisCalcule {
  return {
    offres: offres.map((offre) => calculerOffre(offre, contexte, tarifs, tarifsConsommables)),
    dateDelivrancePrevue: contexte.dateDelivrancePrevue,
    finGarantieMinimale: finGarantieMinimale(contexte.dateDelivrancePrevue),
  };
}
