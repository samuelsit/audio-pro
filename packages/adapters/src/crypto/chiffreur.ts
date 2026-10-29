/**
 * Chiffrement applicatif d'une valeur texte. Le `contexte` (ex. « patient.nir ») est authentifié avec la
 * valeur : une enveloppe copiée dans une autre colonne ne se déchiffre pas.
 */
export interface Chiffreur {
  chiffrer(clair: string, contexte: string): string;
  dechiffrer(enveloppe: string, contexte: string): string;
}

/** Message volontairement générique : ni la valeur ni la clé n'y figurent. */
export class ErreurDechiffrement extends Error {
  constructor(motif = 'enveloppe invalide ou altérée') {
    super(`Déchiffrement impossible : ${motif}.`);
    this.name = 'ErreurDechiffrement';
  }
}

export class ErreurConfigurationChiffrement extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErreurConfigurationChiffrement';
  }
}
