import { prisma } from '@ha/db/admin';
import { beforeEach, describe, expect, it } from 'vitest';

import { creerAchats } from '@/test/achats';
import { creerCatalogueDevis, creerPatientDevis, type CatalogueDevis } from '@/test/devis';
import { creerJeuDeDonnees, viderBase, type JeuDeDonnees } from '@/test/donnees';

import { AccesRefuseError, type UtilisateurConnecte } from '../auth/acces';
import { ErreurSaisie } from '../erreurs';
import {
  ajouterLigne,
  annulerCommande,
  approuverCommande,
  cloturerCommande,
  creerCommande,
  obtenirCommande,
  soumettreCommande,
} from './commandes';
import { listerEcarts, traiterEcart } from './ecarts-achat';
import { transmettreCommande } from './envoi-commandes';
import { aujourdhui } from './patients';
import { abandonnerReliquat, pointerReception } from './reception-commande';

let d: JeuDeDonnees;
let catalogue: CatalogueDevis;
let fournisseurs: Awaited<ReturnType<typeof creerAchats>>;

interface LigneDemandee {
  produit: string;
  quantite: string;
  enConsignation?: boolean;
  patientId?: string;
}

async function commandeEnvoyee(
  lignes: readonly LigneDemandee[],
  fournisseurId = fournisseurs.fabricantId,
) {
  const { admin } = d.acteurs;
  const id = await creerCommande(admin, { centreId: d.centres.a.id, fournisseurId });
  for (const ligne of lignes) {
    await ajouterLigne(admin, id, { enConsignation: false, ...ligne });
  }
  await soumettreCommande(admin, id);
  await approuverCommande(admin, id);
  await transmettreCommande(admin, id);
  return id;
}

const appareils = (quantite = '2') => ({ produit: `modele:${catalogue.classeI}`, quantite });

async function pointer(
  acteur: UtilisateurConnecte,
  id: string,
  lignes: readonly {
    numerosSerie?: string[];
    quantite?: string;
    quantiteNonConforme?: string;
    commentaire?: string;
  }[],
) {
  const { lignes: vues } = await obtenirCommande(d.acteurs.admin, id);
  return pointerReception(acteur, id, {
    dateReception: aujourdhui(),
    referenceBonLivraison: 'BL-1',
    lignes: lignes.map((l, rang) => ({
      ligneId: vues[rang]?.id,
      quantite: '0',
      numerosSerie: [],
      quantiteNonConforme: '0',
      ...l,
    })),
  });
}

beforeEach(async () => {
  await viderBase();
  d = await creerJeuDeDonnees();
  await prisma().lppCode.create({ data: { code: '2332976' } });
  catalogue = await creerCatalogueDevis(d);
  fournisseurs = await creerAchats(d, catalogue);
});

describe('réception partielle', () => {
  it('crée les appareils au prix de la commande, sans droit sur les prix, puis complète', async () => {
    const { assistantA, admin } = d.acteurs;
    const id = await commandeEnvoyee([appareils()]);

    await pointer(assistantA, id, [{ numerosSerie: ['SN 001'] }]);
    let vue = await obtenirCommande(admin, id);
    expect(vue.statut).toBe('PARTIELLEMENT_RECUE');
    expect(vue.lignes[0]?.quantiteRecue).toBe(1);

    const appareil = await prisma().appareil.findFirstOrThrow({
      where: { numeroSerie: 'SN001' },
    });
    expect(appareil).toMatchObject({
      statut: 'EN_STOCK',
      centreId: d.centres.a.id,
      prixAchatCentimes: 60_000,
      referenceBonLivraison: 'BL-1',
    });
    const mouvement = await prisma().mouvementAppareil.findFirstOrThrow({
      where: { appareilId: appareil.id },
    });
    expect(mouvement.commandeId).toBe(id);
    expect(await prisma().receptionLigneAppareil.count()).toBe(1);

    await pointer(assistantA, id, [{ numerosSerie: ['SN002'] }]);
    vue = await obtenirCommande(admin, id);
    expect(vue.statut).toBe('RECUE');
    expect(vue.receptions).toHaveLength(2);
    expect((await listerEcarts(admin, { type: 'tous' }, {})).lignes).toHaveLength(0);
  });

  it('entre les accessoires en stock, avec le lien vers la commande', async () => {
    const { admin } = d.acteurs;
    const id = await commandeEnvoyee(
      [{ produit: `accessoire:${catalogue.piles}`, quantite: '10' }],
      fournisseurs.accessoiresId,
    );
    await pointer(admin, id, [{ quantite: '4' }]);

    const stock = await prisma().stockAccessoire.findUniqueOrThrow({
      where: {
        centreId_accessoireId: { centreId: d.centres.a.id, accessoireId: catalogue.piles },
      },
    });
    expect(stock.quantite).toBe(4);
    const mouvement = await prisma().mouvementAccessoire.findFirstOrThrow({
      where: { commandeId: id },
    });
    expect(mouvement).toMatchObject({ type: 'ENTREE', quantite: 4 });
  });

  it('une ligne sur deux reçue laisse la commande partielle', async () => {
    const { admin } = d.acteurs;
    const id = await commandeEnvoyee([
      appareils('1'),
      { produit: `modele:${catalogue.classeII}`, quantite: '1' },
    ]);
    await pointer(admin, id, [{ numerosSerie: ['SN100'] }]);
    expect((await obtenirCommande(admin, id)).statut).toBe('PARTIELLEMENT_RECUE');
  });

  it('un numéro déjà connu annule toute la réception', async () => {
    const { admin } = d.acteurs;
    const id = await commandeEnvoyee([appareils()]);
    await pointer(admin, id, [{ numerosSerie: ['SN200'] }]);

    await expect(pointer(admin, id, [{ numerosSerie: ['SN201', 'SN200'] }])).rejects.toBeInstanceOf(
      ErreurSaisie,
    );
    expect(await prisma().appareil.count({ where: { numeroSerie: 'SN201' } })).toBe(0);
    expect(await prisma().reception.count()).toBe(1);
    expect((await obtenirCommande(admin, id)).lignes[0]?.quantiteRecue).toBe(1);
  });

  it('une ligne nominative journalise le patient et reste en stock', async () => {
    const { admin } = d.acteurs;
    const patientId = await creerPatientDevis(d);
    const id = await commandeEnvoyee([{ ...appareils('1'), patientId }]);
    await pointer(admin, id, [{ numerosSerie: ['SN300'] }]);

    const appareil = await prisma().appareil.findFirstOrThrow({ where: { numeroSerie: 'SN300' } });
    expect(appareil).toMatchObject({ statut: 'EN_STOCK', patientId: null });
    const journal = await prisma().journalAudit.findFirst({
      where: { entiteType: 'COMMANDE', entiteId: id, patientId, action: 'UPDATE' },
      orderBy: { id: 'desc' },
    });
    expect(journal?.details).toMatchObject({ receptionId: expect.any(String) as string });
  });
});

describe('écarts à la réception', () => {
  it('signale un surplus, qui entre en stock', async () => {
    const { admin } = d.acteurs;
    const id = await commandeEnvoyee([appareils('1')]);
    await pointer(admin, id, [{ numerosSerie: ['SN400', 'SN401'] }]);

    expect((await obtenirCommande(admin, id)).statut).toBe('RECUE');
    const { lignes } = await listerEcarts(admin, { type: 'tous' }, {});
    expect(lignes[0]).toMatchObject({
      type: 'SURPLUS',
      statut: 'OUVERT',
      quantiteAttendue: 1,
      quantiteConstatee: 2,
    });
  });

  it('un produit non conforme n’entre pas en stock, son commentaire est chiffré', async () => {
    const { admin } = d.acteurs;
    const id = await commandeEnvoyee([appareils('1')]);
    await pointer(admin, id, [{ quantiteNonConforme: '1', commentaire: 'Mauvais modèle' }]);

    expect(await prisma().appareil.count()).toBe(0);
    const vue = await obtenirCommande(admin, id);
    expect(vue).toMatchObject({ statut: 'ENVOYEE', ecartsATraiter: 1 });
    const { lignes } = await listerEcarts(admin, { type: 'tous' }, {});
    expect(lignes[0]).toMatchObject({
      type: 'PRODUIT_NON_CONFORME',
      commentaire: 'Mauvais modèle',
    });
    const brut = await prisma().ecartAchat.findFirstOrThrow();
    expect(brut.commentaire).toMatch(/^v1\./);
  });

  it('les écarts sont réservés à la gestion, et se traitent une fois', async () => {
    const { admin, assistantA } = d.acteurs;
    const id = await commandeEnvoyee([appareils('1')]);
    await pointer(admin, id, [{ numerosSerie: ['SN500', 'SN501'] }]);
    const [ecart] = (await listerEcarts(admin, { type: 'tous' }, {})).lignes;
    const ecartId = ecart?.id ?? '';

    await expect(listerEcarts(assistantA, { type: 'tous' }, {})).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
    await expect(
      traiterEcart(assistantA, ecartId, { statut: 'RESOLU', commentaire: 'x' }),
    ).rejects.toBeInstanceOf(AccesRefuseError);
    await traiterEcart(admin, ecartId, { statut: 'ACCEPTE', commentaire: 'Gardé en stock' });
    await expect(
      traiterEcart(admin, ecartId, { statut: 'RESOLU', commentaire: 'x' }),
    ).rejects.toBeInstanceOf(ErreurSaisie);
  });
});

describe('reliquat', () => {
  it('l’abandon consigne le manque et solde la réception', async () => {
    const { admin, assistantA } = d.acteurs;
    const id = await commandeEnvoyee([appareils()]);
    await pointer(admin, id, [{ numerosSerie: ['SN600'] }]);
    const ligneId = (await obtenirCommande(admin, id)).lignes[0]?.id ?? '';

    await expect(
      abandonnerReliquat(assistantA, id, ligneId, { motif: 'x' }),
    ).rejects.toBeInstanceOf(AccesRefuseError);
    await abandonnerReliquat(admin, id, ligneId, { motif: 'Modèle arrêté' });

    const vue = await obtenirCommande(admin, id);
    expect(vue.statut).toBe('RECUE');
    expect(vue.lignes[0]?.quantiteAbandonnee).toBe(1);
    const { lignes } = await listerEcarts(admin, { type: 'tous' }, {});
    expect(lignes[0]).toMatchObject({
      type: 'QUANTITE_MANQUANTE',
      statut: 'ACCEPTE',
      commentaire: 'Modèle arrêté',
    });

    await expect(abandonnerReliquat(admin, id, ligneId, { motif: 'x' })).rejects.toBeInstanceOf(
      ErreurSaisie,
    );
  });
});

describe('garde-fous', () => {
  it('refuse une commande qui n’attend rien, une ligne inconnue, un pointage vide', async () => {
    const { admin } = d.acteurs;
    const id = await commandeEnvoyee([appareils('1')]);
    await expect(pointer(admin, id, [{}])).rejects.toBeInstanceOf(ErreurSaisie);
    await expect(
      pointerReception(admin, id, {
        dateReception: aujourdhui(),
        referenceBonLivraison: 'BL',
        lignes: [
          {
            ligneId: '019a8000-0000-7000-8000-00000000ffff',
            quantite: '1',
            numerosSerie: [],
            quantiteNonConforme: '0',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(AccesRefuseError);

    await pointer(admin, id, [{ numerosSerie: ['SN700'] }]);
    await expect(pointer(admin, id, [{ numerosSerie: ['SN701'] }])).rejects.toBeInstanceOf(
      ErreurSaisie,
    );
  });

  it('refuse des numéros sur un accessoire, une quantité sur un appareil', async () => {
    const { admin } = d.acteurs;
    const id = await commandeEnvoyee([appareils('1')]);
    await expect(pointer(admin, id, [{ quantite: '1' }])).rejects.toBeInstanceOf(ErreurSaisie);

    const accessoires = await commandeEnvoyee(
      [{ produit: `accessoire:${catalogue.piles}`, quantite: '1' }],
      fournisseurs.accessoiresId,
    );
    await expect(pointer(admin, accessoires, [{ numerosSerie: ['SN800'] }])).rejects.toBeInstanceOf(
      ErreurSaisie,
    );
  });

  it('une réception et ses lignes ne se modifient pas', async () => {
    const { admin } = d.acteurs;
    const id = await commandeEnvoyee([appareils('1')]);
    await pointer(admin, id, [{ numerosSerie: ['SN900'] }]);
    await expect(
      prisma().reception.updateMany({ data: { referenceBonLivraison: 'Autre' } }),
    ).rejects.toThrow(/ne se modifie pas/);
    await expect(prisma().receptionLigne.deleteMany()).rejects.toThrow(/ne se modifie pas/);
  });

  it('une commande reçue ne s’annule plus', async () => {
    const { admin } = d.acteurs;
    const id = await commandeEnvoyee([appareils()]);
    await pointer(admin, id, [{ numerosSerie: ['SN950'] }]);
    await expect(annulerCommande(admin, id, { motif: 'x' })).rejects.toBeInstanceOf(ErreurSaisie);
  });

  it('un écart à traiter retient la clôture d’une commande en consignation', async () => {
    const { admin } = d.acteurs;
    const id = await commandeEnvoyee([{ ...appareils('1'), enConsignation: true }]);
    await pointer(admin, id, [{ numerosSerie: ['SN960', 'SN961'] }]);

    await expect(cloturerCommande(admin, id)).rejects.toBeInstanceOf(ErreurSaisie);
    const [ecart] = (await listerEcarts(admin, { type: 'tous' }, {})).lignes;
    await traiterEcart(admin, ecart?.id ?? '', { statut: 'CONTESTE', commentaire: 'En cours' });
    await expect(cloturerCommande(admin, id)).rejects.toBeInstanceOf(ErreurSaisie);

    await prisma().ecartAchat.updateMany({ data: { statut: 'RESOLU' } });
    await cloturerCommande(admin, id);
    expect((await obtenirCommande(admin, id)).statut).toBe('CLOSE');
    const appareil = await prisma().appareil.findFirstOrThrow({ where: { numeroSerie: 'SN960' } });
    expect(appareil.enConsignation).toBe(true);
  });
});
