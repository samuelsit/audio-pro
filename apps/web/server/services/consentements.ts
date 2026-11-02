import {
  adresseCanonique,
  adresseMessage,
  CANAUX_MESSAGE,
  champConsentement,
  peutNoterConsentement,
  recueilConsentementSchema,
  telephoneCanonique,
  type CanalMessage,
  type CanalNotification,
} from '@ha/domain';

import { AccesRefuseError, type UtilisateurConnecte } from '../auth/acces';
import { withAudit } from '../audit/journal';
import { base, type ClientTransaction } from '../chiffrement';
import { ErreurSaisie, valider } from '../erreurs';
import { notifier } from '../notifier';
import { empreinteAdresse } from '../reservation-empreintes';
import { exigerPatient } from './garanties';

/** L'envoi d'un document se refuse tout de suite : la garde l'abandonnerait, le centre le croirait parti. */
export async function exigerSansOpposition(
  client: Pick<ClientTransaction, 'oppositionAdresse'>,
  canal: CanalNotification,
  adresse: string,
): Promise<void> {
  // La fiche écrit `0…` ou `+33…`, l'empreinte porte sur la forme canonique.
  const canonique =
    canal === 'SMS' ? (telephoneCanonique(adresse) ?? adresse) : adresseCanonique(canal, adresse);
  const opposition = await client.oppositionAdresse.findFirst({
    where: { canal, empreinte: empreinteAdresse().calculer(canal, canonique) },
    select: { id: true },
  });
  if (opposition !== null) {
    throw ErreurSaisie.surChamp('canal', 'Le patient s’est opposé à ce canal.');
  }
}

/** Canaux coupés par une opposition sur les adresses actuelles de ce patient. */
export async function oppositionsDuPatient(
  acteur: UtilisateurConnecte,
  patient: Parameters<typeof adresseMessage>[0],
): Promise<CanalMessage[]> {
  const cibles = CANAUX_MESSAGE.flatMap((canal) => {
    const adresse = adresseMessage(patient, canal);
    return adresse === null
      ? []
      : [{ canal, empreinte: empreinteAdresse().calculer(canal, adresse) }];
  });
  if (cibles.length === 0) {
    return [];
  }
  const lignes = await base(acteur).oppositionAdresse.findMany({
    where: { OR: cibles },
    select: { canal: true },
  });
  return lignes.map((l) => l.canal);
}

/**
 * Le patient, de vive voix ou par écrit, consent de nouveau : seule cette action lève une opposition. Le
 * fournisseur est prévenu d'abord : l'inverse laisserait le numéro bloqué chez lui, et le relevé suivant
 * reposerait l'opposition.
 */
export async function noterConsentement(
  acteur: UtilisateurConnecte,
  patientId: string,
  saisie: unknown,
): Promise<void> {
  if (!peutNoterConsentement(acteur.role)) {
    throw new AccesRefuseError();
  }
  const { canal, finalites } = valider(recueilConsentementSchema, saisie);
  await exigerPatient(base(acteur), acteur, patientId);
  const patient = await base(acteur).patient.findUniqueOrThrow({
    where: { id: patientId },
    select: {
      centreId: true,
      telephone: true,
      email: true,
      adresseLigne1: true,
      codePostal: true,
      ville: true,
    },
  });
  const adresse = adresseMessage(patient, canal);
  if (adresse === null) {
    throw ErreurSaisie.surChamp('canal', 'Le patient n’a pas de coordonnée sur ce canal.');
  }
  const empreinte = empreinteAdresse().calculer(canal, adresse);
  const opposition = await base(acteur).oppositionAdresse.findFirst({
    where: { canal, empreinte },
    select: { id: true },
  });
  if (opposition !== null && canal === 'SMS') {
    await notifier().retirerOppositionSms(adresse);
  }
  await withAudit(
    acteur,
    async (tx) => {
      await tx.oppositionAdresse.deleteMany({ where: { canal, empreinte } });
      await tx.patient.update({
        where: { id: patientId },
        data: Object.fromEntries(finalites.map((f) => [champConsentement(canal, f), true])),
      });
      await tx.evenementConsentement.createMany({
        data: finalites.map((finalite) => ({
          organisationId: acteur.organisationId,
          patientId,
          canal,
          finalite,
          accorde: true,
          origine: 'RECUEIL' as const,
          auteur: `${acteur.prenom} ${acteur.nom}`,
        })),
      });
    },
    {
      action: 'UPDATE',
      entiteType: 'PATIENT',
      entiteId: patientId,
      patientId,
      centreId: patient.centreId,
      details: { consentement: canal, finalites },
    },
  );
}
