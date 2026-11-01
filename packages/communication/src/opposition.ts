import {
  adresseCanonique,
  champConsentement,
  FINALITES_MESSAGE,
  type CanalMessage,
  type ConsentementsPatient,
} from '@ha/domain';

import { journaliserSysteme, type TxCommunication } from './journal';

export interface EntreeOpposition {
  readonly organisationId: string;
  readonly canal: CanalMessage;
  /** Adresse canonique. */
  readonly adresse: string;
  readonly empreinte: string;
  readonly origine: 'DESINSCRIPTION' | 'STOP_SMS';
  readonly maintenant: Date;
}

/** Écritures possibles d'une même adresse sur les fiches : `0…` et `+33…` y coexistent. */
function adressesSurFiche(canal: CanalMessage, adresse: string): readonly string[] {
  return canal === 'SMS' ? [adresse, `0${adresse.slice('+33'.length)}`] : [adresse];
}

/**
 * Coupe le canal pour cette adresse, chez ce client : la ligne d'opposition bloque les envois à venir, y compris
 * ceux déjà en file, et chaque fiche qui porte l'adresse perd ses consentements du canal. Rejouable : une
 * opposition déjà posée ne change rien. Le dernier message reçu garde la trace de la désinscription.
 */
export async function appliquerOpposition(
  tx: TxCommunication,
  entree: EntreeOpposition,
): Promise<void> {
  const { organisationId, canal, adresse, empreinte, origine, maintenant } = entree;
  const { count } = await tx.oppositionAdresse.createMany({
    data: [
      {
        organisationId,
        canal,
        empreinte,
        adresse: adresseCanonique(canal, adresse),
        origine,
        survenueLe: maintenant,
      },
    ],
    skipDuplicates: true,
  });
  if (count === 0) {
    return;
  }
  const ecritures = adressesSurFiche(canal, adresse);
  const patients = await tx.patient.findMany({
    where: {
      fusionneDansId: null,
      ...(canal === 'SMS'
        ? { telephone: { in: [...ecritures] } }
        : { email: { in: [...ecritures], mode: 'insensitive' } }),
    },
    select: {
      id: true,
      centreId: true,
      consentementSms: true,
      consentementEmail: true,
      consentementCourrier: true,
      consentementSmsCommercial: true,
      consentementEmailCommercial: true,
      consentementCourrierCommercial: true,
    },
  });
  for (const patient of patients) {
    const champs = FINALITES_MESSAGE.map((finalite) => ({
      finalite,
      champ: champConsentement(canal, finalite),
    })).filter(({ champ }) => patient[champ as keyof ConsentementsPatient]);
    if (champs.length === 0) {
      continue;
    }
    await tx.patient.update({
      where: { id: patient.id },
      data: Object.fromEntries(champs.map(({ champ }) => [champ, false])),
    });
    await tx.evenementConsentement.createMany({
      data: champs.map(({ finalite }) => ({
        organisationId,
        patientId: patient.id,
        canal,
        finalite,
        accorde: false,
        origine,
        auteur: origine === 'STOP_SMS' ? 'Réponse STOP' : 'Lien de désinscription',
        survenuLe: maintenant,
      })),
    });
    await journaliserSysteme(tx, organisationId, [
      {
        action: 'UPDATE',
        entiteType: 'PATIENT',
        entiteId: patient.id,
        patientId: patient.id,
        centreId: patient.centreId,
        details: { opposition: canal, origine },
      },
    ]);
  }
  const dernier = await tx.messagePatient.findFirst({
    where: { canal, empreinteAdresse: empreinte, envoyeLe: { not: null } },
    orderBy: { envoyeLe: 'desc' },
    select: { id: true },
  });
  if (dernier !== null) {
    await tx.messagePatient.update({
      where: { id: dernier.id },
      data: { desinscritLe: maintenant },
    });
  }
}
