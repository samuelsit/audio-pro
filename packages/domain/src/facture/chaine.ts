import type { Hacheur } from '../ports/hacheur';
import type { Centimes } from '../money';
import type { NaturePiece } from './types';

/** Types de maillon. L'étape 15 ajoutera encaissements et clôtures, sans nouvelle structure (ADR-028). */
export const TYPES_EVENEMENT_CAISSE = [
  'FACTURE_VALIDEE',
  'AVOIR_VALIDE',
  'ORIGINAL_EMIS',
  'DUPLICATA_EMIS',
  'FACTURE_ENVOYEE',
] as const;
export type TypeEvenementCaisse = (typeof TYPES_EVENEMENT_CAISSE)[number];

export const LIBELLES_EVENEMENTS_CAISSE: Readonly<Record<TypeEvenementCaisse, string>> = {
  FACTURE_VALIDEE: 'Facture validée',
  AVOIR_VALIDE: 'Avoir validé',
  ORIGINAL_EMIS: 'Original émis',
  DUPLICATA_EMIS: 'Duplicata émis',
  FACTURE_ENVOYEE: 'Envoyée au patient',
};

/** Précédent du premier maillon d'une chaîne. */
export const EMPREINTE_INITIALE = '0'.repeat(64);

function canonique(valeur: unknown): string {
  if (Array.isArray(valeur)) {
    return `[${valeur.map(canonique).join(',')}]`;
  }
  if (typeof valeur === 'object' && valeur !== null) {
    const champs = Object.entries(valeur)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([cle, v]) => `${JSON.stringify(cle)}:${canonique(v)}`);
    return `{${champs.join(',')}}`;
  }
  return JSON.stringify(valeur);
}

/** JSON à clés triées : l'ordre rendu par PostgreSQL ne change pas l'empreinte. */
export function serialiserCanonique(valeur: unknown): string {
  return canonique(valeur);
}

export interface Maillon {
  readonly rang: number;
  readonly type: TypeEvenementCaisse;
  readonly charge: unknown;
  readonly empreintePrecedente: string;
  readonly empreinte: string;
}

/** Empreinte d'un maillon : toute modification de lui ou d'un précédent rompt la suite de la chaîne. */
export function enchainer(
  { rang, type, charge, empreintePrecedente }: Omit<Maillon, 'empreinte'>,
  hacheur: Hacheur,
): string {
  return hacheur.sha256(serialiserCanonique({ charge, empreintePrecedente, rang, type }));
}

export type ResultatChaine =
  | { readonly valide: true; readonly maillons: number }
  | { readonly valide: false; readonly rang: number };

/** Parcourt la chaîne d'un centre, triée par rang : le premier maillon altéré, absent ou déplacé rompt. */
export function verifierChaine(maillons: readonly Maillon[], hacheur: Hacheur): ResultatChaine {
  let precedente = EMPREINTE_INITIALE;
  for (const [index, maillon] of maillons.entries()) {
    const attendu = index + 1;
    if (
      maillon.rang !== attendu ||
      maillon.empreintePrecedente !== precedente ||
      maillon.empreinte !== enchainer(maillon, hacheur)
    ) {
      return { valide: false, rang: attendu };
    }
    precedente = maillon.empreinte;
  }
  return { valide: true, maillons: maillons.length };
}

/** Pièce figée, telle que chaînée. Toute valeur probante y figure, y compris ses lignes. */
export interface PieceAChainer {
  readonly id: string;
  readonly nature: NaturePiece;
  readonly numero: string;
  readonly numeroSequence: number;
  readonly dateFacture: string;
  readonly patientId: string;
  readonly dossierId: string | null;
  readonly factureOrigineId: string | null;
  readonly totaux: {
    readonly prixTTC: Centimes;
    readonly ht: Centimes;
    readonly tva: Centimes;
    readonly amo: Centimes;
    readonly amc: Centimes;
    readonly resteACharge: Centimes;
  };
  readonly lignes: readonly {
    readonly nature: string;
    readonly codeLpp: string | null;
    readonly codePrestation: string | null;
    readonly numeroSerie: string | null;
    readonly quantite: number;
    readonly prixTTC: Centimes;
    readonly tauxTva: number | null;
    readonly montantHT: Centimes;
    readonly montantTva: Centimes;
    readonly amo: Centimes;
    readonly amc: Centimes;
    readonly resteACharge: Centimes;
  }[];
}

/** Charge d'un maillon de validation, recalculée à la vérification depuis la pièce elle-même. */
export function chargePiece({ lignes, ...piece }: PieceAChainer): unknown {
  return {
    ...piece,
    lignes: lignes.map(
      ({
        nature,
        codeLpp,
        codePrestation,
        numeroSerie,
        quantite,
        prixTTC,
        tauxTva,
        montantHT,
        montantTva,
        amo,
        amc,
        resteACharge,
      }) => ({
        nature,
        codeLpp,
        codePrestation,
        numeroSerie,
        quantite,
        prixTTC,
        tauxTva,
        montantHT,
        montantTva,
        amo,
        amc,
        resteACharge,
      }),
    ),
  };
}
