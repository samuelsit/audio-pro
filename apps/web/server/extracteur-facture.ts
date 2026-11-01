import { FakeExtracteurFacture, PdfTexteExtracteurFacture } from '@ha/adapters';
import type { ExtracteurFacture } from '@ha/domain';

let instance: ExtracteurFacture | undefined;

/** Lecture des factures reçues : couche texte du PDF, ou simulation hors production. */
export function extracteurFacture(): ExtracteurFacture {
  instance ??=
    process.env.EXTRACTEUR_FACTURE === 'simulation' && process.env.NODE_ENV !== 'production'
      ? new FakeExtracteurFacture()
      : new PdfTexteExtracteurFacture();
  return instance;
}
