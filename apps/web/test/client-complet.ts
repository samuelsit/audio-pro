import { FakeClock } from '@ha/adapters';
import { archiverCentre, cloturerCentre } from '@ha/caisse';
import { prisma } from '@ha/db/admin';
import { PARAMETRES_COMPTABLES_DEFAUT, PROFIL_ECRITURES_DEFAUT } from '@ha/domain';

import { base } from '@/server/chiffrement';
import { documents } from '@/server/documents';
import { creerRdv } from '@/server/services/agenda';
import {
  creerBilan,
  enregistrerFormulaire,
  enregistrerOtoscopie,
  enregistrerTonale,
} from '@/server/services/audiologie';
import { compterCaisse, ouvrirCaisse } from '@/server/services/caisse';
import {
  ajouterLigne,
  approuverCommande,
  creerCommande,
  obtenirCommande,
  soumettreCommande,
} from '@/server/services/commandes';
import { transmettreCommande } from '@/server/services/envoi-commandes';
import {
  deposerFacture,
  modifierFactureFournisseur,
} from '@/server/services/factures-fournisseurs';
import { pointerReception } from '@/server/services/reception-commande';
import { depsCaisse } from '@/server/services/chaine-caisse';
import { encaisserFacture } from '@/server/services/encaissements';
import { enregistrerPec } from '@/server/services/factures';
import { aujourdhui } from '@/server/services/patients';

import { confirmerCouvertureVente, validerFacture } from '@/server/services/facturation';
import {
  ajouterContact,
  creerCentrale,
  enregistrerComptes,
  enregistrerParametresCommande,
} from '@/server/services/fournisseurs';
import { preparerFse } from '@/server/services/fse';
import { enregistrerSeuil } from '@/server/services/reappro';
import { creerRegleCommande } from '@/server/services/regles-commande';
import { importerReleve } from '@/server/services/releves-centrale';
import {
  classerEcartReglement,
  enregistrerRejet,
  enregistrerReglement,
  lettrer,
} from '@/server/services/tiers-payant';

import { creerFournisseurDe } from './achats';
import { creerCatalogueDevis, dossierJusquAchat, identifierCentreA, SCAN } from './devis';
import { creerJeuDeDonnees } from './donnees';
import { venteDirecte } from './facturation';

const PHOTO_PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

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
  const { id: cabineId } = await prisma().cabine.create({
    data: { centreId: d.centres.a.id, nom: 'Cabine 1' },
  });
  const typeRdv = await prisma().typeRdv.create({
    data: {
      organisationId,
      nom: 'Bilan',
      dureeMinutes: 60,
      couleur: '#2563eb',
      requierePraticien: true,
      requiereCabine: true,
    },
  });
  const rdvId = await creerRdv(audio, {
    centreId: d.centres.a.id,
    typeRdvId: typeRdv.id,
    patientId,
    date: '2030-01-07',
    heure: '09:00',
    dureeMinutes: 60,
    praticienId: d.praticiens.praticienAB.id,
    origine: 'INTERNE',
    notes: 'Note fictive',
    confirmerHorsDisponibilites: true,
  });
  await prisma().exceptionAgenda.create({
    data: {
      organisationId,
      type: 'FERMETURE_CENTRE',
      centreId: d.centres.a.id,
      debut: new Date('2030-08-01T00:00:00.000Z'),
      fin: new Date('2030-08-02T00:00:00.000Z'),
      createdById: utilisateurId,
    },
  });
  await prisma().parametresReservation.create({
    data: {
      organisationId,
      centreId: d.centres.a.id,
      actif: true,
      delaiMinimalMinutes: 0,
      horizonJours: 30,
      validation: 'AUTOMATIQUE',
      delaiModificationHeures: 24,
    },
  });
  await prisma().typeRdvEnLigne.create({
    data: { organisationId, centreId: d.centres.a.id, typeRdvId: typeRdv.id },
  });
  const reservation = await prisma().reservationEnLigne.create({
    data: {
      organisationId,
      centreId: d.centres.a.id,
      typeRdvId: typeRdv.id,
      praticienId: d.praticiens.praticienAB.id,
      debut: new Date('2030-08-05T09:00:00.000Z'),
      fin: new Date('2030-08-05T09:30:00.000Z'),
      expireLe: new Date('2030-08-05T08:00:00.000Z'),
      jetonEmpreinte: `jeton-reservation${suffixe}`,
    },
  });
  await base({ organisationId }).notification.create({
    data: {
      organisationId,
      reservationId: reservation.id,
      canal: 'SMS',
      destinataire: '+33600000000',
      gabarit: 'RDV_CONFIRME',
      parametres: {},
      cleIdempotence: `cle${suffixe}`,
    },
  });
  const bilanId = await creerBilan(audio, patientId, { dateBilan: '2026-01-05' });
  await enregistrerTonale(audio, bilanId, {
    appareil: null,
    audiogramme: {
      droite: {
        aerienne: [{ frequence: 1000, seuil: 40, masque: null }],
        osseuse: [],
        inconfort: [],
      },
      gauche: { aerienne: [], osseuse: [], inconfort: [] },
    },
  });
  await enregistrerOtoscopie(
    audio,
    bilanId,
    { oreille: 'DROITE', conduit: 'LIBRE', tympan: 'NORMAL', observation: '' },
    PHOTO_PNG,
  );
  const { id: modeleFormulaireId } = await prisma().modeleFormulaire.findFirstOrThrow({
    where: { organisationId, nature: 'ANAMNESE' },
    select: { id: true },
  });
  await enregistrerFormulaire(audio, bilanId, modeleFormulaireId, {});
  await prisma().session.create({
    data: {
      token: `jeton${suffixe}`,
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      userId: utilisateurId,
    },
  });
  await prisma().lienDocument.create({
    data: {
      organisationId,
      dossierId: parcours.dossierId,
      patientId,
      cible: 'DEVIS',
      destinataire: 'PATIENT',
      pdfCle: `document${suffixe}`,
      expireLe: new Date('2099-01-01T00:00:00.000Z'),
      createdById: utilisateurId,
    },
  });
  await prisma().stockAccessoire.update({
    where: { centreId_accessoireId: { centreId: d.centres.a.id, accessoireId: catalogue.piles } },
    data: { quantite: 5 },
  });
  await prisma().prescripteur.update({
    where: { id: prescripteurId },
    data: { rpps: `1000000001${suffixe === '' ? '7' : '8'}` },
  });
  const venteId = await venteDirecte(d, audio, patientId, catalogue.piles, prescriptionId);
  await confirmerCouvertureVente(audio, venteId);
  await validerFacture(audio, venteId);
  await preparerFse(audio, venteId);
  await ouvrirCaisse(audio, d.centres.a.id, { fond: '10', justification: '' });
  await encaisserFacture(audio, venteId, {
    mode: 'ESPECES',
    montant: '1,00',
    remis: '',
    reference: '',
    partenaire: '',
    echeances: '',
  });
  const { id: complementaireId } = await prisma().complementaire.create({
    data: { organisationId, nom: 'Mutuelle fictive', identifiant: 'AMC-TEST' },
  });
  const { id: creanceId } = await prisma().creance.create({
    data: {
      organisationId,
      centreId: d.centres.a.id,
      factureId: venteId,
      patientId,
      type: 'AMC',
      complementaireId,
      organisme: 'Mutuelle fictive',
      montantCentimes: 100,
      soldeCentimes: 100,
      dateEmission: new Date('2026-01-05T00:00:00.000Z'),
      echeanceAttendue: new Date('2026-02-05T00:00:00.000Z'),
    },
  });
  const reglementId = await enregistrerReglement(audio, d.centres.a.id, {
    complementaireId,
    dateReglement: aujourdhui(),
    reference: `VIR-TEST${suffixe}`,
    partAmc: '1,00',
  });
  await lettrer(audio, reglementId, { imputations: [{ creanceId, montant: '0,50' }] });
  await classerEcartReglement(d.acteurs.admin, reglementId, {
    montant: '0,10',
    motif: 'Écart fictif',
    type: 'AMC',
  });
  await enregistrerRejet(audio, creanceId, {
    dateRejet: aujourdhui(),
    code: '',
    motif: 'Rejet fictif',
  });
  await compterCaisse(audio, d.centres.a.id, {
    comptees: '11',
    remiseBanque: '',
    justification: '',
  });
  // Un mois plus tard : la journée et le mois se clôturent, le mois s'archive.
  const plusTard = new FakeClock(new Date(Date.now() + 45 * 86_400_000).toISOString());
  const depsPlusTard = { ...depsCaisse(audio), horloge: plusTard };
  await cloturerCentre(depsPlusTard, d.centres.a.id);
  await archiverCentre(depsPlusTard, documents(), d.centres.a.id);
  await prisma().parametresComptables.create({
    data: {
      centreId: d.centres.a.id,
      organisationId,
      comptes: { ...PARAMETRES_COMPTABLES_DEFAUT },
      profil: { ...PROFIL_ECRITURES_DEFAUT },
    },
  });
  const inventaire = await prisma().inventaire.create({
    data: { organisationId, centreId: d.centres.a.id, ouvertParId: utilisateurId },
  });
  await prisma().inventaireLigne.create({
    data: { organisationId, inventaireId: inventaire.id, numeroSerie: 'INVENTAIRE1' },
  });
  await prisma().compte.create({
    data: { accountId: utilisateurId, providerId: 'credential', userId: utilisateurId },
  });
  await prisma().deuxFacteurs.create({
    data: { secret: 'fictif', backupCodes: 'fictif', userId: utilisateurId },
  });

  const centraleId = await creerCentrale(d.acteurs.admin, { nom: 'Centrale fictive', actif: true });
  const fournisseur = await creerFournisseurDe(organisationId, fabricantId);
  await prisma().fournisseur.update({
    where: { id: fournisseur.id },
    data: { centraleAchatId: centraleId },
  });
  await ajouterContact(d.acteurs.admin, fournisseur.id, { nom: 'Contact fictif' });
  await enregistrerComptes(d.acteurs.admin, fournisseur.id, [
    { centreId: d.centres.a.id, numeroClient: 'CLIENT-A' },
  ]);
  await enregistrerParametresCommande(d.acteurs.admin, {
    delaiRelanceJours: '3',
    relancesMax: '2',
    tolerancePrix: '0',
  });

  const regleCommandeId = await creerRegleCommande(d.acteurs.admin, {
    libelle: 'Règle fictive',
    priorite: '10',
    decision: 'APPROBATION',
    actif: true,
  });
  const commandeId = await creerCommande(d.acteurs.admin, {
    centreId: d.centres.a.id,
    fournisseurId: fournisseur.id,
  });
  await ajouterLigne(d.acteurs.admin, commandeId, {
    produit: `modele:${catalogue.classeI}`,
    quantite: '1',
    enConsignation: false,
    patientId,
  });
  const commandeRecueId = await creerCommande(d.acteurs.admin, {
    centreId: d.centres.a.id,
    fournisseurId: fournisseur.id,
  });
  await ajouterLigne(d.acteurs.admin, commandeRecueId, {
    produit: `modele:${catalogue.classeI}`,
    quantite: '1',
    enConsignation: false,
  });
  await soumettreCommande(d.acteurs.admin, commandeRecueId);
  await approuverCommande(d.acteurs.admin, commandeRecueId);
  await transmettreCommande(d.acteurs.admin, commandeRecueId);
  const { lignes } = await obtenirCommande(d.acteurs.admin, commandeRecueId);
  await pointerReception(d.acteurs.admin, commandeRecueId, {
    dateReception: aujourdhui(),
    referenceBonLivraison: 'BL-FICTIF',
    lignes: [
      {
        ligneId: lignes[0]?.id,
        quantite: '0',
        numerosSerie: [`SERIE-COMMANDE${suffixe}`],
        quantiteNonConforme: '1',
        commentaire: 'Écart fictif',
      },
    ],
  });
  const { id: ecartId } = await prisma().ecartAchat.findFirstOrThrow({
    where: { organisationId },
    select: { id: true },
  });
  const factureFournisseurId = await deposerFacture(
    d.acteurs.admin,
    Buffer.from(`%PDF-1.7 fictif${suffixe}`),
  );
  await modifierFactureFournisseur(d.acteurs.admin, factureFournisseurId, {
    lignes: [{ designation: 'Ligne fictive', quantite: '1', prixUnitaireCentimes: '10,00' }],
  });
  const releveId = await importerReleve(
    d.acteurs.admin,
    {
      centraleAchatId: centraleId,
      mois: '2030-01',
      csv: 'numero_facture;fournisseur;date;montant_ttc\nFA-FICTIVE;Fictif;2030-01-07;10,00',
    },
    null,
  );
  await enregistrerSeuil(d.acteurs.admin, {
    centreId: d.centres.a.id,
    produit: `modele:${catalogue.classeI}`,
    minimum: '1',
    cible: '2',
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
    centraleId,
    fournisseurId: fournisseur.id,
    regleCommandeId,
    commandeId,
    commandeRecueId,
    ecartId,
    factureFournisseurId,
    releveId,
    cabineId,
    venteId,
    complementaireId,
    creanceId,
    reglementId,
    typeRdvId: typeRdv.id,
    rdvId,
    reservationId: reservation.id,
    bilanId,
  };
}

export type ClientComplet = Awaited<ReturnType<typeof creerClientComplet>>;
