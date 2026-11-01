import { clientPlateforme } from '@ha/db';
import type { DocumentStore } from '@ha/domain';
import { z } from 'zod';

import type { FileTravaux } from '../file';
import { definirTravail, type Travail } from '../travail';

const TAILLE_LOT = 100;
const chargePurge = z.object({});
type ChargePurge = typeof chargePurge;

/**
 * Retire le compte rendu figé d'un lien expiré : il n'existait que pour ce lien. Le PDF d'un devis, lui, reste :
 * c'est le document du dossier. Idempotent : `delete` ignore une clé absente, et la ligne est marquée ensuite.
 */
export function travailPurgeLiensDocument(
  stockage: Pick<DocumentStore, 'delete'>,
  maintenant: () => Date = () => new Date(),
): Travail<ChargePurge> {
  return definirTravail({
    nom: 'purger-liens-document',
    charge: chargePurge,
    async executer({ client }) {
      const instant = maintenant();
      const lot = await client.lienDocument.findMany({
        where: { cible: 'COMPTE_RENDU_ESSAI', expireLe: { lt: instant }, pdfPurgeLe: null },
        select: { id: true, pdfCle: true },
        take: TAILLE_LOT,
      });
      for (const { id, pdfCle } of lot) {
        await stockage.delete(pdfCle);
        await client.lienDocument.update({ where: { id }, data: { pdfPurgeLe: instant } });
      }
    },
  });
}

/** Une purge par client, chacune sous sa RLS. */
export async function repartirPurgeLiens(
  file: FileTravaux,
  travail: Travail<ChargePurge>,
): Promise<void> {
  const organisations = await clientPlateforme().organisation.findMany({ select: { id: true } });
  for (const { id: organisationId } of organisations) {
    await file.envoyer(travail, { organisationId, cleIdempotence: 'purge-liens', charge: {} });
  }
}
