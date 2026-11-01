import type { FactureExtraite } from '../factures-fournisseurs/extraction';

/** Lit une facture PDF. Une lecture impossible rend une facture vide : la saisie reste manuelle. */
export interface ExtracteurFacture {
  extraire(pdf: Uint8Array): Promise<FactureExtraite>;
}
