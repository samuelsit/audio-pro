import { prisma } from '@ha/db/admin';
import { beforeEach, describe, expect, it } from 'vitest';

import { creerAchats } from '@/test/achats';
import { creerCatalogueDevis, creerPatientDevis, type CatalogueDevis } from '@/test/devis';
import { creerJeuDeDonnees, creerResponsable, viderBase, type JeuDeDonnees } from '@/test/donnees';

import { AccesRefuseError, type UtilisateurConnecte } from '../auth/acces';
import { ErreurSaisie } from '../erreurs';
import {
  ajouterLigne,
  annulerCommande,
  approuverCommande,
  cloturerCommande,
  creerCommande,
  fixerPrixLigne,
  listerCommandes,
  obtenirCommande,
  produitsDuFournisseur,
  refuserCommande,
  retirerLigne,
  soumettreCommande,
} from './commandes';
import { creerRegleCommande, modifierRegleCommande } from './regles-commande';

let d: JeuDeDonnees;
let catalogue: CatalogueDevis;
let fournisseurs: Awaited<ReturnType<typeof creerAchats>>;

function nouvelle(acteur: UtilisateurConnecte, fournisseurId = fournisseurs.fabricantId) {
  return creerCommande(acteur, { centreId: d.centres.a.id, fournisseurId });
}

const ligneAppareil = (quantite = '2') => ({
  produit: `modele:${catalogue.classeI}`,
  quantite,
  enConsignation: false,
});

async function commandeAvecLigne(acteur: UtilisateurConnecte) {
  const id = await nouvelle(acteur);
  await ajouterLigne(acteur, id, ligneAppareil());
  return id;
}

beforeEach(async () => {
  await viderBase();
  d = await creerJeuDeDonnees();
  await prisma().lppCode.create({ data: { code: '2332976' } });
  catalogue = await creerCatalogueDevis(d);
  fournisseurs = await creerAchats(d, catalogue);
});

describe('demande', () => {
  it('une assistante crée une demande, numérotée, au prix du catalogue qu’elle ne voit pas', async () => {
    const { assistantA, admin } = d.acteurs;
    const id = await commandeAvecLigne(assistantA);

    const vue = await obtenirCommande(assistantA, id);
    expect(vue).toMatchObject({ statut: 'BROUILLON', montantCentimes: null });
    expect(vue.numero).toMatch(/^CMD-\d{4}-000001$/);
    expect(vue.lignes[0]).toMatchObject({ quantite: 2, prixAchatCentimes: null });

    expect((await obtenirCommande(admin, id)).montantCentimes).toBe(120_000);
    const liste = await listerCommandes(
      assistantA,
      { type: 'centre', centreId: d.centres.a.id },
      {},
    );
    expect(liste.lignes[0]?.montantCentimes).toBeNull();
  });

  it('refuse un prix saisi par un rôle qui ne voit pas les prix', async () => {
    const { assistantA } = d.acteurs;
    const id = await nouvelle(assistantA);
    await expect(
      ajouterLigne(assistantA, id, { ...ligneAppareil(), prixAchatCentimes: '1,00' }),
    ).rejects.toBeInstanceOf(AccesRefuseError);
  });

  it('un prix saisi par la gestion remplace celui du catalogue', async () => {
    const { admin } = d.acteurs;
    const id = await nouvelle(admin);
    await ajouterLigne(admin, id, { ...ligneAppareil('1'), prixAchatCentimes: '500,00' });
    expect((await obtenirCommande(admin, id)).montantCentimes).toBe(50_000);
  });

  it('refuse un produit que le fournisseur ne livre pas, ou un fournisseur inconnu', async () => {
    const { admin } = d.acteurs;
    const id = await nouvelle(admin, fournisseurs.accessoiresId);
    await expect(ajouterLigne(admin, id, ligneAppareil())).rejects.toBeInstanceOf(ErreurSaisie);

    const autre = await nouvelle(admin);
    await expect(
      ajouterLigne(admin, autre, {
        produit: `accessoire:${catalogue.piles}`,
        quantite: '1',
        enConsignation: false,
      }),
    ).rejects.toBeInstanceOf(ErreurSaisie);

    await expect(
      creerCommande(admin, {
        centreId: d.centres.a.id,
        fournisseurId: '019a8000-0000-7000-8000-00000000ffff',
      }),
    ).rejects.toBeInstanceOf(ErreurSaisie);
  });

  it('liste les produits du fournisseur', async () => {
    const { admin } = d.acteurs;
    expect(await produitsDuFournisseur(admin, fournisseurs.accessoiresId)).toEqual([
      { valeur: `accessoire:${catalogue.piles}`, libelle: 'Piles 13' },
    ]);
    const valeurs = (await produitsDuFournisseur(admin, fournisseurs.fabricantId)).map(
      (p) => p.valeur,
    );
    expect(valeurs).toContain(`modele:${catalogue.classeI}`);
  });

  it('refuse le centre d’un autre', async () => {
    const { assistantB } = d.acteurs;
    await expect(nouvelle(assistantB)).rejects.toBeInstanceOf(AccesRefuseError);
    const id = await commandeAvecLigne(d.acteurs.admin);
    await expect(obtenirCommande(assistantB, id)).rejects.toBeInstanceOf(AccesRefuseError);
    await expect(ajouterLigne(assistantB, id, ligneAppareil())).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
  });

  it('une ligne se retire tant que la commande est un brouillon', async () => {
    const { admin } = d.acteurs;
    const id = await commandeAvecLigne(admin);
    const ligneId = (await obtenirCommande(admin, id)).lignes[0]?.id ?? '';
    await retirerLigne(admin, id, ligneId);
    expect((await obtenirCommande(admin, id)).lignes).toHaveLength(0);
    await expect(soumettreCommande(admin, id)).rejects.toBeInstanceOf(ErreurSaisie);
  });
});

describe('ligne nominative', () => {
  it('porte un code aléatoire et journalise le lien avec le patient', async () => {
    const { audioAB } = d.acteurs;
    const patientId = await creerPatientDevis(d);
    const id = await nouvelle(audioAB);
    await ajouterLigne(audioAB, id, { ...ligneAppareil('1'), patientId, oreille: 'DROITE' });

    const { lignes } = await obtenirCommande(audioAB, id);
    expect(lignes[0]?.referencePatient).toMatch(/^PT-[0-9A-Z]{8}$/);
    expect(lignes[0]?.patient?.id).toBe(patientId);
    expect(lignes[0]?.oreille).toBe('DROITE');

    const journal = await prisma().journalAudit.findMany({
      where: { entiteType: 'COMMANDE', entiteId: id, patientId },
      select: { action: true },
    });
    expect(journal.map((j) => j.action).sort()).toEqual(['READ', 'UPDATE']);
  });

  it('refuse un patient hors du périmètre', async () => {
    const { assistantB, admin } = d.acteurs;
    const patientId = await creerPatientDevis(d);
    await prisma().patient.update({
      where: { id: patientId },
      data: { centreId: d.centres.a.id },
    });
    const id = await creerCommande(admin, {
      centreId: d.centres.b.id,
      fournisseurId: fournisseurs.fabricantId,
    });
    await expect(
      ajouterLigne(assistantB, id, { ...ligneAppareil('1'), patientId }),
    ).rejects.toBeInstanceOf(ErreurSaisie);
  });
});

describe('règles d’approbation', () => {
  const regle = {
    libelle: 'Petites commandes',
    priorite: '1',
    decision: 'ENVOI_DIRECT',
    actif: true,
  };

  it('sans règle, la commande attend une approbation', async () => {
    const { assistantA } = d.acteurs;
    const id = await commandeAvecLigne(assistantA);
    expect(await soumettreCommande(assistantA, id)).toBe('A_APPROUVER');
  });

  it('sous le plafond, elle part directement, avec la règle figée', async () => {
    const { admin, assistantA } = d.acteurs;
    await creerRegleCommande(admin, { ...regle, montantMaxCentimes: '1 500,00' });
    const id = await commandeAvecLigne(assistantA);
    expect(await soumettreCommande(assistantA, id)).toBe('APPROUVEE');
    expect((await obtenirCommande(admin, id)).envoiDirect).toBe(true);
  });

  it('au-dessus du plafond, elle attend', async () => {
    const { admin, assistantA } = d.acteurs;
    await creerRegleCommande(admin, { ...regle, montantMaxCentimes: '1 000,00' });
    const id = await commandeAvecLigne(assistantA);
    expect(await soumettreCommande(assistantA, id)).toBe('A_APPROUVER');
  });

  it('un prix inconnu interdit l’envoi direct', async () => {
    const { admin, assistantA } = d.acteurs;
    await creerRegleCommande(admin, regle);
    await prisma().modeleAideAuditive.update({
      where: { id: catalogue.classeI },
      data: { prixAchatCentimes: null },
    });
    const id = await commandeAvecLigne(assistantA);
    expect(await soumettreCommande(assistantA, id)).toBe('A_APPROUVER');
  });

  it('une règle désactivée ne compte plus, et une règle priorité basse l’emporte', async () => {
    const { admin, assistantA } = d.acteurs;
    const regleId = await creerRegleCommande(admin, regle);
    await modifierRegleCommande(admin, regleId, { ...regle, actif: false });
    const id = await commandeAvecLigne(assistantA);
    expect(await soumettreCommande(assistantA, id)).toBe('A_APPROUVER');

    await creerRegleCommande(admin, { ...regle, priorite: '2' });
    await creerRegleCommande(admin, {
      ...regle,
      priorite: '0',
      fournisseurId: fournisseurs.fabricantId,
      decision: 'APPROBATION',
    });
    const autre = await commandeAvecLigne(assistantA);
    expect(await soumettreCommande(assistantA, autre)).toBe('A_APPROUVER');
  });

  it('seul l’administrateur écrit les règles, sur ses propres fiches', async () => {
    const { admin, assistantA } = d.acteurs;
    await expect(creerRegleCommande(assistantA, regle)).rejects.toBeInstanceOf(AccesRefuseError);
    await expect(
      creerRegleCommande(admin, {
        ...regle,
        fournisseurId: '019a8000-0000-7000-8000-00000000ffff',
      }),
    ).rejects.toBeInstanceOf(ErreurSaisie);
    await expect(
      creerRegleCommande(admin, { ...regle, centreId: '019a8000-0000-7000-8000-00000000ffff' }),
    ).rejects.toBeInstanceOf(ErreurSaisie);
  });
});

describe('approbation', () => {
  it('un responsable approuve dans ses centres, une assistante non', async () => {
    const { assistantA } = d.acteurs;
    const responsable = await creerResponsable(d);
    const id = await commandeAvecLigne(assistantA);
    await soumettreCommande(assistantA, id);

    await expect(approuverCommande(assistantA, id)).rejects.toBeInstanceOf(AccesRefuseError);
    await approuverCommande(responsable, id);
    expect(await obtenirCommande(responsable, id)).toMatchObject({
      statut: 'APPROUVEE',
      approbateur: 'Responsable Test',
    });
    await expect(approuverCommande(responsable, id)).rejects.toBeInstanceOf(ErreurSaisie);
  });

  it('le refus rend un brouillon, avec son motif chiffré', async () => {
    const { admin, assistantA } = d.acteurs;
    const id = await commandeAvecLigne(assistantA);
    await soumettreCommande(assistantA, id);

    await expect(refuserCommande(assistantA, id, { motif: 'Non' })).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
    await refuserCommande(admin, id, { motif: 'Quantité trop élevée' });
    expect(await obtenirCommande(assistantA, id)).toMatchObject({
      statut: 'BROUILLON',
      motifRefus: 'Quantité trop élevée',
    });
    const brut = await prisma().commande.findUniqueOrThrow({ where: { id } });
    expect(brut.motifRefus).toMatch(/^v1\./);

    expect(await soumettreCommande(assistantA, id)).toBe('A_APPROUVER');
    expect((await obtenirCommande(admin, id)).motifRefus).toBeNull();
  });

  it('le prix manquant se complète avant l’approbation, plus après', async () => {
    const { admin, assistantA } = d.acteurs;
    await prisma().modeleAideAuditive.update({
      where: { id: catalogue.classeI },
      data: { prixAchatCentimes: null },
    });
    const id = await commandeAvecLigne(assistantA);
    await soumettreCommande(assistantA, id);
    const ligneId = (await obtenirCommande(admin, id)).lignes[0]?.id ?? '';

    await expect(
      fixerPrixLigne(assistantA, id, ligneId, { prixAchatCentimes: '1,00' }),
    ).rejects.toBeInstanceOf(AccesRefuseError);
    await fixerPrixLigne(admin, id, ligneId, { prixAchatCentimes: '600,00' });
    expect((await obtenirCommande(admin, id)).montantCentimes).toBe(120_000);

    await approuverCommande(admin, id);
    await expect(
      fixerPrixLigne(admin, id, ligneId, { prixAchatCentimes: '1,00' }),
    ).rejects.toBeInstanceOf(ErreurSaisie);
  });

  it('une ligne approuvée est figée, même hors du service', async () => {
    const { admin } = d.acteurs;
    const id = await commandeAvecLigne(admin);
    await soumettreCommande(admin, id);
    await approuverCommande(admin, id);

    await expect(ajouterLigne(admin, id, ligneAppareil())).rejects.toBeInstanceOf(ErreurSaisie);
    await expect(
      prisma().commandeLigne.updateMany({ where: { commandeId: id }, data: { quantite: 9 } }),
    ).rejects.toThrow(/figée/);
    await expect(prisma().commandeLigne.deleteMany({ where: { commandeId: id } })).rejects.toThrow(
      /figée/,
    );
  });
});

describe('annulation et clôture', () => {
  it('le demandeur annule son brouillon, la gestion ce qui suit', async () => {
    const { admin, assistantA } = d.acteurs;
    const brouillon = await commandeAvecLigne(assistantA);
    await annulerCommande(assistantA, brouillon, { motif: 'Erreur de saisie' });
    expect(await obtenirCommande(admin, brouillon)).toMatchObject({
      statut: 'ANNULEE',
      motifAnnulation: 'Erreur de saisie',
    });

    const soumise = await commandeAvecLigne(assistantA);
    await soumettreCommande(assistantA, soumise);
    await expect(annulerCommande(assistantA, soumise, { motif: 'x' })).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
    await annulerCommande(admin, soumise, { motif: 'Doublon' });
    await expect(annulerCommande(admin, soumise, { motif: 'x' })).rejects.toBeInstanceOf(
      ErreurSaisie,
    );
  });

  it('une commande non facturée ne se clôt pas', async () => {
    const { admin } = d.acteurs;
    const id = await commandeAvecLigne(admin);
    await expect(cloturerCommande(admin, id)).rejects.toBeInstanceOf(ErreurSaisie);
  });

  it('filtre la liste par statut et par fournisseur', async () => {
    const { admin } = d.acteurs;
    const perimetre = { type: 'tous' } as const;
    const a = await commandeAvecLigne(admin);
    await soumettreCommande(admin, a);
    await commandeAvecLigne(admin);

    const aApprouver = await listerCommandes(admin, perimetre, { statut: 'A_APPROUVER' });
    expect(aApprouver.lignes.map((l) => l.id)).toEqual([a]);
    const autre = await listerCommandes(admin, perimetre, {
      fournisseurId: fournisseurs.accessoiresId,
    });
    expect(autre.lignes).toHaveLength(0);
  });
});
