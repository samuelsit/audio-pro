import path from 'node:path';

import { prisma } from '@ha/db/admin';
import { ROLE_SUPERADMIN } from '@ha/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  creerCatalogueDevis,
  creerPatientDevis,
  identifierCentreA,
  type CatalogueDevis,
} from '@/test/devis';
import { creerJeuDeDonnees, viderBase, type JeuDeDonnees } from '@/test/donnees';
import { approvisionner, venteDirecte } from '@/test/facturation';
import { appareilVendu } from '@/test/sav';

import {
  AccesRefuseError,
  chargerCompteConnecte,
  type SuperadminConnecte,
  type UtilisateurConnecte,
} from '../auth/acces';
import { importerLpp } from '../lpp/importer';
import { emettreAvoir } from './avoirs';
import { articlesComptoir, compteurPiles, venteComptoir } from './comptoir';
import { confirmerCouvertureVente, creerVenteDirecte, validerFacture } from './facturation';
import { aujourdhui } from './patients';
import { ajouterQuotaPiles, listerQuotasPiles } from './quota-piles';

vi.setConfig({ testTimeout: 30_000 });

const V908 = path.join(import.meta.dirname, '../../../../fixtures/lpp/908');

let d: JeuDeDonnees;
let audio: UtilisateurConnecte;
let admin: UtilisateurConnecte;
let assistant: UtilisateurConnecte;
let catalogue: CatalogueDevis;
let patientId: string;

beforeEach(async () => {
  await viderBase();
  await prisma().quotaPiles.deleteMany();
  d = await creerJeuDeDonnees();
  ({ audioAB: audio, admin, assistantA: assistant } = d.acteurs);
  await identifierCentreA(d);
  await importerLpp(V908);
  catalogue = await creerCatalogueDevis(d);
  await approvisionner(d.centres.a.id, catalogue.piles, 50);
  patientId = await creerPatientDevis(d);
});

const saisie = (surcharge = {}) => ({
  patientId,
  centreId: d.centres.a.id,
  prescriptionId: '',
  lignes: [{ accessoireId: catalogue.piles, quantite: '2' }],
  entretienLibelle: '',
  entretienPrix: '',
  ...surcharge,
});

/** Vente remboursable : la prescription du dossier ouvre la part AMO des piles. */
async function pilesRemboursees(quantite: string) {
  const vente = await appareilVendu(d, audio, catalogue);
  const { id: prescriptionId } = await prisma().prescription.findFirstOrThrow({
    where: { dossierId: vente.dossierId },
    select: { id: true },
  });
  const factureId = await venteComptoir(
    audio,
    saisie({
      prescriptionId,
      patientId: vente.patientId,
      lignes: [{ accessoireId: catalogue.piles, quantite }],
    }),
  );
  await confirmerCouvertureVente(audio, factureId);
  await validerFacture(audio, factureId);
  return { factureId, patientId: vente.patientId };
}

async function creerSuperadmin(): Promise<SuperadminConnecte> {
  const { id } = await prisma().utilisateur.create({
    data: {
      prenom: 'Claude',
      nom: 'Éditeur',
      name: 'Claude Éditeur',
      email: 'console-comptoir@exemple.test',
      role: ROLE_SUPERADMIN,
      doitChangerMotDePasse: false,
    },
  });
  const compte = await chargerCompteConnecte(id);
  if (compte?.role !== ROLE_SUPERADMIN) {
    throw new Error('Compte éditeur attendu.');
  }
  return compte;
}

describe('vente au comptoir', () => {
  it('ouvre un brouillon avec les prix du catalogue', async () => {
    const factureId = await venteComptoir(assistant, saisie());
    const facture = await prisma().facture.findUniqueOrThrow({
      where: { id: factureId },
      include: { lignes: true },
    });
    const { prixCentimes, nom } = await prisma().accessoire.findUniqueOrThrow({
      where: { id: catalogue.piles },
    });
    expect(facture).toMatchObject({ statut: 'BROUILLON', dossierId: null });
    expect(facture.lignes).toMatchObject([
      { nature: 'PILE', quantite: 2, prixUnitaireCentimes: prixCentimes, libelle: nom },
    ]);
  });

  it('ajoute un entretien libre', async () => {
    const factureId = await venteComptoir(
      audio,
      saisie({ lignes: [], entretienLibelle: 'Nettoyage', entretienPrix: '10,00' }),
    );
    const lignes = await prisma().ligneFacture.findMany({ where: { factureId } });
    expect(lignes).toMatchObject([
      { nature: 'ENTRETIEN', libelle: 'Nettoyage', prixUnitaireCentimes: 1000 },
    ]);
  });

  it('un article inconnu annule toute la vente', async () => {
    await expect(
      venteComptoir(
        audio,
        saisie({
          lignes: [{ accessoireId: '018f0000-0000-7000-8000-000000000001', quantite: '1' }],
        }),
      ),
    ).rejects.toMatchObject({ erreurs: { lignes: ['Article inconnu.'] } });
    expect(await prisma().facture.count()).toBe(0);
  });

  it('liste les articles en stock du centre', async () => {
    const articles = await articlesComptoir(audio, d.centres.a.id);
    expect(articles).toMatchObject([{ id: catalogue.piles, quantiteEnStock: 50 }]);
    expect(await articlesComptoir(audio, d.centres.b.id)).toEqual([]);
  });

  it('un centre hors droits est refusé', async () => {
    await expect(
      venteComptoir(assistant, saisie({ centreId: d.centres.b.id })),
    ).rejects.toBeInstanceOf(AccesRefuseError);
  });
});

describe('droits de l’assistant', () => {
  it('crée et valide une vente directe, sort le stock', async () => {
    const factureId = await creerVenteDirecte(assistant, {
      patientId,
      centreId: d.centres.a.id,
      prescriptionId: null,
    });
    expect(factureId).not.toBe('');
    const venteId = await venteDirecte(d, assistant, patientId, catalogue.piles);
    await validerFacture(assistant, venteId);
    expect((await prisma().facture.findUniqueOrThrow({ where: { id: venteId } })).statut).toBe(
      'VALIDEE',
    );
    const stock = await prisma().stockAccessoire.findFirstOrThrow({
      where: { accessoireId: catalogue.piles, centreId: d.centres.a.id },
    });
    expect(stock.quantite).toBe(48);
  });
});

describe('compteur de piles', () => {
  it('sans vente remboursée, zéro et aucun quota', async () => {
    expect(await compteurPiles(audio, patientId)).toMatchObject({
      annee: Number(aujourdhui().slice(0, 4)),
      boites: 0,
      quota: null,
      depasse: false,
    });
  });

  it('une vente sans prescription ne compte pas', async () => {
    const factureId = await venteComptoir(audio, saisie());
    await validerFacture(audio, factureId);
    expect((await compteurPiles(audio, patientId)).boites).toBe(0);
  });

  it('compte les boîtes remboursées et s’efface après un avoir total', async () => {
    const { factureId, patientId: patient } = await pilesRemboursees('3');
    // La facture du dossier livre déjà des piles : le compteur les inclut.
    const cumul = (await compteurPiles(audio, patient)).boites;
    expect(cumul).toBeGreaterThanOrEqual(3);
    await emettreAvoir(admin, factureId, { mode: 'TOTAL', motif: 'Erreur' });
    expect((await compteurPiles(audio, patient)).boites).toBe(cumul - 3);
  });

  it('applique le quota en vigueur et signale un dépassement', async () => {
    await prisma().quotaPiles.create({
      data: { debut: new Date('2020-01-01'), boitesParAn: 1, source: 'Texte fictif' },
    });
    const { patientId: patient } = await pilesRemboursees('3');
    expect(await compteurPiles(audio, patient)).toMatchObject({
      quota: 1,
      restant: 0,
      depasse: true,
    });
  });

  it('le patient d’un autre centre est refusé', async () => {
    await prisma().patient.update({
      where: { id: patientId },
      data: { centreId: d.centres.b.id },
    });
    await expect(compteurPiles(assistant, patientId)).rejects.toBeInstanceOf(AccesRefuseError);
  });
});

describe('quota en console', () => {
  it('réservé à l’éditeur, daté, avec sa source', async () => {
    const superadmin = await creerSuperadmin();
    const quota = { boitesParAn: '10', debut: '2027-01-01', source: 'Texte fictif' };
    await expect(
      ajouterQuotaPiles(admin as unknown as SuperadminConnecte, quota),
    ).rejects.toBeInstanceOf(AccesRefuseError);
    await ajouterQuotaPiles(superadmin, quota);
    expect(await listerQuotasPiles(superadmin)).toEqual([
      { boitesParAn: 10, debut: '2027-01-01', source: 'Texte fictif' },
    ]);
    await expect(ajouterQuotaPiles(superadmin, quota)).rejects.toThrow('existe déjà');
  });
});
