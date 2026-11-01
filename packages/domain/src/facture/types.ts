import { NATURES_ACCESSOIRE, LIBELLES_NATURES_ACCESSOIRE } from '../catalogue';

/** L'entretien n'existe qu'à la facture : ni article de catalogue, ni code LPP, ni code prestation. */
export const NATURES_LIGNE_FACTURE = ['AIDE_AUDITIVE', ...NATURES_ACCESSOIRE, 'ENTRETIEN'] as const;
export type NatureLigneFacture = (typeof NATURES_LIGNE_FACTURE)[number];

export const LIBELLES_NATURES_LIGNE_FACTURE: Readonly<Record<NatureLigneFacture, string>> = {
  ...LIBELLES_NATURES_ACCESSOIRE,
  AIDE_AUDITIVE: 'Aide auditive',
  ENTRETIEN: 'Entretien',
};

/** Une facture et son avoir partagent table, série, chaîne et PDF (ADR-028). */
export const NATURES_PIECE = ['FACTURE', 'AVOIR'] as const;
export type NaturePiece = (typeof NATURES_PIECE)[number];

export const LIBELLES_NATURES_PIECE: Readonly<Record<NaturePiece, string>> = {
  FACTURE: 'Facture',
  AVOIR: 'Avoir',
};

/** `ABANDONNEE` : brouillon sans numéro, jamais supprimé. Une pièce validée reste `VALIDEE`. */
export const STATUTS_FACTURE = ['BROUILLON', 'VALIDEE', 'ABANDONNEE'] as const;
export type StatutFacture = (typeof STATUTS_FACTURE)[number];

export const LIBELLES_STATUTS_FACTURE: Readonly<Record<StatutFacture, string>> = {
  BROUILLON: 'Brouillon',
  VALIDEE: 'Validée',
  ABANDONNEE: 'Abandonnée',
};
