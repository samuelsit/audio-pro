import { appliquerOpposition } from '@ha/communication';
import { clientPlateforme, type Prisma } from '@ha/db';
import { adresseMessage, type CanalMessage } from '@ha/domain';
import { SystemClock } from '@ha/adapters';

import { enregistrerTentative, type RegleLimitation } from '../auth/limitation';
import { base, enTransaction } from '../chiffrement';
import { empreinteAdresse, signatureLienDesinscription } from '../reservation-empreintes';

const horloge = new SystemClock();
const LIMITE_LIEN_IP: RegleLimitation = { max: 60, fenetreSecondes: 15 * 60 };

export interface Desinscription {
  readonly centre: string;
  readonly canal: CanalMessage;
  readonly dejaFaite: boolean;
}

/** Cible du jeton. Une désinscription reste possible même si le client est suspendu : c'est un droit du patient. */
async function lireMessage(jeton: string) {
  const cible = signatureLienDesinscription().lire(jeton);
  if (cible === null) {
    return null;
  }
  const message = await base(cible).messagePatient.findUnique({
    where: { id: cible.messageId },
    select: {
      patientId: true,
      canal: true,
      desinscritLe: true,
      centre: { select: { nom: true } },
    },
  });
  return message && { cible, message };
}

/** Ce que voit le patient : le centre et le canal, rien de son dossier. */
export async function lireDesinscription(jeton: string): Promise<Desinscription | null> {
  const lecture = await lireMessage(jeton);
  if (lecture === null) {
    return null;
  }
  const { centre, canal, desinscritLe } = lecture.message;
  return { centre: centre.nom, canal, dejaFaite: desinscritLe !== null };
}

/** Coupe le canal. Rejouer le lien ne change rien. */
export async function desinscrire(jeton: string): Promise<boolean> {
  const lecture = await lireMessage(jeton);
  if (lecture === null) {
    return false;
  }
  const { cible, message } = lecture;
  await enTransaction(cible, async (tx) => {
    const patient = await tx.patient.findUniqueOrThrow({
      where: { id: message.patientId },
      select: {
        telephone: true,
        email: true,
        adresseLigne1: true,
        codePostal: true,
        ville: true,
      },
    });
    const adresse = adresseMessage(patient, message.canal);
    const maintenant = new Date(horloge.now());
    if (adresse !== null) {
      await appliquerOpposition(tx as unknown as Prisma.TransactionClient, {
        organisationId: cible.organisationId,
        canal: message.canal,
        adresse,
        empreinte: empreinteAdresse().calculer(message.canal, adresse),
        origine: 'DESINSCRIPTION',
        maintenant,
      });
    }
    await tx.messagePatient.update({
      where: { id: cible.messageId },
      data: { desinscritLe: maintenant },
    });
  });
  return true;
}

/**
 * Adresse réelle d'un lien court, et note le premier clic. Le code n'est lisible par `ha_plateforme` qu'avec son
 * organisation : rien du patient ne se lit sans contexte client. À VÉRIFIER : une passerelle de messagerie peut
 * ouvrir le lien à la place du patient, le clic reste un indice ; base légale du suivi de clic absente de docs/ref.
 */
export async function suivreLien(code: string, ip: string): Promise<string | null> {
  const accepte = await enregistrerTentative(
    `lien-court:${ip}`,
    LIMITE_LIEN_IP,
    Date.parse(horloge.now()),
  );
  if (!accepte) {
    return null;
  }
  // En SQL : `ha_plateforme` n'a droit qu'à ces colonnes, Prisma lirait aussi l'identifiant.
  const [trouve] = await clientPlateforme().$queryRaw<{ organisationId: string }[]>`
    SELECT organisation_id AS "organisationId" FROM message_patient WHERE code_court = ${code}`;
  if (trouve === undefined) {
    return null;
  }
  return enTransaction(trouve, async (tx) => {
    const message = await tx.messagePatient.findUnique({
      where: { codeCourt: code },
      select: { id: true, lienCible: true, clicLe: true },
    });
    if (message === null || message.lienCible === null) {
      return null;
    }
    if (message.clicLe === null) {
      await tx.messagePatient.update({
        where: { id: message.id },
        data: { clicLe: new Date(horloge.now()) },
      });
    }
    return message.lienCible;
  });
}
