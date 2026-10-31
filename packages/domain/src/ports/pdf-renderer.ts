/** Rendu d'un document HTML autonome (styles compris, aucune ressource externe) en PDF A4. */
export interface PdfRenderer {
  rendre(html: string): Promise<Uint8Array>;
  /** Assemble des PDF à la suite, sans toucher à leur contenu. */
  assembler(documents: readonly Uint8Array[]): Promise<Uint8Array>;
}
