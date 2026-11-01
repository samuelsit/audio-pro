import { randomUUID } from 'node:crypto';

import { clientPlateforme } from '@ha/db';
import {
  decisionEnvoi,
  localDepuisInstant,
  rendreLettreHtml,
  type DocumentStore,
  type Notifier,
  type PdfRenderer,
} from '@ha/domain';
import { z } from 'zod';

import type { FileTravaux } from '../file';
import { definirTravail, type ContexteTravail, type Travail } from '../travail';
import { SELECTION_PATIENT_MESSAGE } from './declencher-scenarios';

const TAILLE_LOT = 100;

const charge = z.object({});
type Charge = typeof charge;

export interface DependancesCourriers {
  readonly notifier: Notifier;
  readonly documents: DocumentStore;
  readonly pdf: PdfRenderer;
  readonly maintenant?: () => Date;
}

async function lotsAGenerer(client: ContexteTravail['client']): Promise<string[]> {
  const orphelins = await client.messagePatient.findMany({
    where: { canal: 'COURRIER', statut: 'A_IMPRIMER', lotCourrierId: null },
    select: { id: true, centreId: true },
    orderBy: { id: 'asc' },
    take: TAILLE_LOT,
  });
  for (const centreId of new Set(orphelins.map((m) => m.centreId))) {
    const lot = await client.lotCourrier.create({ data: { centreId, type: 'LETTRES' } });
    await client.messagePatient.updateMany({
      where: { id: { in: orphelins.filter((m) => m.centreId === centreId).map((m) => m.id) } },
      data: { lotCourrierId: lot.id },
    });
  }
  const lots = await client.lotCourrier.findMany({
    where: { statut: 'A_GENERER', type: 'LETTRES' },
    select: { id: true },
  });
  return lots.map((l) => l.id);
}

/**
 * Assemble les lettres dues par centre, en un PDF à imprimer. Une lettre fermée n'a pas de plage horaire ; le
 * consentement, lui, se relit ici. Rejouable : un lot resté à générer se reprend, ses lettres sont déjà rattachées.
 */
export function travailCourriers(dependances: DependancesCourriers): Travail<Charge> {
  const { notifier, documents, pdf, maintenant = () => new Date() } = dependances;
  return definirTravail({
    nom: 'generer-courriers',
    charge,
    async executer({ client }) {
      for (const lotId of await lotsAGenerer(client)) {
        const lot = await client.lotCourrier.findUniqueOrThrow({
          where: { id: lotId },
          select: {
            centre: {
              select: {
                nom: true,
                adresseLigne1: true,
                adresseLigne2: true,
                codePostal: true,
                ville: true,
                telephone: true,
                email: true,
                siret: true,
              },
            },
          },
        });
        const messages = await client.messagePatient.findMany({
          where: { lotCourrierId: lotId, statut: 'A_IMPRIMER' },
          select: { id: true, patientId: true, finalite: true, sujet: true, corps: true },
          orderBy: { id: 'asc' },
        });
        const patients = await client.patient.findMany({
          where: { id: { in: messages.map((m) => m.patientId) } },
          select: {
            ...SELECTION_PATIENT_MESSAGE,
            civilite: true,
            nomNaissance: true,
            nomUsage: true,
            adresseLigne2: true,
          },
        });
        const { centre } = lot;
        const instant = maintenant();
        const lettres: Uint8Array[] = [];
        for (const message of messages) {
          const patient = patients.find((p) => p.id === message.patientId);
          const decision = patient && decisionEnvoi(patient, 'COURRIER', message.finalite, false);
          if (!patient || !decision?.autorise) {
            await client.messagePatient.update({
              where: { id: message.id },
              data: {
                statut: 'BLOQUE',
                motif: decision && !decision.autorise ? decision.motif : 'SANS_ADRESSE',
                lotCourrierId: null,
              },
            });
            continue;
          }
          lettres.push(
            await pdf.rendre(
              rendreLettreHtml({
                centre: {
                  nom: centre.nom,
                  adresse: [
                    centre.adresseLigne1,
                    ...(centre.adresseLigne2 === null ? [] : [centre.adresseLigne2]),
                    `${centre.codePostal} ${centre.ville}`,
                  ],
                  telephone: centre.telephone,
                  email: centre.email,
                  siret: centre.siret ?? '',
                },
                destinataire: {
                  nom: `${patient.prenoms} ${patient.nomUsage ?? patient.nomNaissance}`,
                  adresse: [
                    patient.adresseLigne1 as string,
                    ...(patient.adresseLigne2 === null ? [] : [patient.adresseLigne2]),
                    `${patient.codePostal as string} ${patient.ville as string}`,
                  ],
                },
                lieu: centre.ville,
                date: localDepuisInstant(instant.getTime()).date,
                objet: z.string().parse(message.sujet),
                corps: z.string().parse(message.corps),
              }),
            ),
          );
        }
        if (lettres.length === 0) {
          await client.lotCourrier.update({
            where: { id: lotId },
            data: { statut: 'PRET', genereLe: instant },
          });
          continue;
        }
        const cleDocument = `courriers/${randomUUID()}`;
        await documents.put(cleDocument, await pdf.assembler(lettres), 'application/pdf');
        await notifier.envoyerCourrier({ cleDocument, lettres: lettres.length });
        await client.lotCourrier.update({
          where: { id: lotId },
          data: {
            statut: 'PRET',
            documentCle: cleDocument,
            lettres: lettres.length,
            genereLe: instant,
          },
        });
      }
    },
  });
}

export async function repartirCourriers(
  file: FileTravaux,
  travail: Travail<Charge>,
): Promise<void> {
  const enAttente = await clientPlateforme().$queryRaw<{ organisationId: string }[]>`
    SELECT DISTINCT organisation_id AS "organisationId" FROM message_patient
    WHERE canal = 'COURRIER' AND statut = 'A_IMPRIMER' AND lot_courrier_id IS NULL`;
  for (const { organisationId } of enAttente) {
    await file.envoyer(travail, { organisationId, cleIdempotence: 'courriers', charge: {} });
  }
}
