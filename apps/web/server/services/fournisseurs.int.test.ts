import { prisma } from '@ha/db/admin';
import { PARAMETRES_COMMANDE_DEFAUT } from '@ha/domain';
import { beforeEach, describe, expect, it } from 'vitest';

import { creerJeuDeDonnees, viderBase } from '@/test/donnees';

import { AccesRefuseError } from '../auth/acces';
import { ErreurSaisie } from '../erreurs';
import { creerAccessoire, creerFabricant, obtenirAccessoire } from './catalogue';
import {
  ajouterContact,
  creerCentrale,
  creerFournisseur,
  enregistrerComptes,
  enregistrerParametresCommande,
  lireParametresCommande,
  listerFournisseurs,
  modifierCentrale,
  modifierFournisseur,
  obtenirCentrale,
  obtenirFournisseur,
  retirerContact,
} from './fournisseurs';

let d: Awaited<ReturnType<typeof creerJeuDeDonnees>>;

const fiche = { type: 'FOURNISSEUR', nom: 'Piles Démo', emailCommande: 'piles@exemple.test' };

beforeEach(async () => {
  await viderBase();
  d = await creerJeuDeDonnees();
});

describe('fournisseurs', () => {
  it('crée un fournisseur rattaché à une centrale, sans la prévenir des commandes', async () => {
    const { admin } = d.acteurs;
    const centraleAchatId = await creerCentrale(admin, { nom: 'Centrale Démo', actif: true });
    const id = await creerFournisseur(admin, { ...fiche, centraleAchatId, actif: true });

    expect(await obtenirFournisseur(admin, id)).toMatchObject({
      nom: 'Piles Démo',
      centraleAchat: 'Centrale Démo',
      emailCommande: 'piles@exemple.test',
    });
    const journal = await prisma().journalAudit.findFirst({
      where: { entiteType: 'FOURNISSEUR', entiteId: id, action: 'CREATE' },
    });
    expect(journal).not.toBeNull();
  });

  it('un fabricant du catalogue n’a qu’une fiche', async () => {
    const { admin } = d.acteurs;
    const fabricantId = await creerFabricant(admin, { nom: 'Fabricant Démo', actif: true });
    const saisie = { type: 'FABRICANT', nom: 'Fabricant Démo', fabricantId, actif: true };
    await creerFournisseur(admin, saisie);

    await expect(creerFournisseur(admin, { ...saisie, nom: 'Autre' })).rejects.toBeInstanceOf(
      ErreurSaisie,
    );
  });

  it('refuse deux fiches du même nom', async () => {
    const { admin } = d.acteurs;
    await creerFournisseur(admin, { ...fiche, actif: true });
    await expect(creerFournisseur(admin, { ...fiche, actif: true })).rejects.toBeInstanceOf(
      ErreurSaisie,
    );
  });

  it('refuse un fabricant ou une centrale inconnus', async () => {
    const { admin } = d.acteurs;
    const inconnu = '019a8000-0000-7000-8000-00000000ffff';
    await expect(
      creerFournisseur(admin, { ...fiche, centraleAchatId: inconnu, actif: true }),
    ).rejects.toBeInstanceOf(ErreurSaisie);
    await expect(
      creerFournisseur(admin, {
        type: 'FABRICANT',
        nom: 'Inconnu',
        fabricantId: inconnu,
        actif: true,
      }),
    ).rejects.toBeInstanceOf(ErreurSaisie);
  });

  it('modifie, archive et réserve l’écriture à l’administrateur', async () => {
    const { admin, assistantA } = d.acteurs;
    const id = await creerFournisseur(admin, { ...fiche, actif: true });

    await modifierFournisseur(admin, id, { ...fiche, delaiRelanceJours: '7', actif: false });
    expect(await obtenirFournisseur(admin, id)).toMatchObject({
      delaiRelanceJours: 7,
      actif: false,
    });

    await expect(creerFournisseur(assistantA, { ...fiche, actif: true })).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
    await expect(
      modifierFournisseur(assistantA, id, { ...fiche, actif: true }),
    ).rejects.toBeInstanceOf(AccesRefuseError);
    expect(await listerFournisseurs(assistantA)).toHaveLength(1);
  });

  it('ajoute et retire un contact', async () => {
    const { admin } = d.acteurs;
    const id = await creerFournisseur(admin, { ...fiche, actif: true });
    await ajouterContact(admin, id, { nom: 'Contact Démo', email: 'contact@exemple.test' });
    const { contacts } = await obtenirFournisseur(admin, id);
    expect(contacts).toHaveLength(1);

    await retirerContact(admin, id, contacts[0]?.id ?? '');
    expect((await obtenirFournisseur(admin, id)).contacts).toHaveLength(0);
  });

  it('remplace les numéros de client et refuse un numéro partagé', async () => {
    const { admin } = d.acteurs;
    const { a, b } = d.centres;
    const id = await creerFournisseur(admin, { ...fiche, actif: true });
    await enregistrerComptes(admin, id, [
      { centreId: a.id, numeroClient: 'CL-1' },
      { centreId: b.id, numeroClient: 'CL-2' },
    ]);
    await enregistrerComptes(admin, id, [
      { centreId: a.id, numeroClient: 'CL-3' },
      { centreId: b.id, numeroClient: '' },
    ]);
    expect((await obtenirFournisseur(admin, id)).comptes).toEqual([
      { centreId: a.id, numeroClient: 'CL-3' },
    ]);

    await expect(
      enregistrerComptes(admin, id, [
        { centreId: a.id, numeroClient: 'CL-4' },
        { centreId: b.id, numeroClient: 'CL-4' },
      ]),
    ).rejects.toBeInstanceOf(ErreurSaisie);
  });

  it('un accessoire désigne son fournisseur, qui doit exister', async () => {
    const { admin } = d.acteurs;
    const fournisseurId = await creerFournisseur(admin, { ...fiche, actif: true });
    const accessoire = {
      nom: 'Piles 312',
      nature: 'PILE',
      prixCentimes: '5,00',
      prixAchatCentimes: '2,00',
      actif: true,
    };
    const id = await creerAccessoire(admin, { ...accessoire, fournisseurId });
    expect((await obtenirAccessoire(admin, id)).fournisseurId).toBe(fournisseurId);

    await expect(
      creerAccessoire(admin, {
        ...accessoire,
        nom: 'Piles 13',
        fournisseurId: '019a8000-0000-7000-8000-00000000ffff',
      }),
    ).rejects.toBeInstanceOf(ErreurSaisie);
  });
});

describe('centrales et paramètres', () => {
  it('modifie une centrale, sans doublon', async () => {
    const { admin, assistantA } = d.acteurs;
    const id = await creerCentrale(admin, { nom: 'Centrale Démo', actif: true });
    await creerCentrale(admin, { nom: 'Autre Centrale', actif: true });

    await modifierCentrale(admin, id, { nom: 'Centrale Renommée', actif: false });
    expect(await obtenirCentrale(admin, id)).toMatchObject({
      nom: 'Centrale Renommée',
      actif: false,
    });
    await expect(
      modifierCentrale(admin, id, { nom: 'Autre Centrale', actif: true }),
    ).rejects.toBeInstanceOf(ErreurSaisie);
    await expect(creerCentrale(assistantA, { nom: 'X', actif: true })).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
  });

  it('applique les valeurs par défaut sans ligne, puis celles du client', async () => {
    const { admin, assistantA } = d.acteurs;
    expect(await lireParametresCommande(admin)).toEqual(PARAMETRES_COMMANDE_DEFAUT);

    await enregistrerParametresCommande(admin, {
      delaiRelanceJours: '5',
      relancesMax: '1',
      tolerancePrix: '0,50',
      adresseBoiteFactures: 'factures@exemple.test',
    });
    expect(await lireParametresCommande(admin)).toEqual({
      delaiRelanceJours: 5,
      relancesMax: 1,
      tolerancePrixCentimes: 50,
      adresseBoiteFactures: 'factures@exemple.test',
    });
    await expect(enregistrerParametresCommande(assistantA, {})).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
  });
});
