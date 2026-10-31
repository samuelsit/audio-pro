import type { Captcha } from '@ha/domain';
import {
  createChallenge,
  randomInt,
  verifySolution,
  type Challenge,
  type Solution,
} from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2';

const ALGORITHME = 'PBKDF2/SHA-256';
const VALIDITE_SECONDES = 300;
// Réglés pour rester sous la seconde ou deux sur un téléphone ancien : le public est âgé.
const COUT = 2_000;
const COMPTEUR_MIN = 2_000;
const COMPTEUR_MAX = 5_000;

interface ReponseAltcha {
  readonly challenge: Challenge;
  readonly solution: Solution;
}

function decoder(reponse: string): ReponseAltcha | null {
  try {
    return JSON.parse(Buffer.from(reponse, 'base64').toString('utf8')) as ReponseAltcha;
  } catch {
    return null;
  }
}

/** ALTCHA auto-hébergé : preuve de travail dans le navigateur, sans service tiers ni cookie. */
export class AltchaCaptcha implements Captcha {
  readonly #signature: string;
  readonly #cleDerivee: string;

  constructor(secret: string) {
    this.#signature = `${secret}:signature`;
    this.#cleDerivee = `${secret}:cle`;
  }

  async creerDefi(): Promise<string> {
    const defi = await createChallenge({
      algorithm: ALGORITHME,
      cost: COUT,
      counter: randomInt(COMPTEUR_MIN, COMPTEUR_MAX),
      deriveKey,
      expiresAt: Math.floor(Date.now() / 1000) + VALIDITE_SECONDES,
      hmacSignatureSecret: this.#signature,
      hmacKeySignatureSecret: this.#cleDerivee,
    });
    return JSON.stringify(defi);
  }

  async verifier(reponse: string): Promise<boolean> {
    const decodee = decoder(reponse);
    if (decodee === null) {
      return false;
    }
    try {
      const resultat = await verifySolution({
        challenge: decodee.challenge,
        solution: decodee.solution,
        deriveKey,
        hmacSignatureSecret: this.#signature,
        hmacKeySignatureSecret: this.#cleDerivee,
      });
      return resultat.verified;
    } catch {
      return false;
    }
  }
}
