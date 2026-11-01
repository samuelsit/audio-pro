export interface PieceFacture {
  readonly nomFichier: string;
  readonly contenu: Uint8Array;
}

export interface MessageFacture {
  /** Stable d'une lecture à l'autre : un message relu ne crée pas de doublon. */
  readonly identifiant: string;
  readonly expediteur: string;
  readonly pieces: readonly PieceFacture[];
}

/**
 * Boîte de réception des factures d'un client, à adresse unique. Structure provisoire : aucun fournisseur d'e-mail
 * n'est retenu (ADR-021) et docs/vendor n'en documente aucun.
 */
export interface BoiteFactures {
  relever(adresse: string): Promise<readonly MessageFacture[]>;
  /** Le message traité sort de la boîte. */
  acquitter(adresse: string, identifiant: string): Promise<void>;
}
