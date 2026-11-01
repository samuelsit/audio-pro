import { timingSafeEqual } from 'node:crypto';

import { EmpreinteHmac } from './empreinte';

const CONTEXTE = 'lien-document';

export interface CibleLienDocumentSigne {
  readonly organisationId: string;
  readonly lienId: string;
}

/**
 * Jeton d'un lien vers un document, sans donnée à stocker : le travail d'envoi le recalcule. L'organisation y
 * figure pour la même raison que dans `SignatureLienRdv`. Il ne suffit pas : la validité se lit en base, et
 * l'ouverture exige la date de naissance du patient (ADR-026).
 */
export class SignatureLienDocument {
  readonly #empreinte: EmpreinteHmac;

  constructor(cle: Buffer) {
    this.#empreinte = new EmpreinteHmac(cle);
  }

  #signature({ organisationId, lienId }: CibleLienDocumentSigne): string {
    return this.#empreinte.calculer(`${organisationId}.${lienId}`, CONTEXTE);
  }

  signer(cible: CibleLienDocumentSigne): string {
    return `${cible.organisationId}.${cible.lienId}.${this.#signature(cible)}`;
  }

  /** Cible d'un jeton intact, `null` sinon. */
  lire(jeton: string): CibleLienDocumentSigne | null {
    const [organisationId, lienId, signature, ...reste] = jeton.split('.');
    if (!organisationId || !lienId || !signature || reste.length > 0) {
      return null;
    }
    const cible = { organisationId, lienId };
    const attendue = Buffer.from(this.#signature(cible), 'utf8');
    const recue = Buffer.from(signature, 'utf8');
    return attendue.length === recue.length && timingSafeEqual(attendue, recue) ? cible : null;
  }
}
