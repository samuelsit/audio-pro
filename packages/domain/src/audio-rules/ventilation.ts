import { centimes, type Centimes } from '../money';

export interface EntreePartAMO {
  readonly baseRemboursement: Centimes;
  /** Taux en pour cent, 60 pour 60 %. */
  readonly tauxAMO: number;
}

/**
 * Part AMO : base × taux, au centime le plus proche. Le taux reste fourni par l'appelant : ceux de
 * l'ALD, de la maternité, de l'accident du travail ou d'Alsace-Moselle ne sont pas dans docs/ref (R5).
 * Source : fr201-codes-prestation.pdf, table 4, p. 4 ; test n° 9 (4,91 € × 60 % = 2,95 €).
 * À VÉRIFIER : exactement ,5 centime, arrondi au supérieur, aucun texte.
 */
export function partAMO({ baseRemboursement, tauxAMO }: EntreePartAMO): Centimes {
  if (tauxAMO < 0 || tauxAMO > 100) {
    throw new RangeError('Le taux AMO doit être compris entre 0 et 100.');
  }
  return centimes(Math.floor((baseRemboursement * tauxAMO + 50) / 100));
}

export interface EntreeVentilation {
  readonly prixTTC: Centimes;
  readonly baseRemboursement: Centimes;
  readonly tauxAMO: number;
  /** Montant que l'AMC prendrait en charge ; écrêté à ce qui reste après l'AMO. */
  readonly priseEnChargeAMC: Centimes;
}

export interface Ventilation {
  readonly amo: Centimes;
  readonly amc: Centimes;
  readonly resteACharge: Centimes;
}

/**
 * Répartition du prix entre AMO, AMC et patient ; aucune part n'est négative.
 * Source : fr201-codes-prestation.pdf, tests n° 6 à 10.
 * À VÉRIFIER : prix inférieur à la base, l'AMO se calcule sur le prix (R13), aucun texte.
 */
export function ventilation({
  prixTTC,
  baseRemboursement,
  tauxAMO,
  priseEnChargeAMC,
}: EntreeVentilation): Ventilation {
  if (prixTTC < 0 || baseRemboursement < 0 || priseEnChargeAMC < 0) {
    throw new RangeError('Un montant de ventilation ne peut pas être négatif.');
  }
  const baseRetenue = centimes(Math.min(prixTTC, baseRemboursement));
  const amo = partAMO({ baseRemboursement: baseRetenue, tauxAMO });
  const amc = centimes(Math.min(priseEnChargeAMC, prixTTC - amo));
  return { amo, amc, resteACharge: centimes(prixTTC - amo - amc) };
}

export interface EntreePartAMCC2S {
  readonly prixTTC: Centimes;
  /** Prix maximal C2S d'une aide, base de remboursement d'un consommable. */
  readonly plafond: Centimes;
  readonly amo: Centimes;
}

/**
 * Part complémentaire d'un bénéficiaire de la C2S : le prix maximal lui est pris en charge à 100 %, le
 * dépassement reste à sa charge s'il a refusé l'offre.
 * Source : fr201-codes-prestation.pdf, tests n° 5 et 10 ; convention-audioprothesistes.pdf, art. 29 § 2,
 * p. 27 ; ameli-100-sante-audio.pdf p. 2.
 * À VÉRIFIER : à 20 ans et plus, et sur les piles et accessoires, la part est déduite, aucun cas de test
 * ne la montre (R6).
 */
export function partAMCC2S({ prixTTC, plafond, amo }: EntreePartAMCC2S): Centimes {
  return centimes(Math.max(0, Math.min(prixTTC, plafond) - amo));
}
