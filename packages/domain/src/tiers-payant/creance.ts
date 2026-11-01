import { ajouterJours, joursEntre } from '../commun/date';
import { jourSemaine } from '../commun/fuseau';
import { centimes, type Centimes } from '../money';

export const TYPES_CREANCE = ['AMO', 'AMC'] as const;
export type TypeCreance = (typeof TYPES_CREANCE)[number];

export const LIBELLES_TYPES_CREANCE: Readonly<Record<TypeCreance, string>> = {
  AMO: 'AMO',
  AMC: 'AMC',
};

export const STATUTS_CREANCE = ['OUVERTE', 'PARTIELLE', 'SOLDEE', 'REJETEE', 'INDU'] as const;
export type StatutCreance = (typeof STATUTS_CREANCE)[number];

export const LIBELLES_STATUTS_CREANCE: Readonly<Record<StatutCreance, string>> = {
  OUVERTE: 'Ouverte',
  PARTIELLE: 'Partiellement réglée',
  SOLDEE: 'Soldée',
  REJETEE: 'Rejetée',
  INDU: 'Indu à traiter',
};

/** Repli quand ni la lecture Vitale ni la saisie n'ont donné la caisse : la créance doit se regrouper. */
export const ORGANISME_AMO_INCONNU = 'Assurance maladie';

/** Source : convention-audioprothesistes.pdf, art. 35 § 3, p. 32 (ordre de virement). */
export const DELAI_ORDRE_VIREMENT_JOURS_OUVRES = 5;

/** À VÉRIFIER : aucun délai de paiement AMC dans docs/ref, valeur par défaut d'une complémentaire (R42). */
export const DELAI_PAIEMENT_AMC_DEFAUT_JOURS = 30;

/**
 * `date` + `jours` jours du lundi au vendredi.
 * À VÉRIFIER : les jours fériés ne sont pas déduits, la convention ne définit pas « ouvré » (R42).
 */
export function ajouterJoursOuvres(date: string, jours: number): string {
  let courante = date;
  let restants = jours;
  while (restants > 0) {
    courante = ajouterJours(courante, 1);
    const jour = jourSemaine(courante);
    if (jour !== 'samedi' && jour !== 'dimanche') {
      restants -= 1;
    }
  }
  return courante;
}

/**
 * Échéance attendue d'une part payée par la caisse : l'AMO, et la part C2S coordonnée par elle.
 * `depart` est la date de facture, remplacée par celle de la FSE acceptée quand elle est connue.
 * Source : convention-audioprothesistes.pdf, art. 35 § 3, p. 32 (cinq jours ouvrés après l'ARL positif).
 * À VÉRIFIER : le texte vise l'ordre de virement en mode sécurisé, pas la réception des fonds (R42).
 */
export function echeanceAmo(depart: string): string {
  return ajouterJoursOuvres(depart, DELAI_ORDRE_VIREMENT_JOURS_OUVRES);
}

/** À VÉRIFIER : choix applicatif, aucun délai de paiement AMC dans docs/ref (R42). */
export function echeanceAmc(dateFacture: string, delaiJours: number | null): string {
  return ajouterJours(dateFacture, delaiJours ?? DELAI_PAIEMENT_AMC_DEFAUT_JOURS);
}

export interface PayeurComplementaire {
  readonly organisme: string;
  readonly complementaireId: string | null;
  readonly numeroAccord: string | null;
  readonly delaiPaiementJours: number | null;
}

export interface EntreeCreances {
  readonly dateFacture: string;
  readonly tiersPayantAmo: boolean;
  readonly amo: Centimes;
  readonly amc: Centimes;
  readonly c2s: boolean;
  /** Caisse du patient, `null` si inconnue. */
  readonly caisse: string | null;
  readonly regime: string | null;
  /** PEC qui a fourni la part AMC ; `null` en C2S ou sans part AMC. */
  readonly complementaire: PayeurComplementaire | null;
}

export interface CreanceAEcrire {
  readonly type: TypeCreance;
  readonly organisme: string;
  readonly regime: string | null;
  readonly complementaireId: string | null;
  readonly numeroAccord: string | null;
  readonly montant: Centimes;
  readonly echeanceAttendue: string;
}

/**
 * Créances nées d'une facture validée : une par part portée par un organisme. Sans tiers payant AMO, le patient
 * règle cette part lui-même.
 * Source : convention-audioprothesistes.pdf, art. 27, p. 26 (subrogation) et art. 35 § 3, p. 32 (part AMC C2S
 * coordonnée par la caisse).
 * À VÉRIFIER : C2S gérée par un organisme complémentaire, traitée comme gérée par la caisse (R23).
 */
export function creancesDeFacture(entree: EntreeCreances): CreanceAEcrire[] {
  const { dateFacture, tiersPayantAmo, amo, amc, c2s, regime, complementaire } = entree;
  const organismeAmo = entree.caisse ?? ORGANISME_AMO_INCONNU;
  const creances: CreanceAEcrire[] = [];
  if (tiersPayantAmo && amo > 0) {
    creances.push({
      type: 'AMO',
      organisme: organismeAmo,
      regime,
      complementaireId: null,
      numeroAccord: null,
      montant: amo,
      echeanceAttendue: echeanceAmo(dateFacture),
    });
  }
  if (amc > 0) {
    creances.push({
      type: 'AMC',
      organisme: complementaire?.organisme ?? organismeAmo,
      regime: complementaire ? null : regime,
      complementaireId: complementaire?.complementaireId ?? null,
      numeroAccord: complementaire?.numeroAccord ?? null,
      montant: amc,
      echeanceAttendue:
        c2s || !complementaire
          ? echeanceAmo(dateFacture)
          : echeanceAmc(dateFacture, complementaire.delaiPaiementJours),
    });
  }
  return creances;
}

export interface EtatCreance {
  readonly montantCentimes: number;
  readonly soldeCentimes: number;
  readonly rejetATraiter: boolean;
}

/** Statut toujours déduit : un rejet à traiter prime, un solde négatif est un trop-versé par l'organisme. */
export function statutCreance({
  montantCentimes,
  soldeCentimes,
  rejetATraiter,
}: EtatCreance): StatutCreance {
  if (rejetATraiter) {
    return 'REJETEE';
  }
  if (soldeCentimes < 0) {
    return 'INDU';
  }
  if (soldeCentimes === 0) {
    return 'SOLDEE';
  }
  return soldeCentimes < montantCentimes ? 'PARTIELLE' : 'OUVERTE';
}

/** Comptées depuis la date de facture. Choix applicatif, rien dans docs/ref. */
export const TRANCHES_ANCIENNETE = ['J0_30', 'J31_60', 'J61_90', 'J91_PLUS'] as const;
export type TrancheAnciennete = (typeof TRANCHES_ANCIENNETE)[number];

export const LIBELLES_TRANCHES_ANCIENNETE: Readonly<Record<TrancheAnciennete, string>> = {
  J0_30: '0 à 30 jours',
  J31_60: '31 à 60 jours',
  J61_90: '61 à 90 jours',
  J91_PLUS: 'Plus de 90 jours',
};

export function trancheAnciennete(dateEmission: string, jour: string): TrancheAnciennete {
  const age = joursEntre(dateEmission, jour);
  if (age <= 30) {
    return 'J0_30';
  }
  if (age <= 60) {
    return 'J31_60';
  }
  return age <= 90 ? 'J61_90' : 'J91_PLUS';
}

/** Dates d'émission d'une tranche, bornes comprises ; `null` : pas de borne. */
export function bornesTranche(
  tranche: TrancheAnciennete,
  jour: string,
): { readonly depuis: string | null; readonly jusqua: string | null } {
  const [plusRecent, plusAncien] = (
    {
      J0_30: [0, 30],
      J31_60: [31, 60],
      J61_90: [61, 90],
      J91_PLUS: [91, null],
    } as const
  )[tranche];
  return {
    depuis: plusAncien === null ? null : ajouterJours(jour, -plusAncien),
    jusqua: ajouterJours(jour, -plusRecent),
  };
}

export interface CreanceAgregee {
  readonly organisme: string;
  readonly dateEmission: string;
  readonly soldeCentimes: number;
}

export interface LigneSynthese {
  readonly organisme: string;
  readonly nombre: number;
  readonly total: Centimes;
  readonly parTranche: Readonly<Record<TrancheAnciennete, Centimes>>;
}

/** Soldes ouverts par organisme et par ancienneté, du plus gros encours au plus petit. */
export function syntheseCreances(
  creances: readonly CreanceAgregee[],
  jour: string,
): LigneSynthese[] {
  const lignes = new Map<string, { nombre: number; parTranche: Map<TrancheAnciennete, number> }>();
  for (const { organisme, dateEmission, soldeCentimes } of creances) {
    const ligne = lignes.get(organisme) ?? { nombre: 0, parTranche: new Map() };
    const tranche = trancheAnciennete(dateEmission, jour);
    ligne.nombre += 1;
    ligne.parTranche.set(tranche, (ligne.parTranche.get(tranche) ?? 0) + soldeCentimes);
    lignes.set(organisme, ligne);
  }
  return [...lignes]
    .map(([organisme, { nombre, parTranche }]) => {
      const montantDe = (tranche: TrancheAnciennete) => centimes(parTranche.get(tranche) ?? 0);
      return {
        organisme,
        nombre,
        total: centimes([...parTranche.values()].reduce((t, m) => t + m, 0)),
        parTranche: {
          J0_30: montantDe('J0_30'),
          J31_60: montantDe('J31_60'),
          J61_90: montantDe('J61_90'),
          J91_PLUS: montantDe('J91_PLUS'),
        },
      };
    })
    .sort((a, b) => b.total - a.total || a.organisme.localeCompare(b.organisme, 'fr'));
}
