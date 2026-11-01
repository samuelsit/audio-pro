import { prisma } from '@ha/db/admin';
import { beforeEach, describe, expect, it } from 'vitest';

import { creerAchats } from '@/test/achats';
import { creerCatalogueDevis, creerPatientDevis, type CatalogueDevis } from '@/test/devis';
import { creerJeuDeDonnees, viderBase, type JeuDeDonnees } from '@/test/donnees';

import { AccesRefuseError, type UtilisateurConnecte } from '../auth/acces';
import { ErreurSaisie } from '../erreurs';
import { signatureLienCommande } from '../reservation-empreintes';
import {
  ajouterLigne,
  annulerCommande,
  approuverCommande,
  creerCommande,
  obtenirCommande,
  soumettreCommande,
} from './commandes';
import {
  accuserParLien,
  lireCommandeAccusable,
  saisirAccuse,
  telechargerBon,
  transmettreCommande,
} from './envoi-commandes';

let d: JeuDeDonnees;
let catalogue: CatalogueDevis;
let fournisseurs: Awaited<ReturnType<typeof creerAchats>>;

async function commandeApprouvee(acteur: UtilisateurConnecte) {
  const id = await creerCommande(acteur, {
    centreId: d.centres.a.id,
    fournisseurId: fournisseurs.fabricantId,
  });
  await ajouterLigne(acteur, id, {
    produit: `modele:${catalogue.classeI}`,
    quantite: '1',
    enConsignation: false,
  });
  await soumettreCommande(acteur, id);
  await approuverCommande(acteur, id);
  return id;
}

function jetonDe(commandeId: string): string {
  return signatureLienCommande().signer({ organisationId: d.organisation.id, commandeId });
}

beforeEach(async () => {
  await viderBase();
  d = await creerJeuDeDonnees();
  await prisma().lppCode.create({ data: { code: '2332976' } });
  catalogue = await creerCatalogueDevis(d);
  fournisseurs = await creerAchats(d, catalogue);
});

describe('transmettreCommande', () => {
  it('stocke le bon, écrit le message et passe en ENVOYEE', async () => {
    const { admin } = d.acteurs;
    const id = await commandeApprouvee(admin);
    await transmettreCommande(admin, id);

    expect(await obtenirCommande(admin, id)).toMatchObject({
      statut: 'ENVOYEE',
      envoi: 'A_ENVOYER',
    });
    const message = await prisma().notification.findFirstOrThrow({ where: { commandeId: id } });
    expect(message).toMatchObject({ gabarit: 'BON_COMMANDE', statut: 'A_ENVOYER' });
    expect(message.destinataire).not.toContain('@');

    const journal = await prisma().journalAudit.findFirst({
      where: { entiteType: 'COMMANDE', entiteId: id, action: 'SEND' },
    });
    expect(journal).not.toBeNull();
  });

  it('ne part pas deux fois', async () => {
    const { admin } = d.acteurs;
    const id = await commandeApprouvee(admin);
    await transmettreCommande(admin, id);
    await expect(transmettreCommande(admin, id)).rejects.toBeInstanceOf(ErreurSaisie);
  });

  it('une commande non approuvée ne part pas', async () => {
    const { admin } = d.acteurs;
    const id = await creerCommande(admin, {
      centreId: d.centres.a.id,
      fournisseurId: fournisseurs.fabricantId,
    });
    await expect(transmettreCommande(admin, id)).rejects.toBeInstanceOf(ErreurSaisie);
  });

  it('sans adresse de commande, la commande reste approuvée', async () => {
    const { admin } = d.acteurs;
    await prisma().fournisseur.update({
      where: { id: fournisseurs.fabricantId },
      data: { emailCommande: null },
    });
    const id = await commandeApprouvee(admin);
    await expect(transmettreCommande(admin, id)).rejects.toBeInstanceOf(ErreurSaisie);
    expect((await obtenirCommande(admin, id)).statut).toBe('APPROUVEE');
  });

  it('annuler une commande dont le bon n’est pas parti retient le message', async () => {
    const { admin } = d.acteurs;
    const id = await commandeApprouvee(admin);
    await transmettreCommande(admin, id);
    await annulerCommande(admin, id, { motif: 'Erreur' });
    const message = await prisma().notification.findFirstOrThrow({ where: { commandeId: id } });
    expect(message.statut).toBe('ABANDONNEE');
  });
});

describe('telechargerBon', () => {
  it('rend un aperçu, puis le bon stocké, sans nom de patient', async () => {
    const { admin } = d.acteurs;
    const patientId = await creerPatientDevis(d);
    const id = await creerCommande(admin, {
      centreId: d.centres.a.id,
      fournisseurId: fournisseurs.fabricantId,
    });
    await ajouterLigne(admin, id, {
      produit: `modele:${catalogue.classeI}`,
      quantite: '1',
      enConsignation: false,
      patientId,
      oreille: 'GAUCHE',
    });
    const texte = (octets: Uint8Array) => Buffer.from(octets).toString('latin1');
    const apercu = await telechargerBon(admin, id);
    expect(apercu.nomFichier).toBe('bon-de-commande.pdf');
    expect(texte(apercu.contenu)).not.toContain('Essai');
    expect(texte(apercu.contenu)).not.toContain('Camille');

    await soumettreCommande(admin, id);
    await approuverCommande(admin, id);
    await transmettreCommande(admin, id);
    const { contenu } = await telechargerBon(admin, id);
    expect(contenu.length).toBeGreaterThan(0);
  });

  it('est réservé aux rôles qui voient les prix, dans leurs centres', async () => {
    const { admin, assistantA } = d.acteurs;
    const id = await commandeApprouvee(admin);
    await expect(telechargerBon(assistantA, id)).rejects.toBeInstanceOf(AccesRefuseError);
  });
});

describe('accusé', () => {
  async function envoyee() {
    const { admin } = d.acteurs;
    const id = await commandeApprouvee(admin);
    await transmettreCommande(admin, id);
    return id;
  }

  it('saisi à l’écran, avec la référence du fabricant', async () => {
    const { assistantA, admin } = d.acteurs;
    const id = await envoyee();
    await saisirAccuse(assistantA, id, { referenceFournisseur: 'FAB-42' });
    const vue = await obtenirCommande(admin, id);
    expect(vue.accuseLe).not.toBeNull();
    expect(vue.referenceFournisseur).toBe('FAB-42');
  });

  it('une commande non partie ne s’accuse pas', async () => {
    const { admin } = d.acteurs;
    const id = await commandeApprouvee(admin);
    await expect(saisirAccuse(admin, id, {})).rejects.toBeInstanceOf(ErreurSaisie);
    expect(await lireCommandeAccusable(jetonDe(id))).toBeNull();
  });

  it('par le lien : numéro et centre seulement, le premier accusé fait foi', async () => {
    const { admin } = d.acteurs;
    const id = await envoyee();
    const jeton = jetonDe(id);

    const avant = await lireCommandeAccusable(jeton);
    expect(avant).toMatchObject({ centre: 'Centre A', dejaAccusee: false });
    expect(Object.keys(avant ?? {}).sort()).toEqual(['centre', 'dejaAccusee', 'numero']);

    expect(await accuserParLien(jeton, { referenceFournisseur: 'FAB-1' })).toBe(true);
    expect(await accuserParLien(jeton, { referenceFournisseur: 'FAB-2' })).toBe(false);
    expect((await obtenirCommande(admin, id)).referenceFournisseur).toBe('FAB-1');
    expect(await lireCommandeAccusable(jeton)).toMatchObject({ dejaAccusee: true });

    const journal = await prisma().journalAudit.findMany({
      where: { entiteType: 'COMMANDE', entiteId: id, utilisateurId: null },
    });
    expect(journal).toHaveLength(1);
  });

  it('un jeton falsifié n’ouvre rien', async () => {
    const id = await envoyee();
    const faux = `${d.organisation.id}.${id}.signature`;
    expect(await lireCommandeAccusable(faux)).toBeNull();
    expect(await accuserParLien(faux, {})).toBe(false);
  });
});
