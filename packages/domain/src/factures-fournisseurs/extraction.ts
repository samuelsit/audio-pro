import { centimesDepuisSaisieEuros } from '../money';

export interface LigneExtraite {
  readonly reference: string | null;
  readonly designation: string;
  readonly quantite: number;
  readonly prixUnitaireCentimes: number;
  readonly numerosSerie: readonly string[];
}

/** Ce que l'on a cru lire : une proposition, jamais une donnée validée. Tout champ peut manquer. */
export interface FactureExtraite {
  readonly numero: string | null;
  /** ISO 8601. */
  readonly dateFacture: string | null;
  readonly montantHtCentimes: number | null;
  readonly montantTvaCentimes: number | null;
  readonly montantTtcCentimes: number | null;
  readonly sirets: readonly string[];
  /** Numéros de client qui figurent sur la facture. */
  readonly numerosClient: readonly string[];
  readonly numerosCommande: readonly string[];
  readonly lignes: readonly LigneExtraite[];
}

export const FACTURE_VIDE: FactureExtraite = {
  numero: null,
  dateFacture: null,
  montantHtCentimes: null,
  montantTvaCentimes: null,
  montantTtcCentimes: null,
  sirets: [],
  numerosClient: [],
  numerosCommande: [],
  lignes: [],
};

const MONTANT = String.raw`(\d{1,3}(?:[ \u00a0\u202f]\d{3})*(?:[.,]\d{2})|\d+[.,]\d{2})`;

function premier(texte: string, motif: RegExp): string | null {
  return motif.exec(texte)?.[1]?.trim() ?? null;
}

function tous(texte: string, motif: RegExp): string[] {
  return [...new Set([...texte.matchAll(motif)].map((m) => (m[1] ?? '').trim()))];
}

function montantApres(texte: string, libelle: string): number | null {
  const valeur = premier(texte, new RegExp(`${libelle}[^\\d\\n]{0,40}${MONTANT}`, 'i'));
  return valeur === null ? null : centimesDepuisSaisieEuros(valeur);
}

function dateIso(texte: string): string | null {
  const trouvee = /date[^\n]{0,30}?(\d{2})[/.-](\d{2})[/.-](\d{4})/i.exec(texte);
  if (!trouvee) {
    return null;
  }
  const [, jour, mois, annee] = trouvee;
  return `${annee ?? ''}-${mois ?? ''}-${jour ?? ''}`;
}

function sirets(texte: string): string[] {
  return tous(texte, /siret[^\d\n]{0,10}(\d[\d \u00a0]{12,18}\d)/gi).map((s) => s.replace(/\D/g, ''));
}

const LIGNE_ARTICLE = new RegExp(
  String.raw`^\s*(?:([A-Z0-9][A-Z0-9._/-]{2,})\s+)?(.+?)\s+(\d{1,4})\s+${MONTANT}\s*€?\s+${MONTANT}\s*€?\s*$`,
  'i',
);
const LIGNE_SERIES =
  /^\s*(?:s\/n|n°\s*de\s*s[ée]rie|num[ée]ros?\s+de\s+s[ée]rie|serial)\s*[:.]?\s*(.+)$/i;

function numerosDeLaLigne(valeur: string): string[] {
  return valeur
    .split(/[,;\s]+/)
    .map((n) => n.trim().toUpperCase())
    .filter((n) => n.length >= 4);
}

/** Lignes d'articles : référence éventuelle, désignation, quantité, prix unitaire, total. */
function lignes(texte: string): LigneExtraite[] {
  const resultat: { -readonly [K in keyof LigneExtraite]: LigneExtraite[K] }[] = [];
  for (const brute of texte.split('\n')) {
    const series = LIGNE_SERIES.exec(brute);
    const precedente = resultat.at(-1);
    if (series && precedente) {
      precedente.numerosSerie = [...precedente.numerosSerie, ...numerosDeLaLigne(series[1] ?? '')];
      continue;
    }
    const article = LIGNE_ARTICLE.exec(brute);
    if (!article) {
      continue;
    }
    const [, reference, designation, quantite, unitaire, total] = article;
    const prixUnitaireCentimes = centimesDepuisSaisieEuros(unitaire ?? '');
    const prixTotal = centimesDepuisSaisieEuros(total ?? '');
    const nombre = Number(quantite);
    // Quantité × prix = total : sans ce recoupement, toute ligne de chiffres passerait pour un article.
    if (prixUnitaireCentimes !== null && prixTotal === nombre * prixUnitaireCentimes) {
      resultat.push({
        reference: reference ?? null,
        designation: (designation ?? '').trim(),
        quantite: nombre,
        prixUnitaireCentimes,
        numerosSerie: [],
      });
    }
  }
  return resultat;
}

/**
 * Heuristiques sur le texte d'une facture PDF : numéro, date, totaux, SIRET, numéros de client et de commande,
 * lignes et numéros de série. Générique, sans format de fabricant : aucun n'est documenté dans docs/vendor.
 * Ce qui n'est pas reconnu reste vide, à la personne qui valide de le compléter.
 */
export function extraireDepuisTexte(texte: string): FactureExtraite {
  return {
    numero: premier(
      texte,
      /facture\s*(?:n°|n[o°]\.?|num[ée]ro|#)\s*[:.]?\s*([A-Z0-9][A-Z0-9/_-]*)/i,
    ),
    dateFacture: dateIso(texte),
    montantHtCentimes: montantApres(texte, String.raw`total\s+h\.?t\.?`),
    montantTvaCentimes: montantApres(texte, String.raw`(?:total\s+)?t\.?v\.?a\.?`),
    montantTtcCentimes: montantApres(texte, String.raw`total\s+t\.?t\.?c\.?`),
    sirets: sirets(texte),
    numerosClient: tous(
      texte,
      /(?:n°\s*client|num[ée]ro\s+de\s+client|code\s+client)\s*[:.]?\s*([A-Z0-9-]+)/gi,
    ),
    numerosCommande: tous(texte, /\b(CMD-\d{4}-\d{6})\b/gi).map((n) => n.toUpperCase()),
    lignes: lignes(texte),
  };
}
