import { ErreurDocumentIntrouvable, type DocumentStore } from '@ha/domain';

/** Stockage en mémoire pour les tests : `objets` donne accès à ce qui a réellement été déposé. */
export class FakeDocumentStore implements DocumentStore {
  readonly objets = new Map<string, Uint8Array>();

  async put(cle: string, contenu: Uint8Array): Promise<void> {
    this.objets.set(cle, Uint8Array.from(contenu));
  }

  async get(cle: string): Promise<Uint8Array> {
    const contenu = this.objets.get(cle);
    if (!contenu) {
      throw new ErreurDocumentIntrouvable();
    }
    return contenu;
  }

  async delete(cle: string): Promise<void> {
    this.objets.delete(cle);
  }
}
