import type { EmpreinteAdresse } from '@ha/adapters';
import { appliquerOpposition } from '@ha/communication';
import { clientPlateforme } from '@ha/db';
import { statutApresAccuse, telephoneCanonique, type CanalSuivi, type Notifier } from '@ha/domain';
import { z } from 'zod';

import type { FileTravaux } from '../file';
import { definirTravail, enTransactionChiffree, type Travail } from '../travail';

const TAILLE_LOT = 200;
const MS_PAR_HEURE = 3_600_000;
/** Passé ce délai, un message sans accusé n'en aura plus : il reste « envoyé ». */
const SUIVI_HEURES = 72;

const charge = z.object({});
type Charge = typeof charge;

export interface DependancesReleve {
  readonly notifier: Notifier;
  readonly maintenant?: () => Date;
}

/**
 * Relit l'état des messages confiés aux fournisseurs : aucun des deux ne signe ses appels entrants, leurs retours
 * se lisent chez eux (ADR-034). Rejouable : un état final ne recule pas. Une panne n'arrête que sa ligne.
 */
export function travailReleveEnvois(dependances: DependancesReleve): Travail<Charge> {
  const { notifier, maintenant = () => new Date() } = dependances;
  return definirTravail({
    nom: 'relever-envois',
    charge,
    async executer({ client }) {
      const instant = maintenant();
      const lot = await client.messagePatient.findMany({
        where: {
          statut: 'ENVOYE',
          idFournisseur: { not: null },
          envoyeLe: { gte: new Date(instant.getTime() - SUIVI_HEURES * MS_PAR_HEURE) },
        },
        select: { id: true, canal: true, statut: true, idFournisseur: true },
        orderBy: { envoyeLe: 'asc' },
        take: TAILLE_LOT,
      });
      for (const ligne of lot) {
        try {
          const etat = await notifier.etatEnvoi(
            ligne.canal as CanalSuivi,
            ligne.idFournisseur as string,
          );
          const statut = statutApresAccuse(ligne.statut, etat);
          if (statut !== ligne.statut) {
            await client.messagePatient.update({
              where: { id: ligne.id },
              data: {
                statut,
                ...(statut === 'DELIVRE' ? { delivreLe: instant } : { echecLe: instant }),
              },
            });
          }
        } catch {
          // La réponse d'un fournisseur peut citer le destinataire : rien dans les journaux.
          console.error(`Message ${ligne.id} : accusé illisible.`);
        }
      }
    },
  });
}

export async function repartirReleveEnvois(
  file: FileTravaux,
  travail: Travail<Charge>,
): Promise<void> {
  const enAttente = await clientPlateforme().$queryRaw<{ organisationId: string }[]>`
    SELECT DISTINCT organisation_id AS "organisationId" FROM message_patient WHERE statut = 'ENVOYE'`;
  for (const { organisationId } of enAttente) {
    await file.envoyer(travail, { organisationId, cleIdempotence: 'releve-envois', charge: {} });
  }
}

export interface DependancesStop {
  readonly notifier: Notifier;
  readonly empreinte: EmpreinteAdresse;
  readonly maintenant?: () => Date;
}

/**
 * Relève les STOP, transverse par nature : le compte d'envoi est unique et un numéro ne dit pas quel client il
 * vise. Le STOP s'applique donc à chaque client qui a écrit à ce numéro (ADR-034). `ha_plateforme` ne voit que
 * des empreintes et des organisations ; l'écriture se fait dans le contexte de chacune.
 */
export async function releverOppositions(dependances: DependancesStop): Promise<void> {
  const { notifier, empreinte, maintenant = () => new Date() } = dependances;
  const numeros = await notifier.oppositionsSms();
  for (const numero of numeros) {
    const adresse = telephoneCanonique(numero.replace(/^00/, '+'));
    if (adresse === null) {
      continue;
    }
    const empreinteAdresse = empreinte.calculer('SMS', adresse);
    const clients = await clientPlateforme().$queryRaw<{ organisationId: string }[]>`
      SELECT DISTINCT organisation_id AS "organisationId" FROM message_patient
      WHERE canal = 'SMS' AND empreinte_adresse = ${empreinteAdresse}`;
    for (const { organisationId } of clients) {
      await enTransactionChiffree(organisationId, (tx) =>
        appliquerOpposition(tx, {
          organisationId,
          canal: 'SMS',
          adresse,
          empreinte: empreinteAdresse,
          origine: 'STOP_SMS',
          maintenant: maintenant(),
        }),
      );
    }
  }
}
