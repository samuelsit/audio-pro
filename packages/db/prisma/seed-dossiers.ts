import { chargerTrousseau, ChiffreurAesGcm } from '@ha/adapters';

import type { PrismaClient } from '../src/generated/prisma/client';

// Dossiers fictifs : un brouillon en renouvellement et une délivrance droite vieille de 2 ans, pour
// montrer le refus à moins de 4 ans ; un essai à une semaine de son échéance, pour l'écran « Essais en
// cours » ; un dossier à facturer, bloqué faute de prise en charge, pour la file « À facturer ». Aucun scan
// ni PDF : le seed ne touche pas au stockage de documents, ces documents s'ouvrent donc sur une erreur 404.
// Le dossier en essai n'a pas de devis : il sert à montrer l'essai, pas à le signer.
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

/** Patiente du seed, centre Nord, avec une complémentaire et sans autre dossier. */
const PATIENT_A_FACTURER = '019a3000-0000-7000-8000-000000000501';
const PRIX_A_FACTURER = 95_000;
const AMO_A_FACTURER = 24_000;
const HT_A_FACTURER = 90_047;
const TVA_AIDE = 550;

const DOSSIER_A_FACTURER = '019a7000-0000-7000-8000-000000000007';
const PRESCRIPTION_A_FACTURER = '019a7000-0000-7000-8000-000000000008';
const DEVIS_A_FACTURER = '019a7000-0000-7000-8000-000000000009';
const ESSAI_A_FACTURER = '019a7000-0000-7000-8000-00000000000a';
const FACTURE_A_FACTURER = '019a7000-0000-7000-8000-00000000000b';

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

export const NOMBRE_DOSSIERS_DEMO = 3;

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

/** Sans mise à jour, comme l'essai. Le devis s'écrit en brouillon, seul état où ses lignes s'ajoutent. */
async function seedAFacturer(
  db: PrismaClient,
  organisationId: string,
  centreId: string,
  utilisateurId: string,
  chiffreur: ChiffreurAesGcm,
): Promise<void> {
  const appareil = await db.appareil.findFirst({
    where: {
      centreId,
      statut: 'EN_STOCK',
      numeroSerie: { not: NUMERO_SERIE_ESSAI },
      modele: { classe: 'CLASSE_I' },
    },
    orderBy: { numeroSerie: 'desc' },
    select: {
      id: true,
      modeleId: true,
      fabricant: { select: { nom: true, adresse: true, mandataire: true } },
      modele: true,
    },
  });
  const existante = await db.facturePreparee.findUnique({
    where: { id: FACTURE_A_FACTURER },
    select: { id: true },
  });
  if (!appareil || existante) {
    return;
  }
  const { modele, fabricant } = appareil;
  const debut = ilYaJours(40);
  const achat = ilYaJours(3);
  const poste = {
    ht: HT_A_FACTURER,
    htApresRemise: HT_A_FACTURER,
    ttc: PRIX_A_FACTURER,
    amo: AMO_A_FACTURER,
    amc: null,
    resteACharge: null,
    resteApresAMO: PRIX_A_FACTURER - AMO_A_FACTURER,
  };
  await db.dossier.create({
    data: {
      id: DOSSIER_A_FACTURER,
      organisationId,
      patientId: PATIENT_A_FACTURER,
      centreId,
      praticienId: PRATICIEN_DEMO,
      statut: 'A_FACTURER',
      oreilles: 'DROITE',
      typeDroite: 'PRIMO',
      dateOuverture: ilYaJours(50),
      surdicecite: chiffreur.chiffrer('NON', CONTEXTE_SURDICECITE),
    },
  });
  await db.transitionDossier.create({
    data: { dossierId: DOSSIER_A_FACTURER, statutApres: 'A_FACTURER', utilisateurId },
  });
  await db.prescription.create({
    data: {
      id: PRESCRIPTION_A_FACTURER,
      dossierId: DOSSIER_A_FACTURER,
      prescripteurId: PRESCRIPTEURS[0].id,
      datePrescription: ilYaJours(50),
      oreilles: 'DROITE',
      mentionRenouvellement: false,
      scanCle: 'seed/ordonnance-a-facturer-absente',
      scanType: 'application/pdf',
      scanTaille: 1,
      controles: { erreursForcees: [], avertissements: [], refusRenouvellement: [] },
      createdById: utilisateurId,
    },
  });
  await db.devis.create({
    data: {
      id: DEVIS_A_FACTURER,
      organisationId,
      dossierId: DOSSIER_A_FACTURER,
      numero: '2026-900001',
      version: 1,
      lieuEmission: 'Lille',
      validiteMois: 2,
      tauxAmo: 60,
      refusOffreC2S: false,
      contratResponsable: true,
      bobineTPresentee: true,
      ficheTechniqueJointe: true,
      createdById: utilisateurId,
    },
  });
  const { id: offreId } = await db.devisOffre.create({
    data: { devisId: DEVIS_A_FACTURER, rubrique: 'OFFRE_100_SANTE', amcDroiteCentimes: 71_000 },
    select: { id: true },
  });
  await db.devisLigne.create({
    data: {
      offreId,
      ordre: 1,
      nature: 'AIDE_AUDITIVE',
      oreille: 'DROITE',
      classe: modele.classe,
      modeleId: modele.id,
      quantite: 1,
      prixUnitaireAvantRemiseCentimes: PRIX_A_FACTURER,
      prixUnitaireCentimes: PRIX_A_FACTURER,
      tauxTva: TVA_AIDE,
      designation: {
        fabricant: fabricant.nom,
        adresseFabricant: fabricant.adresse,
        mandataire: fabricant.mandataire,
        marque: modele.marque,
        gamme: modele.gamme,
        modele: modele.nom,
        referenceCommerciale: modele.referenceCommerciale,
        lieuFabrication: modele.lieuFabrication,
        type: modele.type,
        classe: modele.classe,
        nombreCanaux: modele.nombreCanaux,
        connectivite: modele.connectivite,
        antiLarsen: modele.antiLarsen,
        reducteurAcouphenes: modele.reducteurAcouphenes,
        bobineT: modele.bobineT,
        options: modele.options,
      },
    },
  });
  await db.devis.update({
    where: { id: DEVIS_A_FACTURER },
    data: {
      statut: 'SIGNE',
      dateEmission: ilYaJours(45),
      dateFinValidite: ilYaJours(0),
      pdfCle: 'seed/devis-a-facturer-absent',
      pdfTaille: 1,
      emisParId: utilisateurId,
      offreEssai: 'OFFRE_100_SANTE',
      offreRetenue: 'OFFRE_100_SANTE',
      totaux: {
        offres: [
          {
            rubrique: 'OFFRE_100_SANTE',
            droite: { ...poste, base: 40_000, plafond: PRIX_A_FACTURER },
            gauche: null,
            consommables: null,
            total: poste,
          },
        ],
        dateDelivrancePrevue: ilYaJours(15).toISOString().slice(0, 10),
        finGarantieMinimale: '2030-10-01',
      },
    },
  });
  await db.signatureDevis.create({
    data: {
      devisId: DEVIS_A_FACTURER,
      mode: 'SCAN',
      dateSignature: achat,
      saisieParId: utilisateurId,
      scanCle: 'seed/devis-signe-absent',
      scanType: 'application/pdf',
      scanTaille: 1,
    },
  });
  await db.essai.create({
    data: {
      id: ESSAI_A_FACTURER,
      organisationId,
      dossierId: DOSSIER_A_FACTURER,
      dateDebut: debut,
      issue: 'ACHAT',
      dateFin: achat,
      createdById: utilisateurId,
    },
  });
  await db.essaiAppareil.create({
    data: {
      essaiId: ESSAI_A_FACTURER,
      appareilId: appareil.id,
      oreille: 'DROITE',
      poseLe: debut,
      poseParId: utilisateurId,
    },
  });
  for (const [type, date] of [
    ['POSE', debut],
    ['FIN_ESSAI', achat],
  ] as const) {
    await db.essaiRdv.create({
      data: {
        essaiId: ESSAI_A_FACTURER,
        date,
        type,
        compteRendu: chiffreur.chiffrer('Rendez-vous fictif', CONTEXTE_COMPTE_RENDU),
        createdById: utilisateurId,
      },
    });
  }
  await db.appareil.update({
    where: { id: appareil.id },
    data: { statut: 'RESERVE', patientId: PATIENT_A_FACTURER },
  });
  await db.mouvementAppareil.create({
    data: {
      organisationId,
      appareilId: appareil.id,
      type: 'CHANGEMENT_STATUT',
      utilisateurId,
      statutAvant: 'EN_STOCK',
      statutApres: 'RESERVE',
      centreAvantId: centreId,
      centreApresId: centreId,
      patientId: PATIENT_A_FACTURER,
      dossierId: DOSSIER_A_FACTURER,
      motif: chiffreur.chiffrer('Achat confirmé à l’issue de l’essai', CONTEXTE_MOTIF),
    },
  });
  await db.facturePreparee.create({
    data: {
      id: FACTURE_A_FACTURER,
      organisationId,
      dossierId: DOSSIER_A_FACTURER,
      dateDelivrance: achat,
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
  await seedAFacturer(db, organisationId, centreId, utilisateurId, chiffreur);
}
