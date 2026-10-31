import { prisma } from '@ha/db/admin';

import { base } from '@/server/chiffrement';
import { documents } from '@/server/documents';
import { enregistrerPec } from '@/server/services/factures';
import { aujourdhui } from '@/server/services/patients';

import { creerCatalogueDevis, dossierJusquAchat, identifierCentreA, SCAN } from './devis';
import { creerJeuDeDonnees } from './donnees';

/**
 * Un client fictif avec au moins une ligne dans chaque table métier : le parcours passe par les vrais
 * services, sous le rôle ha_app ; le reste est écrit directement.
 */
export async function creerClientComplet(suffixe: string) {
  const d = await creerJeuDeDonnees(suffixe);
  await identifierCentreA(d);
  const organisationId = d.organisation.id;
  const audio = d.acteurs.audioAB;
  const catalogue = await creerCatalogueDevis(d);
  const parcours = await dossierJusquAchat(d, audio, catalogue);
  const { dossierId, patientId } = parcours;
  const { id: essaiId } = await prisma().essai.findUniqueOrThrow({
    where: { dossierId },
    select: { id: true },
  });
  const { id: appareilId } = await prisma().appareil.findFirstOrThrow({
    where: { organisationId, numeroSerie: parcours.numeroSerie },
    select: { id: true },
  });
  const { id: prescriptionId } = await prisma().prescription.findFirstOrThrow({
    where: { dossierId },
    select: { id: true },
  });
  const { id: prescripteurId } = await prisma().prescripteur.findFirstOrThrow({
    where: { organisationId },
    select: { id: true },
  });
  const { id: fabricantId } = await prisma().fabricant.findFirstOrThrow({
    where: { organisationId },
    select: { id: true },
  });

  const utilisateurId = d.utilisateurs.admin.id;
  await prisma().couvertureAmc.create({ data: { patientId, organismeNom: 'Mutuelle fictive' } });
  await prisma().lectureVitale.create({
    data: { organisationId, utilisateurId, resultat: 'AUCUN_LECTEUR' },
  });
  await prisma().lppCode.upsert({
    where: { code: '2351057' },
    create: { code: '2351057' },
    update: {},
  });
  await prisma().modeleCodeLpp.createMany({
    data: [{ modeleId: catalogue.classeI, code: '2351057' }],
    skipDuplicates: true,
  });
  await prisma().stockAccessoire.create({
    data: { centreId: d.centres.a.id, accessoireId: catalogue.piles, quantite: 3 },
  });
  await base({ organisationId }).mouvementAccessoire.create({
    data: {
      organisationId,
      centreId: d.centres.a.id,
      accessoireId: catalogue.piles,
      type: 'ENTREE',
      quantite: 3,
      quantiteApres: 3,
      utilisateurId,
      motif: 'Réception fictive',
    },
  });
  await prisma().delivrance.create({
    data: {
      organisationId,
      patientId,
      oreille: 'DROITE',
      dateDelivrance: new Date('2026-01-05T00:00:00.000Z'),
      dossierId,
      origine: 'REPRISE',
    },
  });
  // Vrais fichiers : un refus ne doit pas pouvoir venir d'un document absent.
  const justificatifCle = `prolongations/${organisationId}`;
  await documents().put(justificatifCle, SCAN, 'application/pdf');
  await base({ organisationId }).prolongationEssai.create({
    data: {
      essaiId,
      dateDemande: new Date('2026-01-05T00:00:00.000Z'),
      jours: 15,
      motif: 'Prolongation fictive',
      justificatifCle,
      justificatifType: 'application/pdf',
      justificatifTaille: SCAN.length,
      createdById: utilisateurId,
    },
  });
  await enregistrerPec(
    audio,
    dossierId,
    {
      statut: 'ACCORDEE',
      organisme: 'Mutuelle fictive',
      plateforme: 'Plateforme fictive',
      numeroAccord: 'ACC-001',
      montantAccorde: '712,40',
      datePec: aujourdhui(),
    },
    SCAN,
  );
  await prisma().session.create({
    data: {
      token: `jeton${suffixe}`,
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      userId: utilisateurId,
    },
  });
  await prisma().compte.create({
    data: { accountId: utilisateurId, providerId: 'credential', userId: utilisateurId },
  });
  await prisma().deuxFacteurs.create({
    data: { secret: 'fictif', backupCodes: 'fictif', userId: utilisateurId },
  });

  return {
    d,
    catalogue,
    ...parcours,
    essaiId,
    appareilId,
    prescriptionId,
    prescripteurId,
    fabricantId,
  };
}

export type ClientComplet = Awaited<ReturnType<typeof creerClientComplet>>;
