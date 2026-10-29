import { deflateRawSync, inflateRawSync } from 'node:zlib';

import { vitaleReadResultSchema, type VitaleReadResult } from '@ha/domain';
import { z } from 'zod';

import { chiffreur } from '../chiffrement';
import { ErreurSaisie } from '../erreurs';

/** Cookie de la lecture en cours (HttpOnly, limité à /patients/vitale). */
export const COOKIE_LECTURE_VITALE = 'ha_vitale_lecture';

/** Durée de validité d'une lecture : au-delà, il faut relire la carte. */
export const DUREE_LECTURE_SECONDES = 15 * 60;

/** Lecture en cours : rien n'est écrit en base, le résultat voyage chiffré dans un cookie (ADR-007). */
export interface LectureEnCours {
  readonly lectureId: string;
  readonly resultat: VitaleReadResult;
  /** Instant ISO au-delà duquel la lecture n'est plus utilisable. */
  readonly expireLe: string;
}

const lectureEnCoursSchema = z.object({
  lectureId: z.string().min(1),
  resultat: vitaleReadResultSchema,
  expireLe: z.iso.datetime({ offset: true }),
});

// Contexte lié à l'utilisateur : un jeton volé ne s'ouvre pas dans la session d'un autre compte.
function contexte(acteurId: string): string {
  return `vitale.lecture.${acteurId}`;
}

export function expirationLecture(dateLecture: string): string {
  return new Date(Date.parse(dateLecture) + DUREE_LECTURE_SECONDES * 1000).toISOString();
}

/** Compressé puis chiffré (AES-256-GCM) : une carte familiale tient dans un cookie. */
export function scellerLecture(acteurId: string, lecture: LectureEnCours): string {
  const compresse = deflateRawSync(Buffer.from(JSON.stringify(lecture), 'utf8')).toString(
    'base64url',
  );
  return chiffreur().chiffrer(compresse, contexte(acteurId));
}

export class ErreurLectureExpiree extends ErreurSaisie {
  constructor() {
    super({}, 'La lecture de la carte a expiré ou n’est plus valable : relisez la carte.');
    this.name = 'ErreurLectureExpiree';
  }
}

/** Ouvre un jeton : lève ErreurLectureExpiree s'il est absent, altéré, d'un autre compte ou expiré. */
export function ouvrirLecture(
  acteurId: string,
  jeton: string | undefined,
  maintenant: string,
): LectureEnCours {
  if (!jeton) {
    throw new ErreurLectureExpiree();
  }
  let lecture: LectureEnCours;
  try {
    const compresse = chiffreur().dechiffrer(jeton, contexte(acteurId));
    const json = inflateRawSync(Buffer.from(compresse, 'base64url')).toString('utf8');
    lecture = lectureEnCoursSchema.parse(JSON.parse(json));
  } catch {
    throw new ErreurLectureExpiree();
  }
  if (Date.parse(lecture.expireLe) <= Date.parse(maintenant)) {
    throw new ErreurLectureExpiree();
  }
  return lecture;
}
