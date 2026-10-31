import { timingSafeEqual } from 'node:crypto';

import { chargerCle, EmpreinteHmac } from './empreinte';

const CONTEXTE = 'lien-rdv';

export interface CibleLienRdv {
  readonly organisationId: string;
  readonly reservationId: string;
}

/**
 * Lien de gestion d'un rendez-vous, sans donnée à stocker : le travail d'envoi le recalcule. L'organisation y
 * figure parce que la réservation vit sous RLS : on doit la connaître avant toute lecture, et un lien doit
 * survivre à un changement de slug ou à l'arrêt de la réservation en ligne. Clé dédiée, pour qu'une fuite ou
 * une rotation ne touche pas les empreintes de NIR.
 */
export class SignatureLienRdv {
  readonly #empreinte: EmpreinteHmac;

  constructor(cle: Buffer) {
    this.#empreinte = new EmpreinteHmac(cle);
  }

  #signature({ organisationId, reservationId }: CibleLienRdv): string {
    return this.#empreinte.calculer(`${organisationId}.${reservationId}`, CONTEXTE);
  }

  signer(cible: CibleLienRdv): string {
    return `${cible.organisationId}.${cible.reservationId}.${this.#signature(cible)}`;
  }

  /** Cible d'un jeton intact, `null` sinon. */
  lire(jeton: string): CibleLienRdv | null {
    const [organisationId, reservationId, signature, ...reste] = jeton.split('.');
    if (!organisationId || !reservationId || !signature || reste.length > 0) {
      return null;
    }
    const cible = { organisationId, reservationId };
    const attendue = Buffer.from(this.#signature(cible), 'utf8');
    const recue = Buffer.from(signature, 'utf8');
    return attendue.length === recue.length && timingSafeEqual(attendue, recue) ? cible : null;
  }
}

/** Lit `LIEN_RDV_CLE` (base64, 32 octets). */
export function chargerCleLienRdv(env: Readonly<Record<string, string | undefined>>): Buffer {
  return chargerCle(env, 'LIEN_RDV_CLE');
}
