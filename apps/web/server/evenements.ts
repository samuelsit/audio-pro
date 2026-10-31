import type { Prisma } from '@ha/db';
import { evenementAgendaSchema, type EvenementAgenda } from '@ha/domain';

import type { ClientTransaction } from './chiffrement';

/**
 * Écrit l'événement dans la transaction du métier : il existe si et seulement si l'écriture a eu lieu.
 * `packages/jobs` le diffuse ensuite aux abonnés (ADR-020).
 */
export async function publierEvenement(
  tx: ClientTransaction,
  evenement: EvenementAgenda,
  survenuLe: Date,
): Promise<void> {
  const { type, charge } = evenementAgendaSchema.parse(evenement);
  await tx.evenementDomaine.create({
    data: {
      type,
      agregatId: charge.rendezVousId,
      charge: charge as unknown as Prisma.InputJsonValue,
      survenuLe,
    },
  });
}
