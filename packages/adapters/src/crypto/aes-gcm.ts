import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { ErreurDechiffrement, type Chiffreur } from './chiffreur';
import type { Trousseau } from './trousseau';

const VERSION = 'v1';
const ALGORITHME = 'aes-256-gcm';
const OCTETS_IV = 12;
const OCTETS_TAG = 16;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

interface EnveloppeLue {
  readonly idCle: string;
  readonly iv: Buffer;
  readonly chiffre: Buffer;
  readonly tag: Buffer;
}

/** Données authentifiées : la version, la clé et le contexte sont liés au chiffré. */
function donneesAuthentifiees(idCle: string, contexte: string): Buffer {
  return Buffer.from(`${VERSION}.${idCle}.${contexte}`, 'utf8');
}

function lireEnveloppe(enveloppe: string): EnveloppeLue {
  const parties = enveloppe.split('.');
  const [version, idCle, iv, donnees] = parties;
  if (
    parties.length !== 4 ||
    version !== VERSION ||
    !idCle ||
    !iv ||
    !donnees ||
    !BASE64URL.test(iv) ||
    !BASE64URL.test(donnees)
  ) {
    throw new ErreurDechiffrement('format d’enveloppe inconnu');
  }
  const octetsIv = Buffer.from(iv, 'base64url');
  const octets = Buffer.from(donnees, 'base64url');
  if (octetsIv.length !== OCTETS_IV || octets.length < OCTETS_TAG) {
    throw new ErreurDechiffrement('format d’enveloppe inconnu');
  }
  return {
    idCle,
    iv: octetsIv,
    chiffre: octets.subarray(0, octets.length - OCTETS_TAG),
    tag: octets.subarray(octets.length - OCTETS_TAG),
  };
}

/**
 * AES-256-GCM, IV aléatoire de 96 bits. Enveloppe : `v1.<idCle>.<iv>.<chiffré + tag>` (base64url).
 * L'identifiant de clé stocké dans l'enveloppe permet la rotation : les anciennes clés restent
 * dans le trousseau pour déchiffrer, la clé active chiffre.
 */
export class ChiffreurAesGcm implements Chiffreur {
  constructor(private readonly trousseau: Trousseau) {}

  chiffrer(clair: string, contexte: string): string {
    const idCle = this.trousseau.idActif;
    const iv = randomBytes(OCTETS_IV);
    const chiffreur = createCipheriv(ALGORITHME, this.cle(idCle), iv, {
      authTagLength: OCTETS_TAG,
    });
    chiffreur.setAAD(donneesAuthentifiees(idCle, contexte));
    const donnees = Buffer.concat([
      chiffreur.update(clair, 'utf8'),
      chiffreur.final(),
      chiffreur.getAuthTag(),
    ]);
    return [VERSION, idCle, iv.toString('base64url'), donnees.toString('base64url')].join('.');
  }

  dechiffrer(enveloppe: string, contexte: string): string {
    const { idCle, iv, chiffre, tag } = lireEnveloppe(enveloppe);
    const dechiffreur = createDecipheriv(ALGORITHME, this.cle(idCle), iv, {
      authTagLength: OCTETS_TAG,
    });
    dechiffreur.setAAD(donneesAuthentifiees(idCle, contexte));
    dechiffreur.setAuthTag(tag);
    try {
      return Buffer.concat([dechiffreur.update(chiffre), dechiffreur.final()]).toString('utf8');
    } catch {
      throw new ErreurDechiffrement();
    }
  }

  /** Identifiant de la clé qui a chiffré l'enveloppe. */
  idCle(enveloppe: string): string {
    return lireEnveloppe(enveloppe).idCle;
  }

  /** Vrai si l'enveloppe a été chiffrée avec une autre clé que la clé active. */
  aRechiffrer(enveloppe: string): boolean {
    return this.idCle(enveloppe) !== this.trousseau.idActif;
  }

  /** Rotation : rechiffre avec la clé active (enveloppe inchangée si c'est déjà le cas). */
  rechiffrer(enveloppe: string, contexte: string): string {
    return this.aRechiffrer(enveloppe)
      ? this.chiffrer(this.dechiffrer(enveloppe, contexte), contexte)
      : enveloppe;
  }

  private cle(idCle: string): Buffer {
    const cle = this.trousseau.cles.get(idCle);
    if (!cle) {
      throw new ErreurDechiffrement(`clé « ${idCle} » absente du trousseau`);
    }
    return cle;
  }
}
