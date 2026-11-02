import { historiserMessage } from '@ha/communication';
import type { Prisma } from '@ha/db';
import {
  localDepuisInstant,
  parametresGabaritSchema,
  type CanalNotification,
  type GabaritNotification,
  type OrigineRdv,
} from '@ha/domain';

import type { ClientTransaction } from '../chiffrement';
import { empreinteAdresse } from '../reservation-empreintes';

interface RdvEnLigne {
  readonly id: string;
  readonly origine: OrigineRdv;
  readonly debut: Date;
}

/**
 * Écrit dans la transaction du métier les messages au patient qui a réservé en ligne : ils partent avec elle,
 * ou pas du tout. Sans réservation liée, rien : les autres rendez-vous passent par les scénarios (ADR-033).
 * Un patient connu voit le message dans son historique ; un prospect n'a pas de fiche où l'inscrire.
 * `version` : celle du rendez-vous après l'écriture, pour qu'un même message ne parte pas deux fois.
 */
export async function notifierPatientEnLigne(
  tx: ClientTransaction,
  rdv: RdvEnLigne,
  gabarit: GabaritNotification,
  version: number,
): Promise<void> {
  if (rdv.origine !== 'EN_LIGNE') {
    return;
  }
  const reservation = await tx.reservationEnLigne.findUnique({
    where: { rendezVousId: rdv.id },
    select: {
      id: true,
      organisationId: true,
      centreId: true,
      telephone: true,
      email: true,
      centre: { select: { nom: true, telephone: true } },
      rendezVous: { select: { patientId: true } },
    },
  });
  if (reservation === null) {
    return;
  }
  const { date, heure } = localDepuisInstant(rdv.debut.getTime());
  const parametres = parametresGabaritSchema.parse({
    centre: reservation.centre.nom,
    telephoneCentre: reservation.centre.telephone,
    date,
    heure,
  });
  const envois: readonly (readonly [CanalNotification, string | null])[] = [
    ['SMS', reservation.telephone],
    ['EMAIL', reservation.email],
  ];
  const patientId = reservation.rendezVous?.patientId ?? null;
  for (const [canal, destinataire] of envois) {
    if (destinataire !== null) {
      const cleIdempotence = `${reservation.id}:${String(version)}:${gabarit}:${canal}`;
      const messagePatientId =
        patientId === null
          ? null
          : await historiserMessage(
              tx as unknown as Prisma.TransactionClient,
              {
                organisationId: reservation.organisationId,
                centreId: reservation.centreId,
                patientId,
                canal,
                adresse: destinataire,
                finalite: 'SUIVI',
                sujet: 'Votre rendez-vous',
                cleIdempotence: `reservation:${cleIdempotence}`,
              },
              empreinteAdresse(),
            );
      await tx.notification.create({
        data: {
          reservationId: reservation.id,
          messagePatientId,
          canal,
          destinataire,
          gabarit,
          parametres: parametres as Prisma.InputJsonValue,
          cleIdempotence,
        },
      });
    }
  }
}
