import { chargerTrousseau, ChiffreurAesGcm } from '@ha/adapters';
import {
  MODELES_PAR_DEFAUT,
  VERSION_SCHEMA_MESURE,
  type Audiogramme,
  type PointAudiogramme,
} from '@ha/domain';

import type { PrismaClient } from '../src/generated/prisma/client';

// Deux bilans fictifs à deux ans d'écart, pour montrer la superposition et l'évolution.
// Le seed écrit sans l'extension Prisma de l'application : il chiffre lui-même, avec le même contexte que
// apps/web/server/chiffrement.ts.

const CONTEXTE_DONNEES = 'mesure_audiologique.donnees';

/** Patient du seed : Michel Lefebvre, centre Nord. */
const PATIENT_DEMO = '019a3000-0000-7000-8000-000000000506';
const PRATICIEN_DEMO = '019a3000-0000-7000-8000-000000000301';

const BILANS = [
  {
    id: '019a8000-0000-7000-8000-000000000001',
    mesureId: '019a8000-0000-7000-8000-000000000011',
    date: '2024-03-12',
    droite: [15, 20, 25, 30, 45],
    gauche: [15, 20, 30, 35, 50],
  },
  {
    id: '019a8000-0000-7000-8000-000000000002',
    mesureId: '019a8000-0000-7000-8000-000000000012',
    date: '2026-03-10',
    droite: [20, 25, 35, 45, 60],
    gauche: [20, 30, 40, 50, 65],
  },
] as const;

function aerienne(seuils: readonly [number, number, number, number, number]): PointAudiogramme[] {
  const frequences = [250, 500, 1000, 2000, 4000] as const;
  return frequences.map((frequence, i) => ({
    frequence,
    seuil: seuils[i] ?? null,
    masque: null,
  }));
}

export async function seedAudiologie(
  db: PrismaClient,
  organisationId: string,
  centreId: string,
  utilisateurId: string,
): Promise<void> {
  const chiffreur = new ChiffreurAesGcm(chargerTrousseau(process.env));
  for (const { code, nature, nom, definition } of MODELES_PAR_DEFAUT) {
    await db.modeleFormulaire.upsert({
      where: { organisationId_code_version: { organisationId, code, version: 1 } },
      create: { organisationId, code, version: 1, nature, nom, definition },
      update: {},
    });
  }
  for (const bilan of BILANS) {
    const dateBilan = new Date(`${bilan.date}T00:00:00.000Z`);
    await db.bilanAudiologique.upsert({
      where: { id: bilan.id },
      create: {
        id: bilan.id,
        organisationId,
        patientId: PATIENT_DEMO,
        centreId,
        praticienId: PRATICIEN_DEMO,
        dateBilan,
        createdById: utilisateurId,
      },
      update: {},
    });
    const audiogramme: Audiogramme = {
      droite: { aerienne: aerienne(bilan.droite), osseuse: [], inconfort: [] },
      gauche: { aerienne: aerienne(bilan.gauche), osseuse: [], inconfort: [] },
    };
    await db.mesureAudiologique.upsert({
      where: { id: bilan.mesureId },
      create: {
        id: bilan.mesureId,
        organisationId,
        bilanId: bilan.id,
        type: 'TONALE',
        mesureLe: dateBilan,
        appareil: 'Audiomètre de démonstration',
        donnees: chiffreur.chiffrer(JSON.stringify(audiogramme), CONTEXTE_DONNEES),
        versionSchema: VERSION_SCHEMA_MESURE,
        auteurId: utilisateurId,
      },
      update: {},
    });
  }
}
