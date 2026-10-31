import { chargerTrousseau, ChiffreurAesGcm } from '@ha/adapters';

import type { PrismaClient } from '../src/generated/prisma/client';

// Dossiers fictifs : un brouillon en renouvellement et une délivrance droite vieille de 2 ans, pour
// montrer le refus à moins de 4 ans ; un essai à une semaine de son échéance, pour l'écran « Essais en
// cours ». Aucun scan : le seed ne touche pas au stockage de documents, l'ordonnance de l'essai s'ouvre
// donc sur une erreur 404, et ce dossier n'a pas de devis : il sert à montrer l'essai, pas à le signer.
// Le seed écrit sans l'extension Prisma de l'application : il chiffre lui-même, avec le même contexte que
// apps/web/server/chiffrement.ts.

const CONTEXTE_SURDICECITE = 'dossier.surdicecite';
const CONTEXTE_MOTIF = 'mouvement_appareil.motif';
const CONTEXTE_COMPTE_RENDU = 'essai_rdv.compte_rendu';

/** Patient et praticien du seed : Michel Lefebvre, centre Nord, Camille Audio. */
const PATIENT_DEMO = '019a3000-0000-7000-8000-000000000506';
const PRATICIEN_DEMO = '019a3000-0000-7000-8000-000000000301';

const DOSSIER_DEMO = '019a7000-0000-7000-8000-000000000001';
const TRANSITION_DEMO = '019a7000-0000-7000-8000-000000000002';
const DELIVRANCE_DEMO = '019a7000-0000-7000-8000-000000000003';

/** Patient du seed, centre Nord, sans autre dossier ; appareil du stock de ce centre. */
const PATIENT_ESSAI = '019a3000-0000-7000-8000-000000000505';
const NUMERO_SERIE_ESSAI = 'DEMO000004';
const JOURS_ECOULES_ESSAI = 23;

const DOSSIER_ESSAI = '019a7000-0000-7000-8000-000000000004';
const PRESCRIPTION_ESSAI = '019a7000-0000-7000-8000-000000000005';
const ESSAI_DEMO = '019a7000-0000-7000-8000-000000000006';

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

export const NOMBRE_DOSSIERS_DEMO = 2;

/** Date du jour moins deux ans (seed, hors domaine) : la démonstration ne vieillit pas. */
function ilYaDeuxAns(): Date {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - 2);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function ilYaJours(jours: number): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - jours);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

/** Sans mise à jour : un essai avancé ou un appareil déplacé en démonstration garde son état. */
async function seedEssai(
  db: PrismaClient,
  organisationId: string,
  centreId: string,
  utilisateurId: string,
  chiffreur: ChiffreurAesGcm,
): Promise<void> {
  const appareil = await db.appareil.findFirst({
    where: { centreId, numeroSerie: NUMERO_SERIE_ESSAI, statut: 'EN_STOCK' },
    select: { id: true },
  });
  const existant = await db.essai.findUnique({ where: { id: ESSAI_DEMO }, select: { id: true } });
  if (!appareil || existant) {
    return;
  }
  const debut = ilYaJours(JOURS_ECOULES_ESSAI);
  await db.dossier.create({
    data: {
      id: DOSSIER_ESSAI,
      organisationId,
      patientId: PATIENT_ESSAI,
      centreId,
      praticienId: PRATICIEN_DEMO,
      statut: 'EN_ESSAI',
      oreilles: 'DROITE',
      typeDroite: 'PRIMO',
      dateOuverture: ilYaJours(JOURS_ECOULES_ESSAI + 7),
      surdicecite: chiffreur.chiffrer('NON', CONTEXTE_SURDICECITE),
    },
  });
  await db.transitionDossier.create({
    data: { dossierId: DOSSIER_ESSAI, statutApres: 'EN_ESSAI', utilisateurId },
  });
  await db.prescription.create({
    data: {
      id: PRESCRIPTION_ESSAI,
      dossierId: DOSSIER_ESSAI,
      prescripteurId: PRESCRIPTEURS[0].id,
      datePrescription: ilYaJours(JOURS_ECOULES_ESSAI + 7),
      oreilles: 'DROITE',
      mentionRenouvellement: false,
      scanCle: 'seed/ordonnance-absente',
      scanType: 'application/pdf',
      scanTaille: 1,
      controles: { erreursForcees: [], avertissements: [], refusRenouvellement: [] },
      createdById: utilisateurId,
    },
  });
  await db.essai.create({
    data: {
      id: ESSAI_DEMO,
      organisationId,
      dossierId: DOSSIER_ESSAI,
      dateDebut: debut,
      createdById: utilisateurId,
    },
  });
  await db.essaiAppareil.create({
    data: {
      essaiId: ESSAI_DEMO,
      appareilId: appareil.id,
      oreille: 'DROITE',
      poseLe: debut,
      poseParId: utilisateurId,
    },
  });
  await db.appareil.update({
    where: { id: appareil.id },
    data: { statut: 'EN_ESSAI', patientId: PATIENT_ESSAI },
  });
  await db.mouvementAppareil.create({
    data: {
      organisationId,
      appareilId: appareil.id,
      type: 'CHANGEMENT_STATUT',
      utilisateurId,
      statutAvant: 'EN_STOCK',
      statutApres: 'EN_ESSAI',
      centreAvantId: centreId,
      centreApresId: centreId,
      patientId: PATIENT_ESSAI,
      dossierId: DOSSIER_ESSAI,
      motif: chiffreur.chiffrer('Mise en essai', CONTEXTE_MOTIF),
    },
  });
  await db.essaiRdv.create({
    data: {
      essaiId: ESSAI_DEMO,
      date: debut,
      type: 'POSE',
      compteRendu: chiffreur.chiffrer('Pose et premiers réglages', CONTEXTE_COMPTE_RENDU),
      createdById: utilisateurId,
    },
  });
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
  await seedEssai(db, organisationId, centreId, utilisateurId, chiffreur);
}
