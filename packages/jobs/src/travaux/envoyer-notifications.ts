import type { SignatureLienCommande, SignatureLienDocument, SignatureLienRdv } from '@ha/adapters';
import { clientPlateforme } from '@ha/db';
import {
  DUREE_LIEN_DOCUMENT_JOURS,
  gabaritAvecPieceJointe,
  parametresCommandeMessageSchema,
  parametresDocumentSchema,
  parametresGabaritSchema,
  rendreMessage,
  rendreMessageCommande,
  rendreMessageDocument,
  type DocumentStore,
  type GabaritCommande,
  type GabaritNotification,
  type GabaritRdv,
  type MessageRendu,
  type Notifier,
} from '@ha/domain';
import { z } from 'zod';

import type { FileTravaux } from '../file';
import { definirTravail, type ContexteTravail, type Travail } from '../travail';

const TAILLE_LOT = 50;
const TENTATIVES_MAX = 5;
const MS_PAR_MINUTE = 60_000;
/** Délai avant de reprendre une ligne dont l'envoi n'a pas abouti, y compris si l'ouvrier est tombé. */
const REPRISE_MINUTES = 5;

export interface DependancesEnvoi {
  readonly notifier: Notifier;
  readonly signature: SignatureLienRdv;
  readonly signatureDocument: SignatureLienDocument;
  readonly signatureCommande: SignatureLienCommande;
  /** Bons de commande. Sans stockage réel, leurs messages attendent : ils ne partent pas sans pièce jointe. */
  readonly documents: DocumentStore | null;
  readonly urlPublique: string;
  readonly maintenant?: () => Date;
}

const chargeEnvoi = z.object({});
type ChargeEnvoi = typeof chargeEnvoi;

function estGabaritCommande(gabarit: GabaritNotification): gabarit is GabaritCommande {
  return gabaritAvecPieceJointe(gabarit);
}

function estGabaritRdv(gabarit: GabaritNotification): gabarit is GabaritRdv {
  return gabarit !== 'DOCUMENT_A_CONSULTER' && !estGabaritCommande(gabarit);
}

/**
 * Envoie les messages dus d'une organisation. Chaque ligne se réserve avant l'envoi, en repoussant son prochain
 * essai : deux exécutions ne prennent pas la même, et un ouvrier tombé la laisse reprendre plus tard. Au moins
 * une fois, donc : un message peut, très rarement, partir deux fois. Une panne n'arrête que sa ligne.
 */
export function travailEnvoi(dependances: DependancesEnvoi): Travail<ChargeEnvoi> {
  const {
    notifier,
    signature,
    signatureDocument,
    signatureCommande,
    documents,
    urlPublique,
    maintenant = () => new Date(),
  } = dependances;

  function message(
    organisationId: string,
    ligne: {
      gabarit: GabaritNotification;
      parametres: unknown;
      reservationId: string | null;
      lienDocumentId: string | null;
    },
  ): MessageRendu {
    if (ligne.reservationId !== null && estGabaritRdv(ligne.gabarit)) {
      const jeton = signature.signer({ organisationId, reservationId: ligne.reservationId });
      return rendreMessage(
        ligne.gabarit,
        parametresGabaritSchema.parse(ligne.parametres),
        `${urlPublique}/rdv/lien/${jeton}`,
      );
    }
    const jeton = signatureDocument.signer({
      organisationId,
      lienId: z.string().parse(ligne.lienDocumentId),
    });
    return rendreMessageDocument(
      parametresDocumentSchema.parse(ligne.parametres),
      `${urlPublique}/document/${jeton}`,
      DUREE_LIEN_DOCUMENT_JOURS,
    );
  }

  async function envoyerCommande(
    client: ContexteTravail['client'],
    stockage: DocumentStore,
    organisationId: string,
    ligne: {
      commandeId: string;
      destinataire: string;
      gabarit: GabaritCommande;
      parametres: unknown;
    },
  ): Promise<void> {
    const commande = await client.commande.findUniqueOrThrow({
      where: { id: ligne.commandeId },
      select: { numero: true, bonPdfCle: true, centre: { select: { email: true } } },
    });
    const jeton = signatureCommande.signer({ organisationId, commandeId: ligne.commandeId });
    const { sujet, corps } = rendreMessageCommande(
      ligne.gabarit,
      parametresCommandeMessageSchema.parse(ligne.parametres),
      `${urlPublique}/commande-accuse/${jeton}`,
    );
    await notifier.envoyerEmail({
      destinataire: ligne.destinataire,
      sujet,
      texte: corps,
      repondreA: commande.centre.email,
      piecesJointes: [
        {
          nomFichier: `${commande.numero}.pdf`,
          typeContenu: 'application/pdf',
          contenu: await stockage.get(z.string().parse(commande.bonPdfCle)),
        },
      ],
    });
  }

  return definirTravail({
    nom: 'envoyer-notifications',
    charge: chargeEnvoi,
    async executer({ client, organisationId }) {
      const instant = maintenant();
      const lot = await client.notification.findMany({
        where: {
          statut: 'A_ENVOYER',
          prochainEssaiLe: { lte: instant },
          ...(documents === null ? { commandeId: null } : {}),
        },
        orderBy: { id: 'asc' },
        take: TAILLE_LOT,
      });
      for (const ligne of lot) {
        const tentatives = ligne.tentatives + 1;
        const { count } = await client.notification.updateMany({
          where: { id: ligne.id, statut: 'A_ENVOYER', prochainEssaiLe: { lte: instant } },
          data: {
            tentatives,
            prochainEssaiLe: new Date(instant.getTime() + REPRISE_MINUTES * MS_PAR_MINUTE),
          },
        });
        if (count !== 1) {
          continue;
        }
        try {
          if (ligne.commandeId !== null && estGabaritCommande(ligne.gabarit) && documents) {
            await envoyerCommande(client, documents, organisationId, {
              ...ligne,
              commandeId: ligne.commandeId,
              gabarit: ligne.gabarit,
            });
            await client.notification.update({
              where: { id: ligne.id },
              data: { statut: 'ENVOYEE', envoyeeLe: maintenant() },
            });
            continue;
          }
          const { sujet, corps } = message(organisationId, ligne);
          if (ligne.canal === 'SMS') {
            await notifier.envoyerSms({ destinataire: ligne.destinataire, texte: corps });
          } else {
            await notifier.envoyerEmail({
              destinataire: ligne.destinataire,
              sujet,
              texte: corps,
            });
          }
          await client.notification.update({
            where: { id: ligne.id },
            data: { statut: 'ENVOYEE', envoyeeLe: maintenant() },
          });
        } catch {
          // Le message d'erreur d'un fournisseur peut citer le destinataire : rien dans les journaux.
          console.error(`Notification ${ligne.id} : envoi en échec.`);
          if (tentatives >= TENTATIVES_MAX) {
            await client.notification.update({
              where: { id: ligne.id },
              data: { statut: 'ABANDONNEE' },
            });
          }
        }
      }
    },
  });
}

/** Met en file l'envoi des seules organisations qui ont un message dû. */
export async function repartirEnvois(
  file: FileTravaux,
  travail: Travail<ChargeEnvoi>,
): Promise<void> {
  // En SQL : `ha_plateforme` n'a droit qu'à ces colonnes, le `distinct` de Prisma les lirait toutes.
  const enAttente = await clientPlateforme().$queryRaw<{ organisationId: string }[]>`
    SELECT DISTINCT organisation_id AS "organisationId" FROM notification
    WHERE statut = 'A_ENVOYER' AND prochain_essai_le <= now()`;
  for (const { organisationId } of enAttente) {
    await file.envoyer(travail, { organisationId, cleIdempotence: 'envoi', charge: {} });
  }
}
