import { decisionEnvoi, prochainCreneau, type PlageEnvoi, type StatutMessage } from '@ha/domain';

import type { ContexteTravail } from '../travail';

const STATUTS_RDV_ACTIFS = ['PLANIFIE', 'CONFIRME'];

const SELECTION = {
  id: true,
  patientId: true,
  centreId: true,
  canal: true,
  finalite: true,
  scenario: true,
  sujet: true,
  corps: true,
  statut: true,
  rendezVousId: true,
  rdvDebut: true,
  entiteId: true,
  expireLe: true,
  centre: { select: { nom: true, email: true } },
} as const;

export interface MessageARelire {
  readonly id: string;
  readonly patientId: string;
  readonly centreId: string;
  readonly scenario: string | null;
  readonly sujet: string | null;
  readonly corps: string | null;
  readonly centre: { readonly nom: string; readonly email: string };
}

export type VerdictGarde =
  | { readonly issue: 'ENVOI'; readonly message: MessageARelire | null }
  | { readonly issue: 'REPORT'; readonly creneau: Date }
  | { readonly issue: 'ABANDON' };

interface EntreeGarde {
  readonly client: ContexteTravail['client'];
  readonly messagePatientId: string | null;
  readonly opposition: boolean;
  readonly parametres: PlageEnvoi;
  readonly instant: Date;
}

/** L'événement annoncé tient-il toujours ? Un rendez-vous déplacé ou un essai conclu rend le message faux. */
async function encorePertinent(
  client: ContexteTravail['client'],
  message: {
    scenario: string | null;
    rendezVousId: string | null;
    rdvDebut: Date | null;
    entiteId: string | null;
  },
): Promise<boolean> {
  const { scenario, rendezVousId, rdvDebut, entiteId } = message;
  if (rendezVousId !== null && scenario !== 'ANNULATION_RDV') {
    const rdv = await client.rendezVous.findUnique({
      where: { id: rendezVousId },
      select: { statut: true, debut: true },
    });
    return (
      rdv !== null &&
      STATUTS_RDV_ACTIFS.includes(rdv.statut) &&
      rdv.debut.getTime() === rdvDebut?.getTime()
    );
  }
  if (scenario === 'RELANCE_DEVIS' && entiteId !== null) {
    const devis = await client.devis.findUnique({
      where: { id: entiteId },
      select: { statut: true },
    });
    return devis?.statut === 'EMIS';
  }
  if (scenario === 'FIN_ESSAI' && entiteId !== null) {
    const essai = await client.essai.findUnique({
      where: { id: entiteId },
      select: { issue: true },
    });
    return essai !== null && essai.issue === null;
  }
  return true;
}

async function clore(
  client: ContexteTravail['client'],
  id: string,
  statut: Extract<StatutMessage, 'BLOQUE' | 'EXPIRE'>,
  motif: string,
): Promise<VerdictGarde> {
  await client.messagePatient.update({ where: { id }, data: { statut, motif } });
  return { issue: 'ABANDON' };
}

/**
 * Dernier contrôle avant l'envoi, indépendant de ce qui valait à l'écriture du message : un patient a pu dire
 * STOP, retirer un consentement, un rendez-vous a pu bouger. L'opposition vaut pour toute ligne ; le reste, pour
 * les messages rattachés à un patient. Une ligne hors plage attend, sans compter comme une tentative.
 */
export async function gardeEnvoi(entree: EntreeGarde): Promise<VerdictGarde> {
  const { client, messagePatientId, opposition, parametres, instant } = entree;
  if (messagePatientId === null) {
    return opposition ? { issue: 'ABANDON' } : { issue: 'ENVOI', message: null };
  }
  const message = await client.messagePatient.findUniqueOrThrow({
    where: { id: messagePatientId },
    select: SELECTION,
  });
  if (message.statut !== 'A_ENVOYER') {
    return { issue: 'ABANDON' };
  }
  if (message.expireLe !== null && message.expireLe <= instant) {
    return clore(client, message.id, 'EXPIRE', 'PERIME');
  }
  if (!(await encorePertinent(client, message))) {
    return clore(client, message.id, 'EXPIRE', 'SANS_OBJET');
  }
  const patient = await client.patient.findUniqueOrThrow({
    where: { id: message.patientId },
    select: {
      telephone: true,
      email: true,
      adresseLigne1: true,
      codePostal: true,
      ville: true,
      consentementSms: true,
      consentementEmail: true,
      consentementCourrier: true,
      consentementSmsCommercial: true,
      consentementEmailCommercial: true,
      consentementCourrierCommercial: true,
    },
  });
  const decision = decisionEnvoi(patient, message.canal, message.finalite, opposition);
  if (!decision.autorise) {
    return clore(client, message.id, 'BLOQUE', decision.motif);
  }
  const creneau = prochainCreneau(parametres, instant.getTime());
  if (creneau === null) {
    return clore(client, message.id, 'EXPIRE', 'HORS_PLAGE');
  }
  if (creneau > instant.getTime()) {
    if (message.expireLe !== null && creneau >= message.expireLe.getTime()) {
      return clore(client, message.id, 'EXPIRE', 'HORS_PLAGE');
    }
    return { issue: 'REPORT', creneau: new Date(creneau) };
  }
  return { issue: 'ENVOI', message };
}
