import { z } from 'zod';

import { ajouterJours, ajouterMois, decomposerDate } from '../commun/date';
import { NATURES_PIECE } from '../facture/types';
import type { TypeEvenementCaisse } from '../facture/chaine';
import { MODES_PAIEMENT, NATURES_MOUVEMENT, type ModePaiement } from './encaissement';

/**
 * Version de la fonction de caisse, portée par les clôtures et les archives. Changer un paramètre qui touche aux
 * conditions d'inaltérabilité, de sécurisation, de conservation ou d'archivage impose une nouvelle version majeure,
 * donc de nouvelles attestations.
 * Source : fiscal/boi-tva-decla-30-10-30.html § 340 et § 380.
 */
export const VERSION_CAISSE = '1.0';

/** Source : fiscal/boi-tva-decla-30-10-30.html § 170 : trois échéances « cumulatives et impératives ». */
export const PORTEES_CLOTURE = ['JOUR', 'MOIS', 'EXERCICE'] as const;
export type PorteeCloture = (typeof PORTEES_CLOTURE)[number];

export const LIBELLES_PORTEES_CLOTURE: Readonly<Record<PorteeCloture, string>> = {
  JOUR: 'Journalière',
  MOIS: 'Mensuelle',
  EXERCICE: 'Annuelle',
};

const chargePieceLueSchema = z.object({
  nature: z.enum(NATURES_PIECE),
  totaux: z.object({ prixTTC: z.number(), ht: z.number(), tva: z.number() }),
  lignes: z.array(
    z.object({
      prixTTC: z.number(),
      tauxTva: z.number().nullable(),
      montantHT: z.number(),
      montantTva: z.number(),
    }),
  ),
});

const chargeMouvementLueSchema = z.object({
  nature: z.enum(NATURES_MOUVEMENT),
  mode: z.enum(MODES_PAIEMENT),
  montantCentimes: z.number(),
  devisId: z.string().nullable(),
});

export interface TotalTaux {
  /** Pour dix mille ; nul si la ligne n'a pas de taux figé. */
  readonly taux: number | null;
  readonly ttc: number;
  readonly ht: number;
  readonly tva: number;
}

export interface TotalMode {
  readonly mode: ModePaiement;
  readonly encaisse: number;
  readonly rendu: number;
}

export interface TotauxCloture {
  readonly factures: number;
  readonly avoirs: number;
  /** Nets d'avoirs. */
  readonly ttc: number;
  readonly ht: number;
  readonly tva: number;
  readonly parTaux: readonly TotalTaux[];
  /** Acomptes compris : tout ce qui est entré ou sorti, par mode. */
  readonly parMode: readonly TotalMode[];
  /** Nets de remboursements et d'annulations. */
  readonly encaissementsNets: number;
  /** À VÉRIFIER : hors totaux par taux, tant que la TVA sur acomptes n'est pas tranchée (R36). */
  readonly acomptesNets: number;
}

/** Totaux relus de la base, pour additionner les journées d'un mois. */
export const totauxClotureSchema = z.object({
  factures: z.number(),
  avoirs: z.number(),
  ttc: z.number(),
  ht: z.number(),
  tva: z.number(),
  parTaux: z.array(
    z.object({ taux: z.number().nullable(), ttc: z.number(), ht: z.number(), tva: z.number() }),
  ),
  parMode: z.array(
    z.object({ mode: z.enum(MODES_PAIEMENT), encaisse: z.number(), rendu: z.number() }),
  ),
  encaissementsNets: z.number(),
  acomptesNets: z.number(),
}) satisfies z.ZodType<TotauxCloture>;

export const TOTAUX_VIDES: TotauxCloture = {
  factures: 0,
  avoirs: 0,
  ttc: 0,
  ht: 0,
  tva: 0,
  parTaux: [],
  parMode: [],
  encaissementsNets: 0,
  acomptesNets: 0,
};

function fusionnerTaux(a: readonly TotalTaux[], b: readonly TotalTaux[]): readonly TotalTaux[] {
  const parTaux = new Map<number | null, TotalTaux>(a.map((t) => [t.taux, t]));
  for (const t of b) {
    const connu = parTaux.get(t.taux);
    parTaux.set(
      t.taux,
      connu
        ? { taux: t.taux, ttc: connu.ttc + t.ttc, ht: connu.ht + t.ht, tva: connu.tva + t.tva }
        : t,
    );
  }
  return [...parTaux.values()].sort((x, y) => (x.taux ?? -1) - (y.taux ?? -1));
}

function fusionnerModes(a: readonly TotalMode[], b: readonly TotalMode[]): readonly TotalMode[] {
  return MODES_PAIEMENT.flatMap((mode) => {
    const lignes = [...a, ...b].filter((t) => t.mode === mode);
    return lignes.length === 0
      ? []
      : [
          {
            mode,
            encaisse: lignes.reduce((total, t) => total + t.encaisse, 0),
            rendu: lignes.reduce((total, t) => total + t.rendu, 0),
          },
        ];
  });
}

/** Le mois additionne ses jours, l'exercice ses mois. */
export function additionnerTotaux(totaux: readonly TotauxCloture[]): TotauxCloture {
  return totaux.reduce(
    (cumul, t) => ({
      factures: cumul.factures + t.factures,
      avoirs: cumul.avoirs + t.avoirs,
      ttc: cumul.ttc + t.ttc,
      ht: cumul.ht + t.ht,
      tva: cumul.tva + t.tva,
      parTaux: fusionnerTaux(cumul.parTaux, t.parTaux),
      parMode: fusionnerModes(cumul.parMode, t.parMode),
      encaissementsNets: cumul.encaissementsNets + t.encaissementsNets,
      acomptesNets: cumul.acomptesNets + t.acomptesNets,
    }),
    TOTAUX_VIDES,
  );
}

function totauxPiece(charge: unknown): TotauxCloture {
  const { nature, totaux, lignes } = chargePieceLueSchema.parse(charge);
  const signe = nature === 'FACTURE' ? 1 : -1;
  const parTaux = lignes.reduce<readonly TotalTaux[]>(
    (cumul, ligne) =>
      fusionnerTaux(cumul, [
        {
          taux: ligne.tauxTva,
          ttc: signe * ligne.prixTTC,
          ht: signe * ligne.montantHT,
          tva: signe * ligne.montantTva,
        },
      ]),
    [],
  );
  return {
    ...TOTAUX_VIDES,
    factures: nature === 'FACTURE' ? 1 : 0,
    avoirs: nature === 'AVOIR' ? 1 : 0,
    ttc: signe * totaux.prixTTC,
    ht: signe * totaux.ht,
    tva: signe * totaux.tva,
    parTaux,
  };
}

function totauxMouvement(charge: unknown): TotauxCloture {
  const { nature, mode, montantCentimes, devisId } = chargeMouvementLueSchema.parse(charge);
  const entree = nature === 'ENCAISSEMENT';
  const net = entree ? montantCentimes : -montantCentimes;
  return {
    ...TOTAUX_VIDES,
    parMode: [
      { mode, encaisse: entree ? montantCentimes : 0, rendu: entree ? 0 : montantCentimes },
    ],
    encaissementsNets: net,
    acomptesNets: devisId === null ? 0 : net,
  };
}

export interface MaillonCloture {
  readonly type: TypeEvenementCaisse;
  readonly charge: unknown;
}

const TYPES_PIECE: readonly TypeEvenementCaisse[] = ['FACTURE_VALIDEE', 'AVOIR_VALIDE'];
const TYPES_MOUVEMENT: readonly TypeEvenementCaisse[] = [
  'ENCAISSEMENT',
  'REMBOURSEMENT',
  'ANNULATION_ENCAISSEMENT',
];

/** Totaux d'une plage de maillons. Le calcul lit les charges : ce qui est chaîné est ce qui est totalisé. */
export function totauxDepuisMaillons(maillons: readonly MaillonCloture[]): TotauxCloture {
  return additionnerTotaux(
    maillons.flatMap(({ type, charge }) => {
      if (TYPES_PIECE.includes(type)) {
        return [totauxPiece(charge)];
      }
      return TYPES_MOUVEMENT.includes(type) ? [totauxMouvement(charge)] : [];
    }),
  );
}

/** Ces maillons ne font pas une journée d'activité : ils viennent après coup. */
const TYPES_HORS_ACTIVITE: readonly TypeEvenementCaisse[] = [
  'CLOTURE',
  'ARCHIVAGE',
  'VERIFICATION_ECHEC',
];

export function maillonDActivite(type: TypeEvenementCaisse): boolean {
  return !TYPES_HORS_ACTIVITE.includes(type);
}

export interface Cumuls {
  /** Chiffre d'affaires depuis l'ouverture de l'exercice. Source : boi-tva-decla-30-10-30.html § 170. */
  readonly grandTotalCentimes: number;
  /** Chiffre d'affaires depuis le début d'utilisation, jamais remis à zéro. Source : idem. */
  readonly perpetuelCentimes: number;
  /** Encaissements nets depuis le début d'utilisation. */
  readonly encaissePerpetuelCentimes: number;
}

export const CUMULS_INITIAUX: Cumuls = {
  grandTotalCentimes: 0,
  perpetuelCentimes: 0,
  encaissePerpetuelCentimes: 0,
};

/** Cumuls après une journée : le grand total repart à l'ouverture de l'exercice, le perpétuel jamais. */
export function cumulsSuivants(
  precedents: Cumuls,
  totaux: TotauxCloture,
  memeExercice: boolean,
): Cumuls {
  return {
    grandTotalCentimes: (memeExercice ? precedents.grandTotalCentimes : 0) + totaux.ttc,
    perpetuelCentimes: precedents.perpetuelCentimes + totaux.ttc,
    encaissePerpetuelCentimes: precedents.encaissePerpetuelCentimes + totaux.encaissementsNets,
  };
}

export interface Periode {
  /** Inclus. */
  readonly debut: string;
  /** Inclus. */
  readonly fin: string;
}

export function moisDe(date: string): Periode {
  const [annee, mois] = decomposerDate(date);
  const debut = `${String(annee)}-${String(mois).padStart(2, '0')}-01`;
  return { debut, fin: ajouterJours(ajouterMois(debut, 1), -1) };
}

/**
 * Exercice contenant `date`, clos à la fin de `moisCloture`.
 * Source : fiscal/boi-tva-decla-30-10-30.html § 170 (« ou par exercice lorsque l'exercice ne coïncide pas avec
 * l'année civile »).
 */
export function exerciceDe(date: string, moisCloture: number): Periode {
  const [annee, mois] = decomposerDate(date);
  const anneeFin = mois > moisCloture ? annee + 1 : annee;
  const { fin } = moisDe(`${String(anneeFin)}-${String(moisCloture).padStart(2, '0')}-01`);
  const lendemain = ajouterJours(fin, 1);
  const [anneeSuivante] = decomposerDate(lendemain);
  return { debut: `${String(anneeSuivante - 1)}${lendemain.slice(4)}`, fin };
}

/** Mois entièrement écoulés, ayant au moins une journée clôturée, et pas encore clôturés. */
export function moisACloturer(
  joursClotures: readonly string[],
  moisDejaClotures: readonly string[],
  aujourdhui: string,
): readonly Periode[] {
  const debuts = new Set(joursClotures.map((jour) => moisDe(jour).debut));
  return [...debuts]
    .filter((debut) => !moisDejaClotures.includes(debut))
    .map(moisDe)
    .filter(({ fin }) => fin < aujourdhui)
    .sort((a, b) => a.debut.localeCompare(b.debut));
}

/** Exercices entièrement écoulés, ayant au moins un mois clôturé, et pas encore clôturés. */
export function exercicesACloturer(
  moisClotures: readonly string[],
  exercicesDejaClotures: readonly string[],
  moisCloture: number,
  aujourdhui: string,
): readonly Periode[] {
  const parDebut = new Map(moisClotures.map((m) => [exerciceDe(m, moisCloture).debut, m]));
  return [...parDebut.values()]
    .map((m) => exerciceDe(m, moisCloture))
    .filter(({ debut, fin }) => fin < aujourdhui && !exercicesDejaClotures.includes(debut))
    .sort((a, b) => a.debut.localeCompare(b.debut));
}

export interface ClotureAChainer extends Cumuls, Periode {
  readonly id: string;
  readonly portee: PorteeCloture;
  readonly rangDebut: number;
  readonly rangFin: number;
  readonly totaux: TotauxCloture;
  readonly versionCaisse: string;
}

export function chargeCloture(cloture: ClotureAChainer): unknown {
  return { ...cloture };
}
