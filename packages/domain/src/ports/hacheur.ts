/** Hachage de la chaîne de caisse : `node:crypto` est interdit au domaine. */
export interface Hacheur {
  /** Empreinte SHA-256 du texte, en hexadécimal minuscule (64 caractères). */
  sha256(texte: string): string;
}
