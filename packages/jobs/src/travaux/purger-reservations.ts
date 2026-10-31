import { clientPlateforme } from '@ha/db';
import { z } from 'zod';

import type { FileTravaux } from '../file';
import { definirTravail } from '../travail';

const MS_PAR_JOUR = 86_400_000;
// À VÉRIFIER : durées de conservation absentes de docs/ref, à arrêter à l'étape 22.
const CONSERVATION_NOTIFICATIONS_JOURS = 30;
const CONSERVATION_CONTACT_JOURS = 1;
const CONSERVATION_LIMITATION_JOURS = 2;

const chargePurge = z.object({});

/**
 * Efface ce que la réservation en ligne n'a plus à garder : un verrou abandonné contient une identité, et seul
 * le prochain réservant du même créneau l'aurait supprimé. Un prospect jamais converti reste : sa durée de
 * conservation relève de l'étape 22.
 */
export const travailPurgeReservations = definirTravail({
  nom: 'purger-reservations',
  charge: chargePurge,
  async executer({ client }) {
    const maintenant = new Date();
    await client.reservationEnLigne.deleteMany({
      where: { statut: 'VERROU', expireLe: { lt: maintenant } },
    });
    await client.reservationEnLigne.updateMany({
      where: {
        statut: 'FINALISEE',
        telephone: { not: null },
        rendezVous: {
          patientId: { not: null },
          fin: { lt: new Date(maintenant.getTime() - CONSERVATION_CONTACT_JOURS * MS_PAR_JOUR) },
        },
      },
      data: { telephone: null, email: null },
    });
    await client.notification.deleteMany({
      where: {
        statut: { not: 'A_ENVOYER' },
        createdAt: {
          lt: new Date(maintenant.getTime() - CONSERVATION_NOTIFICATIONS_JOURS * MS_PAR_JOUR),
        },
      },
    });
  },
});

/** Une purge par client, chacune sous sa RLS. */
export async function repartirPurge(
  file: FileTravaux,
  travail: typeof travailPurgeReservations,
): Promise<void> {
  const organisations = await clientPlateforme().organisation.findMany({ select: { id: true } });
  for (const { id: organisationId } of organisations) {
    await file.envoyer(travail, { organisationId, cleIdempotence: 'purge', charge: {} });
  }
}

/**
 * Compteurs de limitation périmés. Seule tâche transverse à écrire (ADR-021) : la table est technique, sans
 * organisation, et les clés publiques la font croître au gré des visiteurs.
 */
export async function purgerLimitations(): Promise<void> {
  const limite = BigInt(Date.now() - CONSERVATION_LIMITATION_JOURS * MS_PAR_JOUR);
  await clientPlateforme().$executeRaw`
    DELETE FROM limitation_debit WHERE derniere_requete < ${limite}::bigint`;
}
