import path from 'node:path';

import type { FakePdfRenderer } from '@ha/adapters';
import { prisma } from '@ha/db/admin';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  creerAppareil,
  creerCatalogueDevis,
  identifierCentreA,
  type CatalogueDevis,
} from '@/test/devis';
import { creerJeuDeDonnees, viderBase, type JeuDeDonnees } from '@/test/donnees';
import { approvisionner } from '@/test/facturation';
import { appareilVendu } from '@/test/sav';

import { AccesRefuseError, type UtilisateurConnecte } from '../auth/acces';
import { ErreurSaisie } from '../erreurs';
import { importerLpp } from '../lpp/importer';
import { rendeurPdf } from '../pdf';
import { emettreAvoir } from './avoirs';
import { aujourdhui } from './patients';
import {
  abandonnerRemplacant,
  annulerRetour,
  corrigerSerieRemplacant,
  echangerAppareilDuStock,
  enregistrerIssue,
  enregistrerRemplacant,
  envoyerRetour,
  listerRetours,
  obtenirRetour,
  preparerRetour,
  remettreRemplacant,
  telechargerBonRetour,
} from './retours-fabricant';
import { annulerVente, obtenirFicheAppareil } from './stock';
import {
  annulerTicket,
  diagnostiquerTicket,
  obtenirTicket,
  ouvrirTicket,
  restituerAppareil,
} from './tickets-sav';

vi.setConfig({ testTimeout: 30_000 });

const V908 = path.join(import.meta.dirname, '../../../../fixtures/lpp/908');
const PERIMETRE_TOUS = { type: 'tous' } as const;

let d: JeuDeDonnees;
let audio: UtilisateurConnecte;
let admin: UtilisateurConnecte;
let catalogue: CatalogueDevis;
let fournisseurId: string;

beforeEach(async () => {
  await viderBase();
  d = await creerJeuDeDonnees();
  ({ audioAB: audio, admin } = d.acteurs);
  await identifierCentreA(d);
  await importerLpp(V908);
  catalogue = await creerCatalogueDevis(d);
  await approvisionner(d.centres.a.id, catalogue.piles, 100);
  ({ id: fournisseurId } = await prisma().fournisseur.create({
    data: { organisationId: d.organisation.id, type: 'FOURNISSEUR', nom: 'Fournisseur Fictif' },
  }));
});

const appareil = (id: string) => prisma().appareil.findUniqueOrThrow({ where: { id } });
const ticketEnBase = (id: string) => prisma().ticketSav.findUniqueOrThrow({ where: { id } });
const retourEnBase = (id: string) => prisma().retourFabricant.findUniqueOrThrow({ where: { id } });
const SANS_SOURCE = { ticketId: '', appareilId: '', ecartId: '', descriptionPanne: '' };

/** Ticket diagnostiqué, avec l'action demandée. */
async function ticketDiagnostique(action = 'ENVOI_FABRICANT', motif = 'PANNE') {
  const vente = await appareilVendu(d, audio, catalogue);
  const ticketId = await ouvrirTicket(audio, {
    numeroSerie: vente.numeroSerie,
    motif,
    description: '',
  });
  await diagnostiquerTicket(audio, ticketId, {
    motif,
    diagnostic: 'Microphone HS',
    action,
    cout: '',
  });
  return { ...vente, ticketId };
}

async function retourEnvoye(action = 'ENVOI_FABRICANT') {
  const contexte = await ticketDiagnostique(action);
  const retourId = await preparerRetour(audio, {
    ...SANS_SOURCE,
    fournisseurId,
    ticketId: contexte.ticketId,
    descriptionPanne: 'Micro muet',
  });
  await envoyerRetour(audio, retourId, {
    transporteur: 'Transporteur fictif',
    numeroSuivi: 'SUIVI-1',
    dateEnvoi: aujourdhui(),
  });
  return { ...contexte, retourId };
}

const REMPLACANT = () => ({
  modeleId: catalogue.classeI,
  numeroSerie: 'NOUVEAU-1',
  confirmation: 'NOUVEAU-1',
  referenceBonLivraison: 'BL-ECHANGE',
});

describe('bon de retour', () => {
  it('ne porte aucune identité de patient', async () => {
    const { ticketId, numeroSerie, patientId } = await ticketDiagnostique();
    const { nomNaissance, prenoms } = await prisma().patient.findUniqueOrThrow({
      where: { id: patientId },
    });
    const pdf = rendeurPdf() as FakePdfRenderer;
    const avant = pdf.rendus.length;
    const retourId = await preparerRetour(audio, {
      ...SANS_SOURCE,
      fournisseurId,
      ticketId,
      descriptionPanne: 'Micro muet',
    });
    const html = pdf.rendus[avant] ?? '';
    expect(html).toContain(numeroSerie);
    expect(html).toContain('Sous garantie');
    expect(html).toContain('Micro muet');
    expect(html).not.toContain(nomNaissance);
    expect(html).not.toContain(prenoms);
    expect((await retourEnBase(retourId)).bonPdfCle).toMatch(/^bons-retour\//);
    const { nomFichier, contenu } = await telechargerBonRetour(audio, retourId);
    expect(nomFichier).toBe('bon-de-retour.pdf');
    expect(contenu.length).toBeGreaterThan(0);
  });

  it('exige un envoi ou un échange au diagnostic', async () => {
    const { ticketId } = await ticketDiagnostique('REPARATION_CENTRE');
    await expect(
      preparerRetour(audio, { ...SANS_SOURCE, fournisseurId, ticketId }),
    ).rejects.toThrow('Choisir d’abord');
  });

  it('un seul retour en cours par ticket', async () => {
    const { ticketId } = await ticketDiagnostique();
    await preparerRetour(audio, { ...SANS_SOURCE, fournisseurId, ticketId });
    await expect(
      preparerRetour(audio, { ...SANS_SOURCE, fournisseurId, ticketId }),
    ).rejects.toThrow('déjà un retour');
  });
});

describe('suivi', () => {
  it('envoi puis réparation : l’appareil revient au patient', async () => {
    const { ticketId, retourId, appareilId, patientId } = await retourEnvoye();
    expect((await ticketEnBase(ticketId)).statut).toBe('CHEZ_FABRICANT');
    expect(await appareil(appareilId)).toMatchObject({ statut: 'RETOUR_FABRICANT', patientId });
    expect(await retourEnBase(retourId)).toMatchObject({
      statut: 'ENVOYE',
      numeroSuivi: 'SUIVI-1',
    });
    await enregistrerIssue(audio, retourId, { issue: 'REPARE' });
    expect((await ticketEnBase(ticketId)).statut).toBe('A_RESTITUER');
    expect((await appareil(appareilId)).statut).toBe('SAV');
    await restituerAppareil(audio, ticketId);
    expect(await appareil(appareilId)).toMatchObject({ statut: 'VENDU', patientId });
  });

  it('un refus ramène le ticket en cours et autorise un autre retour', async () => {
    const { ticketId, retourId, appareilId } = await retourEnvoye();
    await enregistrerIssue(audio, retourId, { issue: 'REFUSE' });
    expect((await ticketEnBase(ticketId)).statut).toBe('EN_COURS');
    expect((await appareil(appareilId)).statut).toBe('SAV');
    await preparerRetour(audio, { ...SANS_SOURCE, fournisseurId, ticketId });
  });

  it('une date d’envoi future est refusée', async () => {
    const { ticketId } = await ticketDiagnostique();
    const retourId = await preparerRetour(audio, { ...SANS_SOURCE, fournisseurId, ticketId });
    await expect(
      envoyerRetour(audio, retourId, {
        transporteur: '',
        numeroSuivi: '',
        dateEnvoi: '2099-01-01',
      }),
    ).rejects.toMatchObject({ erreurs: { dateEnvoi: [expect.any(String)] } });
  });

  it('un ticket annulé annule son retour préparé', async () => {
    const { ticketId } = await ticketDiagnostique();
    const retourId = await preparerRetour(audio, { ...SANS_SOURCE, fournisseurId, ticketId });
    await annulerTicket(audio, ticketId, { motif: 'Erreur' });
    expect((await retourEnBase(retourId)).statut).toBe('ANNULE');
  });

  it('un retour préparé s’annule, un retour parti non', async () => {
    const { ticketId } = await ticketDiagnostique();
    const retourId = await preparerRetour(audio, { ...SANS_SOURCE, fournisseurId, ticketId });
    await annulerRetour(audio, retourId);
    expect((await retourEnBase(retourId)).statut).toBe('ANNULE');
    await expect(annulerRetour(audio, retourId)).rejects.toThrow('changé d’étape');
  });

  it('liste et fiche', async () => {
    const { retourId, numeroSerie } = await retourEnvoye();
    const { lignes } = await listerRetours(admin, PERIMETRE_TOUS, {});
    expect(lignes).toMatchObject([{ id: retourId, numeroSerie, statut: 'ENVOYE' }]);
    expect(await obtenirRetour(audio, retourId)).toMatchObject({
      descriptionPanne: 'Micro muet',
      transporteur: 'Transporteur fictif',
      sourceStock: false,
    });
  });
});

describe('échange', () => {
  async function echangeRemis() {
    const contexte = await retourEnvoye('ECHANGE');
    await enregistrerRemplacant(audio, contexte.ticketId, REMPLACANT());
    await remettreRemplacant(audio, contexte.ticketId);
    const nouveau = await prisma().appareil.findFirstOrThrow({
      where: { numeroSerie: 'NOUVEAU-1' },
    });
    return { ...contexte, nouveau };
  }

  it('à la réception, le remplaçant est réservé et l’ancien ne bouge pas', async () => {
    const { ticketId, retourId, appareilId, patientId } = await retourEnvoye('ECHANGE');
    await enregistrerRemplacant(audio, ticketId, REMPLACANT());
    const nouveau = await prisma().appareil.findFirstOrThrow({
      where: { numeroSerie: 'NOUVEAU-1' },
    });
    expect(nouveau).toMatchObject({ statut: 'RESERVE', patientId });
    expect(await appareil(appareilId)).toMatchObject({
      statut: 'RETOUR_FABRICANT',
      remplaceParId: null,
    });
    expect(await ticketEnBase(ticketId)).toMatchObject({
      statut: 'A_RESTITUER',
      appareilRemplacantId: nouveau.id,
    });
    expect((await retourEnBase(retourId)).statut).toBe('ECHANGE');
  });

  it('à la remise : nouveau numéro vendu, ancien conservé, lien, mouvements', async () => {
    const { ticketId, appareilId, patientId, nouveau, numeroSerie } = await echangeRemis();
    expect(nouveau).toMatchObject({ statut: 'VENDU', patientId });
    expect(nouveau.numeroSerie).not.toBe(numeroSerie);
    expect(await appareil(appareilId)).toMatchObject({
      numeroSerie,
      statut: 'REMPLACE',
      patientId: null,
      remplaceParId: nouveau.id,
    });
    expect((await ticketEnBase(ticketId)).statut).toBe('CLOTURE');
    const historique = await prisma().mouvementAppareil.findMany({
      where: { appareilId },
      orderBy: [{ horodatage: 'asc' }, { id: 'asc' }],
    });
    expect(historique.at(-1)).toMatchObject({
      type: 'ECHANGE',
      statutAvant: 'RETOUR_FABRICANT',
      statutApres: 'REMPLACE',
      patientId,
      ticketSavId: ticketId,
    });
    expect(historique.map((m) => m.statutApres)).toContain('VENDU');
    const fiche = await obtenirFicheAppareil(audio, nouveau.id);
    expect(fiche.remplace).toMatchObject({ id: appareilId, numeroSerie });
    const ancienne = await obtenirFicheAppareil(audio, appareilId);
    expect(ancienne.remplacePar).toMatchObject({ id: nouveau.id });
  });

  it('la garantie garde sa date de fin et aucune délivrance ne naît', async () => {
    const { appareilId, patientId, nouveau, factureId } = await echangeRemis();
    const avant = await prisma().garantieAppareil.findUniqueOrThrow({ where: { appareilId } });
    const apres = await prisma().garantieAppareil.findUniqueOrThrow({
      where: { appareilId: nouveau.id },
    });
    expect(apres).toMatchObject({
      dateDebut: avant.dateDebut,
      dateFin: avant.dateFin,
      origineId: avant.id,
      patientId,
    });
    expect(await prisma().delivrance.count({ where: { patientId } })).toBe(1);
    const ligne = await prisma().ligneFacture.findFirstOrThrow({
      where: { factureId, nature: 'AIDE_AUDITIVE' },
    });
    expect(ligne.appareilId).toBe(appareilId);
  });

  it('un avoir total ramène le remplaçant, l’ancien reste remplacé', async () => {
    const { appareilId, patientId, nouveau, factureId, dossierId } = await echangeRemis();
    await emettreAvoir(admin, factureId, { mode: 'TOTAL', motif: 'Erreur' });
    expect(await appareil(nouveau.id)).toMatchObject({ statut: 'RESERVE', patientId });
    expect((await appareil(appareilId)).statut).toBe('REMPLACE');
    expect(
      await prisma().essaiAppareil.count({
        where: { appareilId: nouveau.id, retireLe: null, essai: { dossierId } },
      }),
    ).toBe(1);
    expect(await prisma().garantieAppareil.count({ where: { appareilId: nouveau.id } })).toBe(0);
  });

  it('un remplaçant ne s’annule pas hors facture', async () => {
    const { nouveau } = await echangeRemis();
    await expect(annulerVente(admin, nouveau.id, { motif: 'x' })).rejects.toThrow('avoir');
    const fiche = await obtenirFicheAppareil(admin, nouveau.id);
    expect(fiche.annulable).toBe(false);
  });

  it('un numéro déjà connu est une réparation, pas un échange', async () => {
    const { ticketId, numeroSerie } = await retourEnvoye('ECHANGE');
    await expect(
      enregistrerRemplacant(audio, ticketId, {
        ...REMPLACANT(),
        numeroSerie,
        confirmation: numeroSerie,
      }),
    ).rejects.toBeInstanceOf(ErreurSaisie);
  });

  it('une faute de frappe se corrige avant la remise', async () => {
    const { ticketId } = await retourEnvoye('ECHANGE');
    await enregistrerRemplacant(audio, ticketId, REMPLACANT());
    await corrigerSerieRemplacant(audio, ticketId, {
      numeroSerie: 'NOUVEAU-2',
      confirmation: 'NOUVEAU-2',
    });
    expect(await prisma().appareil.count({ where: { numeroSerie: 'NOUVEAU-2' } })).toBe(1);
    await remettreRemplacant(audio, ticketId);
    await expect(
      corrigerSerieRemplacant(audio, ticketId, {
        numeroSerie: 'NOUVEAU-3',
        confirmation: 'NOUVEAU-3',
      }),
    ).rejects.toThrow('n’attend pas');
  });

  it('abandon : le remplaçant repart en stock, l’ancien se rend au patient', async () => {
    const { ticketId, appareilId, patientId } = await retourEnvoye('ECHANGE');
    await enregistrerRemplacant(audio, ticketId, REMPLACANT());
    await abandonnerRemplacant(audio, ticketId, { motif: 'Mauvais modèle' });
    const nouveau = await prisma().appareil.findFirstOrThrow({
      where: { numeroSerie: 'NOUVEAU-1' },
    });
    expect(nouveau).toMatchObject({ statut: 'EN_STOCK', patientId: null });
    await restituerAppareil(audio, ticketId);
    expect(await appareil(appareilId)).toMatchObject({ statut: 'VENDU', patientId });
  });

  it('perte : remplacement sans retour physique', async () => {
    const { ticketId, appareilId } = await ticketDiagnostique('ECHANGE', 'PERTE');
    await enregistrerRemplacant(audio, ticketId, REMPLACANT());
    await remettreRemplacant(audio, ticketId);
    expect((await appareil(appareilId)).statut).toBe('REMPLACE');
    expect(await prisma().retourFabricant.count()).toBe(0);
  });

  it('une panne ne se remplace pas sans passer par le fabricant', async () => {
    const { ticketId } = await ticketDiagnostique('ECHANGE');
    await expect(enregistrerRemplacant(audio, ticketId, REMPLACANT())).rejects.toThrow(
      'au retour du fabricant',
    );
  });

  it('le fabricant peut échanger un appareil envoyé en réparation', async () => {
    const { ticketId } = await retourEnvoye('ENVOI_FABRICANT');
    await enregistrerRemplacant(audio, ticketId, REMPLACANT());
    expect((await obtenirTicket(audio, ticketId)).action).toBe('ECHANGE');
  });
});

describe('appareil du stock', () => {
  it('retour, puis réparation : il reprend sa place', async () => {
    const id = await creerAppareil(d, catalogue.classeI, 'SN-STOCK');
    const retourId = await preparerRetour(admin, {
      ...SANS_SOURCE,
      fournisseurId,
      appareilId: id,
    });
    await envoyerRetour(admin, retourId, {
      transporteur: '',
      numeroSuivi: '',
      dateEnvoi: aujourdhui(),
    });
    expect((await appareil(id)).statut).toBe('RETOUR_FABRICANT');
    await enregistrerIssue(admin, retourId, { issue: 'REPARE' });
    expect((await appareil(id)).statut).toBe('EN_STOCK');
  });

  it('retour, puis échange : le nouveau numéro entre en stock', async () => {
    const id = await creerAppareil(d, catalogue.classeI, 'SN-STOCK');
    const retourId = await preparerRetour(admin, {
      ...SANS_SOURCE,
      fournisseurId,
      appareilId: id,
    });
    await envoyerRetour(admin, retourId, {
      transporteur: '',
      numeroSuivi: '',
      dateEnvoi: aujourdhui(),
    });
    await echangerAppareilDuStock(admin, retourId, REMPLACANT());
    const nouveau = await prisma().appareil.findFirstOrThrow({
      where: { numeroSerie: 'NOUVEAU-1' },
    });
    expect(nouveau.statut).toBe('EN_STOCK');
    expect(await appareil(id)).toMatchObject({ statut: 'REMPLACE', remplaceParId: nouveau.id });
  });

  it('réservé à la gestion', async () => {
    const id = await creerAppareil(d, catalogue.classeI, 'SN-STOCK');
    await expect(
      preparerRetour(audio, { ...SANS_SOURCE, fournisseurId, appareilId: id }),
    ).rejects.toBeInstanceOf(AccesRefuseError);
  });

  it('refuse un appareil qui n’est pas en stock', async () => {
    const { appareilId } = await appareilVendu(d, audio, catalogue);
    await expect(
      preparerRetour(admin, { ...SANS_SOURCE, fournisseurId, appareilId }),
    ).rejects.toThrow('en stock');
  });
});

describe('produit non conforme', () => {
  async function ecartOuvert() {
    const { id } = await prisma().ecartAchat.create({
      data: {
        organisationId: d.organisation.id,
        centreId: d.centres.a.id,
        type: 'PRODUIT_NON_CONFORME',
        numeroSerie: 'SN-ABIME',
        quantiteConstatee: 1,
      },
    });
    return id;
  }

  it('le bon part, l’écart se résout, rien n’entre en stock', async () => {
    const ecartId = await ecartOuvert();
    const retourId = await preparerRetour(admin, { ...SANS_SOURCE, fournisseurId, ecartId });
    const { contenu } = await telechargerBonRetour(admin, retourId);
    expect(contenu.length).toBeGreaterThan(0);
    await envoyerRetour(admin, retourId, {
      transporteur: '',
      numeroSuivi: '',
      dateEnvoi: aujourdhui(),
    });
    const ecart = await prisma().ecartAchat.findUniqueOrThrow({ where: { id: ecartId } });
    expect(ecart).toMatchObject({ statut: 'RESOLU', traiteParId: admin.id });
    await expect(enregistrerIssue(admin, retourId, { issue: 'REPARE' })).rejects.toThrow(
      'par la commande',
    );
  });

  it('refuse un autre type d’écart', async () => {
    const ecartId = await ecartOuvert();
    await prisma().ecartAchat.update({ where: { id: ecartId }, data: { statut: 'RESOLU' } });
    await expect(preparerRetour(admin, { ...SANS_SOURCE, fournisseurId, ecartId })).rejects.toThrow(
      'ne donne pas lieu',
    );
  });
});
