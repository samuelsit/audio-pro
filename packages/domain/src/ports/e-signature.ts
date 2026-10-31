export interface DemandeSignature {
  /** SHA-256 hexadécimal du document présenté au signataire. */
  readonly empreinteDocument: string;
  /** Tracé capturé à l'écran, en PNG. */
  readonly trace: Uint8Array;
  /** Instant ISO 8601 de la signature. */
  readonly horodatage: string;
}

/** Preuve de signature, sans donnée patient : elle est conservée en base. */
export interface PreuveSignature {
  readonly fournisseur: string;
  /** Identifiant de la signature chez le fournisseur. */
  readonly reference: string;
  readonly empreinteDocument: string;
  readonly empreinteTrace: string;
  readonly horodatage: string;
}

/**
 * Signature électronique d'un document. Aucun fournisseur n'est documenté dans `docs/vendor` : le port reste
 * à confronter à sa documentation quand il sera choisi (ADR-025).
 */
export interface ESignature {
  signer(demande: DemandeSignature): Promise<PreuveSignature>;
}
