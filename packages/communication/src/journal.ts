import type { Prisma } from '@ha/db';
import { assainirPourAudit, type TypeEntite } from '@ha/domain';

export type TxCommunication = Prisma.TransactionClient;

/** Libellé des lignes écrites sans personne : un envoi planifié, un STOP relevé chez le fournisseur. */
export const AUTEUR_SYSTEME = 'Envoi automatique';

export interface EvenementSysteme {
  readonly action: 'SEND' | 'UPDATE' | 'READ';
  readonly entiteType: TypeEntite;
  readonly entiteId: string;
  readonly patientId: string;
  readonly centreId?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

/** Journal d'audit des travaux, qui touchent aussi des dossiers patient (ADR-019) : l'auteur n'est personne. */
export async function journaliserSysteme(
  tx: TxCommunication,
  organisationId: string,
  evenements: readonly EvenementSysteme[],
): Promise<void> {
  if (evenements.length === 0) {
    return;
  }
  await tx.journalAudit.createMany({
    data: evenements.map((e) => ({
      organisationId,
      utilisateurId: null,
      utilisateurLibelle: AUTEUR_SYSTEME,
      role: null,
      centreId: e.centreId ?? null,
      action: e.action,
      entiteType: e.entiteType,
      entiteId: e.entiteId,
      patientId: e.patientId,
      ...(e.details ? { details: assainirPourAudit(e.details) as Prisma.InputJsonValue } : {}),
    })),
  });
}
