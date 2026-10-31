import { prisma } from '@ha/db/admin';
import { beforeEach, describe, expect, it } from 'vitest';

import { creerJeuDeDonnees, viderBase, type JeuDeDonnees } from '@/test/donnees';

import { AccesRefuseError, type UtilisateurConnecte } from '../auth/acces';
import { ErreurSaisie } from '../erreurs';
import {
  cloturerInventaire,
  compterAccessoire,
  justifierEcart,
  listerInventaires,
  obtenirInventaire,
  ouvrirInventaire,
  pointerAppareil,
  valeurDuStock,
} from './inventaires';
import { receptionner } from './reception';
import { entreeAccessoire, sortieAccessoire } from './stock';

let d: JeuDeDonnees;
let admin: UtilisateurConnecte;
let assistantA: UtilisateurConnecte;
let assistantB: UtilisateurConnecte;
let modeleId: string;
let accessoireId: string;

const PERIMETRE_A = () => ({ type: 'centre', centreId: d.centres.a.id }) as const;

beforeEach(async () => {
  await viderBase();
  d = await creerJeuDeDonnees();
  ({ admin, assistantA, assistantB } = d.acteurs);
  const fabricant = await prisma().fabricant.create({
    data: { organisationId: d.organisation.id, nom: 'Fabricant' },
  });
  const modele = await prisma().modeleAideAuditive.create({
    data: {
      organisationId: d.organisation.id,
      fabricantId: fabricant.id,
      gamme: 'Gamme',
      nom: 'Alpha',
      type: 'RIC',
      classe: 'CLASSE_II',
      prixConseilleCentimes: 150000,
    },
  });
  modeleId = modele.id;
  const accessoire = await prisma().accessoire.create({
    data: {
      organisationId: d.organisation.id,
      nom: 'Piles 312',
      nature: 'PILE',
      prixCentimes: 500,
      prixAchatCentimes: 200,
    },
  });
  accessoireId = accessoire.id;
});

async function recevoir(numeros: string[], prixAchatCentimes: number | null = 65000) {
  await receptionner(admin, {
    centreId: d.centres.a.id,
    dateReception: '2026-01-15',
    referenceBonLivraison: 'BL-1',
    referenceFactureFabricant: null,
    commandeId: null,
    appareils: [{ modeleId, numerosSerie: numeros, prixAchatCentimes, enConsignation: false }],
    accessoires: [],
  });
}

function entrerPiles(quantite: number) {
  return entreeAccessoire(admin, {
    centreId: d.centres.a.id,
    accessoireId,
    quantite,
    motif: 'Stock initial',
  });
}

function ouvrir() {
  return ouvrirInventaire(admin, { centreId: d.centres.a.id });
}

describe('ouverture', () => {
  it('réserve l’ouverture aux rôles de gestion', async () => {
    await expect(ouvrirInventaire(assistantA, { centreId: d.centres.a.id })).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
  });

  it('un seul inventaire ouvert par centre', async () => {
    await ouvrir();
    await expect(ouvrir()).rejects.toMatchObject({
      erreurs: { centreId: ['Un inventaire est déjà ouvert dans ce centre.'] },
    });
    await expect(ouvrirInventaire(admin, { centreId: d.centres.b.id })).resolves.toEqual(
      expect.any(String),
    );
  });

  it('liste selon le périmètre', async () => {
    const id = await ouvrir();
    const liste = await listerInventaires(assistantA, PERIMETRE_A());
    expect(liste.map((l) => l.id)).toEqual([id]);
    await expect(listerInventaires(assistantB, PERIMETRE_A())).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
  });
});

describe('pointage et écarts', () => {
  it('distingue attendus, manquants et excédents, sans doublon de douchette', async () => {
    await recevoir(['SN1', 'SN2']);
    const id = await ouvrir();
    expect(await pointerAppareil(assistantA, id, { numeroSerie: 'sn1' })).toBe('ATTENDU');
    expect(await pointerAppareil(assistantA, id, { numeroSerie: 'SN1' })).toBe('ATTENDU');
    expect(await pointerAppareil(assistantA, id, { numeroSerie: 'INCONNU' })).toBe('NON_ATTENDU');

    const detail = await obtenirInventaire(assistantA, id);
    expect(detail).toMatchObject({ appareilsAttendus: 2, appareilsPointes: 2, gestion: false });
    expect(detail.manquants.map((m) => m.numeroSerie)).toEqual(['SN2']);
    expect(detail.excedents.map((m) => m.numeroSerie)).toEqual(['INCONNU']);
  });

  it('refuse un inventaire d’un autre centre', async () => {
    const id = await ouvrir();
    await expect(pointerAppareil(assistantB, id, { numeroSerie: 'SN1' })).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
    await expect(obtenirInventaire(assistantB, id)).rejects.toBeInstanceOf(AccesRefuseError);
  });

  it('refuse le pointage d’un inventaire clôturé', async () => {
    const id = await ouvrir();
    await cloturerInventaire(admin, id);
    await expect(pointerAppareil(assistantA, id, { numeroSerie: 'SN1' })).rejects.toThrow(
      'Cet inventaire est clôturé.',
    );
  });

  it('réserve la justification aux rôles de gestion', async () => {
    const id = await ouvrir();
    await expect(
      justifierEcart(assistantA, id, { numeroSerie: 'SN1', justification: 'Casse' }),
    ).rejects.toBeInstanceOf(AccesRefuseError);
  });

  it('refuse de justifier un accessoire non compté', async () => {
    const id = await ouvrir();
    await expect(
      justifierEcart(admin, id, { accessoireId, justification: 'Casse' }),
    ).rejects.toThrow(ErreurSaisie);
  });
});

describe('clôture', () => {
  it('exige tous les accessoires comptés, puis tous les écarts justifiés', async () => {
    await recevoir(['SN1']);
    await entrerPiles(10);
    const id = await ouvrir();
    await expect(cloturerInventaire(admin, id)).rejects.toThrow(
      'Il reste 1 accessoire(s) à compter.',
    );
    await compterAccessoire(assistantA, id, { accessoireId, quantiteComptee: '7' });
    await expect(cloturerInventaire(admin, id)).rejects.toThrow('Il reste 2 écart(s) à justifier.');
    await justifierEcart(admin, id, { numeroSerie: 'SN1', justification: 'Introuvable' });
    await expect(cloturerInventaire(admin, id)).rejects.toThrow('Il reste 1 écart(s) à justifier.');
  });

  it('réserve la clôture aux rôles de gestion', async () => {
    const id = await ouvrir();
    await expect(cloturerInventaire(assistantA, id)).rejects.toBeInstanceOf(AccesRefuseError);
  });

  it('corrige les accessoires, garde l’appareil manquant et photographie la valeur', async () => {
    await recevoir(['SN1', 'SN2']);
    await entrerPiles(10);
    const id = await ouvrir();
    await pointerAppareil(assistantA, id, { numeroSerie: 'SN1' });
    await compterAccessoire(assistantA, id, { accessoireId, quantiteComptee: '7' });
    await justifierEcart(admin, id, { numeroSerie: 'SN2', justification: 'Introuvable' });
    await justifierEcart(admin, id, { accessoireId, justification: 'Trois boîtes abîmées' });
    await cloturerInventaire(admin, id);

    const stock = await prisma().stockAccessoire.findFirstOrThrow();
    expect(stock.quantite).toBe(7);
    const mouvement = await prisma().mouvementAccessoire.findFirstOrThrow({
      where: { type: 'INVENTAIRE_SORTIE' },
    });
    expect(mouvement).toMatchObject({ quantite: 3, quantiteApres: 7 });
    expect(mouvement.motif.startsWith('v1.')).toBe(true);

    const appareil = await prisma().appareil.findFirstOrThrow({ where: { numeroSerie: 'SN2' } });
    expect(appareil.statut).toBe('EN_STOCK');

    const detail = await obtenirInventaire(admin, id);
    expect(detail.statut).toBe('CLOTURE');
    expect(detail.manquants).toEqual([{ numeroSerie: 'SN2', justification: 'Introuvable' }]);
    expect(detail.accessoires[0]).toMatchObject({
      ecart: -3,
      justification: 'Trois boîtes abîmées',
    });
    expect(detail.valeur).toEqual({
      valeurCentimes: 2 * 65000 + 7 * 200,
      articlesSansPrix: 0,
    });
    expect((await obtenirInventaire(assistantA, id)).valeur).toBeNull();
  });

  it('crédite un écart positif et ignore les ventes postérieures au comptage', async () => {
    await entrerPiles(10);
    const id = await ouvrir();
    await compterAccessoire(assistantA, id, { accessoireId, quantiteComptee: '12' });
    await sortieAccessoire(admin, {
      centreId: d.centres.a.id,
      accessoireId,
      quantite: 1,
      motif: 'Vente',
    });
    await justifierEcart(admin, id, { accessoireId, justification: 'Boîtes retrouvées' });
    await cloturerInventaire(admin, id);
    const stock = await prisma().stockAccessoire.findFirstOrThrow();
    expect(stock.quantite).toBe(11);
  });

  it('un excédent justifié se clôture et reste consigné', async () => {
    const id = await ouvrir();
    await pointerAppareil(assistantA, id, { numeroSerie: 'INCONNU' });
    await justifierEcart(admin, id, { numeroSerie: 'INCONNU', justification: 'Retour non saisi' });
    await cloturerInventaire(admin, id);
    const detail = await obtenirInventaire(admin, id);
    expect(detail.excedents).toEqual([
      { numeroSerie: 'INCONNU', justification: 'Retour non saisi' },
    ]);
  });

  it('un écart résolu après sa justification n’en est plus un à la clôture', async () => {
    await recevoir(['SN1']);
    const id = await ouvrir();
    await justifierEcart(admin, id, { numeroSerie: 'SN1', justification: 'Introuvable' });
    await pointerAppareil(assistantA, id, { numeroSerie: 'SN1' });
    await cloturerInventaire(admin, id);
    const detail = await obtenirInventaire(admin, id);
    expect(detail.manquants).toEqual([]);
    expect(detail.excedents).toEqual([]);
  });

  it('la base refuse de modifier un inventaire clôturé', async () => {
    await recevoir(['SN1']);
    const id = await ouvrir();
    await pointerAppareil(assistantA, id, { numeroSerie: 'SN1' });
    await cloturerInventaire(admin, id);
    await expect(
      prisma().inventaire.update({ where: { id }, data: { valeurCentimes: 1 } }),
    ).rejects.toThrow('inventaire clôturé');
    await expect(
      prisma().inventaireLigne.updateMany({ where: { inventaireId: id }, data: { pointe: false } }),
    ).rejects.toThrow('inventaire clôturé');
  });
});

describe('valeur du stock', () => {
  it('additionne au prix d’achat et compte les articles sans prix', async () => {
    await recevoir(['SN1', 'SN2']);
    await recevoir(['SN3'], null);
    await entrerPiles(5);
    expect(await valeurDuStock(admin, PERIMETRE_A())).toEqual({
      valeurCentimes: 2 * 65000 + 5 * 200,
      articlesSansPrix: 1,
    });
  });

  it('ignore les appareils en consignation et vendus', async () => {
    await recevoir(['SN1', 'SN2', 'SN3']);
    await prisma().appareil.update({
      where: { fabricantId_numeroSerie: await cleAppareil('SN1') },
      data: { enConsignation: true },
    });
    await prisma().appareil.update({
      where: { fabricantId_numeroSerie: await cleAppareil('SN2') },
      data: { statut: 'VENDU' },
    });
    expect(await valeurDuStock(admin, PERIMETRE_A())).toEqual({
      valeurCentimes: 65000,
      articlesSansPrix: 0,
    });
  });

  it('est réservée aux rôles de gestion', async () => {
    await expect(valeurDuStock(assistantA, PERIMETRE_A())).rejects.toBeInstanceOf(AccesRefuseError);
  });
});

async function cleAppareil(numeroSerie: string) {
  const { fabricantId } = await prisma().appareil.findFirstOrThrow({ where: { numeroSerie } });
  return { fabricantId, numeroSerie };
}
