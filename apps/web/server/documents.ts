import {
  chargerConfigurationS3,
  DocumentStoreChiffre,
  FakeDocumentStore,
  S3DocumentStore,
} from '@ha/adapters';
import type { DocumentStore } from '@ha/domain';

import { chiffreur } from './chiffrement';

function creerStockage(): DocumentStore {
  if (process.env.DOCUMENTS_STOCKAGE === 'memoire' && process.env.NODE_ENV !== 'production') {
    return new FakeDocumentStore();
  }
  return new S3DocumentStore(chargerConfigurationS3(process.env));
}

let instanceStockage: DocumentStore | undefined;

/** Stockage sous-jacent, qui ne voit que des octets chiffrés. Les services passent par `documents()`. */
export function stockageBrut(): DocumentStore {
  instanceStockage ??= creerStockage();
  return instanceStockage;
}

/** Stockage des documents : chiffrés quel que soit l'adaptateur (ADR-011). */
export function documents(): DocumentStore {
  return new DocumentStoreChiffre(stockageBrut(), chiffreur());
}
