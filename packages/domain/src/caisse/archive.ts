import { z } from 'zod';

import {
  maillonSuivantValide,
  serialiserCanonique,
  TYPES_EVENEMENT_CAISSE,
  type Maillon,
} from '../facture/chaine';
import type { Hacheur } from '../ports/hacheur';
import type { Periode } from './cloture';

/**
 * Notice jointe au contenu de chaque archive.
 * Source : fiscal/boi-tva-decla-30-10-30.html § 230 (format ouvert, notice explicative en français).
 * À VÉRIFIER : art. 286 I 3° bis CGI, version du 27/06/2026 : format de restitution « répondant aux normes établies
 * par l'administration », norme non trouvée et texte absent de docs/ref (R38).
 */
export const NOTICE_ARCHIVE = `Archive de caisse. Fichier JSON, encodé en UTF-8, à clés triées et sans espaces.

« maillons » : le journal des événements de caisse de la période, dans l'ordre de la chaîne. Chaque maillon porte
l'empreinte SHA-256 du précédent. Empreinte de format 2 : SHA-256 du JSON trié des champs acteurId, centreId,
charge, empreintePrecedente, format, horodatage, rang et type. Format 1 : champs charge, empreintePrecedente, rang
et type. Les horodatages sont en UTC.
« pieces » et « lignes » : factures et avoirs validés sur la période, ligne par ligne.
« mouvements » : encaissements, remboursements et annulations. Une correction est une opération inverse.
« sessions » et « comptages » : fonds de caisse, espèces comptées, écarts et leurs justifications.
« clotures » : clôtures de la période, avec totaux par mode de paiement et par taux de TVA, grand total et total
perpétuel, signature Ed25519 de l'empreinte du maillon de clôture.
« clePublique » : clé publique Ed25519 (base64, SPKI DER) qui vérifie les signatures, sans aucun secret.
Montants en centimes d'euro, taux de TVA pour dix mille.

Pour vérifier : calculer le SHA-256 du fichier et le comparer à l'empreinte de l'archive, puis recalculer chaque
maillon et sa liaison au précédent. Le maillon ARCHIVAGE de la chaîne porte l'empreinte du fichier.`;

export interface MaillonArchive {
  readonly rang: number;
  readonly type: string;
  readonly format: number;
  readonly centreId: string;
  readonly acteurId: string | null;
  readonly horodatage: string;
  readonly charge: unknown;
  readonly empreintePrecedente: string;
  readonly empreinte: string;
}

export interface EntreeArchive extends Periode {
  readonly versionCaisse: string;
  readonly centre: { readonly id: string; readonly nom: string; readonly siret: string | null };
  readonly clePublique: string;
  readonly maillons: readonly MaillonArchive[];
  readonly pieces: readonly unknown[];
  readonly lignes: readonly unknown[];
  readonly mouvements: readonly unknown[];
  readonly sessions: readonly unknown[];
  readonly comptages: readonly unknown[];
  readonly clotures: readonly unknown[];
}

/** Contenu d'une archive, en clair : l'empreinte porte sur ce texte, le stockage peut le chiffrer. */
export function contenuArchive(entree: EntreeArchive): string {
  return serialiserCanonique({ notice: NOTICE_ARCHIVE, ...entree });
}

const maillonLuSchema = z.object({
  rang: z.number(),
  type: z.enum(TYPES_EVENEMENT_CAISSE),
  format: z.number(),
  centreId: z.string(),
  acteurId: z.string().nullable(),
  horodatage: z.string(),
  charge: z.unknown(),
  empreintePrecedente: z.string(),
  empreinte: z.string(),
});

const archiveLueSchema = z.object({ maillons: z.array(maillonLuSchema) });

/** Le format 1 n'avait ni horodatage, ni acteur, ni centre dans l'empreinte. */
export function maillonDepuisArchive(maillon: z.output<typeof maillonLuSchema>): Maillon {
  const { rang, type, charge, empreintePrecedente, empreinte } = maillon;
  if (maillon.format !== 2) {
    return { rang, type, charge, empreintePrecedente, empreinte };
  }
  const { centreId, acteurId, horodatage } = maillon;
  return {
    format: 2,
    rang,
    type,
    charge,
    empreintePrecedente,
    empreinte,
    centreId,
    acteurId,
    horodatage,
  };
}

export type ResultatArchive =
  | { readonly valide: true; readonly maillons: number }
  | { readonly valide: false; readonly raison: 'EMPREINTE' | 'FORMAT' | 'MAILLON' };

/** Vérifie un fichier d'archive seul, hors ligne : son empreinte, puis la suite de ses maillons. */
export function verifierArchive(
  contenu: string,
  empreinteAttendue: string,
  hacheur: Hacheur,
): ResultatArchive {
  if (hacheur.sha256(contenu) !== empreinteAttendue) {
    return { valide: false, raison: 'EMPREINTE' };
  }
  let donnees: unknown;
  try {
    donnees = JSON.parse(contenu);
  } catch {
    return { valide: false, raison: 'FORMAT' };
  }
  const lecture = archiveLueSchema.safeParse(donnees);
  if (!lecture.success) {
    return { valide: false, raison: 'FORMAT' };
  }
  const { maillons } = lecture.data;
  const [premier] = maillons;
  let position = {
    rang: (premier?.rang ?? 1) - 1,
    empreinte: premier?.empreintePrecedente ?? '',
  };
  for (const lu of maillons) {
    const maillon = maillonDepuisArchive(lu);
    if (!maillonSuivantValide(position, maillon, hacheur)) {
      return { valide: false, raison: 'MAILLON' };
    }
    position = { rang: maillon.rang, empreinte: maillon.empreinte };
  }
  return { valide: true, maillons: maillons.length };
}

export interface ArchiveAChainer extends Periode {
  readonly id: string;
  readonly rangDebut: number;
  readonly rangFin: number;
  readonly empreinteContenu: string;
  readonly tailleOctets: number;
  readonly versionCaisse: string;
}

export function chargeArchive(archive: ArchiveAChainer): unknown {
  return { ...archive };
}
