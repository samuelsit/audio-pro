import path from 'node:path';

import { prisma } from '@ha/db/admin';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  creerCatalogueDevis,
  dossierJusquAchat,
  identifierCentreA,
  type CatalogueDevis,
} from '@/test/devis';
import { creerJeuDeDonnees, viderBase, type JeuDeDonnees } from '@/test/donnees';
import { approvisionner } from '@/test/facturation';

import { AccesRefuseError, type UtilisateurConnecte } from '../auth/acces';
import { ErreurSaisie } from '../erreurs';
import { importerLpp } from '../lpp/importer';
import { emettreAvoir } from './avoirs';
import { verifierChaineCaisse } from './chaine-caisse';
import { creerComplementaire, modifierComplementaire } from './complementaires';
import { encaissementsDeFacture, encaisserFacture } from './encaissements';
import { exporterEcritures } from './export-comptable';
import { ErreurFactureBloquee, modifierTiersPayantAmo, validerFacture } from './facturation';
import {
  actualiserPec,
  confirmerCouvertureAmo,
  demanderPecPlateforme,
  enregistrerPec,
  obtenirFacture,
} from './factures';
import { aujourdhui } from './patients';
import {
  annulerReglement,
  classerEcartReglement,
  creancesDeLaFacture,
  delettrer,
  enregistrerEcart,
  enregistrerRejet,
  enregistrerReglement,
  exporterCreances,
  lettrer,
  listerCreances,
  listerImpayes,
  listerRejets,
  listerReglements,
  marquerRelancee,
  obtenirCreance,
  obtenirReglement,
  resoudreRejet,
  syntheseParOrganisme,
  transfererAuPatient,
} from './tiers-payant';

vi.setConfig({ testTimeout: 30_000 });

const V908 = path.join(import.meta.dirname, '../../../../fixtures/lpp/908');
const VIDE = new Uint8Array(0);

let d: JeuDeDonnees;
let audio: UtilisateurConnecte;
let assistant: UtilisateurConnecte;
let admin: UtilisateurConnecte;
let catalogue: CatalogueDevis;

const centreA = () => d.centres.a.id;
const perimetre = () => ({ type: 'centre', centreId: centreA() }) as const;
const euros = (texte = '0') => Number(texte.replace(',', '.'));

const pecAccordee = (montant: string, surcharge: Record<string, unknown> = {}) => ({
  statut: 'ACCORDEE',
  organisme: 'Mutuelle Démo',
  plateforme: '',
  numeroAccord: 'ACC-1',
  montantAccorde: montant,
  datePec: aujourdhui(),
  ...surcharge,
});

async function dossierAFacturer(pec: Record<string, unknown>) {
  const parcours = await dossierJusquAchat(d, audio, catalogue);
  await confirmerCouvertureAmo(audio, parcours.dossierId);
  await enregistrerPec(audio, parcours.dossierId, pec, VIDE);
  const evaluee = await obtenirFacture(audio, parcours.dossierId);
  if (!evaluee?.facture) {
    throw new Error('Brouillon attendu.');
  }
  return { ...parcours, factureId: evaluee.factureId, totaux: evaluee.facture.totaux };
}

async function factureValidee(pec: Record<string, unknown> = pecAccordee('300,00')) {
  const dossier = await dossierAFacturer(pec);
  await validerFacture(audio, dossier.factureId);
  const creances = await creancesDeLaFacture(audio, dossier.factureId);
  const creance = (type: 'AMO' | 'AMC') => {
    const trouvee = creances.find((c) => c.type === type);
    if (!trouvee) {
      throw new Error(`Créance ${type} attendue.`);
    }
    return trouvee;
  };
  return { ...dossier, amo: creance('AMO'), amc: creance('AMC') };
}

function virement(partAmo: string, partAmc: string, surcharge: Record<string, unknown> = {}) {
  return enregistrerReglement(audio, centreA(), {
    organisme: 'CPAM démo',
    dateReglement: aujourdhui(),
    reference: `VIR-${partAmo}-${partAmc}`,
    partAmo,
    partAmc,
    ...surcharge,
  });
}

/** Solde mis en cache et solde recalculé depuis ses lignes : ils ne doivent jamais diverger. */
async function exigerCacheFidele(): Promise<void> {
  const creances = await prisma().creance.findMany({
    include: { lettrages: true, regularisations: true, facture: { include: { avoirs: true } } },
  });
  for (const c of creances) {
    const avoirs = c.facture.avoirs
      .filter((a) => a.statut === 'VALIDEE')
      .reduce((t, a) => t + (c.type === 'AMO' ? a.totalAmoCentimes : a.totalAmcCentimes), 0);
    const lettre = c.lettrages.reduce((t, l) => t + l.montantCentimes, 0);
    const regularise = c.regularisations.reduce((t, r) => t + r.montantCentimes, 0);
    expect(c.soldeCentimes).toBe(c.montantCentimes - avoirs - lettre - regularise);
  }
}

async function soldeCompte(compte: string): Promise<number> {
  const jour = aujourdhui();
  let texte = '';
  for await (const ligne of await exporterEcritures(admin, centreA(), { debut: jour, fin: jour })) {
    texte += ligne;
  }
  return texte
    .trim()
    .split('\n')
    .map((ligne) => ligne.split(';'))
    .filter((c) => c[2] === compte)
    .reduce((t, c) => t + Math.round(euros(c[5]) * 100) - Math.round(euros(c[6]) * 100), 0);
}

/** Altère la base comme un propriétaire : les triggers sont coupés le temps de l'écriture. */
async function falsifier(sql: string): Promise<void> {
  await prisma().$executeRawUnsafe(`ALTER TABLE "reglement_organisme" DISABLE TRIGGER USER`);
  try {
    await prisma().$executeRawUnsafe(sql);
  } finally {
    await prisma().$executeRawUnsafe(`ALTER TABLE "reglement_organisme" ENABLE TRIGGER USER`);
  }
}

beforeEach(async () => {
  await viderBase();
  d = await creerJeuDeDonnees();
  ({ audioAB: audio, admin } = d.acteurs);
  assistant = d.acteurs.assistantA;
  await identifierCentreA(d);
  await importerLpp(V908);
  catalogue = await creerCatalogueDevis(d);
  await approvisionner(centreA(), catalogue.piles, 1000);
});

afterEach(async () => {
  await exigerCacheFidele();
  await expect(verifierChaineCaisse(admin, centreA())).resolves.toMatchObject({ valide: true });
});

describe('créances à la validation', () => {
  it('crée une créance AMO et une créance AMC, avec leur échéance', async () => {
    const { amo, amc, totaux } = await factureValidee();
    expect(amo).toMatchObject({ montant: totaux.amo, solde: totaux.amo, statut: 'OUVERTE' });
    expect(amc).toMatchObject({ montant: 30_000, organisme: 'Mutuelle Démo', statut: 'OUVERTE' });
    expect(amo.echeanceAttendue > aujourdhui()).toBe(true);
    expect(amc.echeanceAttendue > amo.echeanceAttendue).toBe(true);
  });

  it('applique le délai de la complémentaire du référentiel', async () => {
    const complementaireId = await creerComplementaire(admin, {
      nom: 'Mutuelle Référencée',
      identifiant: '99999001',
      modePec: 'PORTAIL',
      delaiPaiementJours: '10',
      actif: 'on',
    });
    const { amc } = await factureValidee(
      pecAccordee('300,00', { organisme: '', complementaireId }),
    );
    expect(amc.organisme).toBe('Mutuelle Référencée');
  });

  it('sans tiers payant AMO : pas de créance AMO, le patient doit la part AMO', async () => {
    const dossier = await dossierAFacturer(pecAccordee('300,00'));
    await modifierTiersPayantAmo(audio, dossier.factureId, { tiersPayantAmo: false });
    await validerFacture(audio, dossier.factureId);

    const creances = await creancesDeLaFacture(audio, dossier.factureId);
    expect(creances.map((c) => c.type)).toEqual(['AMC']);
    const { solde } = await encaissementsDeFacture(audio, dossier.factureId);
    expect(solde.du).toBe(dossier.totaux.resteACharge + dossier.totaux.amo);
    expect(await soldeCompte('411100')).toBe(0);
    expect(await soldeCompte('411000')).toBe(solde.du);
  });

  it('refuse de retirer le tiers payant d’une facture validée', async () => {
    const { factureId } = await factureValidee();
    await expect(
      modifierTiersPayantAmo(audio, factureId, { tiersPayantAmo: false }),
    ).rejects.toBeInstanceOf(ErreurSaisie);
  });

  it('le patient ne peut pas régler la part des organismes en tiers payant', async () => {
    const { factureId, totaux } = await factureValidee();
    const saisie = {
      mode: 'VIREMENT',
      remis: '',
      reference: '',
      partenaire: '',
      echeances: '',
      montant: `${String((totaux.resteACharge + 100) / 100).replace('.', ',')}`,
    };
    await expect(encaisserFacture(audio, factureId, saisie)).rejects.toBeInstanceOf(ErreurSaisie);
  });
});

describe('effet de la PEC sur le reste à charge', () => {
  it.each([
    ['accord', () => pecAccordee('300,00'), 30_000],
    [
      'accord partiel',
      () => ({
        ...pecAccordee('100,00'),
        statut: 'PARTIELLE',
        demande: [
          { libelle: 'Aide', codeLpp: '', prixTtcCentimes: 1, amoCentimes: 0, montant: '300,00' },
        ],
      }),
      10_000,
    ],
    ['refus', () => ({ statut: 'REFUSEE', organisme: 'Mutuelle Démo', datePec: aujourdhui() }), 0],
  ])('%s', async (_, pec, amc) => {
    const { totaux } = await dossierAFacturer(pec());
    expect(totaux.amc).toBe(amc);
    expect(totaux.resteACharge).toBe(totaux.prixTTC - totaux.amo - amc);
  });

  it('un refus ne crée pas de créance AMC et laisse la part au patient', async () => {
    const dossier = await dossierAFacturer({
      statut: 'REFUSEE',
      organisme: 'Mutuelle Démo',
      datePec: aujourdhui(),
    });
    await validerFacture(audio, dossier.factureId);
    const creances = await creancesDeLaFacture(audio, dossier.factureId);
    expect(creances.map((c) => c.type)).toEqual(['AMO']);
    const { solde } = await encaissementsDeFacture(audio, dossier.factureId);
    expect(solde.du).toBe(dossier.totaux.prixTTC - dossier.totaux.amo);
  });

  it('un accord dépassé bloque la validation', async () => {
    const parcours = await dossierAFacturer(
      pecAccordee('300,00', { datePec: '2020-01-01', validiteFin: '2020-02-01' }),
    );
    await expect(validerFacture(audio, parcours.factureId)).rejects.toBeInstanceOf(
      ErreurFactureBloquee,
    );
  });
});

describe('demande par la plateforme', () => {
  const demande = (numeroAdherent: string, montant = '300,00') => ({
    statut: 'A_DEMANDER',
    organisme: 'Mutuelle Démo',
    numeroAdherent,
    demande: [{ libelle: 'Aide', codeLpp: '', prixTtcCentimes: 100_000, amoCentimes: 0, montant }],
  });

  it('applique un accord simulé', async () => {
    const { dossierId } = await dossierJusquAchat(d, audio, catalogue);
    await enregistrerPec(audio, dossierId, demande('A5'), VIDE);
    await expect(demanderPecPlateforme(audio, dossierId)).resolves.toBe('ACCORDEE');
    const pec = await prisma().priseEnCharge.findUniqueOrThrow({ where: { dossierId } });
    expect(pec).toMatchObject({ montantAccordeCentimes: 30_000 });
    expect(pec.referencePlateforme).toContain('SIM-PEC');
  });

  it('une demande en attente se relit', async () => {
    const { dossierId } = await dossierJusquAchat(d, audio, catalogue);
    await enregistrerPec(audio, dossierId, demande('A2'), VIDE);
    await expect(demanderPecPlateforme(audio, dossierId)).resolves.toBe('DEMANDEE');
    await expect(actualiserPec(audio, dossierId)).resolves.toBe('ACCORDEE');
  });

  it('refuse une demande sans lignes', async () => {
    const { dossierId } = await dossierJusquAchat(d, audio, catalogue);
    await enregistrerPec(
      audio,
      dossierId,
      { statut: 'A_DEMANDER', organisme: 'Mutuelle Démo' },
      VIDE,
    );
    await expect(demanderPecPlateforme(audio, dossierId)).rejects.toBeInstanceOf(ErreurSaisie);
  });
});

describe('règlements et lettrage', () => {
  it('lettrage partiel : la créance reste due pour le solde', async () => {
    const { amo } = await factureValidee();
    const reglementId = await virement('100,00', '');
    await lettrer(audio, reglementId, {
      imputations: [{ creanceId: amo.id, montant: '40,00' }],
    });

    const [creance] = (await listerCreances(audio, perimetre(), { statut: 'PARTIELLE' })).lignes;
    expect(creance).toMatchObject({ id: amo.id, solde: amo.montant - 4_000 });
    const detail = await obtenirReglement(audio, reglementId);
    expect(detail).toMatchObject({ reste: 6_000 });
    expect(detail.resteParType).toEqual({ AMO: 6_000, AMC: 0 });
  });

  it('lettrage multiple : un virement sur plusieurs créances, parts AMO et AMC', async () => {
    const premiere = await factureValidee();
    const seconde = await factureValidee();
    const reglementId = await virement('200,00', '300,00');
    await lettrer(audio, reglementId, {
      imputations: [
        { creanceId: premiere.amo.id, montant: '100,00' },
        { creanceId: seconde.amo.id, montant: '100,00' },
        { creanceId: premiere.amc.id, montant: '300,00' },
      ],
    });
    expect((await obtenirReglement(audio, reglementId)).reste).toBe(0);
    const creances = await creancesDeLaFacture(audio, premiere.factureId);
    expect(creances.find((c) => c.type === 'AMC')).toMatchObject({ solde: 0, statut: 'SOLDEE' });
    expect(await soldeCompte('512000')).toBe(50_000);
    expect(await soldeCompte('411200')).toBe(60_000 - 30_000);
  });

  it.each([
    ['plus que le solde', 'amc', '301,00'],
    ['plus que la part du règlement', 'amo', '151,00'],
  ] as const)('refuse : %s', async (_, type, montant) => {
    const facture = await factureValidee();
    const reglementId = await virement('150,00', '400,00');
    await expect(
      lettrer(audio, reglementId, {
        imputations: [{ creanceId: facture[type].id, montant }],
      }),
    ).rejects.toThrow(/dépasse/);
  });

  it('délettre, puis annule le virement', async () => {
    const { amo } = await factureValidee();
    const reglementId = await virement('100,00', '');
    await lettrer(audio, reglementId, {
      imputations: [{ creanceId: amo.id, montant: '40,00' }],
    });
    await expect(annulerReglement(admin, reglementId, { motif: 'Erreur' })).rejects.toThrow(
      /Délettrez/,
    );
    const [lettrage] = (await obtenirReglement(admin, reglementId)).lettrages;
    await delettrer(admin, lettrage?.id ?? '');
    await expect(delettrer(admin, lettrage?.id ?? '')).rejects.toBeInstanceOf(ErreurSaisie);
    await annulerReglement(admin, reglementId, { motif: 'Erreur de saisie' });

    expect(await soldeCompte('512000')).toBe(0);
    expect((await listerCreances(audio, perimetre(), {})).lignes.map((c) => c.solde)).toContain(
      amo.montant,
    );
    await expect(
      lettrer(audio, reglementId, { imputations: [{ creanceId: amo.id, montant: '1,00' }] }),
    ).rejects.toThrow(/annulé/);
    expect((await listerReglements(audio, perimetre(), {})).lignes[0]).toMatchObject({
      annule: true,
    });
  });

  it('refuse un virement saisi deux fois, mais pas après son annulation', async () => {
    const reglementId = await virement('100,00', '');
    await expect(virement('100,00', '')).rejects.toBeInstanceOf(ErreurSaisie);
    await annulerReglement(admin, reglementId, { motif: 'Doublon' });
    await expect(virement('100,00', '')).resolves.toBeTruthy();
  });

  it('refuse un virement daté du futur', async () => {
    await expect(virement('1,00', '', { dateReglement: '2999-01-01' })).rejects.toBeInstanceOf(
      ErreurSaisie,
    );
  });

  it('deux lettrages simultanés ne dépassent pas le règlement', async () => {
    const { amo } = await factureValidee();
    const reglementId = await virement('100,00', '');
    const resultats = await Promise.allSettled(
      [1, 2].map(() =>
        lettrer(audio, reglementId, {
          imputations: [{ creanceId: amo.id, montant: '100,00' }],
        }),
      ),
    );
    expect(resultats.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await obtenirReglement(audio, reglementId)).reste).toBe(0);
  });
});

describe('écarts, rejets et transfert', () => {
  it('un écart en perte solde la créance sans charger le patient', async () => {
    const { amc, factureId } = await factureValidee();
    await enregistrerEcart(admin, amc.id, { montant: '300,00', motif: 'Moins versé' });
    expect((await creancesDeLaFacture(audio, factureId))[1]).toMatchObject({ statut: 'SOLDEE' });
    expect(await soldeCompte('654000')).toBe(30_000);
    expect(await soldeCompte('411200')).toBe(0);
  });

  it('classe en produit ce qu’un organisme a versé en trop', async () => {
    const reglementId = await virement('100,00', '');
    await classerEcartReglement(admin, reglementId, {
      montant: '1,00',
      motif: 'Trop versé',
      type: 'AMO',
    });
    expect((await obtenirReglement(admin, reglementId)).reste).toBe(9_900);
    expect(await soldeCompte('758000')).toBe(-100);
    await expect(
      classerEcartReglement(admin, reglementId, { montant: '1,00', motif: 'X', type: 'AMC' }),
    ).rejects.toThrow(/dépasse/);
  });

  it('un rejet attend sa suite, et le transfert charge le patient', async () => {
    const { amc, factureId, totaux } = await factureValidee();
    await enregistrerRejet(audio, amc.id, {
      dateRejet: aujourdhui(),
      code: 'R01',
      motif: 'Droits fermés',
    });
    const { lignes } = await listerRejets(audio, perimetre(), {});
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatchObject({ code: 'R01', motif: 'Droits fermés', solde: 30_000 });
    expect((await listerCreances(audio, perimetre(), { statut: 'REJETEE' })).lignes).toHaveLength(
      1,
    );

    await resoudreRejet(admin, lignes[0]?.id ?? '', {
      resolution: 'TRANSFEREE_PATIENT',
      motif: '',
    });
    expect((await listerRejets(audio, perimetre(), {})).lignes).toHaveLength(0);
    const { solde } = await encaissementsDeFacture(audio, factureId);
    expect(solde.du).toBe(totaux.resteACharge + 30_000);
    expect(await soldeCompte('411200')).toBe(0);
    await expect(
      resoudreRejet(admin, lignes[0]?.id ?? '', { resolution: 'ABANDONNEE', motif: '' }),
    ).rejects.toBeInstanceOf(ErreurSaisie);
  });

  it('une représentation garde la créance et repousse l’échéance', async () => {
    const { amc } = await factureValidee();
    const rejetId = await enregistrerRejet(audio, amc.id, {
      dateRejet: aujourdhui(),
      code: '',
      motif: 'Pièce manquante',
    });
    await resoudreRejet(audio, rejetId, { resolution: 'REPRESENTEE', motif: '' });
    expect((await listerCreances(audio, perimetre(), {})).lignes.map((c) => c.statut)).toContain(
      'OUVERTE',
    );
  });

  it('abandonner un rejet passe le solde en perte', async () => {
    const { amo } = await factureValidee();
    const rejetId = await enregistrerRejet(audio, amo.id, {
      dateRejet: aujourdhui(),
      code: '',
      motif: 'Prescription dépassée',
    });
    await resoudreRejet(admin, rejetId, { resolution: 'ABANDONNEE', motif: 'Classé' });
    expect(await soldeCompte('654000')).toBe(amo.montant);
  });

  it('refuse un écart supérieur au solde', async () => {
    const { amc } = await factureValidee();
    await expect(
      enregistrerEcart(admin, amc.id, { montant: '300,01', motif: 'Trop' }),
    ).rejects.toThrow(/dépasse/);
  });

  it('réserve la régularisation aux rôles de gestion', async () => {
    const { amc } = await factureValidee();
    const saisie = { montant: '1,00', motif: 'Essai' };
    await expect(enregistrerEcart(assistant, amc.id, saisie)).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
    await expect(transfererAuPatient(audio, amc.id, saisie)).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
  });
});

describe('avoir sur une créance', () => {
  it('ouverte : le solde s’éteint', async () => {
    const { factureId, amo, amc } = await factureValidee();
    await emettreAvoir(admin, factureId, { mode: 'TOTAL', motif: 'Erreur' });
    const creances = await creancesDeLaFacture(audio, factureId);
    expect(creances.map((c) => c.solde)).toEqual([0, 0]);
    expect(amo.solde + amc.solde).toBeGreaterThan(0);
    expect(await soldeCompte('411100')).toBe(0);
    expect(await soldeCompte('411200')).toBe(0);
  });

  it('transférée au patient : le transfert se contre-passe, le patient ne doit rien', async () => {
    const { factureId, amc } = await factureValidee();
    await transfererAuPatient(admin, amc.id, { montant: '300,00', motif: 'Refus tardif' });
    await emettreAvoir(admin, factureId, { mode: 'TOTAL', motif: 'Erreur' });
    expect(await soldeCompte('411200')).toBe(0);
    expect(await soldeCompte('411000')).toBe(0);
    const { solde } = await encaissementsDeFacture(audio, factureId);
    expect(solde.du).toBe(0);
  });

  it('déjà payée : un indu apparaît, à relettrer sur la facture suivante', async () => {
    const { factureId, amc, dossierId } = await factureValidee();
    const reglementId = await virement('', '300,00');
    await lettrer(audio, reglementId, {
      imputations: [{ creanceId: amc.id, montant: '300,00' }],
    });
    await emettreAvoir(admin, factureId, { mode: 'TOTAL', motif: 'Erreur' });
    const lignes = await creancesDeLaFacture(audio, factureId);
    expect(lignes.find((c) => c.type === 'AMC')).toMatchObject({ solde: -30_000, statut: 'INDU' });
    expect(await soldeCompte('411200')).toBe(-30_000);

    const [lettrage] = (await obtenirReglement(admin, reglementId)).lettrages;
    await delettrer(admin, lettrage?.id ?? '');
    expect((await creancesDeLaFacture(audio, factureId)).at(-1)).toMatchObject({ solde: 0 });
    expect(dossierId).toBeTruthy();
    expect((await obtenirReglement(admin, reglementId)).reste).toBe(30_000);
  });
});

describe('droits et lecture', () => {
  it('ouvrir une créance écrit une ligne READ', async () => {
    const { amc } = await factureValidee();
    const detail = await obtenirCreance(audio, amc.id);
    expect(detail).toMatchObject({ organisme: 'Mutuelle Démo', regulariser: false });
    const lectures = await prisma().journalAudit.count({
      where: { action: 'READ', entiteType: 'CREANCE', entiteId: amc.id },
    });
    expect(lectures).toBe(1);
  });

  it('refuse les créances d’une facture d’un autre centre', async () => {
    const { factureId, amc } = await factureValidee();
    const autreCentre = d.acteurs.assistantB;
    await expect(creancesDeLaFacture(autreCentre, factureId)).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
    await expect(obtenirCreance(autreCentre, amc.id)).rejects.toBeInstanceOf(AccesRefuseError);
  });

  it('refuse le devis d’un autre dossier dans une demande', async () => {
    const premier = await dossierJusquAchat(d, audio, catalogue);
    const second = await dossierJusquAchat(d, audio, catalogue);
    await expect(
      enregistrerPec(
        audio,
        premier.dossierId,
        { statut: 'A_DEMANDER', organisme: 'Mutuelle Démo', devisId: second.devisId },
        VIDE,
      ),
    ).rejects.toBeInstanceOf(AccesRefuseError);
  });

  it('une PEC à demander datée s’enregistre sans sa date', async () => {
    const { dossierId } = await dossierJusquAchat(d, audio, catalogue);
    await enregistrerPec(
      audio,
      dossierId,
      { statut: 'A_DEMANDER', organisme: 'Mutuelle Démo', datePec: aujourdhui() },
      VIDE,
    );
    await expect(
      prisma().priseEnCharge.findUniqueOrThrow({ where: { dossierId } }),
    ).resolves.toMatchObject({ datePec: null });
  });
});

describe('écrans', () => {
  it('synthèse par organisme et par ancienneté, sans les créances soldées', async () => {
    const { amo } = await factureValidee();
    const reglementId = await virement('', '300,00', { organisme: 'Mutuelle Démo' });
    const lignes = await syntheseParOrganisme(audio, perimetre());
    expect(lignes.map((l) => l.organisme)).toContain('Mutuelle Démo');
    expect(lignes.flatMap((l) => l.parTranche.J0_30)).toContain(30_000);
    expect(reglementId).toBeTruthy();
    expect(amo.solde).toBeGreaterThan(0);
  });

  it('filtre par organisme, part et tranche', async () => {
    await factureValidee();
    const liste = (filtre: object) => listerCreances(audio, perimetre(), filtre);
    expect((await liste({ type: 'AMC' })).lignes).toHaveLength(1);
    expect((await liste({ organisme: 'Mutuelle Démo' })).lignes).toHaveLength(1);
    expect((await liste({ organisme: 'Inconnu' })).lignes).toHaveLength(0);
    expect((await liste({ tranche: 'J0_30' })).lignes).toHaveLength(2);
    expect((await liste({ tranche: 'J91_PLUS' })).lignes).toHaveLength(0);
    expect((await liste({ statut: 'SOLDEE' })).lignes).toHaveLength(0);
  });

  it('range une créance échue dans les impayés, jusqu’à sa relance', async () => {
    const { amo } = await factureValidee();
    await prisma().creance.update({
      where: { id: amo.id },
      data: { echeanceAttendue: new Date('2020-01-01T00:00:00.000Z') },
    });
    const { lignes } = await listerImpayes(audio, perimetre(), {});
    expect(lignes.map((l) => l.id)).toEqual([amo.id]);
    await marquerRelancee(assistant, amo.id);
    expect((await listerImpayes(audio, perimetre(), {})).lignes[0]?.derniereRelanceLe).toBe(
      aujourdhui(),
    );
  });

  it('exporte sans identité de patient et journalise', async () => {
    await factureValidee();
    let texte = '';
    for await (const ligne of await exporterCreances(admin, perimetre(), {})) {
      texte += ligne;
    }
    expect(texte.split('\n')[0]).toContain('Organisme');
    expect(texte).toContain('Mutuelle Démo');
    expect(texte).not.toContain('NOM-DEMO');
    const journal = await prisma().journalAudit.count({
      where: { action: 'EXPORT', entiteType: 'CREANCE' },
    });
    expect(journal).toBe(1);
  });
});

describe('chaîne', () => {
  it('détecte un règlement altéré en base', async () => {
    const reglementId = await virement('100,00', '');
    const fixer = (reference: string) =>
      falsifier(
        `UPDATE "reglement_organisme" SET "reference" = '${reference}' WHERE "id" = '${reglementId}'`,
      );
    await fixer('FAUX');
    await expect(verifierChaineCaisse(admin, centreA())).resolves.toMatchObject({
      valide: false,
      raison: 'TIERS_PAYANT',
    });
    await fixer('VIR-100,00-');
  });

  it('un règlement ne se modifie pas, sauf son reste', async () => {
    const reglementId = await virement('100,00', '');
    await expect(
      prisma().reglementOrganisme.update({
        where: { id: reglementId },
        data: { reference: 'AUTRE' },
      }),
    ).rejects.toThrow();
    await expect(
      prisma().reglementOrganisme.delete({ where: { id: reglementId } }),
    ).rejects.toThrow();
  });
});

describe('complémentaires', () => {
  const saisie = {
    nom: 'Mutuelle Démo',
    identifiant: '99999002',
    modePec: 'PORTAIL',
    delaiPaiementJours: '30',
    actif: 'on',
  };

  it('crée, modifie et refuse un identifiant déjà pris', async () => {
    const id = await creerComplementaire(admin, saisie);
    await expect(creerComplementaire(admin, saisie)).rejects.toBeInstanceOf(ErreurSaisie);
    await modifierComplementaire(admin, id, { ...saisie, nom: 'Mutuelle Renommée' });
    await expect(
      prisma().complementaire.findUniqueOrThrow({ where: { id } }),
    ).resolves.toMatchObject({ nom: 'Mutuelle Renommée' });
  });

  it('réserve le référentiel aux rôles de gestion', async () => {
    await expect(creerComplementaire(assistant, saisie)).rejects.toBeInstanceOf(AccesRefuseError);
  });
});
