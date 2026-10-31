import type { DocumentStore } from '@ha/domain';

import type { ChiffreurOctets } from '../crypto/chiffreur';

function contexte(cle: string): string {
  return `document.${cle}`;
}

/** Chiffre chaque document avant de le confier au stockage (ADR-011). */
export class DocumentStoreChiffre implements DocumentStore {
  constructor(
    private readonly stockage: DocumentStore,
    private readonly chiffreur: ChiffreurOctets,
  ) {}

  async put(cle: string, contenu: Uint8Array): Promise<void> {
    await this.stockage.put(
      cle,
      this.chiffreur.chiffrerOctets(contenu, contexte(cle)),
      'application/octet-stream',
    );
  }

  async get(cle: string): Promise<Uint8Array> {
    return this.chiffreur.dechiffrerOctets(await this.stockage.get(cle), contexte(cle));
  }

  async delete(cle: string): Promise<void> {
    await this.stockage.delete(cle);
  }
}
