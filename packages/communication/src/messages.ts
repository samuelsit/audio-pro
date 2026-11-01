import { randomBytes, randomUUID } from 'node:crypto';

import type { EmpreinteAdresse } from '@ha/adapters';
import {
  adresseMessage,
  choisirCanal,
  rendreTexte,
  valeursMessage,
  variablesDuTexte,
  type CanalMessage,
  type FinaliteMessage,
  type PatientMessage,
  type ScenarioCommunication,
  type TextesModele,
} from '@ha/domain';

import type { TxCommunication } from './journal';

/** 72 bits, en base64url : assez court pour un SMS, trop long à deviner. */
const OCTETS_CODE_COURT = 9;

export interface DependancesMessage {
  readonly empreinte: EmpreinteAdresse;
  readonly urlPublique: string;
}

export interface EntreeMessage {
  readonly organisationId: string;
  readonly centre: { readonly id: string; readonly nom: string; readonly telephone: string };
  readonly patient: PatientMessage & { readonly id: string; readonly prenoms: string };
  readonly canaux: readonly CanalMessage[];
  readonly finalite: FinaliteMessage;
  readonly scenario: ScenarioCommunication | null;
  readonly campagneId?: string;
  readonly textes: TextesModele;
  readonly modeleVersion: number | null;
  readonly rdv?: {
    readonly id: string;
    readonly debut: Date;
    readonly date: string;
    readonly heure: string;
  };
  readonly entiteId?: string;
  readonly cleIdempotence: string;
  /** Adresse réelle derrière `{lien}`. Sans elle, le téléphone du centre en tient lieu. */
  readonly lien?: string;
  readonly expireLe?: Date;
  /** 0 passe d'abord. Une campagne laisse passer les rappels. */
  readonly priorite?: number;
}

export type IssueMessage = 'ECRIT' | 'BLOQUE' | 'DEJA_ECRIT';

/** Oppositions déjà posées sur les adresses de ce patient. */
export async function canauxEnOpposition(
  tx: TxCommunication,
  patient: PatientMessage,
  canaux: readonly CanalMessage[],
  empreinte: EmpreinteAdresse,
): Promise<CanalMessage[]> {
  const cibles = canaux.flatMap((canal) => {
    const adresse = adresseMessage(patient, canal);
    return adresse === null ? [] : [{ canal, empreinte: empreinte.calculer(canal, adresse) }];
  });
  if (cibles.length === 0) {
    return [];
  }
  const lignes = await tx.oppositionAdresse.findMany({
    where: { OR: cibles },
    select: { canal: true },
  });
  return lignes.map((l) => l.canal);
}

function corpsDuCanal(textes: TextesModele, canal: CanalMessage): string {
  switch (canal) {
    case 'SMS':
      return textes.corpsSms;
    case 'EMAIL':
      return textes.corpsEmail;
    case 'COURRIER':
      return textes.corpsCourrier ?? textes.corpsEmail;
  }
}

/**
 * Écrit un message à sa place, une seule fois : la clé d'idempotence rend tout scénario et toute campagne
 * rejouables. Le canal se choisit ici, le consentement se relit à l'envoi. Sans canal, la ligne reste pour dire
 * pourquoi rien n'est parti. Une lettre attend son lot, elle ne passe pas par la file d'envoi.
 */
export async function ecrireMessage(
  tx: TxCommunication,
  entree: EntreeMessage,
  { empreinte, urlPublique }: DependancesMessage,
): Promise<IssueMessage> {
  const { organisationId, centre, patient, canaux, finalite, textes, cleIdempotence } = entree;
  const existant = await tx.messagePatient.findUnique({
    where: { organisationId_cleIdempotence: { organisationId, cleIdempotence } },
    select: { id: true },
  });
  if (existant !== null) {
    return 'DEJA_ECRIT';
  }
  const oppositions = await canauxEnOpposition(tx, patient, canaux, empreinte);
  const decision = choisirCanal(patient, canaux, finalite, oppositions);
  const id = randomUUID();
  const commun = {
    id,
    organisationId,
    centreId: centre.id,
    patientId: patient.id,
    canal: decision.canal,
    finalite,
    scenario: entree.scenario,
    campagneId: entree.campagneId ?? null,
    rendezVousId: entree.rdv?.id ?? null,
    rdvDebut: entree.rdv?.debut ?? null,
    entiteId: entree.entiteId ?? null,
    modeleVersion: entree.modeleVersion,
    cleIdempotence,
    expireLe: entree.expireLe ?? null,
  };

  if (!decision.autorise) {
    const { count } = await tx.messagePatient.createMany({
      data: [{ ...commun, statut: 'BLOQUE', motif: decision.motif }],
      skipDuplicates: true,
    });
    return count === 1 ? 'BLOQUE' : 'DEJA_ECRIT';
  }

  const { canal, adresse } = decision;
  const modele = corpsDuCanal(textes, canal);
  const lienSuivi =
    canal !== 'COURRIER' && entree.lien !== undefined && variablesDuTexte(modele).includes('lien');
  const codeCourt = lienSuivi ? randomBytes(OCTETS_CODE_COURT).toString('base64url') : null;
  const valeurs = valeursMessage({
    prenoms: patient.prenoms,
    centre: centre.nom,
    telephoneCentre: centre.telephone,
    lien: codeCourt === null ? (entree.lien ?? null) : `${urlPublique}/l/${codeCourt}`,
    rdv: entree.rdv ?? null,
  });
  const { count } = await tx.messagePatient.createMany({
    data: [
      {
        ...commun,
        statut: canal === 'COURRIER' ? 'A_IMPRIMER' : 'A_ENVOYER',
        sujet: rendreTexte(textes.sujet, valeurs),
        corps: rendreTexte(modele, valeurs),
        empreinteAdresse: empreinte.calculer(canal, adresse),
        codeCourt,
        lienCible: lienSuivi ? (entree.lien as string) : null,
      },
    ],
    skipDuplicates: true,
  });
  if (count === 0) {
    return 'DEJA_ECRIT';
  }
  if (canal !== 'COURRIER') {
    await tx.notification.create({
      data: {
        organisationId,
        messagePatientId: id,
        canal,
        destinataire: adresse,
        gabarit: 'MESSAGE_PATIENT',
        parametres: {},
        cleIdempotence: `message:${id}`,
        priorite: entree.priorite ?? 0,
      },
    });
  }
  return 'ECRIT';
}
