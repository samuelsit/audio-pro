/**
 * Signature des clôtures et des archives (ADR-029). La clé privée reste hors de la base : recalculer toute la
 * chaîne en SQL ne suffit plus, et la clé publique permet de vérifier sans secret.
 */
export interface SignatureCaisse {
  /** Identifie la clé qui signe aujourd'hui. Une rotation garde les clés publiques précédentes. */
  readonly cleId: string;
  /** Clé publique en base64, publiée dans la notice des archives. */
  readonly clePublique: string;
  /** Signature du message, en base64. */
  signer(message: string): string;
  /** Faux si la signature ne correspond pas, ou si `cleId` est inconnu. */
  verifier(message: string, signature: string, cleId: string): boolean;
}
