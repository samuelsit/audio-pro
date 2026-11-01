import type { Hacheur } from '../ports/hacheur';
import type { Centimes } from '../money';
import type { NaturePiece } from './types';

/** Types de maillon : le journal des événements de caisse et la chaîne ne font qu'un (ADR-028, ADR-029). */
export const TYPES_EVENEMENT_CAISSE = [
  'FACTURE_VALIDEE',
  'AVOIR_VALIDE',
  'ORIGINAL_EMIS',
  'DUPLICATA_EMIS',
  'FACTURE_ENVOYEE',
  'ENCAISSEMENT',
  'REMBOURSEMENT',
  'ANNULATION_ENCAISSEMENT',
  'REGLEMENT_ORGANISME',
  'ANNULATION_REGLEMENT_ORGANISME',
  'REGULARISATION_ORGANISME',
  'CAISSE_OUVERTE',
  'CAISSE_COMPTEE',
  'CLOTURE',
  'ARCHIVAGE',
  'PARAMETRE_MODIFIE',
  'VERIFICATION_ECHEC',
] as const;
export type TypeEvenementCaisse = (typeof TYPES_EVENEMENT_CAISSE)[number];

/** Seuls ces maillons peuvent venir d'un travail planifié, sans acteur humain. */
export const TYPES_EVENEMENT_SYSTEME: readonly TypeEvenementCaisse[] = [
  'CLOTURE',
  'ARCHIVAGE',
  'VERIFICATION_ECHEC',
];

export const LIBELLES_EVENEMENTS_CAISSE: Readonly<Record<TypeEvenementCaisse, string>> = {
  FACTURE_VALIDEE: 'Facture validée',
  AVOIR_VALIDE: 'Avoir validé',
  ORIGINAL_EMIS: 'Original émis',
  DUPLICATA_EMIS: 'Duplicata émis',
  FACTURE_ENVOYEE: 'Envoyée au patient',
  ENCAISSEMENT: 'Encaissement',
  REMBOURSEMENT: 'Remboursement',
  ANNULATION_ENCAISSEMENT: 'Annulation d’encaissement',
  REGLEMENT_ORGANISME: 'Règlement d’organisme',
  ANNULATION_REGLEMENT_ORGANISME: 'Annulation de règlement d’organisme',
  REGULARISATION_ORGANISME: 'Régularisation de créance',
  CAISSE_OUVERTE: 'Ouverture de caisse',
  CAISSE_COMPTEE: 'Comptage de caisse',
  CLOTURE: 'Clôture',
  ARCHIVAGE: 'Archivage',
  PARAMETRE_MODIFIE: 'Changement de paramètres',
  VERIFICATION_ECHEC: 'Échec de vérification',
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

interface MaillonCommun {
  readonly rang: number;
  readonly type: TypeEvenementCaisse;
  readonly charge: unknown;
  readonly empreintePrecedente: string;
}

/** Format de l'étape 14 : ni horodatage, ni acteur, ni centre dans l'empreinte. */
interface ContenuFormat1 extends MaillonCommun {
  readonly format?: 1;
}

/** Date à la minute et traces exigées : toute correction de ces champs rompt la chaîne (R32). */
interface ContenuFormat2 extends MaillonCommun {
  readonly format: 2;
  readonly centreId: string;
  /** Nul sur un maillon de `TYPES_EVENEMENT_SYSTEME`. */
  readonly acteurId: string | null;
  /** Instant UTC, tel que relu de la base. */
  readonly horodatage: string;
}

export type ContenuMaillon = ContenuFormat1 | ContenuFormat2;
export type Maillon = ContenuMaillon & { readonly empreinte: string };

/**
 * Empreinte d'un maillon : toute modification de lui ou d'un précédent rompt la suite de la chaîne.
 * Le format fait partie de ce qui est haché : repasser un maillon en format 1 change son empreinte.
 * Source : fiscal/boi-tva-decla-30-10-30.html § 50 (date à la minute), § 140 (chaînage des enregistrements).
 */
export function enchainer(maillon: ContenuMaillon, hacheur: Hacheur): string {
  const { rang, type, charge, empreintePrecedente } = maillon;
  if (maillon.format !== 2) {
    return hacheur.sha256(serialiserCanonique({ charge, empreintePrecedente, rang, type }));
  }
  const { format, centreId, acteurId, horodatage } = maillon;
  return hacheur.sha256(
    serialiserCanonique({
      acteurId,
      centreId,
      charge,
      empreintePrecedente,
      format,
      horodatage,
      rang,
      type,
    }),
  );
}

/** Ce que le contrôle a trouvé, pour le journal et l'écran de vérification. */
export const RAISONS_RUPTURE = [
  'MAILLON',
  'TETE',
  'PIECE',
  'NUMEROTATION',
  'ENCAISSEMENT',
  'TIERS_PAYANT',
  'SESSION',
  'CLOTURE',
  'ARCHIVE',
  'SIGNATURE',
] as const;
export type RaisonRupture = (typeof RAISONS_RUPTURE)[number];

export const LIBELLES_RAISONS_RUPTURE: Readonly<Record<RaisonRupture, string>> = {
  MAILLON: 'Maillon altéré, absent ou déplacé',
  TETE: 'Tête de chaîne incohérente',
  PIECE: 'Facture ou avoir différent de son maillon',
  NUMEROTATION: 'Numérotation interrompue',
  ENCAISSEMENT: 'Encaissement différent de son maillon',
  TIERS_PAYANT: 'Règlement ou régularisation d’organisme différent de son maillon',
  SESSION: 'Ouverture ou comptage différent de son maillon',
  CLOTURE: 'Clôture différente de son maillon ou de ses opérations',
  ARCHIVE: 'Archive différente de son empreinte',
  SIGNATURE: 'Signature absente ou invalide',
};

export type ResultatChaine =
  | { readonly valide: true; readonly maillons: number }
  | { readonly valide: false; readonly rang: number; readonly raison: RaisonRupture };

/** Dernier maillon contrôlé : le parcours se fait par lots, sans charger toute la chaîne. */
export interface PositionChaine {
  readonly rang: number;
  readonly empreinte: string;
}

export const DEBUT_CHAINE: PositionChaine = { rang: 0, empreinte: EMPREINTE_INITIALE };

/** Le maillon suit-il `position` sans altération ? */
export function maillonSuivantValide(
  position: PositionChaine,
  maillon: Maillon,
  hacheur: Hacheur,
): boolean {
  return (
    maillon.rang === position.rang + 1 &&
    maillon.empreintePrecedente === position.empreinte &&
    maillon.empreinte === enchainer(maillon, hacheur)
  );
}

/** Parcourt la chaîne d'un centre, triée par rang : le premier maillon altéré, absent ou déplacé rompt. */
export function verifierChaine(maillons: readonly Maillon[], hacheur: Hacheur): ResultatChaine {
  let position = DEBUT_CHAINE;
  for (const maillon of maillons) {
    if (!maillonSuivantValide(position, maillon, hacheur)) {
      return { valide: false, rang: position.rang + 1, raison: 'MAILLON' };
    }
    position = { rang: maillon.rang, empreinte: maillon.empreinte };
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
  /** Non nul seulement si des acomptes sont déduits : les maillons antérieurs restent identiques. */
  readonly acomptesDeduits?: Centimes;
  /** Présent seulement à `false` : les maillons antérieurs restent identiques. */
  readonly tiersPayantAmo?: boolean;
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
export function chargePiece({
  lignes,
  acomptesDeduits,
  tiersPayantAmo,
  ...piece
}: PieceAChainer): unknown {
  return {
    ...piece,
    ...(acomptesDeduits ? { acomptesDeduits } : {}),
    ...(tiersPayantAmo === false ? { tiersPayantAmo } : {}),
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
