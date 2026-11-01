/** Facture mise à disposition par la plateforme agréée du client. */
export interface FactureElectronique {
  /** Stable d'une lecture à l'autre : une facture relue ne crée pas de doublon. */
  readonly identifiant: string;
  /** Représentation lisible, si la plateforme en fournit une. */
  readonly pdf: Uint8Array | null;
}

/**
 * Réception des factures électroniques par la plateforme agréée du client. Structure provisoire : les formats et
 * les échanges restent à cadrer avec l'expert-comptable et la plateforme retenue, et docs/vendor n'en documente
 * aucune. À VÉRIFIER : calendrier de la réforme et factures concernées, absents de docs/ref.
 */
export interface PlateformeFactures {
  relever(): Promise<readonly FactureElectronique[]>;
  /** La facture traitée ne se représente plus. */
  acquitter(identifiant: string): Promise<void>;
}
