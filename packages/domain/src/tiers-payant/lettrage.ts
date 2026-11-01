import { centimes, type Centimes } from '../money';
import type { TypeCreance } from './creance';

/** Ce qu'il reste à lettrer d'un règlement, par part : on ne solde pas une créance AMC avec de l'AMO. */
export type ResteParType = Readonly<Record<TypeCreance, Centimes>>;

export interface ImputationReglement {
  readonly type: TypeCreance;
  readonly montantCentimes: number;
}

/** Parts d'un règlement moins ce qui en est lettré ou classé en écart. */
export function resteDuReglement(
  parts: { readonly partAmoCentimes: number; readonly partAmcCentimes: number },
  imputations: readonly ImputationReglement[],
): ResteParType {
  const impute = (type: TypeCreance) =>
    imputations
      .filter((i) => i.type === type)
      .reduce((total, { montantCentimes }) => total + montantCentimes, 0);
  return {
    AMO: centimes(parts.partAmoCentimes - impute('AMO')),
    AMC: centimes(parts.partAmcCentimes - impute('AMC')),
  };
}

export const CODES_REFUS_LETTRAGE = [
  'AUCUNE_IMPUTATION',
  'CREANCE_INCONNUE',
  'AUTRE_CENTRE',
  'DEPASSE_SOLDE',
  'DEPASSE_REGLEMENT',
] as const;
export type CodeRefusLettrage = (typeof CODES_REFUS_LETTRAGE)[number];

export const MESSAGES_REFUS_LETTRAGE: Readonly<Record<CodeRefusLettrage, string>> = {
  AUCUNE_IMPUTATION: 'Indiquez au moins un montant à lettrer.',
  CREANCE_INCONNUE: 'Une créance n’existe plus ou n’est pas accessible.',
  AUTRE_CENTRE: 'Une créance appartient à un autre centre que ce règlement.',
  DEPASSE_SOLDE: 'Le montant dépasse le solde d’une créance.',
  DEPASSE_REGLEMENT: 'Le montant dépasse ce qu’il reste à lettrer de ce règlement.',
};

export interface CreanceALettrer {
  readonly id: string;
  readonly centreId: string;
  readonly type: TypeCreance;
  readonly soldeCentimes: number;
}

export interface DemandeLettrage {
  readonly creanceId: string;
  readonly montantCentimes: number;
}

export type ResultatLettrage =
  | {
      readonly accepte: true;
      readonly lignes: readonly (DemandeLettrage & { readonly type: TypeCreance })[];
    }
  | { readonly accepte: false; readonly code: CodeRefusLettrage };

/**
 * Lettrage manuel d'un règlement sur une ou plusieurs créances, partiel ou complet.
 * À VÉRIFIER : seule la définition FEC du lettrage est dans docs/ref (fiscal/boi-cf-ior-60-40-20.html § 240,
 * « apparier deux écritures ») ; les limites ci-dessous sont un choix applicatif (R44).
 */
export function verifierLettrage(
  reglement: { readonly centreId: string; readonly reste: ResteParType },
  creances: readonly CreanceALettrer[],
  demandes: readonly DemandeLettrage[],
): ResultatLettrage {
  if (demandes.length === 0) {
    return { accepte: false, code: 'AUCUNE_IMPUTATION' };
  }
  const lignes = [];
  const totaux = { AMO: 0, AMC: 0 };
  for (const demande of demandes) {
    const creance = creances.find(({ id }) => id === demande.creanceId);
    if (!creance) {
      return { accepte: false, code: 'CREANCE_INCONNUE' };
    }
    if (creance.centreId !== reglement.centreId) {
      return { accepte: false, code: 'AUTRE_CENTRE' };
    }
    if (demande.montantCentimes > creance.soldeCentimes) {
      return { accepte: false, code: 'DEPASSE_SOLDE' };
    }
    totaux[creance.type] += demande.montantCentimes;
    lignes.push({ ...demande, type: creance.type });
  }
  if (totaux.AMO > reglement.reste.AMO || totaux.AMC > reglement.reste.AMC) {
    return { accepte: false, code: 'DEPASSE_REGLEMENT' };
  }
  return { accepte: true, lignes };
}

export interface CreanceAvoir {
  readonly soldeCentimes: number;
  /** Déjà passé au patient, net des contre-passations. */
  readonly transfertsCentimes: number;
  /** Déjà classé en perte, net des contre-passations. */
  readonly pertesCentimes: number;
}

export interface ImputationAvoir {
  /** Part d'avoir qui éteint le solde ouvert. */
  readonly surSolde: Centimes;
  /** Transfert au patient à contre-passer : l'avoir ne doit pas laisser une dette sur une vente annulée. */
  readonly transfert: Centimes;
  readonly perte: Centimes;
  /** Déjà payé par l'organisme : il devient un indu. */
  readonly indu: Centimes;
  /** Solde après l'avoir ; négatif s'il reste un indu. */
  readonly nouveauSolde: Centimes;
}

/**
 * Répercute sur une créance la part d'un avoir, dans cet ordre : solde ouvert, transfert au patient, perte, puis
 * ce que l'organisme a déjà payé. Le compte de l'organisme reste exact à chaque cas.
 * À VÉRIFIER : choix applicatif, à valider par l'expert-comptable (R44).
 */
export function imputerAvoir(part: number, creance: CreanceAvoir): ImputationAvoir {
  const prendre = (reste: number, disponible: number) => Math.min(reste, Math.max(disponible, 0));
  const surSolde = prendre(part, creance.soldeCentimes);
  const transfert = prendre(part - surSolde, creance.transfertsCentimes);
  const perte = prendre(part - surSolde - transfert, creance.pertesCentimes);
  const indu = part - surSolde - transfert - perte;
  return {
    surSolde: centimes(surSolde),
    transfert: centimes(transfert),
    perte: centimes(perte),
    indu: centimes(indu),
    nouveauSolde: centimes(creance.soldeCentimes - surSolde - indu),
  };
}
