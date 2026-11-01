import type {
  EmpreinteAdresse,
  SignatureLienCommande,
  SignatureLienDesinscription,
  SignatureLienDocument,
  SignatureLienRdv,
} from '@ha/adapters';
import {
  journaliserSysteme,
  lireParametresCommunication,
  type TxCommunication,
} from '@ha/communication';
import { clientPlateforme } from '@ha/db';
import {
  adresseCanonique,
  coutSmsMillimes,
  DUREE_LIEN_DOCUMENT_JOURS,
  gabaritAvecPieceJointe,
  parametresCommandeMessageSchema,
  parametresDocumentSchema,
  parametresGabaritSchema,
  piedEmail,
  rendreMessage,
  rendreMessageCommande,
  rendreMessageDocument,
  telephoneCanonique,
  type CanalNotification,
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
import { gardeEnvoi, type MessageARelire } from './garde-envoi';

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
  readonly signatureDesinscription: SignatureLienDesinscription;
  readonly empreinte: EmpreinteAdresse;
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
  return (
    gabarit !== 'DOCUMENT_A_CONSULTER' &&
    gabarit !== 'MESSAGE_PATIENT' &&
    !estGabaritCommande(gabarit)
  );
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
    signatureDesinscription,
    empreinte,
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

  /** Sur l'empreinte du destinataire : un STOP coupe aussi une ligne déjà en file, quelle que soit sa source. */
  async function sousOpposition(
    client: ContexteTravail['client'],
    organisationId: string,
    canal: CanalNotification,
    destinataire: string,
  ): Promise<boolean> {
    const adresse =
      canal === 'SMS'
        ? (telephoneCanonique(destinataire) ?? destinataire)
        : adresseCanonique('EMAIL', destinataire);
    const opposition = await client.oppositionAdresse.findUnique({
      where: {
        organisationId_canal_empreinte: {
          organisationId,
          canal,
          empreinte: empreinte.calculer(canal, adresse),
        },
      },
      select: { id: true },
    });
    return opposition !== null;
  }

  async function envoyerMessagePatient(
    client: ContexteTravail['client'],
    organisationId: string,
    ligne: { canal: CanalNotification; destinataire: string },
    message: MessageARelire,
    tarifSmsMillimes: number,
  ): Promise<void> {
    const { sujet, corps, centre } = message;
    const texte = z.string().parse(corps);
    let recu;
    if (ligne.canal === 'SMS') {
      recu = await notifier.envoyerSms({ destinataire: ligne.destinataire, texte });
    } else {
      const jeton = signatureDesinscription.signer({ organisationId, messageId: message.id });
      const lienDesinscription = `${urlPublique}/desinscription/${jeton}`;
      recu = await notifier.envoyerEmail({
        destinataire: ligne.destinataire,
        sujet: z.string().parse(sujet),
        texte: piedEmail(texte, centre.nom, lienDesinscription),
        repondreA: centre.email,
        lienDesinscription,
      });
    }
    const envoyeLe = maintenant();
    await client.messagePatient.update({
      where: { id: message.id },
      data: {
        statut: 'ENVOYE',
        envoyeLe,
        idFournisseur: recu.idFournisseur,
        segments: recu.credits,
        coutMillimes:
          recu.credits === null ? null : coutSmsMillimes(recu.credits, tarifSmsMillimes),
      },
    });
    await journaliserSysteme(client as unknown as TxCommunication, organisationId, [
      {
        action: 'SEND',
        entiteType: 'MESSAGE_PATIENT',
        entiteId: message.id,
        patientId: message.patientId,
        centreId: message.centreId,
        details: { canal: ligne.canal, scenario: message.scenario },
      },
    ]);
  }

  return definirTravail({
    nom: 'envoyer-notifications',
    charge: chargeEnvoi,
    async executer({ client, organisationId }) {
      const instant = maintenant();
      const parametres = await lireParametresCommunication(
        client as unknown as TxCommunication,
        organisationId,
      );
      const lot = await client.notification.findMany({
        where: {
          statut: 'A_ENVOYER',
          prochainEssaiLe: { lte: instant },
          ...(documents === null ? { commandeId: null } : {}),
        },
        orderBy: [{ priorite: 'asc' }, { id: 'asc' }],
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
          if (ligne.commandeId === null) {
            const verdict = await gardeEnvoi({
              client,
              messagePatientId: ligne.messagePatientId,
              opposition: await sousOpposition(
                client,
                organisationId,
                ligne.canal,
                ligne.destinataire,
              ),
              parametres,
              instant,
            });
            if (verdict.issue === 'ABANDON') {
              await client.notification.update({
                where: { id: ligne.id },
                data: { statut: 'ABANDONNEE' },
              });
              continue;
            }
            if (verdict.issue === 'REPORT') {
              await client.notification.update({
                where: { id: ligne.id },
                data: { tentatives: ligne.tentatives, prochainEssaiLe: verdict.creneau },
              });
              continue;
            }
            if (ligne.gabarit === 'MESSAGE_PATIENT') {
              await envoyerMessagePatient(
                client,
                organisationId,
                ligne,
                z.custom<MessageARelire>((m) => m !== null).parse(verdict.message),
                parametres.tarifSmsMillimes,
              );
              await client.notification.update({
                where: { id: ligne.id },
                data: { statut: 'ENVOYEE', envoyeeLe: maintenant() },
              });
              continue;
            }
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
            if (ligne.messagePatientId !== null) {
              await client.messagePatient.update({
                where: { id: ligne.messagePatientId },
                data: { statut: 'ECHEC', echecLe: maintenant(), motif: 'ENVOI' },
              });
            }
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
