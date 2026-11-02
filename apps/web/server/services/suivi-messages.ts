import {
  centimesDepuisMillimes,
  peutConsulterCommunication,
  type CanalMessage,
  type FinaliteMessage,
  type OrigineConsentementMessage,
  type Perimetre,
  type ScenarioCommunication,
  type StatutMessage,
} from '@ha/domain';

import { AccesRefuseError, verifierPerimetre, type UtilisateurConnecte } from '../auth/acces';
import { base } from '../chiffrement';
import { centresDuPerimetre } from '../perimetre';
import { oppositionsDuPatient } from './consentements';
import { exigerPatient } from './garanties';

export interface LigneSuivi {
  readonly libelle: { scenario: ScenarioCommunication | null; campagne: string | null };
  readonly envoyes: number;
  readonly delivres: number;
  readonly echecs: number;
  readonly clics: number;
  readonly desinscriptions: number;
  readonly bloques: number;
}

export interface CoutCentre {
  readonly centre: string;
  readonly messages: number;
  readonly segments: number;
  readonly coutCentimes: number;
}

export interface SyntheseSuivi {
  readonly lignes: readonly LigneSuivi[];
  readonly couts: readonly CoutCentre[];
}

function borneMois(mois: string): { debut: Date; fin: Date } {
  const [annee, numero] = mois.split('-').map(Number) as [number, number];
  return {
    debut: new Date(Date.UTC(annee, numero - 1, 1)),
    fin: new Date(Date.UTC(annee, numero, 1)),
  };
}

/** Suivi d'un mois : des nombres, jamais un patient. Le coût vient du reçu du fournisseur. */
export async function syntheseSuivi(
  acteur: UtilisateurConnecte,
  perimetre: Perimetre,
  mois: string,
): Promise<SyntheseSuivi> {
  if (!peutConsulterCommunication(acteur.role)) {
    throw new AccesRefuseError();
  }
  verifierPerimetre(acteur, perimetre);
  const centres = centresDuPerimetre(acteur, perimetre);
  const { debut, fin } = borneMois(mois);
  const client = base(acteur);
  const messages = await client.messagePatient.findMany({
    where: {
      createdAt: { gte: debut, lt: fin },
      ...(centres === null ? {} : { centreId: { in: [...centres] } }),
    },
    select: {
      scenario: true,
      statut: true,
      canal: true,
      segments: true,
      coutMillimes: true,
      envoyeLe: true,
      clicLe: true,
      desinscritLe: true,
      centre: { select: { nom: true } },
      campagne: { select: { nom: true } },
    },
  });
  const lignes = new Map<string, LigneSuivi>();
  const couts = new Map<string, { messages: number; segments: number; millimes: number }>();
  for (const m of messages) {
    const cle = m.campagne?.nom ?? m.scenario ?? '';
    const ligne = lignes.get(cle) ?? {
      libelle: { scenario: m.scenario, campagne: m.campagne?.nom ?? null },
      envoyes: 0,
      delivres: 0,
      echecs: 0,
      clics: 0,
      desinscriptions: 0,
      bloques: 0,
    };
    lignes.set(cle, {
      ...ligne,
      envoyes: ligne.envoyes + (m.envoyeLe === null ? 0 : 1),
      delivres: ligne.delivres + (m.statut === 'DELIVRE' ? 1 : 0),
      echecs: ligne.echecs + (m.statut === 'ECHEC' ? 1 : 0),
      clics: ligne.clics + (m.clicLe === null ? 0 : 1),
      desinscriptions: ligne.desinscriptions + (m.desinscritLe === null ? 0 : 1),
      bloques: ligne.bloques + (m.statut === 'BLOQUE' ? 1 : 0),
    });
    if (m.canal === 'SMS' && m.envoyeLe !== null) {
      const cout = couts.get(m.centre.nom) ?? { messages: 0, segments: 0, millimes: 0 };
      couts.set(m.centre.nom, {
        messages: cout.messages + 1,
        segments: cout.segments + (m.segments ?? 0),
        millimes: cout.millimes + (m.coutMillimes ?? 0),
      });
    }
  }
  return {
    lignes: [...lignes.values()],
    couts: [...couts].map(([centre, c]) => ({
      centre,
      messages: c.messages,
      segments: c.segments,
      coutCentimes: centimesDepuisMillimes(c.millimes),
    })),
  };
}

export interface MessageHistorique {
  readonly id: string;
  readonly date: string;
  readonly canal: CanalMessage;
  readonly finalite: FinaliteMessage;
  readonly scenario: ScenarioCommunication | null;
  readonly campagne: string | null;
  readonly sujet: string | null;
  readonly statut: StatutMessage;
  readonly motif: string | null;
  readonly clicLe: string | null;
  readonly desinscritLe: string | null;
}

export interface EvenementHistorique {
  readonly id: string;
  readonly date: string;
  readonly canal: CanalMessage;
  readonly finalite: FinaliteMessage;
  readonly accorde: boolean;
  readonly origine: OrigineConsentementMessage;
  readonly auteur: string;
}

export interface HistoriquePatient {
  readonly messages: readonly MessageHistorique[];
  readonly evenements: readonly EvenementHistorique[];
  readonly oppositions: readonly CanalMessage[];
}

/** Historique de la fiche. L'appelant vient d'ouvrir la fiche : la ligne `READ` est déjà écrite. */
export async function historiquePatient(
  acteur: UtilisateurConnecte,
  patientId: string,
): Promise<HistoriquePatient> {
  const client = base(acteur);
  await exigerPatient(client, acteur, patientId);
  const fusionnes = await client.patient.findMany({
    where: { fusionneDansId: patientId },
    select: { id: true },
  });
  const patient = await client.patient.findUniqueOrThrow({
    where: { id: patientId },
    select: {
      telephone: true,
      email: true,
      adresseLigne1: true,
      codePostal: true,
      ville: true,
    },
  });
  const [messages, evenements, oppositions] = await Promise.all([
    client.messagePatient.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        createdAt: true,
        envoyeLe: true,
        canal: true,
        finalite: true,
        scenario: true,
        sujet: true,
        statut: true,
        motif: true,
        clicLe: true,
        desinscritLe: true,
        campagne: { select: { nom: true } },
      },
    }),
    // Le journal, immuable, garde l'ancienne fiche : l'affichage suit la fusion.
    client.evenementConsentement.findMany({
      where: { patientId: { in: [patientId, ...fusionnes.map((f) => f.id)] } },
      orderBy: { survenuLe: 'desc' },
      take: 200,
    }),
    oppositionsDuPatient(acteur, patient),
  ]);
  return {
    messages: messages.map((m) => ({
      id: m.id,
      date: (m.envoyeLe ?? m.createdAt).toISOString(),
      canal: m.canal,
      finalite: m.finalite,
      scenario: m.scenario,
      campagne: m.campagne?.nom ?? null,
      sujet: m.sujet,
      statut: m.statut,
      motif: m.motif,
      clicLe: m.clicLe?.toISOString() ?? null,
      desinscritLe: m.desinscritLe?.toISOString() ?? null,
    })),
    evenements: evenements.map((e) => ({
      id: e.id,
      date: e.survenuLe.toISOString(),
      canal: e.canal,
      finalite: e.finalite,
      accorde: e.accorde,
      origine: e.origine,
      auteur: e.auteur,
    })),
    oppositions,
  };
}
