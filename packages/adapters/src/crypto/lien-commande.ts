import { timingSafeEqual } from 'node:crypto';

import { EmpreinteHmac } from './empreinte';

const CONTEXTE = 'lien-commande';

export interface CibleLienCommandeSignee {
  readonly organisationId: string;
  readonly commandeId: string;
}

/**
 * Jeton de la page d'accusé de réception d'une commande, sans donnée à stocker : le travail d'envoi le recalcule.
 * Il n'ouvre rien de sensible : un numéro, un centre, et le droit de dire que le bon est bien arrivé (ADR-031).
 */
export class SignatureLienCommande {
  readonly #empreinte: EmpreinteHmac;

  constructor(cle: Buffer) {
    this.#empreinte = new EmpreinteHmac(cle);
  }

  #signature({ organisationId, commandeId }: CibleLienCommandeSignee): string {
    return this.#empreinte.calculer(`${organisationId}.${commandeId}`, CONTEXTE);
  }

  signer(cible: CibleLienCommandeSignee): string {
    return `${cible.organisationId}.${cible.commandeId}.${this.#signature(cible)}`;
  }

  /** Cible d'un jeton intact, `null` sinon. */
  lire(jeton: string): CibleLienCommandeSignee | null {
    const [organisationId, commandeId, signature, ...reste] = jeton.split('.');
    if (!organisationId || !commandeId || !signature || reste.length > 0) {
      return null;
    }
    const cible = { organisationId, commandeId };
    const attendue = Buffer.from(this.#signature(cible), 'utf8');
    const recue = Buffer.from(signature, 'utf8');
    return attendue.length === recue.length && timingSafeEqual(attendue, recue) ? cible : null;
  }
}
