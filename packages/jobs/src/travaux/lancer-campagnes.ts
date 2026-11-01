import type { EmpreinteAdresse } from '@ha/adapters';
import { ecrireMessage, resoudreSegment, type TxCommunication } from '@ha/communication';
import { clientPlateforme } from '@ha/db';
import { localDepuisInstant, segmentSchema } from '@ha/domain';
import { z } from 'zod';

import type { FileTravaux } from '../file';
import { definirTravail, enTransactionChiffree, type Travail } from '../travail';
import { centresDuClient } from './declencher-scenarios';

const charge = z.object({});
type Charge = typeof charge;

/** Une campagne laisse passer les rappels, dans la file d'envoi. */
const PRIORITE_CAMPAGNE = 1;

export interface DependancesCampagnes {
  readonly empreinte: EmpreinteAdresse;
  readonly urlPublique: string;
  readonly maintenant?: () => Date;
}

/**
 * Lance les campagnes échues. Le segment se résout à cet instant : consentements et oppositions sont ceux du
 * jour. Rejouable : une campagne restée `EN_COURS` se reprend, chaque patient a sa clé d'idempotence.
 */
export function travailCampagnes(dependances: DependancesCampagnes): Travail<Charge> {
  const { empreinte, urlPublique, maintenant = () => new Date() } = dependances;
  return definirTravail({
    nom: 'lancer-campagnes',
    charge,
    async executer({ client, organisationId }) {
      const instant = maintenant();
      const campagnes = await client.campagne.findMany({
        where: { statut: { in: ['PROGRAMMEE', 'EN_COURS'] }, programmeeLe: { lte: instant } },
        include: { modele: true },
      });
      const centres = await centresDuClient(client, organisationId, urlPublique);
      for (const campagne of campagnes) {
        await client.campagne.update({
          where: { id: campagne.id },
          data: { statut: 'EN_COURS', lanceeLe: campagne.lanceeLe ?? instant },
        });
        const { destinataires } = await resoudreSegment(
          client as unknown as TxCommunication,
          segmentSchema.parse(campagne.segment),
          campagne.canal,
          localDepuisInstant(instant.getTime()).date,
          empreinte,
        );
        for (const patient of destinataires) {
          const centre = centres.get(patient.centreId);
          if (centre === undefined) {
            continue;
          }
          await enTransactionChiffree(organisationId, (tx) =>
            ecrireMessage(
              tx,
              {
                organisationId,
                centre,
                patient,
                canaux: [campagne.canal],
                finalite: 'COMMERCIAL',
                scenario: null,
                campagneId: campagne.id,
                textes: campagne.modele,
                modeleVersion: campagne.modele.version,
                cleIdempotence: `campagne:${campagne.id}:${patient.id}`,
                priorite: PRIORITE_CAMPAGNE,
                ...(centre.lien === undefined ? {} : { lien: centre.lien }),
              },
              { empreinte, urlPublique },
            ),
          );
        }
        await client.campagne.update({
          where: { id: campagne.id },
          data: { statut: 'TERMINEE', destinataires: destinataires.length },
        });
      }
    },
  });
}

/** Met en file les seuls clients qui ont une campagne échue. */
export async function repartirCampagnes(
  file: FileTravaux,
  travail: Travail<Charge>,
): Promise<void> {
  const echues = await clientPlateforme().$queryRaw<{ organisationId: string }[]>`
    SELECT DISTINCT organisation_id AS "organisationId" FROM campagne
    WHERE statut IN ('PROGRAMMEE', 'EN_COURS') AND programmee_le <= now()`;
  for (const { organisationId } of echues) {
    await file.envoyer(travail, { organisationId, cleIdempotence: 'campagnes', charge: {} });
  }
}
