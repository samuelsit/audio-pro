/**
 * Stockage de documents (scans d'ordonnance…). Les octets reçus sont déjà chiffrés par l'application :
 * un adaptateur ne voit jamais un document en clair. `cle` : identifiant opaque, sans donnée patient.
 */
export interface DocumentStore {
  put(cle: string, contenu: Uint8Array, typeContenu: string): Promise<void>;
  /** Lève `ErreurDocumentIntrouvable` si la clé n'existe pas. */
  get(cle: string): Promise<Uint8Array>;
  /** Sans effet si la clé n'existe pas. */
  delete(cle: string): Promise<void>;
}

export class ErreurDocumentIntrouvable extends Error {
  constructor() {
    super('Document introuvable.');
    this.name = 'ErreurDocumentIntrouvable';
  }
}
