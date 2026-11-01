import { prisma } from '@ha/db/admin';
import { beforeEach, describe, expect, it } from 'vitest';

import { creerAchats } from '@/test/achats';
import { creerCatalogueDevis, type CatalogueDevis } from '@/test/devis';
import { creerJeuDeDonnees, viderBase, type JeuDeDonnees } from '@/test/donnees';

import { AccesRefuseError } from '../auth/acces';
import { ErreurSaisie } from '../erreurs';
import {
  ajouterLigne,
  approuverCommande,
  creerCommande,
  obtenirCommande,
  soumettreCommande,
} from './commandes';
import { transmettreCommande } from './envoi-commandes';
import {
  deposerFacture,
  modifierFactureFournisseur,
  validerFactureFournisseur,
} from './factures-fournisseurs';
import { aujourdhui } from './patients';
import { pointerReception } from './reception-commande';
import { exporterAchats, statistiquesAchats } from './statistiques-achats';

let d: JeuDeDonnees;
let catalogue: CatalogueDevis;
let fournisseurs: Awaited<ReturnType<typeof creerAchats>>;
let compteur = 0;

const tous = { type: 'tous' } as const;
const periode = { du: '2020-01-01', au: '2099-12-31' };

async function facture(centreId: string, date: string, ht: string, ttc: string) {
  const { admin } = d.acteurs;
  compteur += 1;
  const id = await deposerFacture(admin, Buffer.from(`%PDF-1.7 ${String(compteur)}`));
  await modifierFactureFournisseur(admin, id, {
    fournisseurId: fournisseurs.accessoiresId,
    centreId,
    numero: `FA-${String(compteur)}`,
    dateFacture: date,
    montantHt: ht,
    montantTva: '0,00',
    montantTtc: ttc,
    lignes: [{ designation: 'Ligne', quantite: '1', prixUnitaireCentimes: ht }],
  });
  await validerFactureFournisseur(admin, id);
}

beforeEach(async () => {
  await viderBase();
  d = await creerJeuDeDonnees();
  await prisma().lppCode.create({ data: { code: '2332976' } });
  catalogue = await creerCatalogueDevis(d);
  fournisseurs = await creerAchats(d, catalogue);
});

describe('statistiquesAchats', () => {
  it('additionne les factures validées de la période, par centre', async () => {
    const { admin } = d.acteurs;
    await facture(d.centres.a.id, '2030-01-07', '100,00', '100,00');
    await facture(d.centres.a.id, '2030-01-31', '50,00', '50,00');
    await facture(d.centres.b.id, '2030-01-15', '10,00', '10,00');
    await facture(d.centres.a.id, '2030-02-01', '999,00', '999,00');

    const stats = await statistiquesAchats(admin, tous, { du: '2030-01-01', au: '2030-01-31' });
    expect(stats.totalHtCentimes).toBe(16_000);
    expect(stats.achats).toEqual([
      expect.objectContaining({ centre: 'Centre A', factures: 2, montantHtCentimes: 15_000 }),
      expect.objectContaining({ centre: 'Centre B', factures: 1, montantHtCentimes: 1_000 }),
    ]);

    const { ecarts } = await statistiquesAchats(admin, tous, {
      ...periode,
      fournisseurId: fournisseurs.accessoiresId,
    });
    expect(ecarts).toEqual([{ type: 'LIGNE_NON_COMMANDEE', ouverts: 4, traites: 0 }]);
  });

  it('une facture à valider ne compte pas', async () => {
    const { admin } = d.acteurs;
    await deposerFacture(admin, Buffer.from('%PDF-1.7 brouillon'));
    expect((await statistiquesAchats(admin, tous, periode)).achats).toEqual([]);
  });

  it('mesure le délai de la première livraison, et compte les écarts', async () => {
    const { admin } = d.acteurs;
    const id = await creerCommande(admin, {
      centreId: d.centres.a.id,
      fournisseurId: fournisseurs.fabricantId,
    });
    await ajouterLigne(admin, id, {
      produit: `modele:${catalogue.classeI}`,
      quantite: '1',
      enConsignation: false,
    });
    await soumettreCommande(admin, id);
    await approuverCommande(admin, id);
    await transmettreCommande(admin, id);
    const { lignes } = await obtenirCommande(admin, id);
    await pointerReception(admin, id, {
      dateReception: aujourdhui(),
      referenceBonLivraison: 'BL',
      lignes: [
        {
          ligneId: lignes[0]?.id,
          quantite: '0',
          numerosSerie: ['SN1', 'SN2'],
          quantiteNonConforme: '0',
        },
      ],
    });

    const stats = await statistiquesAchats(admin, tous, periode);
    expect(stats.delais).toEqual([
      { fournisseur: 'Acoustia Démo', commandes: 1, delaiMoyenJours: 0, delaiMaxJours: 0 },
    ]);
    expect(stats.ecarts).toEqual([{ type: 'SURPLUS', ouverts: 1, traites: 0 }]);
  });

  it('filtre par fournisseur, et respecte le périmètre', async () => {
    const { admin } = d.acteurs;
    await facture(d.centres.a.id, '2030-01-07', '100,00', '100,00');
    await facture(d.centres.b.id, '2030-01-07', '10,00', '10,00');

    const autre = await statistiquesAchats(admin, tous, {
      ...periode,
      fournisseurId: fournisseurs.fabricantId,
    });
    expect(autre.achats).toEqual([]);
    const centreB = await statistiquesAchats(
      admin,
      { type: 'centre', centreId: d.centres.b.id },
      periode,
    );
    expect(centreB.totalHtCentimes).toBe(1_000);
  });

  it('refuse un rôle sans droit et une période inversée', async () => {
    const { admin, assistantA } = d.acteurs;
    await expect(statistiquesAchats(assistantA, tous, periode)).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
    await expect(
      statistiquesAchats(admin, tous, { du: '2030-02-01', au: '2030-01-01' }),
    ).rejects.toBeInstanceOf(ErreurSaisie);
  });
});

describe('exporterAchats', () => {
  it('exporte le tableau et journalise', async () => {
    const { admin } = d.acteurs;
    await facture(d.centres.a.id, '2030-01-07', '100,00', '100,00');
    const lignes: string[] = [];
    for await (const ligne of await exporterAchats(admin, tous, periode)) {
      lignes.push(ligne);
    }
    expect(lignes).toHaveLength(2);
    expect(lignes[1]).toContain('Piles fictives');
    const journal = await prisma().journalAudit.findFirst({
      where: { entiteType: 'FACTURE_FOURNISSEUR', action: 'EXPORT' },
    });
    expect(journal).not.toBeNull();
  });
});
