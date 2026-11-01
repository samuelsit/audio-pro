import { prisma } from '@ha/db/admin';
import { beforeEach, describe, expect, it } from 'vitest';

import { creerAchats } from '@/test/achats';
import { creerCatalogueDevis, creerPatientDevis, type CatalogueDevis } from '@/test/devis';
import { creerJeuDeDonnees, viderBase, type JeuDeDonnees } from '@/test/donnees';

import { AccesRefuseError } from '../auth/acces';
import { ErreurSaisie } from '../erreurs';
import { ajouterLigne, creerCommande, obtenirCommande } from './commandes';
import { creerBrouillonsReappro, enregistrerSeuil, proposerReappro, retirerSeuil } from './reappro';
import { receptionner } from './reception';

let d: JeuDeDonnees;
let catalogue: CatalogueDevis;
let fournisseurs: Awaited<ReturnType<typeof creerAchats>>;

const seuilAppareils = () => ({
  centreId: d.centres.a.id,
  produit: `modele:${catalogue.classeI}`,
  minimum: '2',
  cible: '4',
});

const seuilPiles = () => ({
  centreId: d.centres.a.id,
  produit: `accessoire:${catalogue.piles}`,
  minimum: '10',
  cible: '30',
});

beforeEach(async () => {
  await viderBase();
  d = await creerJeuDeDonnees();
  await prisma().lppCode.create({ data: { code: '2332976' } });
  catalogue = await creerCatalogueDevis(d);
  fournisseurs = await creerAchats(d, catalogue);
});

describe('proposerReappro', () => {
  it('compte le stock libre et propose de remonter à la cible', async () => {
    const { admin } = d.acteurs;
    await enregistrerSeuil(admin, seuilAppareils());
    await receptionner(admin, {
      centreId: d.centres.a.id,
      dateReception: '2026-01-15',
      referenceBonLivraison: 'BL',
      referenceFactureFabricant: null,
      commandeId: null,
      appareils: [
        {
          modeleId: catalogue.classeI,
          numerosSerie: ['SN1'],
          prixAchatCentimes: null,
          enConsignation: false,
        },
      ],
      accessoires: [],
    });

    const [ligne] = await proposerReappro(admin, d.centres.a.id);
    expect(ligne).toMatchObject({
      stock: 1,
      enCommande: 0,
      aCommander: 3,
      fournisseurId: fournisseurs.fabricantId,
    });
  });

  it('tient compte des commandes en cours, pas des nominatives', async () => {
    const { admin } = d.acteurs;
    await enregistrerSeuil(admin, seuilAppareils());
    const commandeId = await creerCommande(admin, {
      centreId: d.centres.a.id,
      fournisseurId: fournisseurs.fabricantId,
    });
    await ajouterLigne(admin, commandeId, {
      produit: `modele:${catalogue.classeI}`,
      quantite: '1',
      enConsignation: false,
    });
    await ajouterLigne(admin, commandeId, {
      produit: `modele:${catalogue.classeI}`,
      quantite: '5',
      enConsignation: false,
      patientId: await creerPatientDevis(d),
    });

    const [ligne] = await proposerReappro(admin, d.centres.a.id);
    expect(ligne).toMatchObject({ stock: 0, enCommande: 1, aCommander: 3 });
  });

  it('au-dessus du minimum, rien à commander ; un autre centre ne compte pas', async () => {
    const { admin } = d.acteurs;
    await enregistrerSeuil(admin, seuilPiles());
    await prisma().stockAccessoire.create({
      data: {
        organisationId: d.organisation.id,
        centreId: d.centres.a.id,
        accessoireId: catalogue.piles,
        quantite: 12,
      },
    });
    expect((await proposerReappro(admin, d.centres.a.id))[0]?.aCommander).toBe(0);
    expect(await proposerReappro(admin, d.centres.b.id)).toEqual([]);
  });
});

describe('seuils', () => {
  it('un seuil se remplace, et se retire', async () => {
    const { admin } = d.acteurs;
    await enregistrerSeuil(admin, seuilAppareils());
    await enregistrerSeuil(admin, { ...seuilAppareils(), minimum: '1' });
    const lignes = await proposerReappro(admin, d.centres.a.id);
    expect(lignes).toHaveLength(1);
    expect(lignes[0]?.minimum).toBe(1);

    await retirerSeuil(admin, d.centres.a.id, lignes[0]?.seuilId ?? '');
    expect(await proposerReappro(admin, d.centres.a.id)).toEqual([]);
  });

  it('refuse un produit inconnu, une assistante, un centre hors périmètre', async () => {
    const { admin, assistantA, audioAB } = d.acteurs;
    await expect(
      enregistrerSeuil(admin, {
        ...seuilAppareils(),
        produit: 'modele:019a8000-0000-7000-8000-00000000ffff',
      }),
    ).rejects.toBeInstanceOf(ErreurSaisie);
    await expect(enregistrerSeuil(assistantA, seuilAppareils())).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
    await expect(proposerReappro(audioAB, d.centres.a.id)).rejects.toBeInstanceOf(AccesRefuseError);
  });
});

describe('creerBrouillonsReappro', () => {
  it('crée une demande par fournisseur, en brouillon, et n’en propose plus ensuite', async () => {
    const { admin } = d.acteurs;
    await enregistrerSeuil(admin, seuilAppareils());
    await enregistrerSeuil(admin, seuilPiles());

    const commandes = await creerBrouillonsReappro(admin, d.centres.a.id, [
      { produit: `modele:${catalogue.classeI}`, quantite: '4' },
      { produit: `accessoire:${catalogue.piles}`, quantite: '30' },
    ]);

    expect(commandes).toHaveLength(2);
    const vues = await Promise.all(commandes.map((id) => obtenirCommande(admin, id)));
    expect(vues.map((v) => v.statut)).toEqual(['BROUILLON', 'BROUILLON']);
    expect(vues.map((v) => v.lignes[0]?.quantite).sort()).toEqual([30, 4]);

    const apres = await proposerReappro(admin, d.centres.a.id);
    expect(apres.map((l) => l.aCommander)).toEqual([0, 0]);
  });

  it('une quantité nulle écarte la ligne', async () => {
    const { admin } = d.acteurs;
    await enregistrerSeuil(admin, seuilAppareils());
    expect(
      await creerBrouillonsReappro(admin, d.centres.a.id, [
        { produit: `modele:${catalogue.classeI}`, quantite: '0' },
      ]),
    ).toEqual([]);
  });

  it('refuse un produit sans seuil ou sans fournisseur', async () => {
    const { admin } = d.acteurs;
    await expect(
      creerBrouillonsReappro(admin, d.centres.a.id, [
        { produit: `modele:${catalogue.classeI}`, quantite: '1' },
      ]),
    ).rejects.toBeInstanceOf(ErreurSaisie);

    await enregistrerSeuil(admin, {
      ...seuilAppareils(),
      produit: `accessoire:${catalogue.kit}`,
    });
    await expect(
      creerBrouillonsReappro(admin, d.centres.a.id, [
        { produit: `accessoire:${catalogue.kit}`, quantite: '1' },
      ]),
    ).rejects.toBeInstanceOf(ErreurSaisie);
  });
});
