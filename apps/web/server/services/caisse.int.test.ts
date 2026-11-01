import path from 'node:path';

import { cloturerCentre, archiverCentre, maillonDepuisBase } from '@ha/caisse';
import { prisma } from '@ha/db/admin';
import { enchainer, MODES_PAIEMENT, sirenDepuisSiret, type ContenuMaillon } from '@ha/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  creerCatalogueDevis,
  creerPatientDevis,
  dossierJusquAchat,
  identifierCentreA,
  type CatalogueDevis,
} from '@/test/devis';
import { creerJeuDeDonnees, creerResponsable, viderBase, type JeuDeDonnees } from '@/test/donnees';
import { approvisionner, venteDirecteValidee } from '@/test/facturation';

import { AccesRefuseError, type UtilisateurConnecte } from '../auth/acces';
import { documents, stockageBrut } from '../documents';
import { ErreurSaisie } from '../erreurs';
import { importerLpp } from '../lpp/importer';
import { emettreAvoir } from './avoirs';
import {
  caisseDuJour,
  compterCaisse,
  lancerClotures,
  lancerVerification,
  listerClotures,
  modifierParametresComptables,
  obtenirParametresComptables,
  ouvrirCaisse,
  telechargerArchive,
  verifierArchiveEnregistree,
} from './caisse';
import { depsCaisse, hacheur, verifierChaineCaisse } from './chaine-caisse';
import {
  acomptesDuDevis,
  encaissementsDeFacture,
  encaisserAcompte,
  encaisserFacture,
  rembourserEncaissement,
} from './encaissements';
import { exporterEcritures, produireFec } from './export-comptable';
import { modifierPrefixeSerie, validerFacture } from './facturation';
import { confirmerCouvertureAmo, enregistrerPec, obtenirFacture } from './factures';

vi.setConfig({ testTimeout: 30_000 });

const V908 = path.join(import.meta.dirname, '../../../../fixtures/lpp/908');
const VIDE = new Uint8Array(0);
/** Deux boîtes à 3,00 € : voir `venteDirecte`. */
const VENTE = 600;

let d: JeuDeDonnees;
let audio: UtilisateurConnecte;
let admin: UtilisateurConnecte;
let catalogue: CatalogueDevis;

const centreA = () => d.centres.a.id;

function regler(instant: string): void {
  vi.setSystemTime(new Date(instant));
}

const SAISIE = { remis: '', reference: '', partenaire: '', echeances: '' };
const paiement = (mode: string, montant: string, plus: Record<string, string> = {}) => ({
  ...SAISIE,
  mode,
  montant,
  ...plus,
});

function vente(): Promise<string> {
  return creerPatientDevis(d).then((patientId) =>
    venteDirecteValidee(d, audio, patientId, catalogue.piles),
  );
}

/** Altère la base comme un propriétaire : les triggers sont coupés le temps de l'écriture. */
async function falsifier(sql: string, table: string): Promise<void> {
  await prisma().$executeRawUnsafe(`ALTER TABLE "${table}" DISABLE TRIGGER USER`);
  try {
    await prisma().$executeRawUnsafe(sql);
  } finally {
    await prisma().$executeRawUnsafe(`ALTER TABLE "${table}" ENABLE TRIGGER USER`);
  }
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  regler('2026-11-02T10:00:00+01:00');
  await viderBase();
  await prisma().tauxTva.deleteMany({ where: { type: 'ENTRETIEN' } });
  d = await creerJeuDeDonnees();
  ({ audioAB: audio, admin } = d.acteurs);
  await identifierCentreA(d);
  await importerLpp(V908);
  catalogue = await creerCatalogueDevis(d);
  await approvisionner(centreA(), catalogue.piles, 1000);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('encaissement d’une facture', () => {
  it('encaisse partiellement, en plusieurs fois et dans plusieurs modes', async () => {
    const factureId = await vente();
    await encaisserFacture(audio, factureId, paiement('CB', '2,00'));

    expect((await encaissementsDeFacture(audio, factureId)).solde).toMatchObject({
      encaisse: 200,
      du: VENTE - 200,
      plafond: VENTE - 200,
    });
    await encaisserFacture(audio, factureId, paiement('CHEQUE', '1,00', { reference: '1234567' }));
    await encaisserFacture(
      audio,
      factureId,
      paiement('FINANCEMENT', '3,00', { partenaire: 'Partenaire démo', echeances: '3' }),
    );

    const { solde, mouvements } = await encaissementsDeFacture(audio, factureId);
    expect(solde).toMatchObject({ encaisse: VENTE, du: 0, plafond: 0 });
    expect(mouvements.map((m) => m.mode)).toEqual(['CB', 'CHEQUE', 'FINANCEMENT']);
    expect(mouvements[1]?.reference).toBe('1234567');
    expect(mouvements[2]).toMatchObject({ partenaire: 'Partenaire démo', echeances: 3 });
  });

  it('chiffre les textes libres et n’en garde que l’empreinte dans le maillon', async () => {
    const factureId = await vente();
    await encaisserFacture(audio, factureId, paiement('CHEQUE', '1,00', { reference: '1234567' }));
    const [ligne] = await prisma().$queryRaw<{ reference: string }[]>`
      SELECT "reference" FROM "encaissement"`;
    expect(ligne?.reference).toMatch(/^v1\./);
    const maillon = await prisma().evenementCaisse.findFirstOrThrow({
      where: { type: 'ENCAISSEMENT' },
    });
    expect(JSON.stringify(maillon.charge)).not.toContain('1234567');
  });

  it('refuse de dépasser le TTC net', async () => {
    const factureId = await vente();
    await encaisserFacture(audio, factureId, paiement('CB', '5,00'));
    await expect(encaisserFacture(audio, factureId, paiement('CB', '1,01'))).rejects.toBeInstanceOf(
      ErreurSaisie,
    );
  });

  it('calcule le rendu de monnaie et exige une caisse ouverte pour les espèces', async () => {
    const factureId = await vente();
    await expect(encaisserFacture(audio, factureId, paiement('ESPECES', '6,00'))).rejects.toThrow(
      /Ouvrez la caisse/,
    );
    await ouvrirCaisse(audio, centreA(), { fond: '100', justification: '' });
    await encaisserFacture(audio, factureId, paiement('ESPECES', '6,00', { remis: '10' }));
    const [ligne] = (await encaissementsDeFacture(audio, factureId)).mouvements;
    expect(ligne).toMatchObject({ montantCentimes: 600, renduCentimes: 400 });
    await expect(
      prisma().encaissement.findFirstOrThrow({ select: { remisCentimes: true } }),
    ).resolves.toEqual({ remisCentimes: 1000 });
  });

  it('ne s’applique pas à un brouillon, à un avoir ni au client d’un autre', async () => {
    const factureId = await vente();
    const { avoirId } = await emettreAvoir(admin, factureId, { mode: 'TOTAL', motif: 'Erreur' });
    await expect(encaisserFacture(audio, avoirId, paiement('CB', '1'))).rejects.toThrow(
      /facture validée/,
    );
    const horsCentre = { ...audio, centreIds: [] };
    await expect(
      encaisserFacture(horsCentre, factureId, paiement('CB', '1')),
    ).rejects.toBeInstanceOf(AccesRefuseError);
  });

  it('tient le plafond sous des encaissements simultanés', async () => {
    const factureId = await vente();
    const essais = await Promise.allSettled([
      encaisserFacture(audio, factureId, paiement('CB', '4,00')),
      encaisserFacture(audio, factureId, paiement('CB', '4,00')),
    ]);
    expect(essais.filter((e) => e.status === 'fulfilled')).toHaveLength(1);
    expect((await encaissementsDeFacture(audio, factureId)).solde.encaisse).toBe(400);
    await expect(verifierChaineCaisse(audio, centreA())).resolves.toMatchObject({ valide: true });
  });
});

describe('remboursement', () => {
  it('rembourse par une opération inverse, sans toucher à l’origine', async () => {
    const factureId = await vente();
    const id = await encaisserFacture(audio, factureId, paiement('CB', '6,00'));
    const saisie = {
      nature: 'REMBOURSEMENT',
      mode: 'CHEQUE',
      montant: '2,00',
      motif: 'Geste commercial',
      reference: '',
    };

    await expect(rembourserEncaissement(audio, id, saisie)).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
    await rembourserEncaissement(admin, id, saisie);

    const { solde, mouvements } = await encaissementsDeFacture(admin, factureId);
    expect(solde).toMatchObject({ encaisse: 400, du: 200 });
    expect(mouvements).toHaveLength(2);
    expect(mouvements[0]).toMatchObject({ montantCentimes: 600, remboursable: 400 });
    expect(mouvements[1]).toMatchObject({ nature: 'REMBOURSEMENT', motif: 'Geste commercial' });
    await expect(
      rembourserEncaissement(admin, id, { ...saisie, montant: '5,00' }),
    ).rejects.toBeInstanceOf(ErreurSaisie);
    await expect(
      rembourserEncaissement(admin, mouvements[1]?.id ?? '', { ...saisie, montant: '1' }),
    ).rejects.toThrow(/Seul un encaissement/);
  });

  it('annule tout le reste, dans le même mode', async () => {
    const factureId = await vente();
    const id = await encaisserFacture(audio, factureId, paiement('CB', '6,00'));
    const annulation = { nature: 'ANNULATION', mode: 'CB', motif: 'Erreur', reference: '' };
    await expect(
      rembourserEncaissement(admin, id, { ...annulation, montant: '1,00' }),
    ).rejects.toThrow(/tout le reste/);
    await rembourserEncaissement(admin, id, { ...annulation, montant: '6,00' });
    const maillons = await prisma().evenementCaisse.findMany({
      where: { type: 'ANNULATION_ENCAISSEMENT' },
    });
    expect(maillons).toHaveLength(1);
    expect((await encaissementsDeFacture(admin, factureId)).solde.encaisse).toBe(0);
  });
});

describe('acomptes', () => {
  async function dossierPret() {
    regler(new Date(Date.now()).toISOString());
    const parcours = await dossierJusquAchat(d, audio, catalogue);
    await confirmerCouvertureAmo(audio, parcours.dossierId);
    await enregistrerPec(audio, parcours.dossierId, { statut: 'SANS_TIERS_PAYANT' }, VIDE);
    const evaluee = await obtenirFacture(audio, parcours.dossierId);
    if (!evaluee) {
      throw new Error('Brouillon attendu.');
    }
    return { ...parcours, factureId: evaluee.factureId };
  }

  it('prend un acompte sur un devis signé, repris par la facture et par son PDF', async () => {
    const { devisId, factureId } = await dossierPret();
    await encaisserAcompte(audio, devisId, paiement('CB', '100,00'));
    expect((await acomptesDuDevis(audio, devisId)).net).toBe(10_000);

    await validerFacture(audio, factureId);

    const facture = await prisma().facture.findUniqueOrThrow({ where: { id: factureId } });
    expect(facture.acomptesDeduitsCentimes).toBe(10_000);
    const { solde, mouvements } = await encaissementsDeFacture(audio, factureId);
    expect(solde.encaisse).toBe(10_000);
    expect(solde.du).toBe(facture.totalResteCentimes - 10_000);
    expect(mouvements).toHaveLength(1);
    await expect(verifierChaineCaisse(audio, centreA())).resolves.toMatchObject({ valide: true });
  });

  it('refuse plus que le TTC de l’offre retenue', async () => {
    const { devisId } = await dossierPret();
    await expect(
      encaisserAcompte(audio, devisId, paiement('CB', '100000,00')),
    ).rejects.toBeInstanceOf(ErreurSaisie);
  });

  it('après un avoir total, les paiements suivent la nouvelle facture du dossier', async () => {
    const { dossierId, devisId, factureId } = await dossierPret();
    await encaisserAcompte(audio, devisId, paiement('CB', '100,00'));
    await validerFacture(audio, factureId);
    await encaisserFacture(audio, factureId, paiement('CB', '50,00'));
    await emettreAvoir(admin, factureId, { mode: 'TOTAL', motif: 'Erreur' });

    expect((await encaissementsDeFacture(audio, factureId)).solde).toMatchObject({
      ttcNet: 0,
      encaisse: 15_000,
      tropPercu: 15_000,
    });
    const evaluee = await obtenirFacture(audio, dossierId);
    const nouvelle = evaluee?.factureId ?? '';
    await confirmerCouvertureAmo(audio, dossierId);
    await validerFacture(audio, nouvelle);
    const { solde } = await encaissementsDeFacture(audio, nouvelle);
    expect(solde).toMatchObject({ encaisse: 15_000, tropPercu: 0 });
  });

  it('sur une vente directe, un avoir total laisse un trop-perçu à rembourser', async () => {
    const factureId = await vente();
    await encaisserFacture(audio, factureId, paiement('CB', '6,00'));
    await emettreAvoir(admin, factureId, { mode: 'TOTAL', motif: 'Erreur' });
    expect((await encaissementsDeFacture(audio, factureId)).solde).toMatchObject({
      tropPercu: VENTE,
      du: 0,
      plafond: 0,
    });
  });
});

describe('caisse du jour', () => {
  it('compte les espèces, exige la justification d’un écart et garde chaque comptage', async () => {
    const factureId = await vente();
    await ouvrirCaisse(audio, centreA(), { fond: '100', justification: '' });
    await encaisserFacture(audio, factureId, paiement('ESPECES', '6,00', { remis: '10' }));
    await encaisserFacture(audio, await vente(), paiement('CB', '6,00'));

    const avant = await caisseDuJour(audio, centreA());
    expect(avant.theorique).toBe(10_600);

    await expect(
      compterCaisse(audio, centreA(), { comptees: '105', remiseBanque: '', justification: '' }),
    ).rejects.toBeInstanceOf(ErreurSaisie);
    await compterCaisse(audio, centreA(), {
      comptees: '105',
      remiseBanque: '',
      justification: 'Erreur de rendu',
    });
    await compterCaisse(audio, centreA(), {
      comptees: '106',
      remiseBanque: '50',
      justification: '',
    });

    const { comptages } = await caisseDuJour(audio, centreA());
    expect(comptages.map((c) => c.ecartCentimes)).toEqual([-100, 0]);
    expect(comptages[0]?.justification).toBe('Erreur de rendu');
  });

  it('propose le fond restant le lendemain, et exige de justifier une différence', async () => {
    await ouvrirCaisse(audio, centreA(), { fond: '100', justification: '' });
    await compterCaisse(audio, centreA(), {
      comptees: '100',
      remiseBanque: '40',
      justification: '',
    });
    await expect(
      ouvrirCaisse(audio, centreA(), { fond: '100', justification: '' }),
    ).rejects.toThrow(/déjà ouverte/);

    regler('2026-11-03T09:00:00+01:00');
    expect((await caisseDuJour(audio, centreA())).fondPropose).toBe(6_000);
    await expect(
      ouvrirCaisse(audio, centreA(), { fond: '70', justification: '' }),
    ).rejects.toBeInstanceOf(ErreurSaisie);
    await ouvrirCaisse(audio, centreA(), { fond: '70', justification: 'Appoint ajouté' });
    await expect(verifierChaineCaisse(audio, centreA())).resolves.toMatchObject({ valide: true });
  });

  it('refuse de compter une caisse fermée', async () => {
    await expect(
      compterCaisse(audio, centreA(), { comptees: '1', remiseBanque: '', justification: '' }),
    ).rejects.toThrow(/Ouvrez la caisse/);
  });
});

describe('clôtures', () => {
  let responsable: UtilisateurConnecte;

  beforeEach(async () => {
    responsable = await creerResponsable(d);
  });

  const clotures = (portee: 'JOUR' | 'MOIS' | 'EXERCICE') =>
    prisma().clotureCaisse.findMany({ where: { portee }, orderBy: { debut: 'asc' } });

  it('ne clôture pas la journée en cours', async () => {
    await vente();
    await expect(lancerClotures(admin, centreA())).resolves.toEqual({
      jours: 0,
      mois: 0,
      exercices: 0,
    });
  });

  it('fige les totaux par mode et par taux, et les cumuls', async () => {
    const factureId = await vente();
    await ouvrirCaisse(audio, centreA(), { fond: '0', justification: '' });
    await encaisserFacture(audio, factureId, paiement('CB', '4,00'));
    await encaisserFacture(audio, factureId, paiement('ESPECES', '2,00'));
    const id = await encaisserFacture(audio, await vente(), paiement('CB', '1,00'));
    await rembourserEncaissement(admin, id, {
      nature: 'REMBOURSEMENT',
      mode: 'CB',
      montant: '1,00',
      motif: 'Erreur',
      reference: '',
    });

    regler('2026-11-03T08:00:00+01:00');
    await expect(lancerClotures(responsable, centreA())).resolves.toMatchObject({ jours: 1 });

    const [jour] = await clotures('JOUR');
    expect(jour).toMatchObject({
      rangDebut: 1,
      grandTotalCentimes: BigInt(2 * VENTE),
      perpetuelCentimes: BigInt(2 * VENTE),
      encaissePerpetuelCentimes: BigInt(VENTE),
      versionCaisse: '1.0',
    });
    expect(jour?.totaux).toMatchObject({
      factures: 2,
      avoirs: 0,
      ttc: 2 * VENTE,
      encaissementsNets: VENTE,
      parMode: [
        { mode: 'CB', encaisse: 500, rendu: 100 },
        { mode: 'ESPECES', encaisse: 200, rendu: 0 },
      ],
      parTaux: [{ taux: 2000, ttc: 2 * VENTE }],
    });
    await expect(verifierChaineCaisse(audio, centreA())).resolves.toMatchObject({ valide: true });
    expect(await listerClotures(admin, centreA())).toHaveLength(1);
  });

  it('coupe à minuit, heure de Paris, et n’oublie rien', async () => {
    regler('2026-11-02T23:59:30+01:00');
    await vente();
    regler('2026-11-03T00:00:30+01:00');
    await vente();
    regler('2026-11-04T01:00:00+01:00');
    await lancerClotures(admin, centreA());
    const jours = await clotures('JOUR');
    expect(jours.map((j) => j.debut.toISOString().slice(0, 10))).toEqual([
      '2026-11-02',
      '2026-11-03',
    ]);
    expect(jours.map((j) => (j.totaux as { ttc: number }).ttc)).toEqual([VENTE, VENTE]);
    const [premier, second] = jours;
    expect(second?.rangDebut).toBe((premier?.rangFin ?? 0) + 1);
    expect(second?.perpetuelCentimes).toBe(BigInt(2 * VENTE));
  });

  it('est idempotente et rattrape plusieurs journées', async () => {
    await vente();
    regler('2026-11-04T09:00:00+01:00');
    await vente();
    regler('2026-11-07T09:00:00+01:00');
    await expect(lancerClotures(admin, centreA())).resolves.toMatchObject({ jours: 2 });
    await expect(lancerClotures(admin, centreA())).resolves.toMatchObject({ jours: 0 });
    expect(await clotures('JOUR')).toHaveLength(2);
  });

  it('tient deux clôtures simultanées', async () => {
    await vente();
    regler('2026-11-03T09:00:00+01:00');
    await Promise.allSettled([lancerClotures(admin, centreA()), lancerClotures(admin, centreA())]);
    expect(await clotures('JOUR')).toHaveLength(1);
  });

  it('le mois additionne ses journées, l’exercice ses mois', async () => {
    await vente();
    regler('2026-11-20T09:00:00+01:00');
    const factureId = await vente();
    await emettreAvoir(admin, factureId, { mode: 'TOTAL', motif: 'Erreur' });
    regler('2026-12-05T09:00:00+01:00');
    await vente();
    regler('2027-01-02T09:00:00+01:00');
    await expect(lancerClotures(admin, centreA())).resolves.toEqual({
      jours: 3,
      mois: 2,
      exercices: 1,
    });

    const [novembre, decembre] = await clotures('MOIS');
    expect(novembre?.totaux).toMatchObject({ factures: 2, avoirs: 1, ttc: VENTE });
    expect(decembre?.totaux).toMatchObject({ factures: 1, ttc: VENTE });
    const [exercice] = await clotures('EXERCICE');
    expect(exercice).toMatchObject({
      perpetuelCentimes: BigInt(2 * VENTE),
      grandTotalCentimes: BigInt(2 * VENTE),
    });
    expect(exercice?.totaux).toMatchObject({ factures: 3, avoirs: 1, ttc: 2 * VENTE });
    await expect(verifierChaineCaisse(audio, centreA())).resolves.toMatchObject({ valide: true });
  });

  it('le grand total repart à l’exercice, le total perpétuel jamais', async () => {
    await vente();
    regler('2027-01-05T09:00:00+01:00');
    await vente();
    regler('2027-01-06T09:00:00+01:00');
    await lancerClotures(admin, centreA());
    const jours = await clotures('JOUR');
    expect(jours.at(-1)).toMatchObject({
      grandTotalCentimes: BigInt(VENTE),
      perpetuelCentimes: BigInt(2 * VENTE),
    });
  });

  it('une clôture ne se modifie pas et n’accepte aucune suppression', async () => {
    await vente();
    regler('2026-11-03T09:00:00+01:00');
    await lancerClotures(admin, centreA());
    const { id } = await prisma().clotureCaisse.findFirstOrThrow();
    await expect(
      prisma().clotureCaisse.update({ where: { id }, data: { versionCaisse: 'x' } }),
    ).rejects.toThrow(/ajout seul/);
    await expect(prisma().clotureCaisse.delete({ where: { id } })).rejects.toThrow(/ajout seul/);
  });

  it('une clôture de nuit n’a pas d’acteur, et reste vérifiable', async () => {
    await vente();
    regler('2026-11-03T09:00:00+01:00');
    await cloturerCentre({ ...depsCaisse(admin), acteurId: null }, centreA());
    await expect(prisma().clotureCaisse.findFirstOrThrow()).resolves.toMatchObject({
      acteurId: null,
    });
    await expect(verifierChaineCaisse(audio, centreA())).resolves.toMatchObject({ valide: true });
  });

  it('refuse un maillon sans acteur hors des événements système', async () => {
    await vente();
    const { id } = await prisma().evenementCaisse.findFirstOrThrow();
    await falsifier(
      `UPDATE "evenement_caisse" SET "acteur_id" = NULL WHERE "id" = '${id}'`,
      'evenement_caisse',
    ).then(
      () => {
        throw new Error('Refus attendu.');
      },
      (erreur: unknown) => {
        expect(String(erreur)).toContain('evenement_caisse_acteur_humain');
      },
    );
  });
});

describe('intégrité de la chaîne', () => {
  /** Une journée clôturée, puis un encaissement ouvert sur la suivante. */
  async function chaineVivante() {
    const factureId = await vente();
    const encaissementId = await encaisserFacture(audio, factureId, paiement('CB', '4,00'));
    regler('2026-11-03T09:00:00+01:00');
    await lancerClotures(admin, centreA());
    await encaisserFacture(audio, factureId, paiement('CB', '1,00'));
    await expect(verifierChaineCaisse(audio, centreA())).resolves.toMatchObject({ valide: true });
    return { factureId, encaissementId };
  }

  /** L'attaque la plus forte sans la clé : tout recalculer, de la ligne à la tête de chaîne. */
  async function recalculerToutLaChaine(depuis: number) {
    const lignes = await prisma().evenementCaisse.findMany({ orderBy: { rang: 'asc' } });
    await prisma().$executeRawUnsafe('ALTER TABLE "evenement_caisse" DISABLE TRIGGER USER');
    await prisma().$executeRawUnsafe('ALTER TABLE "chaine_caisse" DISABLE TRIGGER USER');
    await prisma().$executeRawUnsafe('ALTER TABLE "encaissement" DISABLE TRIGGER USER');
    await prisma().$executeRawUnsafe('ALTER TABLE "cloture_caisse" DISABLE TRIGGER USER');
    try {
      let precedente: string | null = null;
      for (const ligne of lignes) {
        const empreintePrecedente = precedente ?? ligne.empreintePrecedente;
        const contenu = { ...maillonDepuisBase(ligne), empreintePrecedente } as ContenuMaillon;
        const empreinte = ligne.rang < depuis ? ligne.empreinte : enchainer(contenu, hacheur);
        await prisma().$executeRaw`
          UPDATE "evenement_caisse" SET "empreinte" = ${empreinte},
            "empreinte_precedente" = ${empreintePrecedente} WHERE "id" = ${ligne.id}`;
        await prisma().$executeRaw`
          UPDATE "encaissement" SET "empreinte" = ${empreinte} WHERE "rang" = ${ligne.rang}`;
        await prisma().$executeRaw`
          UPDATE "cloture_caisse" SET "empreinte" = ${empreinte} WHERE "rang" = ${ligne.rang}`;
        await prisma().$executeRaw`
          UPDATE "facture" SET "empreinte" = "empreinte" WHERE false`;
        precedente = empreinte;
      }
      await prisma().$executeRaw`UPDATE "chaine_caisse" SET "derniere_empreinte" = ${precedente}`;
    } finally {
      await prisma().$executeRawUnsafe('ALTER TABLE "evenement_caisse" ENABLE TRIGGER USER');
      await prisma().$executeRawUnsafe('ALTER TABLE "chaine_caisse" ENABLE TRIGGER USER');
      await prisma().$executeRawUnsafe('ALTER TABLE "encaissement" ENABLE TRIGGER USER');
      await prisma().$executeRawUnsafe('ALTER TABLE "cloture_caisse" ENABLE TRIGGER USER');
    }
  }

  it.each(['encaissement', 'cloture_caisse'] as const)(
    'une ligne de %s refuse toute modification, même au propriétaire',
    async (table) => {
      await chaineVivante();
      await expect(
        prisma().$executeRawUnsafe(`UPDATE "${table}" SET "empreinte" = "empreinte"`),
      ).rejects.toThrow(/ajout seul/);
      await expect(prisma().$executeRawUnsafe(`DELETE FROM "${table}"`)).rejects.toThrow(
        /ajout seul/,
      );
    },
  );

  it('détecte un montant d’encaissement modifié en base', async () => {
    const { encaissementId } = await chaineVivante();
    await falsifier(
      `UPDATE "encaissement" SET "montant_centimes" = 1 WHERE "id" = '${encaissementId}'`,
      'encaissement',
    );
    await expect(verifierChaineCaisse(audio, centreA())).resolves.toMatchObject({
      valide: false,
      raison: 'ENCAISSEMENT',
    });
  });

  it('détecte la charge d’un maillon modifiée', async () => {
    await chaineVivante();
    await falsifier(
      `UPDATE "evenement_caisse" SET "charge" = '{"faux":true}' WHERE "type" = 'ENCAISSEMENT'`,
      'evenement_caisse',
    );
    await expect(verifierChaineCaisse(audio, centreA())).resolves.toMatchObject({
      valide: false,
      raison: 'MAILLON',
    });
  });

  it('détecte un horodatage ou un acteur modifié', async () => {
    await chaineVivante();
    await falsifier(
      `UPDATE "evenement_caisse" SET "created_at" = "created_at" - interval '1 day' WHERE "rang" = 3`,
      'evenement_caisse',
    );
    await expect(verifierChaineCaisse(audio, centreA())).resolves.toMatchObject({
      valide: false,
      rang: 3,
      raison: 'MAILLON',
    });
  });

  it('détecte un encaissement supprimé', async () => {
    const { encaissementId } = await chaineVivante();
    await falsifier(`DELETE FROM "encaissement" WHERE "id" = '${encaissementId}'`, 'encaissement');
    await expect(verifierChaineCaisse(audio, centreA())).resolves.toMatchObject({
      valide: false,
      raison: 'ENCAISSEMENT',
    });
  });

  it('détecte un encaissement ajouté sans maillon', async () => {
    const { encaissementId, factureId } = await chaineVivante();
    await falsifier(
      `INSERT INTO "encaissement" ("id", "organisation_id", "centre_id", "patient_id", "facture_id", "nature", "mode", "montant_centimes", "rang", "empreinte", "acteur_id", "created_at")
       SELECT 'faux', "organisation_id", "centre_id", "patient_id", '${factureId}', 'ENCAISSEMENT', 'CB', 100, 999, "empreinte", "acteur_id", "created_at"
       FROM "encaissement" WHERE "id" = '${encaissementId}'`,
      'encaissement',
    );
    await expect(verifierChaineCaisse(audio, centreA())).resolves.toMatchObject({
      valide: false,
      raison: 'ENCAISSEMENT',
    });
  });

  it('détecte des totaux de clôture modifiés', async () => {
    await chaineVivante();
    await falsifier(`UPDATE "cloture_caisse" SET "perpetuel_centimes" = 1`, 'cloture_caisse');
    await expect(verifierChaineCaisse(audio, centreA())).resolves.toMatchObject({
      valide: false,
      raison: 'CLOTURE',
    });
  });

  it('détecte une signature de clôture remplacée', async () => {
    await chaineVivante();
    await falsifier(`UPDATE "cloture_caisse" SET "signature" = 'fausse'`, 'cloture_caisse');
    await expect(verifierChaineCaisse(audio, centreA())).resolves.toMatchObject({
      valide: false,
      raison: 'SIGNATURE',
    });
  });

  it('détecte une pièce validée sans maillon et un numéro retiré', async () => {
    const { factureId } = await chaineVivante();
    await falsifier(
      `UPDATE "facture" SET "empreinte" = repeat('a', 64) WHERE "id" = '${factureId}'`,
      'facture',
    );
    await expect(verifierChaineCaisse(audio, centreA())).resolves.toMatchObject({
      valide: false,
      raison: 'PIECE',
    });
  });

  it('détecte une série qui ne correspond plus aux pièces', async () => {
    await chaineVivante();
    await prisma().serieFacture.updateMany({ data: { dernierNumero: 9 } });
    await expect(verifierChaineCaisse(audio, centreA())).resolves.toMatchObject({
      valide: false,
      raison: 'NUMEROTATION',
    });
  });

  it('refuse une tête de chaîne qui recule ou qui saute', async () => {
    await chaineVivante();
    await expect(
      prisma().chaineCaisse.updateMany({ data: { dernierRang: { decrement: 1 } } }),
    ).rejects.toThrow(/avance refusée/);
    await expect(
      prisma().chaineCaisse.updateMany({ data: { dernierRang: { increment: 5 } } }),
    ).rejects.toThrow(/avance refusée/);
    await expect(prisma().serieFacture.updateMany({ data: { dernierNumero: 0 } })).rejects.toThrow(
      /recul refusé/,
    );
  });

  it('un recalcul complet sans la clé casse la signature des clôtures', async () => {
    const { encaissementId } = await chaineVivante();
    await falsifier(
      `UPDATE "encaissement" SET "montant_centimes" = 300 WHERE "id" = '${encaissementId}'`,
      'encaissement',
    );
    await falsifier(
      `UPDATE "evenement_caisse" SET "charge" = jsonb_set("charge", '{montantCentimes}', '300')
       WHERE "type" = 'ENCAISSEMENT' AND "charge"->>'id' = '${encaissementId}'`,
      'evenement_caisse',
    );
    const { rang } = await prisma().encaissement.findUniqueOrThrow({
      where: { id: encaissementId },
    });
    await recalculerToutLaChaine(rang);

    await expect(verifierChaineCaisse(audio, centreA())).resolves.toMatchObject({
      valide: false,
      raison: 'SIGNATURE',
    });
  });

  it('journalise un échec une seule fois par rupture, et l’affiche au guichet', async () => {
    const { encaissementId } = await chaineVivante();
    await falsifier(
      `UPDATE "encaissement" SET "montant_centimes" = 1 WHERE "id" = '${encaissementId}'`,
      'encaissement',
    );
    await lancerVerification(admin, centreA());
    await lancerVerification(admin, centreA());
    expect(await prisma().evenementCaisse.count({ where: { type: 'VERIFICATION_ECHEC' } })).toBe(1);
    expect((await caisseDuJour(audio, centreA())).echec).not.toBeNull();
  });

  it('une chaîne valide n’écrit rien', async () => {
    await chaineVivante();
    const avant = await prisma().evenementCaisse.count();
    await expect(lancerVerification(admin, centreA())).resolves.toMatchObject({ valide: true });
    expect(await prisma().evenementCaisse.count()).toBe(avant);
  });
});

describe('journal des événements de caisse', () => {
  it('trace les changements de paramètres avec l’avant et l’après', async () => {
    await modifierPrefixeSerie(admin, centreA(), { prefixe: 'CA' });
    const { comptes, profil, moisClotureExercice } = await obtenirParametresComptables(
      admin,
      centreA(),
    );
    await modifierParametresComptables(admin, centreA(), {
      comptes: { ...comptes, compteClients: '411999' },
      profil,
      moisClotureExercice,
    });
    await modifierParametresComptables(admin, centreA(), {
      comptes: { ...comptes, compteClients: '411999' },
      profil,
      moisClotureExercice,
    });
    const maillons = await prisma().evenementCaisse.findMany({
      where: { type: 'PARAMETRE_MODIFIE' },
      orderBy: { rang: 'asc' },
    });
    expect(maillons).toHaveLength(2);
    expect(maillons[0]?.charge).toMatchObject({ avant: 'FA', apres: 'CA' });
    expect(maillons[1]?.charge).toMatchObject({
      parametre: 'COMPTABILITE',
      avant: { comptes: { compteClients: '411000' } },
      apres: { comptes: { compteClients: '411999' } },
    });
    await expect(verifierChaineCaisse(audio, centreA())).resolves.toMatchObject({ valide: true });
  });
});

describe('archivage', () => {
  /** Novembre entièrement clôturé, décembre commencé. */
  async function moisClos() {
    const factureId = await vente();
    await encaisserFacture(audio, factureId, paiement('CB', '6,00'));
    regler('2026-12-02T09:00:00+01:00');
    await lancerClotures(admin, centreA());
    await expect(archiverCentre(depsCaisse(admin), documents(), centreA())).resolves.toBe(1);
    return prisma().archiveCaisse.findFirstOrThrow();
  }

  it('écrit une archive lisible, chaînée, signée, avec sa notice, sans NIR', async () => {
    const archive = await moisClos();
    expect(await verifierArchiveEnregistree(admin, archive.id)).toEqual({
      valide: true,
      maillons: expect.any(Number) as number,
    });
    const { nom, contenu } = await telechargerArchive(admin, archive.id);
    expect(nom).toBe('archive-caisse-2026-11-01-2026-11-30.json');
    const texte = new TextDecoder().decode(contenu);
    expect(hacheur.sha256(texte)).toBe(archive.empreinteContenu);
    const lue = JSON.parse(texte) as Record<string, unknown[]>;
    expect(lue.notice).toContain('Archive de caisse');
    expect(lue.mouvements).toHaveLength(1);
    expect(lue.clotures).toHaveLength(2);
    expect(texte).not.toMatch(/\b[12]\d{14}\b/);
    const maillon = await prisma().evenementCaisse.findFirstOrThrow({
      where: { type: 'ARCHIVAGE' },
    });
    expect(maillon.charge).toMatchObject({ empreinteContenu: archive.empreinteContenu });
    await expect(verifierChaineCaisse(audio, centreA())).resolves.toMatchObject({ valide: true });
  });

  it('est idempotent', async () => {
    await moisClos();
    await expect(archiverCentre(depsCaisse(admin), documents(), centreA())).resolves.toBe(0);
    expect(await prisma().archiveCaisse.count()).toBe(1);
  });

  it('détecte un fichier remplacé dans le stockage', async () => {
    const archive = await moisClos();
    await documents().put(archive.cle, new TextEncoder().encode('{}'), 'application/json');
    expect(await verifierArchiveEnregistree(admin, archive.id)).toEqual({
      valide: false,
      raison: 'EMPREINTE',
    });
  });

  it('détecte une archive dont la ligne a été altérée', async () => {
    const archive = await moisClos();
    await falsifier(`UPDATE "archive_caisse" SET "signature" = 'fausse'`, 'archive_caisse');
    expect(await verifierArchiveEnregistree(admin, archive.id)).toEqual({
      valide: false,
      raison: 'SIGNATURE',
    });
    await expect(verifierChaineCaisse(audio, centreA())).resolves.toMatchObject({
      valide: false,
      raison: 'SIGNATURE',
    });
  });

  it('chiffre l’archive au repos', async () => {
    const archive = await moisClos();
    const brut = new TextDecoder().decode(await stockageBrut().get(archive.cle));
    expect(brut).not.toContain('Archive de caisse');
  });

  it('réserve les archives à la gestion du centre', async () => {
    const archive = await moisClos();
    await expect(telechargerArchive(audio, archive.id)).rejects.toBeInstanceOf(AccesRefuseError);
  });
});

describe('export comptable', () => {
  async function lire(flux: AsyncGenerator<string>): Promise<string> {
    let texte = '';
    for await (const ligne of flux) {
      texte += ligne;
    }
    return texte;
  }

  it('produit des écritures équilibrées, au format du profil', async () => {
    const factureId = await vente();
    await encaisserFacture(audio, factureId, paiement('CB', '6,00'));
    const texte = await lire(
      await exporterEcritures(admin, centreA(), { debut: '2026-11-01', fin: '2026-11-30' }),
    );
    const lignes = texte.trim().split('\n');
    expect(lignes[0]).toBe('JournalCode;EcritureDate;CompteNum;PieceRef;EcritureLib;Debit;Credit');
    expect(lignes).toContain('CA;02/11/2026;511200;E-2;Encaissement, Carte bancaire;6,00;0,00');
    const montants = lignes.slice(1).map((l) => l.split(';'));
    const somme = (i: number) =>
      montants.reduce((t, c) => t + Number((c[i] ?? '0').replace(',', '.')), 0);
    expect(somme(5)).toBeCloseTo(somme(6));
  });

  it('produit le FEC de l’exercice, par SIREN, avec sa description', async () => {
    const factureId = await vente();
    await encaisserFacture(audio, factureId, paiement('CB', '6,00'));
    const { siret } = await prisma().centre.findUniqueOrThrow({ where: { id: centreA() } });
    const siren = sirenDepuisSiret(siret);
    const fec = await produireFec(admin, centreA(), { date: '2026-11-15' });
    expect(fec.nom).toBe(`${String(siren)}FEC20261231`);
    const [entete, premiere] = fec.contenu.split('\n');
    expect(entete?.split('\t')).toHaveLength(18);
    expect(premiere?.split('\t')).toHaveLength(18);
    expect(fec.description).toContain('Ce fichier ne');
  });

  it('refuse un FEC sans SIRET, et l’export au guichet', async () => {
    await expect(
      exporterEcritures(audio, centreA(), { debut: '2026-11-01', fin: '2026-11-30' }),
    ).rejects.toBeInstanceOf(AccesRefuseError);
    await expect(produireFec(admin, d.centres.b.id, { date: '2026-11-15' })).rejects.toThrow(
      /SIRET/,
    );
  });

  it('refuse une période à l’envers', async () => {
    await expect(
      exporterEcritures(admin, centreA(), { debut: '2026-12-01', fin: '2026-11-01' }),
    ).rejects.toBeInstanceOf(ErreurSaisie);
  });
});

describe('modes de paiement', () => {
  it.each(MODES_PAIEMENT.filter((m) => m !== 'FINANCEMENT' && m !== 'ESPECES'))(
    '%s se vérifie en chaîne',
    async (mode) => {
      await encaisserFacture(audio, await vente(), paiement(mode, '6,00'));
      await expect(verifierChaineCaisse(audio, centreA())).resolves.toMatchObject({ valide: true });
    },
  );
});
