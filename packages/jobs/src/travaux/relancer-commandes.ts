import { clientPlateforme } from '@ha/db';
import { PARAMETRES_COMMANDE_DEFAUT, relanceDue } from '@ha/domain';
import { z } from 'zod';

import type { FileTravaux } from '../file';
import { definirTravail, type Travail } from '../travail';

const chargeRelance = z.object({});
type ChargeRelance = typeof chargeRelance;

/**
 * Relance les commandes parties sans accusé. La clé `relance:<commande>:<rang>` rend le travail rejouable : une
 * exécution interrompue retrouve son message et termine le décompte, sans en écrire un second.
 */
export function travailRelanceCommandes({
  maintenant = () => new Date(),
}: { maintenant?: () => Date } = {}): Travail<ChargeRelance> {
  return definirTravail({
    nom: 'relancer-commandes',
    charge: chargeRelance,
    async executer({ client, organisationId }) {
      const parametres =
        (await client.parametresCommande.findUnique({ where: { organisationId } })) ??
        PARAMETRES_COMMANDE_DEFAUT;
      const commandes = await client.commande.findMany({
        where: { statut: 'ENVOYEE', accuseLe: null, relances: { lt: parametres.relancesMax } },
        select: {
          id: true,
          numero: true,
          relances: true,
          centre: { select: { nom: true } },
          fournisseur: { select: { emailCommande: true, delaiRelanceJours: true } },
        },
      });
      for (const commande of commandes) {
        const { emailCommande, delaiRelanceJours } = commande.fournisseur;
        const messages = await client.notification.findMany({
          where: { commandeId: commande.id, statut: { in: ['A_ENVOYER', 'ENVOYEE'] } },
          select: { statut: true, envoyeeLe: true },
          orderBy: { envoyeeLe: 'desc' },
        });
        const rang = commande.relances + 1;
        const cleIdempotence = `relance:${commande.id}:${String(rang)}`;
        const existante = await client.notification.findUnique({
          where: { organisationId_cleIdempotence: { organisationId, cleIdempotence } },
          select: { id: true },
        });
        if (!existante) {
          const dernierEnvoi = messages.find((m) => m.envoyeeLe !== null)?.envoyeeLe ?? null;
          const due = relanceDue(
            { dernierEnvoi: dernierEnvoi?.toISOString() ?? null, relances: commande.relances },
            {
              delaiJours: delaiRelanceJours ?? parametres.delaiRelanceJours,
              relancesMax: parametres.relancesMax,
            },
            maintenant().toISOString(),
          );
          // Un message encore en attente passera avant : relancer maintenant ferait double emploi.
          if (!due || emailCommande === null || messages.some((m) => m.statut === 'A_ENVOYER')) {
            continue;
          }
          await client.notification.create({
            data: {
              commandeId: commande.id,
              canal: 'EMAIL',
              destinataire: emailCommande,
              gabarit: 'RELANCE_COMMANDE',
              parametres: { numero: commande.numero, centre: commande.centre.nom },
              cleIdempotence,
            },
          });
        }
        await client.commande.updateMany({
          where: { id: commande.id, relances: commande.relances },
          data: { relances: rang },
        });
      }
    },
  });
}

/** Met en file les seules organisations qui ont une commande sans accusé. */
export async function repartirRelances(
  file: FileTravaux,
  travail: Travail<ChargeRelance>,
): Promise<void> {
  const enAttente = await clientPlateforme().$queryRaw<{ organisationId: string }[]>`
    SELECT DISTINCT organisation_id AS "organisationId" FROM commande
    WHERE statut = 'ENVOYEE' AND accuse_le IS NULL`;
  for (const { organisationId } of enAttente) {
    await file.envoyer(travail, { organisationId, cleIdempotence: 'relance', charge: {} });
  }
}
