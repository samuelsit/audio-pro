import { chargerTrousseau, ChiffreurAesGcm } from '@ha/adapters';

import type { PrismaClient } from '../src/generated/prisma/client';

// Dossiers fictifs : un brouillon en renouvellement et une délivrance droite vieille de 2 ans, pour
// montrer le refus à moins de 4 ans. Aucun scan : le seed ne touche pas au stockage de documents.
// Le seed écrit sans l'extension Prisma de l'application : il chiffre lui-même, avec le même contexte que
// apps/web/server/chiffrement.ts.

const CONTEXTE_SURDICECITE = 'dossier.surdicecite';

/** Patient et praticien du seed : Michel Lefebvre, centre Nord, Camille Audio. */
const PATIENT_DEMO = '019a3000-0000-7000-8000-000000000506';
const PRATICIEN_DEMO = '019a3000-0000-7000-8000-000000000301';

const DOSSIER_DEMO = '019a7000-0000-7000-8000-000000000001';
const TRANSITION_DEMO = '019a7000-0000-7000-8000-000000000002';
const DELIVRANCE_DEMO = '019a7000-0000-7000-8000-000000000003';

const PRESCRIPTEURS = [
  {
    id: '019a7000-0000-7000-8000-000000000101',
    nom: 'Démo',
    prenom: 'Agathe',
    rpps: '10000000017',
    specialite: 'ORL',
    formationOtologie: null,
    nomRecherche: 'DEMO',
    prenomRecherche: 'AGATHE',
  },
  {
    id: '019a7000-0000-7000-8000-000000000102',
    nom: 'Fictif',
    prenom: 'Bruno',
    rpps: null,
    specialite: 'MEDECIN_GENERALISTE',
    formationOtologie: true,
    nomRecherche: 'FICTIF',
    prenomRecherche: 'BRUNO',
  },
] as const;

export const NOMBRE_DOSSIERS_DEMO = 1;

/** Date du jour moins deux ans (seed, hors domaine) : la démonstration ne vieillit pas. */
function ilYaDeuxAns(): Date {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - 2);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

export async function seedDossiers(
  db: PrismaClient,
  organisationId: string,
  centreId: string,
  utilisateurId: string,
): Promise<void> {
  const chiffreur = new ChiffreurAesGcm(chargerTrousseau(process.env));
  for (const prescripteur of PRESCRIPTEURS) {
    const donnees = { ...prescripteur, organisationId };
    await db.prescripteur.upsert({
      where: { id: prescripteur.id },
      create: donnees,
      update: donnees,
    });
  }

  // Sans mise à jour : un dossier avancé en démonstration garde son état.
  await db.dossier.createMany({
    data: [
      {
        id: DOSSIER_DEMO,
        organisationId,
        patientId: PATIENT_DEMO,
        centreId,
        praticienId: PRATICIEN_DEMO,
        oreilles: 'DROITE',
        typeDroite: 'RENOUVELLEMENT',
        dateOuverture: new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`),
        surdicecite: chiffreur.chiffrer('NON', CONTEXTE_SURDICECITE),
      },
    ],
    skipDuplicates: true,
  });
  await db.transitionDossier.createMany({
    data: [
      { id: TRANSITION_DEMO, dossierId: DOSSIER_DEMO, statutApres: 'BROUILLON', utilisateurId },
    ],
    skipDuplicates: true,
  });
  await db.delivrance.createMany({
    data: [
      {
        id: DELIVRANCE_DEMO,
        organisationId,
        patientId: PATIENT_DEMO,
        oreille: 'DROITE',
        dateDelivrance: ilYaDeuxAns(),
        origine: 'REPRISE',
      },
    ],
    skipDuplicates: true,
  });
}
