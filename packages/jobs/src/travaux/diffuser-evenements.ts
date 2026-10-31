import { clientPlateforme } from '@ha/db';
import { evenementAgendaSchema, type EvenementAgenda } from '@ha/domain';
import { z } from 'zod';

import type { FileTravaux } from '../file';
import { definirTravail, type ContexteTravail, type Travail } from '../travail';

const TAILLE_LOT = 100;

/** Reçoit un événement au moins une fois : `evenementId` lui sert de clé d'idempotence. */
export interface Abonne {
  readonly nom: string;
  traiter(
    evenement: EvenementAgenda,
    evenementId: string,
    contexte: ContexteTravail,
  ): Promise<void>;
}

const chargeDiffusion = z.object({});
type ChargeDiffusion = typeof chargeDiffusion;

/**
 * Diffuse l'outbox d'une organisation, dans l'ordre. Un abonné en échec arrête le lot et laisse l'événement à
 * diffuser : pg-boss rejoue le travail, ou le répartiteur le remet en file.
 */
export function travailDiffusion(abonnes: readonly Abonne[]): Travail<ChargeDiffusion> {
  return definirTravail({
    nom: 'diffuser-evenements',
    charge: chargeDiffusion,
    async executer(contexte) {
      const { client } = contexte;
      const lot = await client.evenementDomaine.findMany({
        where: { diffuseLe: null },
        orderBy: { id: 'asc' },
        take: TAILLE_LOT,
      });
      for (const { id, type, charge } of lot) {
        const evenement = evenementAgendaSchema.parse({ type, charge });
        for (const abonne of abonnes) {
          await abonne.traiter(evenement, id, contexte);
        }
        await client.evenementDomaine.updateMany({
          where: { id, diffuseLe: null },
          data: { diffuseLe: new Date() },
        });
      }
    },
  });
}

/**
 * Met en file la diffusion des seules organisations en attente. `ha_plateforme` n'a droit qu'à ces deux
 * colonnes de l'outbox, jamais à la charge.
 */
export async function repartirDiffusion(
  file: FileTravaux,
  travail: Travail<ChargeDiffusion>,
): Promise<void> {
  // En SQL : le `distinct` de Prisma lit toutes les colonnes, et ce droit-là n'existe pas.
  const enAttente = await clientPlateforme().$queryRaw<{ organisationId: string }[]>`
    SELECT DISTINCT organisation_id AS "organisationId" FROM evenement_domaine
    WHERE diffuse_le IS NULL`;
  for (const { organisationId } of enAttente) {
    await file.envoyer(travail, { organisationId, cleIdempotence: 'diffusion', charge: {} });
  }
}
