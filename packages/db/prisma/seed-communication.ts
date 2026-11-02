import type { PrismaClient } from '../src/generated/prisma/client';

// Communication de démonstration : deux rappels actifs, un modèle de campagne, quelques accords commerciaux.
// Aucun message : les envois se font par l'ouvrier, en simulation.

const MODELE_ID = '019a9300-0000-7000-8000-000000000001';
const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const PATIENTS_COMMERCIAL = 5;

export async function seedCommunication(db: PrismaClient, organisationId: string): Promise<void> {
  const parametres = {
    heureDebut: '09:00',
    heureFin: '19:00',
    jours: JOURS,
    feries: false,
    tarifSmsMillimes: 45,
    devisDelaiJours: 7,
    devisRelancesMax: 2,
    finEssaiAvanceJours: 7,
    controleAvanceJours: 30,
    garantieAvanceJours: 60,
    renouvellementFenetreJours: 30,
  };
  await db.parametresCommunication.upsert({
    where: { organisationId },
    create: { organisationId, ...parametres },
    update: parametres,
  });
  for (const scenario of ['RAPPEL_RDV_J2', 'RAPPEL_RDV_J1'] as const) {
    await db.reglageScenario.upsert({
      where: { organisationId_scenario: { organisationId, scenario } },
      create: { organisationId, scenario, actif: true, canaux: ['SMS', 'EMAIL'] },
      update: { actif: true, canaux: ['SMS', 'EMAIL'] },
    });
  }
  const modele = {
    nom: 'Invitation de démonstration',
    sujet: 'Votre centre vous invite',
    corpsEmail: 'Bonjour {prenom},\n\n{centre} vous invite à le contacter.\n\n{telephoneCentre}',
    corpsSms: '{prenom}, {centre} vous invite a le contacter. Contact : {lien}',
    corpsCourrier: null,
  };
  await db.modeleMessage.upsert({
    where: { id: MODELE_ID },
    create: { id: MODELE_ID, organisationId, ...modele },
    update: modele,
  });
  const patients = await db.patient.findMany({
    where: { organisationId, consentementSms: true, fusionneDansId: null },
    select: { id: true },
    orderBy: { id: 'asc' },
    take: PATIENTS_COMMERCIAL,
  });
  await db.patient.updateMany({
    where: { id: { in: patients.map((p) => p.id) } },
    data: { consentementSmsCommercial: true },
  });
}
