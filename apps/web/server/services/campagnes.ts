import { SystemClock } from '@ha/adapters';
import { resoudreSegment } from '@ha/communication';
import type { Prisma } from '@ha/db';
import {
  campagneSaisieSchema,
  peutGererCampagnes,
  segmentSchema,
  type CanalMessage,
  type Segment,
  type StatutCampagne,
} from '@ha/domain';

import { AccesRefuseError, verifierAccesCentre, type UtilisateurConnecte } from '../auth/acces';
import { withAudit } from '../audit/journal';
import { base } from '../chiffrement';
import { ErreurSaisie, valider } from '../erreurs';
import { empreinteAdresse } from '../reservation-empreintes';
import { aujourdhui } from './patients';

const horloge = new SystemClock();

function exigerGestion(acteur: UtilisateurConnecte): void {
  if (!peutGererCampagnes(acteur.role)) {
    throw new AccesRefuseError();
  }
}

/** Le segment reste dans les centres de son auteur, qui ne seront pas relus au lancement. */
function exigerCentres(acteur: UtilisateurConnecte, segment: Segment): void {
  for (const centreId of segment.centreIds) {
    verifierAccesCentre(acteur, centreId);
  }
}

export interface ComptageSegment {
  readonly total: number;
  readonly destinataires: number;
}

/** Nombre annoncé avant l'envoi : celui du lancement, à consentements inchangés. */
export async function compterSegment(
  acteur: UtilisateurConnecte,
  segmentSaisi: unknown,
  canal: CanalMessage,
): Promise<ComptageSegment> {
  exigerGestion(acteur);
  const segment = valider(segmentSchema, segmentSaisi);
  exigerCentres(acteur, segment);
  const { total, destinataires } = await resoudreSegment(
    base(acteur) as unknown as Prisma.TransactionClient,
    segment,
    canal,
    aujourdhui(),
    empreinteAdresse(),
  );
  return { total, destinataires: destinataires.length };
}

export async function creerCampagne(acteur: UtilisateurConnecte, saisie: unknown): Promise<string> {
  exigerGestion(acteur);
  const { nom, modeleId, canal, segment, programmeeLe } = valider(campagneSaisieSchema, saisie);
  exigerCentres(acteur, segment);
  const modele = await base(acteur).modeleMessage.findFirst({
    where: { id: modeleId, scenario: null },
    select: { id: true },
  });
  if (modele === null) {
    throw ErreurSaisie.surChamp('modeleId', 'Choisir un modèle de campagne.');
  }
  return withAudit(
    acteur,
    async (tx) => {
      const { id } = await tx.campagne.create({
        data: {
          organisationId: acteur.organisationId,
          nom,
          modeleId,
          canal,
          segment: segment as unknown as Prisma.InputJsonValue,
          programmeeLe: new Date(programmeeLe ?? horloge.now()),
        },
        select: { id: true },
      });
      return id;
    },
    (id) => ({
      action: 'CREATE',
      entiteType: 'CAMPAGNE',
      entiteId: id,
      details: { nom, canal, programmeeLe },
    }),
  );
}

export interface CampagneResume {
  readonly id: string;
  readonly nom: string;
  readonly canal: CanalMessage;
  readonly statut: StatutCampagne;
  readonly programmeeLe: string;
  readonly destinataires: number | null;
}

/** Un responsable ne voit que les campagnes de ses centres. */
export async function listerCampagnes(acteur: UtilisateurConnecte): Promise<CampagneResume[]> {
  exigerGestion(acteur);
  const lignes = await base(acteur).campagne.findMany({
    orderBy: { programmeeLe: 'desc' },
    take: 100,
  });
  return lignes
    .filter(
      (c) =>
        acteur.role === 'ADMIN_CLIENT' ||
        segmentSchema
          .parse(c.segment)
          .centreIds.every((centreId) => acteur.centreIds.includes(centreId)),
    )
    .map((c) => ({
      id: c.id,
      nom: c.nom,
      canal: c.canal,
      statut: c.statut,
      programmeeLe: c.programmeeLe.toISOString(),
      destinataires: c.destinataires,
    }));
}

/** Seule une campagne qui n'a pas commencé s'annule. */
export async function annulerCampagne(acteur: UtilisateurConnecte, id: string): Promise<void> {
  exigerGestion(acteur);
  const campagne = await base(acteur).campagne.findFirst({
    where: { id, organisationId: acteur.organisationId },
    select: { segment: true },
  });
  if (campagne === null) {
    throw new AccesRefuseError();
  }
  exigerCentres(acteur, segmentSchema.parse(campagne.segment));
  await withAudit(
    acteur,
    async (tx) => {
      const { count } = await tx.campagne.updateMany({
        where: { id, statut: 'PROGRAMMEE' },
        data: { statut: 'ANNULEE' },
      });
      if (count === 0) {
        throw new ErreurSaisie({}, 'Cette campagne a déjà commencé.');
      }
    },
    { action: 'UPDATE', entiteType: 'CAMPAGNE', entiteId: id, details: { statut: 'ANNULEE' } },
  );
}
