import { FACTURE_VIDE, type ExtracteurFacture, type FactureExtraite } from '@ha/domain';

/** Rend la facture qu'on lui a confiée. */
export class FakeExtracteurFacture implements ExtracteurFacture {
  constructor(private readonly facture: FactureExtraite = FACTURE_VIDE) {}

  extraire(): Promise<FactureExtraite> {
    return Promise.resolve(this.facture);
  }
}
