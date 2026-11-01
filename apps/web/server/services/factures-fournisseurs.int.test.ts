import { prisma } from '@ha/db/admin';
import { beforeEach, describe, expect, it } from 'vitest';

import { creerAchats } from '@/test/achats';
import { creerCatalogueDevis, type CatalogueDevis } from '@/test/devis';
import { creerJeuDeDonnees, creerResponsable, viderBase, type JeuDeDonnees } from '@/test/donnees';

import { AccesRefuseError } from '../auth/acces';
import { ErreurSaisie } from '../erreurs';
import {
  ajouterLigne,
  approuverCommande,
  cloturerCommande,
  creerCommande,
  obtenirCommande,
  soumettreCommande,
} from './commandes';
import { listerEcarts, traiterEcart } from './ecarts-achat';
import { transmettreCommande } from './envoi-commandes';
import {
  deposerFacture,
  listerFacturesFournisseur,
  modifierFactureFournisseur,
  obtenirFactureFournisseur,
  rejeterFactureFournisseur,
  telechargerFactureFournisseur,
  validerFactureFournisseur,
} from './factures-fournisseurs';
import { enregistrerParametresCommande } from './fournisseurs';
import { aujourdhui } from './patients';
import { pointerReception } from './reception-commande';

let d: JeuDeDonnees;
let catalogue: CatalogueDevis;
let fournisseurs: Awaited<ReturnType<typeof creerAchats>>;
let compteur = 0;

function fichier(): Uint8Array {
  compteur += 1;
  return Buffer.from(`%PDF-1.7 facture ${String(compteur)}`);
}

async function commandeEnvoyee(quantite = '2') {
  const { admin } = d.acteurs;
  const id = await creerCommande(admin, {
    centreId: d.centres.a.id,
    fournisseurId: fournisseurs.fabricantId,
  });
  await ajouterLigne(admin, id, {
    produit: `modele:${catalogue.classeI}`,
    quantite,
    enConsignation: false,
  });
  await soumettreCommande(admin, id);
  await approuverCommande(admin, id);
  await transmettreCommande(admin, id);
  return id;
}

async function recevoir(commandeId: string, numerosSerie: string[]) {
  const { admin } = d.acteurs;
  const { lignes } = await obtenirCommande(admin, commandeId);
  await pointerReception(admin, commandeId, {
    dateReception: aujourdhui(),
    referenceBonLivraison: 'BL-1',
    lignes: [{ ligneId: lignes[0]?.id, quantite: '0', numerosSerie, quantiteNonConforme: '0' }],
  });
}

interface LigneSaisie {
  quantite: string;
  prix: string;
  numeros: string;
  commandeLigneId?: string | undefined;
}

async function factureSaisie(
  numero: string,
  ligne: LigneSaisie,
  montants: { ht: string; tva: string; ttc: string },
) {
  const { admin } = d.acteurs;
  const id = await deposerFacture(admin, fichier());
  await modifierFactureFournisseur(admin, id, {
    fournisseurId: fournisseurs.fabricantId,
    centreId: d.centres.a.id,
    numero,
    dateFacture: '2030-01-07',
    montantHt: montants.ht,
    montantTva: montants.tva,
    montantTtc: montants.ttc,
    lignes: [
      {
        designation: 'Aurore Essentiel',
        quantite: ligne.quantite,
        prixUnitaireCentimes: ligne.prix,
        numerosSerie: ligne.numeros,
        commandeLigneId: ligne.commandeLigneId,
      },
    ],
  });
  return id;
}

async function premiereLigne(commandeId: string): Promise<string> {
  return (await obtenirCommande(d.acteurs.admin, commandeId)).lignes[0]?.id ?? '';
}

const MONTANTS = { ht: '1 200,00', tva: '240,00', ttc: '1 440,00' };

beforeEach(async () => {
  await viderBase();
  d = await creerJeuDeDonnees();
  await prisma().lppCode.create({ data: { code: '2332976' } });
  catalogue = await creerCatalogueDevis(d);
  fournisseurs = await creerAchats(d, catalogue);
});

describe('dépôt', () => {
  it('refuse ce qui n’est pas un PDF, un doublon, et un rôle sans droit', async () => {
    const { admin, assistantA } = d.acteurs;
    await expect(deposerFacture(admin, Buffer.from('<html>'))).rejects.toBeInstanceOf(ErreurSaisie);
    await expect(deposerFacture(admin, new Uint8Array(11 * 1024 * 1024))).rejects.toBeInstanceOf(
      ErreurSaisie,
    );
    await expect(deposerFacture(assistantA, fichier())).rejects.toBeInstanceOf(AccesRefuseError);

    const contenu = fichier();
    await deposerFacture(admin, contenu);
    await expect(deposerFacture(admin, contenu)).rejects.toBeInstanceOf(ErreurSaisie);
  });

  it('un PDF sans texte donne un brouillon à compléter, et le fichier se relit', async () => {
    const { admin } = d.acteurs;
    const contenu = fichier();
    const id = await deposerFacture(admin, contenu);
    const vue = await obtenirFactureFournisseur(admin, id);
    expect(vue).toMatchObject({ statut: 'A_VALIDER', numero: null, origine: 'DEPOT' });
    expect(Object.keys(vue.manquants)).toContain('numero');
    expect(Buffer.from(await telechargerFactureFournisseur(admin, id))).toEqual(
      Buffer.from(contenu),
    );
  });

  it('un fichier rejeté peut revenir', async () => {
    const { admin } = d.acteurs;
    const contenu = fichier();
    const id = await deposerFacture(admin, contenu);
    await rejeterFactureFournisseur(admin, id, { motif: 'Illisible' });
    await expect(deposerFacture(admin, contenu)).resolves.toBeTypeOf('string');
  });
});

describe('rapprochement', () => {
  it('facture conforme : commande FACTUREE, appareils rattachés, puis close', async () => {
    const { admin } = d.acteurs;
    const commandeId = await commandeEnvoyee();
    await recevoir(commandeId, ['SN1', 'SN2']);
    const id = await factureSaisie(
      'FA-1',
      {
        quantite: '2',
        prix: '600,00',
        numeros: 'SN1 SN2',
        commandeLigneId: await premiereLigne(commandeId),
      },
      MONTANTS,
    );

    const avant = await obtenirFactureFournisseur(admin, id);
    expect(avant.ecarts).toEqual([]);
    expect(await validerFactureFournisseur(admin, id)).toBe(0);

    expect((await obtenirCommande(admin, commandeId)).statut).toBe('FACTUREE');
    const appareil = await prisma().appareil.findFirstOrThrow({ where: { numeroSerie: 'SN1' } });
    expect(appareil.referenceFactureFabricant).toBe('FA-1');

    await cloturerCommande(admin, commandeId);
    expect((await obtenirCommande(admin, commandeId)).statut).toBe('CLOSE');
  });

  it('écart de prix : affiché avant, écrit à la validation, et accepté il corrige le stock', async () => {
    const { admin } = d.acteurs;
    const commandeId = await commandeEnvoyee();
    await recevoir(commandeId, ['SN1', 'SN2']);
    const id = await factureSaisie(
      'FA-2',
      {
        quantite: '2',
        prix: '610,00',
        numeros: 'SN1 SN2',
        commandeLigneId: await premiereLigne(commandeId),
      },
      { ht: '1 220,00', tva: '244,00', ttc: '1 464,00' },
    );

    const { ecarts } = await obtenirFactureFournisseur(admin, id);
    expect(ecarts).toEqual([
      expect.objectContaining({
        type: 'PRIX',
        montantAttenduCentimes: 60_000,
        montantConstateCentimes: 61_000,
      }),
    ]);
    expect(await validerFactureFournisseur(admin, id)).toBe(1);

    await expect(cloturerCommande(admin, commandeId)).rejects.toBeInstanceOf(ErreurSaisie);
    const [ecart] = (await listerEcarts(admin, { type: 'tous' }, {})).lignes;
    expect(ecart).toMatchObject({ type: 'PRIX', statut: 'OUVERT', facture: 'FA-2' });

    await traiterEcart(admin, ecart?.id ?? '', { statut: 'ACCEPTE', commentaire: 'Hausse tarif' });
    const appareil = await prisma().appareil.findFirstOrThrow({ where: { numeroSerie: 'SN1' } });
    expect(appareil.prixAchatCentimes).toBe(61_000);
    await cloturerCommande(admin, commandeId);
  });

  it('dans la tolérance du client, aucun écart', async () => {
    const { admin } = d.acteurs;
    await enregistrerParametresCommande(admin, {
      delaiRelanceJours: '3',
      relancesMax: '2',
      tolerancePrix: '10,00',
    });
    const commandeId = await commandeEnvoyee();
    await recevoir(commandeId, ['SN1', 'SN2']);
    const id = await factureSaisie(
      'FA-3',
      {
        quantite: '2',
        prix: '605,00',
        numeros: 'SN1 SN2',
        commandeLigneId: await premiereLigne(commandeId),
      },
      { ht: '1 210,00', tva: '242,00', ttc: '1 452,00' },
    );
    expect(await validerFactureFournisseur(admin, id)).toBe(0);
  });

  it('écart de quantité : facturé plus que reçu, sans statut facturé', async () => {
    const { admin } = d.acteurs;
    const commandeId = await commandeEnvoyee('3');
    await recevoir(commandeId, ['SN1']);
    const id = await factureSaisie(
      'FA-4',
      {
        quantite: '2',
        prix: '600,00',
        numeros: 'SN1 SN2',
        commandeLigneId: await premiereLigne(commandeId),
      },
      MONTANTS,
    );
    await validerFactureFournisseur(admin, id);
    const vue = await obtenirCommande(admin, commandeId);
    expect(vue.statut).toBe('PARTIELLEMENT_RECUE');
    expect(vue.lignes[0]?.quantiteFacturee).toBe(2);
    const { lignes } = await listerEcarts(admin, { type: 'tous' }, { type: 'QUANTITE_FACTUREE' });
    expect(lignes[0]).toMatchObject({ quantiteAttendue: 1, quantiteConstatee: 2 });
  });

  it('facture avant livraison : la réception lève les écarts et la commande devient FACTUREE', async () => {
    const { admin } = d.acteurs;
    const commandeId = await commandeEnvoyee();
    const id = await factureSaisie(
      'FA-5',
      {
        quantite: '2',
        prix: '600,00',
        numeros: 'SN1 SN2',
        commandeLigneId: await premiereLigne(commandeId),
      },
      MONTANTS,
    );
    expect(await validerFactureFournisseur(admin, id)).toBe(3);
    expect((await obtenirCommande(admin, commandeId)).statut).toBe('ENVOYEE');

    await recevoir(commandeId, ['SN1', 'SN2']);

    const vue = await obtenirCommande(admin, commandeId);
    expect(vue).toMatchObject({ statut: 'FACTUREE', ecartsATraiter: 0 });
    await cloturerCommande(admin, commandeId);
  });

  it('un numéro déjà facturé et une ligne non commandée sont signalés', async () => {
    const { admin } = d.acteurs;
    const commandeId = await commandeEnvoyee();
    await recevoir(commandeId, ['SN1', 'SN2']);
    const ligneId = await premiereLigne(commandeId);
    const premiere = await factureSaisie(
      'FA-6',
      { quantite: '1', prix: '600,00', numeros: 'SN1', commandeLigneId: ligneId },
      { ht: '600,00', tva: '120,00', ttc: '720,00' },
    );
    await validerFactureFournisseur(admin, premiere);

    const seconde = await factureSaisie(
      'FA-7',
      { quantite: '1', prix: '600,00', numeros: 'SN1', commandeLigneId: ligneId },
      { ht: '600,00', tva: '120,00', ttc: '720,00' },
    );
    const { ecarts } = await obtenirFactureFournisseur(admin, seconde);
    expect(ecarts.map((e) => e.type)).toEqual(['SERIE_DEJA_FACTUREE']);

    const port = await factureSaisie(
      'FA-8',
      { quantite: '1', prix: '15,00', numeros: '' },
      { ht: '15,00', tva: '3,00', ttc: '18,00' },
    );
    await validerFactureFournisseur(admin, port);
    const { lignes } = await listerEcarts(admin, { type: 'tous' }, { type: 'LIGNE_NON_COMMANDEE' });
    expect(lignes).toHaveLength(1);
  });

  it('propose la ligne de commande d’après les numéros reçus', async () => {
    const { admin } = d.acteurs;
    const commandeId = await commandeEnvoyee();
    await recevoir(commandeId, ['SN1', 'SN2']);
    const id = await factureSaisie(
      'FA-9',
      { quantite: '2', prix: '600,00', numeros: 'SN1 SN2' },
      MONTANTS,
    );
    const ligneId = await premiereLigne(commandeId);
    const vue = await obtenirFactureFournisseur(admin, id);
    expect(vue.lignes[0]?.commandeLigneProposee).toBe(ligneId);
    expect(vue.candidats.map((c) => c.id)).toEqual([ligneId]);
  });
});

describe('validation', () => {
  it('exige une facture complète', async () => {
    const { admin } = d.acteurs;
    const id = await deposerFacture(admin, fichier());
    await expect(validerFactureFournisseur(admin, id)).rejects.toBeInstanceOf(ErreurSaisie);
  });

  it('refuse le même numéro chez le même fournisseur', async () => {
    const { admin } = d.acteurs;
    const ligne = { quantite: '1', prix: '10,00', numeros: '' };
    const montants = { ht: '10,00', tva: '2,00', ttc: '12,00' };
    await validerFactureFournisseur(admin, await factureSaisie('FA-10', ligne, montants));
    const doublon = await factureSaisie('FA-10', ligne, montants);
    await expect(validerFactureFournisseur(admin, doublon)).rejects.toBeInstanceOf(ErreurSaisie);
  });

  it('une facture validée est figée, même hors du service', async () => {
    const { admin } = d.acteurs;
    const id = await factureSaisie(
      'FA-11',
      { quantite: '1', prix: '10,00', numeros: '' },
      { ht: '10,00', tva: '2,00', ttc: '12,00' },
    );
    await validerFactureFournisseur(admin, id);

    await expect(modifierFactureFournisseur(admin, id, { lignes: [] })).rejects.toBeInstanceOf(
      ErreurSaisie,
    );
    await expect(rejeterFactureFournisseur(admin, id, { motif: 'x' })).rejects.toBeInstanceOf(
      ErreurSaisie,
    );
    await expect(
      prisma().factureFournisseur.update({ where: { id }, data: { numero: 'Autre' } }),
    ).rejects.toThrow(/figée/);
    await expect(
      prisma().factureFournisseurLigne.deleteMany({ where: { factureId: id } }),
    ).rejects.toThrow(/figée/);
  });

  it('une ligne ne vise que les commandes de ce fournisseur et de ce centre', async () => {
    const { admin } = d.acteurs;
    const commandeId = await commandeEnvoyee();
    const ligneId = await premiereLigne(commandeId);
    const id = await deposerFacture(admin, fichier());
    await expect(
      modifierFactureFournisseur(admin, id, {
        fournisseurId: fournisseurs.accessoiresId,
        centreId: d.centres.a.id,
        lignes: [
          {
            designation: 'x',
            quantite: '1',
            prixUnitaireCentimes: '1,00',
            commandeLigneId: ligneId,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(ErreurSaisie);
  });

  it('la désignation est chiffrée, le rejet aussi', async () => {
    const { admin } = d.acteurs;
    const id = await factureSaisie(
      'FA-12',
      { quantite: '1', prix: '10,00', numeros: '' },
      { ht: '10,00', tva: '2,00', ttc: '12,00' },
    );
    await rejeterFactureFournisseur(admin, id, { motif: 'Erreur' });
    const ligne = await prisma().factureFournisseurLigne.findFirstOrThrow({
      where: { factureId: id },
    });
    expect(ligne.designation).toMatch(/^v1\./);
    const brute = await prisma().factureFournisseur.findUniqueOrThrow({ where: { id } });
    expect(brute.motifRejet).toMatch(/^v1\./);
    expect((await obtenirFactureFournisseur(admin, id)).motifRejet).toBe('Erreur');
  });
});

describe('dépôt par un responsable', () => {
  it('retient le centre courant : la facture reste lisible par qui la dépose', async () => {
    const responsable = await creerResponsable(d);
    await expect(deposerFacture(responsable, fichier())).rejects.toBeInstanceOf(ErreurSaisie);

    const id = await deposerFacture(responsable, fichier(), d.centres.a.id);
    expect((await obtenirFactureFournisseur(responsable, id)).centreId).toBe(d.centres.a.id);

    await expect(deposerFacture(responsable, fichier(), d.centres.c.id)).rejects.toBeInstanceOf(
      ErreurSaisie,
    );
  });
});

describe('droits', () => {
  it('réservés à la gestion, sur ses centres ; une facture sans centre à l’administrateur', async () => {
    const { admin, assistantA } = d.acteurs;
    const responsable = await creerResponsable(d);
    const sansCentre = await deposerFacture(admin, fichier());

    await expect(obtenirFactureFournisseur(assistantA, sansCentre)).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
    await expect(
      listerFacturesFournisseur(assistantA, { type: 'tous' }, {}),
    ).rejects.toBeInstanceOf(AccesRefuseError);
    await expect(obtenirFactureFournisseur(responsable, sansCentre)).rejects.toBeInstanceOf(
      AccesRefuseError,
    );

    await modifierFactureFournisseur(admin, sansCentre, {
      centreId: d.centres.a.id,
      lignes: [],
    });
    expect((await obtenirFactureFournisseur(responsable, sansCentre)).centre).toBe('Centre A');
    const liste = await listerFacturesFournisseur(admin, { type: 'tous' }, { statut: 'A_VALIDER' });
    expect(liste.lignes).toHaveLength(1);
  });
});
