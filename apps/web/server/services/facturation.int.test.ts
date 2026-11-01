import path from 'node:path';

import type { FakeBillingEngine, FakePdfRenderer } from '@ha/adapters';
import { clientApplication } from '@ha/db';
import { prisma } from '@ha/db/admin';
import { eligibiliteRenouvellement } from '@ha/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  creerCatalogueDevis,
  creerPatientDevis,
  dossierJusquAchat,
  identifierCentreA,
  type CatalogueDevis,
} from '@/test/devis';
import { creerJeuDeDonnees, viderBase, type JeuDeDonnees } from '@/test/donnees';
import { approvisionner, venteDirecte, venteDirecteValidee } from '@/test/facturation';

import { AccesRefuseError, type UtilisateurConnecte } from '../auth/acces';
import { billingEngine } from '../billing-engine';
import { ErreurSaisie } from '../erreurs';
import { importerLpp } from '../lpp/importer';
import { rendeurPdf } from '../pdf';
import { emettreAvoir } from './avoirs';
import { verifierChaineCaisse } from './chaine-caisse';
import {
  abandonnerBrouillon,
  ajouterLigneBrouillon,
  confirmerCouvertureVente,
  creerVenteDirecte,
  ErreurFactureBloquee,
  listerFactures,
  modifierPrefixeSerie,
  obtenirFactureDetail,
  retirerLigneBrouillon,
  telechargerPdf,
  validerFacture,
} from './facturation';
import { confirmerCouvertureAmo, enregistrerPec, obtenirFacture } from './factures';
import { actualiserStatutFse, preparerFse } from './fse';
import { envoyerFactureAuPatient } from './liens-document';
import { aujourdhui } from './patients';
import { annulerVente } from './stock';

// Chaque test rejoue un parcours complet, du dossier à l'achat : long sous la charge de toute la suite.
vi.setConfig({ testTimeout: 30_000 });

const V908 = path.join(import.meta.dirname, '../../../../fixtures/lpp/908');
const VIDE = new Uint8Array(0);

let d: JeuDeDonnees;
let audio: UtilisateurConnecte;
let admin: UtilisateurConnecte;
let catalogue: CatalogueDevis;

const centreA = () => d.centres.a.id;
const moteur = () => billingEngine() as FakeBillingEngine;

beforeEach(async () => {
  await viderBase();
  await prisma().tauxTva.deleteMany({ where: { type: 'ENTRETIEN' } });
  d = await creerJeuDeDonnees();
  ({ audioAB: audio, admin } = d.acteurs);
  await identifierCentreA(d);
  await prisma().centre.update({
    where: { id: d.centres.b.id },
    data: { raisonSociale: 'Audition Fictive B', siret: '00000000000001' },
  });
  await importerLpp(V908);
  catalogue = await creerCatalogueDevis(d);
  await approvisionner(centreA(), catalogue.piles, 100);
});

/** Dossier à facturer, sans blocage : couverture confirmée et sans tiers payant. */
async function dossierPret() {
  const parcours = await dossierJusquAchat(d, audio, catalogue);
  await confirmerCouvertureAmo(audio, parcours.dossierId);
  await enregistrerPec(audio, parcours.dossierId, { statut: 'SANS_TIERS_PAYANT' }, VIDE);
  const evaluee = await obtenirFacture(audio, parcours.dossierId);
  if (!evaluee) {
    throw new Error('Brouillon attendu.');
  }
  expect(evaluee.controle.erreurs).toEqual([]);
  return { ...parcours, factureId: evaluee.factureId };
}

const piece = (id: string) =>
  prisma().facture.findUniqueOrThrow({ where: { id }, include: { lignes: true } });

describe('validation d’une facture de dossier', () => {
  it('numérote, fige, délivre, vend et fait passer le dossier à FACTURE', async () => {
    const { dossierId, factureId, numeroSerie, patientId } = await dossierPret();
    await validerFacture(audio, factureId);

    const facture = await piece(factureId);
    expect(facture).toMatchObject({
      statut: 'VALIDEE',
      numero: 'FA-000001',
      numeroSequence: 1,
      totalTtcCentimes: 95_600,
      totalAmoCentimes: 24_000 + 360,
    });
    expect(facture.dateFacture?.toISOString().slice(0, 10)).toBe(aujourdhui());
    expect(facture.empreinte).toHaveLength(64);
    expect(facture.vendeur).toMatchObject({ siret: expect.any(String) as string });
    expect(facture.lignes.map((l) => l.nature).sort()).toEqual(['AIDE_AUDITIVE', 'PILE']);
    const aide = facture.lignes.find((l) => l.nature === 'AIDE_AUDITIVE');
    expect(aide).toMatchObject({
      oreille: 'DROITE',
      codePrestation: 'P1D',
      numeroSerie,
      tauxTva: 550,
      montantHtCentimes: 90_047,
    });

    const { statut } = await prisma().dossier.findUniqueOrThrow({ where: { id: dossierId } });
    expect(statut).toBe('FACTURE');
    const appareil = await prisma().appareil.findFirstOrThrow({ where: { numeroSerie } });
    expect(appareil).toMatchObject({ statut: 'VENDU', patientId });
    const lien = await prisma().essaiAppareil.findFirstOrThrow({
      where: { appareilId: appareil.id },
    });
    expect(lien.retireLe).not.toBeNull();
    const stock = await prisma().stockAccessoire.findFirstOrThrow({
      where: { centreId: centreA(), accessoireId: catalogue.piles },
    });
    expect(stock.quantite).toBe(100 - 4);
  });

  it('alimente `eligibiliteRenouvellement` avec la date de facturation', async () => {
    const { factureId, patientId } = await dossierPret();
    await validerFacture(audio, factureId);

    const lignes = await prisma().delivrance.findMany({ where: { patientId } });
    expect(lignes).toMatchObject([{ oreille: 'DROITE', factureId, origine: 'DOSSIER' }]);
    const historiqueDelivrances = lignes.map((l) => ({
      oreille: l.oreille,
      dateDelivrance: l.dateDelivrance.toISOString().slice(0, 10),
    }));
    expect(historiqueDelivrances[0]?.dateDelivrance).toBe(aujourdhui());
    const resultat = eligibiliteRenouvellement({
      historiqueDelivrances,
      oreille: 'DROITE',
      date: aujourdhui(),
    });
    expect(resultat.eligible).toBe(false);
  });

  it('refuse un dossier bloqué, sans consommer de numéro', async () => {
    const { dossierId } = await dossierJusquAchat(d, audio, catalogue);
    const brouillon = await obtenirFacture(audio, dossierId);
    await expect(validerFacture(audio, brouillon?.factureId ?? '')).rejects.toBeInstanceOf(
      ErreurFactureBloquee,
    );
    expect(await prisma().serieFacture.count()).toBe(0);
  });

  it('refuse un second passage et un rôle sans droit', async () => {
    const { factureId } = await dossierPret();
    await expect(validerFacture(d.acteurs.assistantA, factureId)).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
    await validerFacture(audio, factureId);
    await expect(validerFacture(audio, factureId)).rejects.toBeInstanceOf(ErreurSaisie);
  });

  it('annule tout si le stock manque : ni numéro, ni vente, ni maillon', async () => {
    const { factureId, numeroSerie, dossierId } = await dossierPret();
    await approvisionner(centreA(), catalogue.piles, 0);
    await expect(validerFacture(audio, factureId)).rejects.toThrow('Stock insuffisant');

    expect(await piece(factureId)).toMatchObject({ statut: 'BROUILLON', numero: null });
    const appareil = await prisma().appareil.findFirstOrThrow({ where: { numeroSerie } });
    expect(appareil.statut).toBe('RESERVE');
    expect(await prisma().delivrance.count({ where: { dossierId } })).toBe(0);
    expect(await prisma().evenementCaisse.count()).toBe(0);
    const serie = await prisma().serieFacture.findUnique({ where: { centreId: centreA() } });
    expect(serie?.dernierNumero ?? 0).toBe(0);
  });
});

describe('vente directe', () => {
  let patientId: string;

  beforeEach(async () => {
    patientId = await creerPatientDevis(d);
  });

  it('sans prescription : tout en reste à charge, pas de délivrance', async () => {
    const id = await venteDirecteValidee(d, audio, patientId, catalogue.piles);
    const facture = await piece(id);
    expect(facture).toMatchObject({
      dossierId: null,
      totalTtcCentimes: 600,
      totalAmoCentimes: 0,
      totalResteCentimes: 600,
      numero: 'FA-000001',
    });
    expect(facture.lignes[0]).toMatchObject({ codePrestation: 'PIL', tauxTva: 2000 });
    expect(await prisma().delivrance.count({ where: { patientId } })).toBe(0);
  });

  it('avec une prescription du patient : ventile la ligne LPP', async () => {
    const { dossierId, patientId: appareille } = await dossierPret();
    const { id: prescriptionId } = await prisma().prescription.findFirstOrThrow({
      where: { dossierId },
    });
    const brouillon = await venteDirecte(d, audio, appareille, catalogue.piles, prescriptionId);
    const { evaluation } = await obtenirFactureDetail(audio, brouillon);
    expect(evaluation?.facture?.lignes[0]).toMatchObject({
      baseRemboursement: 300,
      amo: 180,
      resteACharge: 420,
    });
  });

  it('une couverture saisie se confirme sur la vente, puis la facture se valide', async () => {
    const { dossierId, patientId: appareille } = await dossierPret();
    const { id: prescriptionId } = await prisma().prescription.findFirstOrThrow({
      where: { dossierId },
    });
    const id = await venteDirecte(d, audio, appareille, catalogue.piles, prescriptionId);
    await expect(validerFacture(audio, id)).rejects.toBeInstanceOf(ErreurFactureBloquee);
    await confirmerCouvertureVente(audio, id);
    await validerFacture(audio, id);
    expect(await piece(id)).toMatchObject({ statut: 'VALIDEE', totalAmoCentimes: 180 });
  });

  it('refuse la prescription d’un autre patient', async () => {
    const { dossierId } = await dossierJusquAchat(d, audio, catalogue);
    const { id: prescriptionId } = await prisma().prescription.findFirstOrThrow({
      where: { dossierId },
    });
    await expect(
      creerVenteDirecte(audio, { patientId, centreId: centreA(), prescriptionId }),
    ).rejects.toThrow('Cette prescription n’est pas celle du patient.');
  });

  it('bloque l’entretien tant qu’aucun taux n’est paramétré', async () => {
    const id = await creerVenteDirecte(audio, { patientId, centreId: centreA() });
    await ajouterLigneBrouillon(audio, id, {
      nature: 'ENTRETIEN',
      libelle: 'Nettoyage',
      quantite: '1',
      prixUnitaire: '12,00',
    });
    const { evaluation } = await obtenirFactureDetail(audio, id);
    expect(evaluation?.controle.erreurs).toMatchObject([{ code: 'TAUX_TVA_ABSENT' }]);
    await expect(validerFacture(audio, id)).rejects.toBeInstanceOf(ErreurFactureBloquee);

    await prisma().tauxTva.create({
      data: { type: 'ENTRETIEN', taux: 1000, debut: new Date('2021-01-01T00:00:00.000Z') },
    });
    await validerFacture(audio, id);
    const facture = await piece(id);
    expect(facture.lignes[0]).toMatchObject({ codePrestation: null, tauxTva: 1000 });
  });

  it('un brouillon se modifie et s’abandonne sans numéro ; il ne se supprime pas', async () => {
    const id = await venteDirecte(d, audio, patientId, catalogue.piles);
    const { lignes } = await piece(id);
    await retirerLigneBrouillon(audio, id, lignes[0]?.id ?? '');
    expect((await piece(id)).lignes).toEqual([]);
    await abandonnerBrouillon(audio, id);
    expect(await piece(id)).toMatchObject({ statut: 'ABANDONNEE', numero: null });
    await expect(validerFacture(audio, id)).rejects.toBeInstanceOf(ErreurSaisie);
    const liste = await listerFactures(admin, { type: 'tous' }, {});
    expect(liste.lignes.map((l) => l.id)).not.toContain(id);
  });
});

describe('numérotation', { timeout: 60_000 }, () => {
  const sequences = async (centreId: string) => {
    const pieces = await prisma().facture.findMany({
      where: { centreId, statut: 'VALIDEE' },
      orderBy: { numeroSequence: 'asc' },
    });
    return pieces.map((p) => p.numeroSequence);
  };

  it('reste continue sous validations concurrentes, malgré des échecs après l’attribution', async () => {
    const patientId = await creerPatientDevis(d);
    const { kit } = catalogue;
    await approvisionner(centreA(), kit, 0);
    await prisma().accessoire.update({ where: { id: kit }, data: { nature: 'PILE' } });
    const ok = await Promise.all(
      Array.from({ length: 8 }, () => venteDirecte(d, audio, patientId, catalogue.piles)),
    );
    // Stock nul : `debiter` échoue après le numéro, la transaction l'annule et le rend.
    const ko = await Promise.all(
      Array.from({ length: 4 }, () => venteDirecte(d, audio, patientId, kit)),
    );

    const resultats = await Promise.allSettled(
      [...ok, ...ko].sort().map((id) => validerFacture(audio, id)),
    );

    expect(resultats.filter((r) => r.status === 'fulfilled')).toHaveLength(8);
    expect(await sequences(centreA())).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const { dernierNumero } = await prisma().serieFacture.findUniqueOrThrow({
      where: { centreId: centreA() },
    });
    expect(dernierNumero).toBe(8);
    expect((await verifierChaineCaisse(audio, centreA())).valide).toBe(true);
  });

  it('couvre la course de la toute première pièce d’un centre', async () => {
    const patientId = await creerPatientDevis(d);
    const ids = await Promise.all(
      Array.from({ length: 4 }, () => venteDirecte(d, audio, patientId, catalogue.piles)),
    );
    await Promise.all(ids.map((id) => validerFacture(audio, id)));
    expect(await sequences(centreA())).toEqual([1, 2, 3, 4]);
  });

  it('tient une série par centre, avec son préfixe, sans toucher à l’existant', async () => {
    const patientId = await creerPatientDevis(d);
    await approvisionner(d.centres.b.id, catalogue.piles, 10);
    const a1 = await venteDirecteValidee(d, audio, patientId, catalogue.piles);
    await modifierPrefixeSerie(admin, d.centres.b.id, { prefixe: 'nord' });
    const b1 = await venteDirecte(d, audio, patientId, catalogue.piles, null, d.centres.b.id);
    await validerFacture(audio, b1);
    await modifierPrefixeSerie(admin, centreA(), { prefixe: 'SUD' });
    const a2 = await venteDirecteValidee(d, audio, patientId, catalogue.piles);

    expect((await piece(a1)).numero).toBe('FA-000001');
    expect((await piece(b1)).numero).toBe('NORD-000001');
    expect((await piece(a2)).numero).toBe('SUD-000002');
    await expect(modifierPrefixeSerie(audio, centreA(), { prefixe: 'X' })).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
  });
});

describe('pièce figée', () => {
  it('la base refuse de modifier ou supprimer une pièce validée et ses lignes', async () => {
    const patientId = await creerPatientDevis(d);
    const id = await venteDirecteValidee(d, audio, patientId, catalogue.piles);
    const { lignes } = await piece(id);

    await expect(
      prisma().facture.update({ where: { id }, data: { totalTtcCentimes: 1 } }),
    ).rejects.toThrow('facture figée');
    await expect(prisma().facture.delete({ where: { id } })).rejects.toThrow('suppression refusée');
    await expect(
      prisma().ligneFacture.update({
        where: { id: lignes[0]?.id ?? '' },
        data: { prixTtcCentimes: 1 },
      }),
    ).rejects.toThrow('facture figée');
    await expect(
      clientApplication().$executeRawUnsafe(`DELETE FROM "facture" WHERE id = '${id}'`),
    ).rejects.toThrow(/permission denied/);
    await expect(prisma().evenementCaisse.updateMany({ data: { rang: 99 } })).rejects.toThrow(
      'ajout seul',
    );
  });

  it('seule la clé du PDF se pose, une seule fois', async () => {
    const patientId = await creerPatientDevis(d);
    const id = await venteDirecteValidee(d, audio, patientId, catalogue.piles);
    const { pdfCle } = await piece(id);
    expect(pdfCle).not.toBeNull();
    await expect(
      prisma().facture.update({ where: { id }, data: { pdfCle: 'autre' } }),
    ).rejects.toThrow('facture figée');
  });
});

describe('avoir', () => {
  let factureId: string;

  beforeEach(async () => {
    ({ factureId } = await dossierPret());
    await validerFacture(audio, factureId);
  });

  const ligneAide = async () => {
    const { lignes } = await piece(factureId);
    const ligne = lignes.find((l) => l.nature === 'AIDE_AUDITIVE');
    if (!ligne) {
      throw new Error('Ligne attendue.');
    }
    return ligne;
  };

  it('partiel : lié à la facture, ventilé au prorata, sans effet sur la vente', async () => {
    const { id: ligneId } = await ligneAide();
    const { avoirId } = await emettreAvoir(admin, factureId, {
      mode: 'PARTIEL',
      motif: 'Geste commercial',
      reprises: [{ ligneId, montant: '475,00' }],
    });

    const avoir = await piece(avoirId);
    expect(avoir).toMatchObject({
      nature: 'AVOIR',
      statut: 'VALIDEE',
      factureOrigineId: factureId,
      numero: 'FA-000002',
      totalTtcCentimes: 47_500,
      totalAmoCentimes: 12_000,
    });
    expect(avoir.lignes[0]).toMatchObject({
      ligneOrigineId: ligneId,
      resteAChargeCentimes: 35_500,
    });
    // Le motif, chiffré au repos, se relit en clair par le service.
    expect(avoir.motif).toMatch(/^v1\./);
    const { dossierId } = await piece(factureId);
    const dossier = await prisma().dossier.findUniqueOrThrow({ where: { id: dossierId ?? '' } });
    expect(dossier.statut).toBe('FACTURE');
    expect(await prisma().delivrance.count({ where: { annuleeLe: null } })).toBe(1);
  });

  it('ne dépasse jamais ce qui reste, même en plusieurs fois', async () => {
    const { id: ligneId } = await ligneAide();
    const partiel = (montant: string) =>
      emettreAvoir(admin, factureId, {
        mode: 'PARTIEL',
        motif: 'Test',
        reprises: [{ ligneId, montant }],
      });
    await partiel('600,00');
    await expect(partiel('350,01')).rejects.toThrow('dépasse');
    await partiel('350,00');
    const serie = await prisma().serieFacture.findUniqueOrThrow({ where: { centreId: centreA() } });
    expect(serie.dernierNumero).toBe(3);
  });

  it('total : annule la vente, garde la délivrance marquée et rouvre la facturation', async () => {
    const { dossierId, patientId } = await piece(factureId);
    const { avoirId } = await emettreAvoir(admin, factureId, { mode: 'TOTAL', motif: 'Erreur' });

    expect(await prisma().delivrance.findMany({ where: { patientId } })).toMatchObject([
      { avoirId, factureId },
    ]);
    const historique = await prisma().delivrance.count({ where: { patientId, annuleeLe: null } });
    expect(historique).toBe(0);
    const { numeroSerie } = (await ligneAide()) as { numeroSerie: string };
    const appareil = await prisma().appareil.findFirstOrThrow({ where: { numeroSerie } });
    expect(appareil).toMatchObject({ statut: 'RESERVE', patientId });
    const dossier = await prisma().dossier.findUniqueOrThrow({ where: { id: dossierId ?? '' } });
    expect(dossier.statut).toBe('A_FACTURER');

    // La facture d'origine reste : c'est l'avoir qui la solde.
    expect(await piece(factureId)).toMatchObject({ statut: 'VALIDEE', numero: 'FA-000001' });

    // La confirmation portait sur la facture annulée : le nouveau brouillon la redemande.
    await confirmerCouvertureAmo(audio, dossierId ?? '');
    const nouveau = await obtenirFacture(audio, dossierId ?? '');
    expect(nouveau?.factureId).not.toBe(factureId);
    expect(nouveau?.controle.erreurs).toEqual([]);
    await validerFacture(audio, nouveau?.factureId ?? '');
    expect(await piece(nouveau?.factureId ?? '')).toMatchObject({ numero: 'FA-000003' });
    const vendu = await prisma().appareil.findFirstOrThrow({ where: { numeroSerie } });
    expect(vendu.statut).toBe('VENDU');
    expect(await prisma().delivrance.count({ where: { patientId, annuleeLe: null } })).toBe(1);
    expect((await verifierChaineCaisse(audio, centreA())).valide).toBe(true);
  });

  it('un avoir qui solde la facture après un partiel annule aussi la vente', async () => {
    const { id: ligneId } = await ligneAide();
    await emettreAvoir(admin, factureId, {
      mode: 'PARTIEL',
      motif: 'Test',
      reprises: [{ ligneId, montant: '100,00' }],
    });
    await emettreAvoir(admin, factureId, { mode: 'TOTAL', motif: 'Test' });
    const { dossierId } = await piece(factureId);
    const dossier = await prisma().dossier.findUniqueOrThrow({ where: { id: dossierId ?? '' } });
    expect(dossier.statut).toBe('A_FACTURER');
    await expect(emettreAvoir(admin, factureId, { mode: 'TOTAL', motif: 'Test' })).rejects.toThrow(
      'Saisir au moins un montant',
    );
  });

  it('réservé à la gestion, sur une facture validée', async () => {
    await expect(
      emettreAvoir(audio, factureId, { mode: 'TOTAL', motif: 'Test' }),
    ).rejects.toBeInstanceOf(AccesRefuseError);
    const { avoirId } = await emettreAvoir(admin, factureId, { mode: 'TOTAL', motif: 'Test' });
    await expect(emettreAvoir(admin, avoirId, { mode: 'TOTAL', motif: 'Test' })).rejects.toThrow(
      'Un avoir se fait sur une facture validée.',
    );
  });

  it('signale une FSE déjà partie', async () => {
    await prisma().prescripteur.updateMany({ data: { rpps: '10000000017' } });
    await preparerFse(audio, factureId);
    await actualiserStatutFse(audio, factureId);
    const { alerteFse } = await emettreAvoir(admin, factureId, { mode: 'TOTAL', motif: 'Test' });
    expect(alerteFse).toBe(true);
  });

  it('un appareil facturé ne s’annule plus par la fiche du stock', async () => {
    const { appareilId } = await ligneAide();
    await expect(
      annulerVente(admin, appareilId ?? '', { motif: 'Erreur de saisie' }),
    ).rejects.toThrow('elle s’annule par un avoir');
  });
});

describe('chaînage', () => {
  /** Modifie une ligne figée en contournant les triggers, comme une écriture directe en base. */
  async function falsifier(sql: string, table: string) {
    await prisma().$executeRawUnsafe(`ALTER TABLE "${table}" DISABLE TRIGGER USER`);
    try {
      await prisma().$executeRawUnsafe(sql);
    } finally {
      await prisma().$executeRawUnsafe(`ALTER TABLE "${table}" ENABLE TRIGGER USER`);
    }
  }

  it('enchaîne factures, avoirs et sorties, chaque maillon sur le précédent', async () => {
    const patientId = await creerPatientDevis(d);
    const id = await venteDirecteValidee(d, audio, patientId, catalogue.piles);
    await telechargerPdf(audio, id);
    await telechargerPdf(audio, id);
    const { lignes } = await piece(id);
    await emettreAvoir(admin, id, {
      mode: 'PARTIEL',
      motif: 'Test',
      reprises: [{ ligneId: lignes[0]?.id ?? '', montant: '1,00' }],
    });

    const maillons = await prisma().evenementCaisse.findMany({ orderBy: { rang: 'asc' } });
    expect(maillons.map((m) => [m.rang, m.type])).toEqual([
      [1, 'FACTURE_VALIDEE'],
      [2, 'ORIGINAL_EMIS'],
      [3, 'DUPLICATA_EMIS'],
      [4, 'AVOIR_VALIDE'],
    ]);
    maillons.slice(1).forEach((m, i) => {
      expect(m.empreintePrecedente).toBe(maillons[i]?.empreinte);
    });
    expect((await piece(id)).empreinte).toBe(maillons[0]?.empreinte);
    expect(JSON.stringify(maillons)).not.toContain('150037500000042');
    await expect(verifierChaineCaisse(audio, centreA())).resolves.toEqual({
      valide: true,
      maillons: 4,
    });
  });

  it('détecte une ligne de facture modifiée, même si le journal est intact', async () => {
    const patientId = await creerPatientDevis(d);
    const id = await venteDirecteValidee(d, audio, patientId, catalogue.piles);
    await falsifier(
      `UPDATE "ligne_facture" SET "prix_ttc_centimes" = 1 WHERE "facture_id" = '${id}'`,
      'ligne_facture',
    );
    await expect(verifierChaineCaisse(audio, centreA())).resolves.toEqual({
      valide: false,
      rang: 1,
      raison: 'PIECE',
    });
  });

  it('détecte un maillon altéré et un maillon retiré', async () => {
    const patientId = await creerPatientDevis(d);
    await venteDirecteValidee(d, audio, patientId, catalogue.piles);
    await venteDirecteValidee(d, audio, patientId, catalogue.piles);
    await falsifier(
      `UPDATE "evenement_caisse" SET "charge" = '{"faux":true}' WHERE "rang" = 2`,
      'evenement_caisse',
    );
    await expect(verifierChaineCaisse(audio, centreA())).resolves.toEqual({
      valide: false,
      rang: 2,
      raison: 'MAILLON',
    });
  });

  it('détecte la suppression du dernier maillon grâce à la tête de chaîne', async () => {
    const patientId = await creerPatientDevis(d);
    await venteDirecteValidee(d, audio, patientId, catalogue.piles);
    await falsifier(`DELETE FROM "evenement_caisse" WHERE "rang" = 1`, 'evenement_caisse');
    await expect(verifierChaineCaisse(audio, centreA())).resolves.toMatchObject({ valide: false });
  });
});

describe('PDF, duplicata et envoi', () => {
  let id: string;

  beforeEach(async () => {
    const patientId = await creerPatientDevis(d);
    await prisma().patient.update({
      where: { id: patientId },
      data: { email: 'patient@exemple.test', consentementEmail: true },
    });
    id = await venteDirecteValidee(d, audio, patientId, catalogue.piles);
  });

  it('sert l’original une fois, puis un duplicata marqué, journalisé et chaîné', async () => {
    const premier = await telechargerPdf(audio, id);
    const second = await telechargerPdf(audio, id);
    expect(premier).toMatchObject({ duplicata: false, nomFichier: 'FA-000001.pdf' });
    expect(second).toMatchObject({ duplicata: true, nomFichier: 'duplicata-FA-000001.pdf' });
    const html = (rendeurPdf() as FakePdfRenderer).rendus.at(-1);
    expect(html).toContain('DUPLICATA');
    const journal = await prisma().journalAudit.count({
      where: { entiteType: 'FACTURE', action: 'PRINT', entiteId: id },
    });
    expect(journal).toBe(2);
  });

  it('envoie un lien, sans montant ni donnée de santé dans le message', async () => {
    await envoyerFactureAuPatient(audio, id, { canal: 'EMAIL' });
    const lien = await prisma().lienDocument.findFirstOrThrow({ where: { factureId: id } });
    expect(lien).toMatchObject({ cible: 'FACTURE', dossierId: null, destinataire: 'PATIENT' });
    const { pdfCle } = await piece(id);
    expect(lien.pdfCle).toBe(pdfCle);
    const notification = await prisma().notification.findFirstOrThrow({
      where: { lienDocumentId: lien.id },
    });
    expect(notification.gabarit).toBe('DOCUMENT_A_CONSULTER');
    expect(JSON.stringify(notification.parametres)).not.toMatch(/€|\d+,\d\d|Piles/);
  });

  it('un second envoi est un duplicata', async () => {
    await envoyerFactureAuPatient(audio, id, { canal: 'EMAIL' });
    await envoyerFactureAuPatient(audio, id, { canal: 'EMAIL' });
    const liens = await prisma().lienDocument.findMany({
      where: { factureId: id },
      orderBy: { createdAt: 'asc' },
    });
    expect(liens[1]?.pdfCle).toMatch(/^liens-documents\//);
    const types = await prisma().evenementCaisse.findMany({
      where: { factureId: id },
      orderBy: { rang: 'asc' },
    });
    expect(types.map((m) => m.type)).toEqual([
      'FACTURE_VALIDEE',
      'ORIGINAL_EMIS',
      'FACTURE_ENVOYEE',
      'DUPLICATA_EMIS',
      'FACTURE_ENVOYEE',
    ]);
  });

  it('refuse un canal sans consentement', async () => {
    await expect(envoyerFactureAuPatient(audio, id, { canal: 'SMS' })).rejects.toThrow(
      'n’a pas cette coordonnée',
    );
  });
});

describe('FSE', () => {
  let factureId: string;

  beforeEach(async () => {
    ({ factureId } = await dossierPret());
    await validerFacture(audio, factureId);
    await prisma().prescripteur.updateMany({ data: { rpps: '10000000017' } });
    moteur().prochainRejet = null;
  });

  it('prépare le brouillon depuis la facture et suit les statuts simulés', async () => {
    expect(await preparerFse(audio, factureId)).toBe('EN_ATTENTE');
    const draft = moteur().recues.at(-1);
    expect(draft).toMatchObject({
      factureId,
      numeroFacture: 'FA-000001',
      beneficiaire: { nir: '150037500000042', rangNaissance: 1 },
      prescripteur: { datePrescription: expect.any(String) as string },
      totaux: { amo: 24_360 },
    });
    expect(draft?.lignes.map((l) => l.codePrestation).sort()).toEqual(['P1D', 'PIL']);
    expect(draft?.lignes[0]?.numeroSerie).not.toBeNull();

    expect(await actualiserStatutFse(audio, factureId)).toBe('TRANSMISE');
    expect(await actualiserStatutFse(audio, factureId)).toBe('ACCEPTEE');
  });

  it('chiffre le contenu, et le NIR n’entre jamais au journal', async () => {
    await preparerFse(audio, factureId);
    const fse = await prisma().fse.findUniqueOrThrow({ where: { factureId } });
    expect(fse.contenu).toMatch(/^v1\./);
    expect(fse.contenu).not.toContain('150037500000042');
    const journal = await prisma().journalAudit.findMany({ where: { entiteType: 'FSE' } });
    expect(journal.length).toBeGreaterThan(0);
    expect(JSON.stringify(journal)).not.toContain('150037500000042');
  });

  it('ne renvoie pas une FSE en cours ; une FSE rejetée repart', async () => {
    moteur().prochainRejet = 'Droits fermés (simulation).';
    expect(await preparerFse(audio, factureId)).toBe('REJETEE');
    expect(await prisma().fse.findUnique({ where: { factureId } })).toMatchObject({
      statut: 'REJETEE',
      motif: 'Droits fermés (simulation).',
    });

    expect(await preparerFse(audio, factureId)).toBe('EN_ATTENTE');
    await expect(preparerFse(audio, factureId)).rejects.toThrow('déjà en cours');
    expect(await prisma().fse.count({ where: { factureId } })).toBe(1);
  });

  it('refuse une pièce sans ligne remboursable', async () => {
    const patientId = await creerPatientDevis(d);
    const vente = await venteDirecteValidee(d, audio, patientId, catalogue.piles);
    await expect(preparerFse(audio, vente)).rejects.toThrow('ne donne pas lieu à une FSE');
  });
});
