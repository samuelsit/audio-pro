import { timingSafeEqual } from 'node:crypto';

import { EmpreinteHmac } from './empreinte';

const CONTEXTE = 'lien-desinscription';

export interface CibleLienDesinscription {
  readonly organisationId: string;
  readonly messageId: string;
}

/**
 * Jeton de la page de désinscription, sans donnée à stocker : le travail d'envoi le recalcule. Il ne va que dans
 * un sens, couper un canal, et ne s'éteint jamais : la désinscription doit rester possible depuis un vieux message.
 */
export class SignatureLienDesinscription {
  readonly #empreinte: EmpreinteHmac;

  constructor(cle: Buffer) {
    this.#empreinte = new EmpreinteHmac(cle);
  }

  #signature({ organisationId, messageId }: CibleLienDesinscription): string {
    return this.#empreinte.calculer(`${organisationId}.${messageId}`, CONTEXTE);
  }

  signer(cible: CibleLienDesinscription): string {
    return `${cible.organisationId}.${cible.messageId}.${this.#signature(cible)}`;
  }

  /** Cible d'un jeton intact, `null` sinon. */
  lire(jeton: string): CibleLienDesinscription | null {
    const [organisationId, messageId, signature, ...reste] = jeton.split('.');
    if (!organisationId || !messageId || !signature || reste.length > 0) {
      return null;
    }
    const cible = { organisationId, messageId };
    const attendue = Buffer.from(this.#signature(cible), 'utf8');
    const recue = Buffer.from(signature, 'utf8');
    return attendue.length === recue.length && timingSafeEqual(attendue, recue) ? cible : null;
  }
}
