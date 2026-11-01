import { timingSafeEqual } from 'node:crypto';

import {
  chargerCleLienRdv,
  EmpreinteHmac,
  SignatureLienCommande,
  SignatureLienDocument,
  SignatureLienRdv,
} from '@ha/adapters';

let instanceEmpreinte: EmpreinteHmac | undefined;
let instanceSignature: SignatureLienRdv | undefined;
let instanceSignatureDocument: SignatureLienDocument | undefined;
let instanceSignatureCommande: SignatureLienCommande | undefined;

function empreinte(): EmpreinteHmac {
  instanceEmpreinte ??= new EmpreinteHmac(chargerCleLienRdv(process.env));
  return instanceEmpreinte;
}

/** Signature du lien de gestion d'un rendez-vous. */
export function signatureLien(): SignatureLienRdv {
  instanceSignature ??= new SignatureLienRdv(chargerCleLienRdv(process.env));
  return instanceSignature;
}

/** Signature de la page d'accusé d'une commande. Même clé, contexte distinct. */
export function signatureLienCommande(): SignatureLienCommande {
  instanceSignatureCommande ??= new SignatureLienCommande(chargerCleLienRdv(process.env));
  return instanceSignatureCommande;
}

/** Signature d'un lien vers un document. Même clé, contexte distinct : un jeton ne vaut pas pour l'autre. */
export function signatureLienDocument(): SignatureLienDocument {
  instanceSignatureDocument ??= new SignatureLienDocument(chargerCleLienRdv(process.env));
  return instanceSignatureDocument;
}

/** Empreinte du jeton de parcours : la base ne peut pas le rejouer si elle fuite. */
export function empreinteJeton(jeton: string): string {
  return empreinte().calculer(jeton, 'reservation_en_ligne.jeton');
}

/** Empreinte du code SMS, liée à la réservation : six chiffres se retrouveraient sinon par énumération. */
export function empreinteCode(reservationId: string, code: string): string {
  return empreinte().calculer(`${reservationId}:${code}`, 'reservation_en_ligne.code');
}

/** Clé de limitation d'un téléphone : un numéro ne se stocke pas en clair dans une table technique. */
export function empreinteTelephone(telephone: string): string {
  return empreinte().calculer(telephone, 'limitation.telephone');
}

/** Clé anti-rejeu d'une réponse au captcha. */
export function empreinteCaptcha(reponse: string): string {
  return empreinte().calculer(reponse, 'limitation.captcha');
}

export function empreintesEgales(a: string, b: string): boolean {
  const gauche = Buffer.from(a, 'utf8');
  const droite = Buffer.from(b, 'utf8');
  return gauche.length === droite.length && timingSafeEqual(gauche, droite);
}
