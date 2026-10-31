import { createHmac } from 'node:crypto';

import { ErreurConfigurationChiffrement } from './chiffreur';

// 32 octets en base64 standard : 43 caractères puis « = ».
const CLE_BASE64 = /^[A-Za-z0-9+/]{43}=$/;

/**
 * Empreinte déterministe d'une valeur sensible (HMAC-SHA256, hexadécimal), pour la recherche exacte
 * et la détection de doublons sur un champ chiffré. La clé est distincte du trousseau AES : sans elle,
 * l'empreinte ne permet pas de retrouver la valeur, même en énumérant les NIR possibles.
 * Le `contexte` sépare les usages (une même valeur n'a pas la même empreinte dans deux colonnes).
 */
export class EmpreinteHmac {
  readonly #cle: Buffer;

  constructor(cle: Buffer) {
    if (cle.length !== 32) {
      throw new ErreurConfigurationChiffrement('La clé d’empreinte doit faire 32 octets.');
    }
    this.#cle = cle;
  }

  calculer(valeur: string, contexte: string): string {
    return createHmac('sha256', this.#cle)
      .update(`${contexte}\u0000${valeur}`, 'utf8')
      .digest('hex');
  }
}

/** Lit une clé de 32 octets en base64 ; le message d'erreur ne cite jamais la clé. */
export function chargerCle(
  env: Readonly<Record<string, string | undefined>>,
  variable: string,
): Buffer {
  const valeur = env[variable]?.trim();
  if (!valeur) {
    throw new ErreurConfigurationChiffrement(`${variable} n’est pas défini (voir .env.example).`);
  }
  if (!CLE_BASE64.test(valeur)) {
    throw new ErreurConfigurationChiffrement(
      `${variable} invalide : format attendu une clé de 32 octets en base64.`,
    );
  }
  return Buffer.from(valeur, 'base64');
}

/** Lit `EMPREINTE_CLE` (base64, 32 octets). */
export function chargerCleEmpreinte(env: Readonly<Record<string, string | undefined>>): Buffer {
  return chargerCle(env, 'EMPREINTE_CLE');
}
