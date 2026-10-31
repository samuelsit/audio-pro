/**
 * Constantes réglementaires qui ne viennent pas de la base LPP : ce fichier est le seul à en définir.
 * Le détail de chaque règle est dans docs/REGLES_AUDIO.md.
 *
 * `dateEffet` : date à partir de laquelle la source citée s'applique. Pour la convention, c'est
 * l'entrée en vigueur de la version consolidée (avenant n° 1, p. 1). `null` : aucun document ne la
 * donne.
 */
import { centimes, type Centimes } from '../money';

interface ConstanteReglementaire<V> {
  readonly valeur: V;
  readonly dateEffet: string | null;
  readonly source: string;
}

const CONVENTION = 'convention-audioprothesistes.pdf';
const EFFET_CONVENTION = '2025-01-01';

// À VÉRIFIER : les textes se contredisent sur l'année des 20 ans (R1). Choix validé : suivre ameli.
export const AGE_SEUIL_TRANCHE: ConstanteReglementaire<number> = {
  valeur: 20,
  dateEffet: '2021-01-01',
  source: 'ameli-100-sante-audio.pdf p. 1 ; À VÉRIFIER, libellés LPP 908 contradictoires',
};

export const PLAFOND_C2S_VINGT_ET_PLUS: ConstanteReglementaire<Centimes> = {
  valeur: centimes(80_000),
  dateEffet: '2021-01-01',
  source: 'ameli-100-sante-audio.pdf p. 2',
};

export const PLAFOND_C2S_MOINS_DE_20: ConstanteReglementaire<Centimes> = {
  valeur: centimes(140_000),
  dateEffet: '2021-01-01',
  source: 'ameli-100-sante-audio.pdf p. 2 (aussi : personne sourde et aveugle)',
};

/** Taux en pour cent. */
export const TAUX_AMO_GENERAL: ConstanteReglementaire<number> = {
  valeur: 60,
  dateEffet: '2021-01-01',
  source: 'fr201-codes-prestation.pdf, table 4, p. 4',
};

export const TAUX_AMO_CRPCEN: ConstanteReglementaire<number> = {
  valeur: 85,
  dateEffet: '2021-01-01',
  source: 'fr201-codes-prestation.pdf, table 4, p. 4',
};

export const TAUX_AMO_AME: ConstanteReglementaire<number> = {
  valeur: 100,
  dateEffet: EFFET_CONVENTION,
  source: `${CONVENTION}, art. 30, p. 28`,
};

export const DELAI_RENOUVELLEMENT_ANNEES: ConstanteReglementaire<number> = {
  valeur: 4,
  dateEffet: EFFET_CONVENTION,
  source: `${CONVENTION}, art. 22 § 1, p. 22`,
};

export const ESSAI_DUREE_MINIMALE_JOURS: ConstanteReglementaire<number> = {
  valeur: 30,
  dateEffet: EFFET_CONVENTION,
  source: `${CONVENTION}, art. 18 3°, p. 20`,
};

export const ESSAI_PROLONGATION_MAX_JOURS: ConstanteReglementaire<number> = {
  valeur: 15,
  dateEffet: EFFET_CONVENTION,
  source: `${CONVENTION}, art. 18 3°, p. 20`,
};

export const ESSAI_RDV_MINIMUM: ConstanteReglementaire<number> = {
  valeur: 2,
  dateEffet: EFFET_CONVENTION,
  source: `${CONVENTION}, art. 18 3°, p. 20`,
};

export const ESSAI_SEUIL_ALERTE_JOURS: ConstanteReglementaire<number> = {
  valeur: 7,
  dateEffet: null,
  source: 'Choix applicatif, pas une règle (R9)',
};

export const VALIDITE_MINIMALE_DEVIS_MOIS: ConstanteReglementaire<number> = {
  valeur: 2,
  dateEffet: null,
  source: 'modele-devis-audio.pdf p. 1 (modèle non daté)',
};

export const OPTIONS_MINIMUM_OFFRE_100_SANTE: ConstanteReglementaire<number> = {
  valeur: 3,
  dateEffet: null,
  source: 'modele-devis-audio.pdf p. 1 § 1.1 (modèle non daté)',
};

export const GARANTIE_MINIMALE_ANNEES: ConstanteReglementaire<number> = {
  valeur: 4,
  dateEffet: null,
  source: 'modele-devis-audio.pdf p. 2 § 4 (modèle non daté)',
};

// À VÉRIFIER : aucun document de docs/ref ne fixe ce délai ; l'art. 27 apprécie les droits à la
// délivrance. Choix validé le 2026-10-31 (R22).
export const FRAICHEUR_LECTURE_VITALE_JOURS: ConstanteReglementaire<number> = {
  valeur: 30,
  dateEffet: null,
  source: 'Choix applicatif, À VÉRIFIER : absent de docs/ref',
};

/** Taux en pour dix mille, 550 pour 5,5 %. */
// À VÉRIFIER : aucun document de docs/ref ne donne de taux de TVA (R18).
export const TAUX_TVA_AIDE_AUDITIVE: ConstanteReglementaire<number> = {
  valeur: 550,
  dateEffet: null,
  source: 'À VÉRIFIER : absent de docs/ref',
};

// À VÉRIFIER : aucun document de docs/ref ne donne de taux de TVA (R18).
export const TAUX_TVA_CONSOMMABLES: ConstanteReglementaire<number> = {
  valeur: 2000,
  dateEffet: null,
  source: 'À VÉRIFIER : absent de docs/ref',
};

// À VÉRIFIER : aucun document de docs/ref ne donne ce seuil (R10).
export const AGE_SEUIL_PRESCRIPTION: ConstanteReglementaire<number> = {
  valeur: 6,
  dateEffet: null,
  source: 'À VÉRIFIER : absent de docs/ref',
};

// À VÉRIFIER : aucun document de docs/ref ne donne ce montant (R14).
export const PLAFOND_CONTRAT_RESPONSABLE: ConstanteReglementaire<Centimes> = {
  valeur: centimes(170_000),
  dateEffet: null,
  source: 'À VÉRIFIER : absent de docs/ref',
};
