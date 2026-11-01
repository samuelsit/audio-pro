import { z } from 'zod';

import { NATURES_LIGNE_FACTURE, NATURES_PIECE, type NatureLigneFacture } from '../facture/types';
import type { TypeEvenementCaisse } from '../facture/chaine';
import { MODES_PAIEMENT, NATURES_MOUVEMENT, type ModePaiement } from './encaissement';

const compteSchema = z
  .string({ error: 'Compte obligatoire.' })
  .regex(/^\d{3,13}$/, 'De 3 à 13 chiffres.');
const journalSchema = z
  .string({ error: 'Journal obligatoire.' })
  .regex(/^[A-Z0-9]{1,6}$/, 'Majuscules et chiffres, 6 au maximum.');

/**
 * Plan de comptes d'un centre.
 * À VÉRIFIER : aucun plan de comptes n'est imposé par docs/ref, les valeurs par défaut sont à faire valider par
 * l'expert-comptable (R39).
 */
export const parametresComptablesSchema = z.object({
  journalVentes: journalSchema,
  journalVentesLibelle: z.string().min(1).max(100),
  journalTresorerie: journalSchema,
  journalTresorerieLibelle: z.string().min(1).max(100),
  compteClients: compteSchema,
  compteAmo: compteSchema,
  compteAmc: compteSchema,
  compteAcomptes: compteSchema,
  compteTva: compteSchema,
  compteEcartNegatif: compteSchema,
  compteEcartPositif: compteSchema,
  ventes: z.object(
    Object.fromEntries(NATURES_LIGNE_FACTURE.map((nature) => [nature, compteSchema])) as Record<
      NatureLigneFacture,
      typeof compteSchema
    >,
  ),
  tresorerie: z.object(
    Object.fromEntries(MODES_PAIEMENT.map((mode) => [mode, compteSchema])) as Record<
      ModePaiement,
      typeof compteSchema
    >,
  ),
});
export type ParametresComptables = z.output<typeof parametresComptablesSchema>;

/** À VÉRIFIER : voir `parametresComptablesSchema`. */
export const PARAMETRES_COMPTABLES_DEFAUT: ParametresComptables = {
  journalVentes: 'VE',
  journalVentesLibelle: 'Ventes',
  journalTresorerie: 'CA',
  journalTresorerieLibelle: 'Caisse et encaissements',
  compteClients: '411000',
  compteAmo: '411100',
  compteAmc: '411200',
  compteAcomptes: '419100',
  compteTva: '445710',
  compteEcartNegatif: '658000',
  compteEcartPositif: '758000',
  ventes: {
    AIDE_AUDITIVE: '707000',
    PILE: '707100',
    ACCESSOIRE: '707200',
    ENTRETIEN: '706000',
  },
  tresorerie: {
    CB: '511200',
    ESPECES: '530000',
    CHEQUE: '511100',
    VIREMENT: '512000',
    FINANCEMENT: '467000',
  },
};

export interface LigneEcriture {
  readonly compte: string;
  readonly debit: number;
  readonly credit: number;
}

export interface Ecriture {
  readonly journal: string;
  readonly journalLibelle: string;
  readonly date: string;
  readonly pieceRef: string;
  readonly libelle: string;
  readonly lignes: readonly LigneEcriture[];
}

export interface MaillonComptable {
  readonly rang: number;
  readonly type: TypeEvenementCaisse;
  readonly charge: unknown;
  /** Date de l'opération, en heure de Paris. */
  readonly date: string;
}

const chargePieceComptableSchema = z.object({
  nature: z.enum(NATURES_PIECE),
  numero: z.string(),
  acomptesDeduits: z.number().optional(),
  totaux: z.object({ amo: z.number(), amc: z.number(), resteACharge: z.number() }),
  lignes: z.array(
    z.object({
      nature: z.enum(NATURES_LIGNE_FACTURE),
      montantHT: z.number(),
      montantTva: z.number(),
    }),
  ),
});

const chargeMouvementComptableSchema = z.object({
  nature: z.enum(NATURES_MOUVEMENT),
  mode: z.enum(MODES_PAIEMENT),
  montantCentimes: z.number(),
  devisId: z.string().nullable(),
});

const chargeComptageComptableSchema = z.object({
  journee: z.string(),
  ecartCentimes: z.number(),
});

/** Un montant au débit, ou au crédit s'il est négatif : un avoir retourne l'écriture de sa facture. */
function ligne(compte: string, montant: number): LigneEcriture {
  return { compte, debit: Math.max(montant, 0), credit: Math.max(-montant, 0) };
}

function nonNulles(lignes: readonly LigneEcriture[]): readonly LigneEcriture[] {
  return lignes.filter(({ debit, credit }) => debit !== 0 || credit !== 0);
}

function regrouper(lignes: readonly LigneEcriture[]): readonly LigneEcriture[] {
  const parCompte = new Map<string, number>();
  for (const { compte, debit, credit } of lignes) {
    parCompte.set(compte, (parCompte.get(compte) ?? 0) + debit - credit);
  }
  return [...parCompte].map(([compte, montant]) => ligne(compte, montant));
}

function ecriturePiece(maillon: MaillonComptable, p: ParametresComptables): Ecriture {
  const { nature, numero, totaux, lignes, acomptesDeduits } = chargePieceComptableSchema.parse(
    maillon.charge,
  );
  const signe = nature === 'FACTURE' ? 1 : -1;
  const acomptes = acomptesDeduits ?? 0;
  return {
    journal: p.journalVentes,
    journalLibelle: p.journalVentesLibelle,
    date: maillon.date,
    pieceRef: numero,
    libelle: `${nature === 'FACTURE' ? 'Facture' : 'Avoir'} ${numero}`,
    lignes: nonNulles(
      regrouper([
        ligne(p.compteClients, signe * (totaux.resteACharge - acomptes)),
        ligne(p.compteAcomptes, signe * acomptes),
        ligne(p.compteAmo, signe * totaux.amo),
        ligne(p.compteAmc, signe * totaux.amc),
        ...lignes.flatMap((l) => [
          ligne(p.ventes[l.nature], -signe * l.montantHT),
          ligne(p.compteTva, -signe * l.montantTva),
        ]),
      ]),
    ),
  };
}

function ecritureMouvement(maillon: MaillonComptable, p: ParametresComptables): Ecriture {
  const { nature, mode, montantCentimes, devisId } = chargeMouvementComptableSchema.parse(
    maillon.charge,
  );
  const signe = nature === 'ENCAISSEMENT' ? 1 : -1;
  return {
    journal: p.journalTresorerie,
    journalLibelle: p.journalTresorerieLibelle,
    date: maillon.date,
    pieceRef: `E-${String(maillon.rang)}`,
    libelle: `${devisId === null ? 'Règlement' : 'Acompte'} ${nature.toLowerCase()} ${mode}`,
    lignes: [
      ligne(p.tresorerie[mode], signe * montantCentimes),
      ligne(devisId === null ? p.compteClients : p.compteAcomptes, -signe * montantCentimes),
    ],
  };
}

/** Écart de comptage : un compte de charge ou de produit contre la caisse. À VÉRIFIER (R39). */
function ecritureEcart(maillon: MaillonComptable, p: ParametresComptables): Ecriture | null {
  const { journee, ecartCentimes } = chargeComptageComptableSchema.parse(maillon.charge);
  if (ecartCentimes === 0) {
    return null;
  }
  return {
    journal: p.journalTresorerie,
    journalLibelle: p.journalTresorerieLibelle,
    date: maillon.date,
    pieceRef: `C-${String(maillon.rang)}`,
    libelle: `Écart de caisse du ${journee}`,
    lignes: [
      ligne(p.tresorerie.ESPECES, ecartCentimes),
      ligne(ecartCentimes < 0 ? p.compteEcartNegatif : p.compteEcartPositif, -ecartCentimes),
    ],
  };
}

/** Écritures d'un maillon : rien pour un événement sans effet comptable. */
export function ecrituresDepuisMaillon(
  maillon: MaillonComptable,
  parametres: ParametresComptables,
): readonly Ecriture[] {
  switch (maillon.type) {
    case 'FACTURE_VALIDEE':
    case 'AVOIR_VALIDE':
      return [ecriturePiece(maillon, parametres)];
    case 'ENCAISSEMENT':
    case 'REMBOURSEMENT':
    case 'ANNULATION_ENCAISSEMENT':
      return [ecritureMouvement(maillon, parametres)];
    case 'CAISSE_COMPTEE': {
      const ecart = ecritureEcart(maillon, parametres);
      return ecart ? [ecart] : [];
    }
    default:
      return [];
  }
}

export function ecritureEquilibree({ lignes }: Ecriture): boolean {
  return lignes.reduce((solde, { debit, credit }) => solde + debit - credit, 0) === 0;
}
