import type { CanalMessage } from '@ha/domain';

import { EmpreinteHmac } from './empreinte';

/**
 * Empreinte d'une adresse sous forme canonique : un HMAC, car un numéro de mobile se retrouve par énumération
 * sous un simple SHA-256. Un contexte par canal.
 */
export class EmpreinteAdresse {
  readonly #empreinte: EmpreinteHmac;

  constructor(cle: Buffer) {
    this.#empreinte = new EmpreinteHmac(cle);
  }

  calculer(canal: CanalMessage, adresse: string): string {
    return this.#empreinte.calculer(adresse, `adresse.${canal}`);
  }
}
