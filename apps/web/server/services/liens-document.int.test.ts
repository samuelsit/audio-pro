import path from 'node:path';

import { SignatureLienDocument, type FakeDocumentStore } from '@ha/adapters';
import { prisma } from '@ha/db/admin';
import { TENTATIVES_MAX_LIEN_DOCUMENT } from '@ha/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  creerCatalogueDevis,
  dossierJusquAchat,
  identifierCentreA,
  type CatalogueDevis,
} from '@/test/devis';
import { creerJeuDeDonnees, viderBase, type JeuDeDonnees } from '@/test/donnees';

import { AccesRefuseError, type UtilisateurConnecte } from '../auth/acces';
import { stockageBrut } from '../documents';
import { ErreurSaisie } from '../erreurs';
import { importerLpp } from '../lpp/importer';
import { signatureLienDocument } from '../reservation-empreintes';
import {
  envoyerCompteRenduAuPrescripteur,
  envoyerDevisAuPatient,
  lienDocumentOuvrable,
  listerLiensDocument,
  ouvrirDocument,
  revoquerLien,
} from './liens-document';

const V908 = path.join(import.meta.dirname, '../../../../fixtures/lpp/908');
const NAISSANCE = '1950-03-12';
const IP = '192.0.2.1';

let d: JeuDeDonnees;
let audio: UtilisateurConnecte;
let assistantB: UtilisateurConnecte;
let catalogue: CatalogueDevis;
let dossierId: string;
let devisId: string;
let patientId: string;

const stockage = () => stockageBrut() as FakeDocumentStore;

async function jeton(lienId: string): Promise<string> {
  return signatureLienDocument().signer({ organisationId: d.organisation.id, lienId });
}

async function dernierLien() {
  return prisma().lienDocument.findFirstOrThrow({ orderBy: { createdAt: 'desc' } });
}

async function devisEnvoye(): Promise<string> {
  await envoyerDevisAuPatient(audio, devisId, { canal: 'EMAIL' });
  return jeton((await dernierLien()).id);
}

beforeEach(async () => {
  await viderBase();
  stockage().objets.clear();
  d = await creerJeuDeDonnees();
  audio = d.acteurs.audioAB;
  assistantB = d.acteurs.assistantB;
  await identifierCentreA(d);
  await importerLpp(V908);
  catalogue = await creerCatalogueDevis(d);
  ({ dossierId, devisId, patientId } = await dossierJusquAchat(d, audio, catalogue));
  await prisma().patient.update({
    where: { id: patientId },
    data: {
      dateNaissance: new Date(`${NAISSANCE}T00:00:00.000Z`),
      email: 'alex@exemple.test',
      consentementEmail: true,
      telephone: '+33600000000',
      consentementSms: false,
    },
  });
});

describe('envoi du devis', () => {
  it('crée un lien de 7 jours et un message sans donnée de santé', async () => {
    await devisEnvoye();
    const lien = await dernierLien();
    expect(lien).toMatchObject({ dossierId, cible: 'DEVIS', destinataire: 'PATIENT' });
    expect(lien.expireLe.getTime() - lien.createdAt.getTime()).toBeLessThan(8 * 86_400_000);
    const notification = await prisma().notification.findFirstOrThrow({
      where: { lienDocumentId: lien.id },
    });
    expect(notification).toMatchObject({ gabarit: 'DOCUMENT_A_CONSULTER', canal: 'EMAIL' });
    expect(notification.destinataire).toMatch(/^v1\./);
    expect(JSON.stringify(notification.parametres)).not.toMatch(/devis|appareil/i);
    const journal = await prisma().journalAudit.findFirstOrThrow({ where: { action: 'SEND' } });
    expect(journal).toMatchObject({ entiteType: 'DEVIS', entiteId: devisId, patientId });
  });

  it('envoie le devis signé une fois signé', async () => {
    await devisEnvoye();
    const { scanSigneCle } = await prisma().devis.findUniqueOrThrow({ where: { id: devisId } });
    expect((await dernierLien()).pdfCle).toBe(scanSigneCle);
  });

  it('refuse un canal sans consentement ou sans coordonnée', async () => {
    await expect(envoyerDevisAuPatient(audio, devisId, { canal: 'SMS' })).rejects.toBeInstanceOf(
      ErreurSaisie,
    );
    expect(await prisma().lienDocument.count()).toBe(0);
  });

  it('refuse hors du centre et sans fournisseur', async () => {
    await expect(
      envoyerDevisAuPatient(assistantB, devisId, { canal: 'EMAIL' }),
    ).rejects.toBeInstanceOf(AccesRefuseError);
    vi.stubEnv('NOTIFIER', '');
    await expect(envoyerDevisAuPatient(audio, devisId, { canal: 'EMAIL' })).rejects.toThrow(
      /fournisseur/,
    );
    vi.unstubAllEnvs();
  });
});

describe('ouverture', () => {
  it('ouvre le document contre la bonne date, journalise et compte', async () => {
    const jetonLien = await devisEnvoye();
    expect(await lienDocumentOuvrable(jetonLien, IP)).toBe(true);
    const document = await ouvrirDocument(jetonLien, IP, { dateNaissance: NAISSANCE });
    expect(document.type).toBe('application/pdf');
    expect(document.nomFichier).toBe('devis.pdf');
    expect((await dernierLien()).ouvertures).toBe(1);
    const journal = await prisma().journalAudit.findFirstOrThrow({
      where: { action: 'READ', utilisateurLibelle: 'Lien sécurisé' },
    });
    expect(journal).toMatchObject({ utilisateurId: null, patientId });
  });

  it('bloque après 5 dates erronées, même avec la bonne ensuite', async () => {
    const jetonLien = await devisEnvoye();
    for (let essai = 0; essai < TENTATIVES_MAX_LIEN_DOCUMENT; essai += 1) {
      await expect(
        ouvrirDocument(jetonLien, IP, { dateNaissance: '1999-01-01' }),
      ).rejects.toBeInstanceOf(ErreurSaisie);
    }
    expect((await dernierLien()).bloqueLe).not.toBeNull();
    await expect(
      ouvrirDocument(jetonLien, IP, { dateNaissance: NAISSANCE }),
    ).rejects.toBeInstanceOf(AccesRefuseError);
    expect(await lienDocumentOuvrable(jetonLien, IP)).toBe(false);
  });

  it('refuse un lien expiré, révoqué ou falsifié', async () => {
    const jetonLien = await devisEnvoye();
    const lien = await dernierLien();
    await prisma().lienDocument.update({
      where: { id: lien.id },
      data: { expireLe: new Date('2000-01-01T00:00:00.000Z') },
    });
    expect(await lienDocumentOuvrable(jetonLien, IP)).toBe(false);
    await expect(
      ouvrirDocument(jetonLien, IP, { dateNaissance: NAISSANCE }),
    ).rejects.toBeInstanceOf(AccesRefuseError);

    const faux = new SignatureLienDocument(Buffer.alloc(32, 1)).signer({
      organisationId: d.organisation.id,
      lienId: lien.id,
    });
    expect(await lienDocumentOuvrable(faux, IP)).toBe(false);
    await expect(ouvrirDocument(faux, IP, { dateNaissance: NAISSANCE })).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
  });

  it('refuse le lien d’un client suspendu', async () => {
    const jetonLien = await devisEnvoye();
    await prisma().organisation.update({
      where: { id: d.organisation.id },
      data: { statut: 'SUSPENDU' },
    });
    expect(await lienDocumentOuvrable(jetonLien, IP)).toBe(false);
  });

  it('une révocation ferme le lien, et seul le centre du dossier peut la faire', async () => {
    const jetonLien = await devisEnvoye();
    const lien = await dernierLien();
    await expect(revoquerLien(assistantB, lien.id)).rejects.toBeInstanceOf(AccesRefuseError);
    await revoquerLien(audio, lien.id);
    expect(await lienDocumentOuvrable(jetonLien, IP)).toBe(false);
    expect(await listerLiensDocument(audio, dossierId)).toMatchObject([
      { id: lien.id, ouvert: false, revoque: true },
    ]);
    await expect(revoquerLien(audio, 'inconnu')).rejects.toBeInstanceOf(AccesRefuseError);
  });
});

describe('compte rendu au prescripteur', () => {
  async function adressePrescripteur(contact: string | null) {
    await prisma().prescripteur.updateMany({ data: { contact } });
  }

  it('fige le courrier et envoie un lien par e-mail', async () => {
    await adressePrescripteur('dr.fictif@exemple.test');
    await envoyerCompteRenduAuPrescripteur(audio, dossierId);
    const lien = await dernierLien();
    expect(lien).toMatchObject({ cible: 'COMPTE_RENDU_ESSAI', destinataire: 'PRESCRIPTEUR' });
    expect(stockage().objets.has(lien.pdfCle)).toBe(true);
    const jetonLien = await jeton(lien.id);
    const document = await ouvrirDocument(jetonLien, IP, { dateNaissance: NAISSANCE });
    expect(document.nomFichier).toBe('compte-rendu.pdf');
    const journal = await prisma().journalAudit.findFirstOrThrow({ where: { action: 'SEND' } });
    expect(journal.entiteType).toBe('ESSAI');
  });

  it('exige une adresse et retire le courrier figé', async () => {
    await adressePrescripteur(null);
    const avant = stockage().objets.size;
    await expect(envoyerCompteRenduAuPrescripteur(audio, dossierId)).rejects.toThrow(
      /adresse du prescripteur/,
    );
    expect(stockage().objets.size).toBe(avant);
    expect(await prisma().lienDocument.count()).toBe(0);
  });
});
