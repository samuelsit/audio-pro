import path from 'node:path';

import type { FakeDocumentStore, FakePdfRenderer } from '@ha/adapters';
import { prisma } from '@ha/db/admin';
import { ajouterJours } from '@ha/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  autreOffre,
  creerAppareil,
  creerCatalogueDevis,
  creerDossierPret,
  creerPatientDevis,
  creerRdvVu,
  offre100,
  saisieDevis,
  SCAN,
  tenirRdvEssai,
  terminerPeriodeEssai,
  vieillirEssai,
  type CatalogueDevis,
} from '@/test/devis';
import { creerJeuDeDonnees, viderBase, type JeuDeDonnees } from '@/test/donnees';

import { AccesRefuseError, type UtilisateurConnecte } from '../auth/acces';
import { base } from '../chiffrement';
import { stockageBrut } from '../documents';
import { ErreurSaisie } from '../erreurs';
import { importerLpp } from '../lpp/importer';
import { rendeurPdf } from '../pdf';
import {
  creerDevis,
  demarrerEssai,
  deposerScanDevis,
  emettreDevis,
  enregistrerSignature,
} from './devis';
import { annulerRdv, changerStatutRdv } from './agenda';
import { abandonnerDossier } from './dossiers';
import {
  appareilsProposables,
  changerAppareilEssai,
  compteRenduEssai,
  confirmerAchat,
  enregistrerCompteRendu,
  enregistrerProlongation,
  lireJustificatif,
  listerEssaisEnCours,
  obtenirEssai,
  planifierRdvEssai,
} from './essais';
import { aujourdhui } from './patients';
import { changerStatut, obtenirFicheAppareil } from './stock';

const V908 = path.join(import.meta.dirname, '../../../../fixtures/lpp/908');

let d: JeuDeDonnees;
let audio: UtilisateurConnecte;
let assistantA: UtilisateurConnecte;
let assistantB: UtilisateurConnecte;
let catalogue: CatalogueDevis;
let patientId: string;
let dossierId: string;
let devisId: string;

const stockage = () => stockageBrut() as FakeDocumentStore;
const rendu = () => rendeurPdf() as FakePdfRenderer;
const appareil = (id: string) => prisma().appareil.findUniqueOrThrow({ where: { id } });
const statutDossier = async (id = dossierId) =>
  (await prisma().dossier.findUniqueOrThrow({ where: { id } })).statut;
const centreA = () => ({ type: 'centre', centreId: d.centres.a.id }) as const;

async function devisEmisPour(dossier: string, surcharge: Record<string, unknown> = {}) {
  const id = await creerDevis(audio, dossier, saisieDevis(catalogue, surcharge));
  await emettreDevis(audio, id, { statutAttendu: 'BROUILLON' });
  return id;
}

function debutEssai(numeroSerieDroite: string, surcharge: Record<string, unknown> = {}) {
  return {
    statutAttendu: 'EMIS',
    offreEssai: 'OFFRE_100_SANTE',
    numeroSerieDroite,
    numeroSerieGauche: '',
    ...surcharge,
  };
}

async function essaiDemarre(numero = 'SN-A') {
  const id = await creerAppareil(d, catalogue.classeI, numero);
  await demarrerEssai(audio, devisId, debutEssai(numero));
  return id;
}

async function signer(offreRetenue = 'OFFRE_100_SANTE', statutAttendu = 'EMIS') {
  await deposerScanDevis(audio, devisId, { statutAttendu }, SCAN);
  await enregistrerSignature(audio, devisId, {
    statutAttendu,
    offreRetenue,
    dateSignature: aujourdhui(),
    signe: true,
  });
}

const prolongation = (surcharge: Record<string, unknown> = {}) => ({
  dateDemande: aujourdhui(),
  jours: '15',
  motif: 'Suivi ORL en cours',
  ...surcharge,
});

const changement = (numeroSerie: string, surcharge: Record<string, unknown> = {}) => ({
  statutAttendu: 'EN_ESSAI',
  oreille: 'DROITE',
  numeroSerie,
  motifRetrait: 'Larsen persistant',
  ...surcharge,
});

/** Fait échouer toute écriture dans `table` le temps de l'opération. */
async function avecPanne(table: string, operation: () => Promise<unknown>): Promise<void> {
  await prisma().$executeRawUnsafe(
    `CREATE FUNCTION panne_test() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'panne'; END; $$ LANGUAGE plpgsql`,
  );
  await prisma().$executeRawUnsafe(
    `CREATE TRIGGER panne_test BEFORE INSERT ON "${table}" FOR EACH ROW EXECUTE FUNCTION panne_test()`,
  );
  try {
    await expect(operation()).rejects.toThrow();
  } finally {
    await prisma().$executeRawUnsafe(`DROP TRIGGER panne_test ON "${table}"`);
    await prisma().$executeRawUnsafe('DROP FUNCTION panne_test');
  }
}

beforeEach(async () => {
  await viderBase();
  stockage().objets.clear();
  rendu().rendus.length = 0;
  d = await creerJeuDeDonnees();
  ({ audioAB: audio, assistantA, assistantB } = d.acteurs);
  await prisma().centre.update({
    where: { id: d.centres.a.id },
    data: {
      raisonSociale: 'Audition Démo SAS',
      siret: '00000000000000',
      rcs: 'RCS Démo 000 000 000',
      finess: '000000000',
      tvaIntracommunautaire: 'FR00000000000',
    },
  });
  await importerLpp(V908);
  catalogue = await creerCatalogueDevis(d);
  patientId = await creerPatientDevis(d);
  dossierId = await creerDossierPret(d, audio, patientId);
  devisId = await devisEmisPour(dossierId);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('cycle complet', () => {
  it('de l’essai à l’achat, sans délivrance écrite', async () => {
    const id = await essaiDemarre();

    expect(await statutDossier()).toBe('EN_ESSAI');
    expect(await appareil(id)).toMatchObject({ statut: 'EN_ESSAI', patientId });
    const pose = await prisma().mouvementAppareil.findFirstOrThrow({
      where: { appareilId: id, statutApres: 'EN_ESSAI' },
    });
    expect(pose).toMatchObject({ dossierId, patientId, statutAvant: 'EN_STOCK' });

    await tenirRdvEssai(audio, dossierId, 'POSE');
    await tenirRdvEssai(assistantA, dossierId, 'CONTROLE');
    await terminerPeriodeEssai(audio, dossierId);
    await signer();
    expect(await statutDossier()).toBe('DEVIS_SIGNE');
    expect(await appareil(id)).toMatchObject({ statut: 'EN_ESSAI', patientId });

    await confirmerAchat(audio, dossierId, { statutAttendu: 'DEVIS_SIGNE' });

    expect(await statutDossier()).toBe('A_FACTURER');
    expect(await appareil(id)).toMatchObject({ statut: 'RESERVE', patientId });
    const reservation = await prisma().mouvementAppareil.findFirstOrThrow({
      where: { appareilId: id, statutApres: 'RESERVE' },
    });
    expect(reservation).toMatchObject({ dossierId, patientId, statutAvant: 'EN_ESSAI' });
    expect(await prisma().delivrance.count({ where: { dossierId } })).toBe(0);

    const essai = await obtenirEssai(audio, dossierId);
    expect(essai).toMatchObject({ issue: 'ACHAT', dateFin: aujourdhui() });
    expect(essai?.actions).toEqual({
      planifierRdv: false,
      prolonger: false,
      changerAppareil: false,
      confirmerAchat: false,
    });
    expect((await listerEssaisEnCours(audio, centreA(), {})).lignes).toHaveLength(0);
  });

  it('démarre sur les deux oreilles, avec un appareil chacune', async () => {
    const dossier = await creerDossierPret(d, audio, await creerPatientDevis(d), 'LES_DEUX');
    const devis = await devisEmisPour(dossier, {
      offres: [
        offre100(catalogue, {
          aideGauche: { modeleId: catalogue.classeI, prixAvantRemise: '950', prix: '950' },
          amcGauche: '710,00',
        }),
      ],
    });
    const droite = await creerAppareil(d, catalogue.classeI, 'SN-D');
    const gauche = await creerAppareil(d, catalogue.classeI, 'SN-G');

    await expect(demarrerEssai(audio, devis, debutEssai('SN-D'))).rejects.toThrow(
      'Saisir le numéro de série.',
    );
    await demarrerEssai(audio, devis, debutEssai('sn-d', { numeroSerieGauche: 'SN-G' }));

    expect((await appareil(droite)).statut).toBe('EN_ESSAI');
    expect((await appareil(gauche)).statut).toBe('EN_ESSAI');
    expect((await obtenirEssai(audio, dossier))?.appareils.map((a) => a.oreille).sort()).toEqual([
      'DROITE',
      'GAUCHE',
    ]);
  });

  it('prend l’appareil de l’offre choisie et proposé par le stock du centre', async () => {
    await creerAppareil(d, catalogue.classeII, 'SN-II');
    await creerAppareil(d, catalogue.classeI, 'SN-B', d.centres.b.id);

    const proposes = await appareilsProposables(audio, dossierId);
    expect(proposes.map((a) => a.numeroSerie)).toEqual(['SN-II']);

    await demarrerEssai(audio, devisId, debutEssai('SN-II', { offreEssai: 'AUTRE_OFFRE' }));
    expect(await statutDossier()).toBe('EN_ESSAI');
  });

  it('refuse l’achat avant la signature et le rejoue en conflit', async () => {
    await essaiDemarre();
    await expect(confirmerAchat(audio, dossierId, { statutAttendu: 'EN_ESSAI' })).rejects.toThrow(
      'L’achat se confirme une fois le devis signé.',
    );
    await expect(
      confirmerAchat(audio, dossierId, { statutAttendu: 'DEVIS_SIGNE' }),
    ).rejects.toThrow(/vient d’être modifié/);
  });
});

describe('signature à l’issue de l’essai', () => {
  const saisie = () => ({
    statutAttendu: 'EMIS',
    offreRetenue: 'OFFRE_100_SANTE',
    dateSignature: aujourdhui(),
    signe: true,
  });

  it('refuse avant 30 jours et sans 2 rendez-vous', async () => {
    await essaiDemarre();
    await deposerScanDevis(audio, devisId, { statutAttendu: 'EMIS' }, SCAN);

    await expect(enregistrerSignature(audio, devisId, saisie())).rejects.toThrow(
      /issue de la période d’essai.*au moins 2 rendez-vous/,
    );
    await vieillirEssai(dossierId, 29);
    await tenirRdvEssai(audio, dossierId, 'CONTROLE');
    await tenirRdvEssai(audio, dossierId, 'CONTROLE');
    await expect(enregistrerSignature(audio, devisId, saisie())).rejects.toThrow(
      'La signature se recueille à l’issue de la période d’essai.',
    );
    await vieillirEssai(dossierId, 30);
    await enregistrerSignature(audio, devisId, saisie());
    expect(await statutDossier()).toBe('DEVIS_SIGNE');
  });

  it('juge la durée à la date de signature, pas au jour de la saisie', async () => {
    await essaiDemarre();
    await deposerScanDevis(audio, devisId, { statutAttendu: 'EMIS' }, SCAN);
    await tenirRdvEssai(audio, dossierId, 'CONTROLE');
    await tenirRdvEssai(audio, dossierId, 'CONTROLE');
    const echeance = ajouterJours(aujourdhui(), 30);

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${echeance}T12:00:00.000Z`));

    await expect(
      enregistrerSignature(audio, devisId, {
        ...saisie(),
        dateSignature: ajouterJours(echeance, -1),
      }),
    ).rejects.toThrow('La signature se recueille à l’issue de la période d’essai.');
    await enregistrerSignature(audio, devisId, { ...saisie(), dateSignature: echeance });
    expect(await statutDossier()).toBe('DEVIS_SIGNE');
  });

  it('une prolongation repousse la signature', async () => {
    await essaiDemarre();
    await terminerPeriodeEssai(audio, dossierId);
    await enregistrerProlongation(audio, dossierId, prolongation(), SCAN);
    await deposerScanDevis(audio, devisId, { statutAttendu: 'EMIS' }, SCAN);

    await expect(enregistrerSignature(audio, devisId, saisie())).rejects.toThrow(
      /issue de la période d’essai/,
    );
    await vieillirEssai(dossierId, 45);
    await enregistrerSignature(audio, devisId, saisie());
  });

  it('refuse une offre retenue qui n’est pas celle de l’appareil en essai', async () => {
    await essaiDemarre();
    await terminerPeriodeEssai(audio, dossierId);
    await deposerScanDevis(audio, devisId, { statutAttendu: 'EMIS' }, SCAN);

    await expect(
      enregistrerSignature(audio, devisId, { ...saisie(), offreRetenue: 'AUTRE_OFFRE' }),
    ).rejects.toThrow(/n’est pas celui de l’offre retenue/);
  });
});

describe('prolongation', () => {
  it('recalcule l’échéance et garde le justificatif chiffré', async () => {
    await essaiDemarre();
    const avant = await obtenirEssai(audio, dossierId);

    await enregistrerProlongation(assistantA, dossierId, prolongation({ jours: '10' }), SCAN);

    const apres = await obtenirEssai(audio, dossierId);
    expect(apres?.etat.echeance).toBe(ajouterJours(avant?.etat.echeance ?? '', 10));
    expect(apres).toMatchObject({
      prolongation: { dateDemande: aujourdhui(), jours: 10, motif: 'Suivi ORL en cours' },
      actions: { prolonger: false },
    });

    const ligne = await prisma().prolongationEssai.findFirstOrThrow();
    expect(ligne.motif).toMatch(/^v1\./);
    const brut = stockage().objets.get(ligne.justificatifCle);
    expect(Buffer.from(brut ?? []).includes('%PDF')).toBe(false);

    const document = await lireJustificatif(audio, dossierId);
    expect(Buffer.from(document.contenu).equals(SCAN)).toBe(true);
    expect(document.nomFichier).toBe('demande-prolongation.pdf');
    const lecture = await prisma().journalAudit.findFirstOrThrow({
      where: { entiteType: 'ESSAI', action: 'READ' },
    });
    expect(lecture.details).toMatchObject({ document: 'JUSTIFICATIF_PROLONGATION', dossierId });
  });

  it.each([
    { cas: 'sans fichier', saisie: {}, fichier: new Uint8Array(0), message: /demande écrite/ },
    { cas: 'fichier invalide', saisie: {}, fichier: Buffer.from('texte'), message: /PDF/ },
    { cas: 'plus de 15 jours', saisie: { jours: '16' }, fichier: SCAN, message: /erreurs/ },
    {
      cas: 'date future',
      saisie: { dateDemande: '2999-01-01' },
      fichier: SCAN,
      message: /ne peut pas être future/,
    },
  ])('refuse : $cas, sans rien déposer', async ({ saisie, fichier, message }) => {
    await essaiDemarre();
    await expect(
      enregistrerProlongation(audio, dossierId, prolongation(saisie), fichier),
    ).rejects.toThrow(message);
    expect(stockage().objets.size).toBeGreaterThan(0);
    expect([...stockage().objets.keys()].some((c) => c.startsWith('prolongations/'))).toBe(false);
  });

  it('une seule par essai', async () => {
    await essaiDemarre();
    await enregistrerProlongation(audio, dossierId, prolongation(), SCAN);
    await expect(enregistrerProlongation(audio, dossierId, prolongation(), SCAN)).rejects.toThrow(
      'Cet essai a déjà été prolongé.',
    );
  });

  it('deux demandes simultanées : une seule passe, l’objet du perdant est retiré', async () => {
    await essaiDemarre();
    const resultats = await Promise.allSettled([
      enregistrerProlongation(audio, dossierId, prolongation(), SCAN),
      enregistrerProlongation(assistantA, dossierId, prolongation(), SCAN),
    ]);
    expect(resultats.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      [...stockage().objets.keys()].filter((c) => c.startsWith('prolongations/')),
    ).toHaveLength(1);
  });

  it('si la transaction échoue, le justificatif déposé est retiré', async () => {
    await essaiDemarre();
    await avecPanne('prolongation_essai', () =>
      enregistrerProlongation(audio, dossierId, prolongation(), SCAN),
    );
    expect([...stockage().objets.keys()].some((c) => c.startsWith('prolongations/'))).toBe(false);
  });

  it('refuse sans essai en cours et le justificatif absent reste introuvable', async () => {
    await expect(enregistrerProlongation(audio, dossierId, prolongation(), SCAN)).rejects.toThrow(
      'Aucun essai n’est en cours sur ce dossier.',
    );
    await expect(lireJustificatif(audio, dossierId)).rejects.toThrow(AccesRefuseError);
    await essaiDemarre();
    await expect(lireJustificatif(audio, dossierId)).rejects.toThrow(AccesRefuseError);
  });
});

describe('rendez-vous', () => {
  it('saisit le compte rendu d’un rendez-vous vu, chiffré et hors du journal', async () => {
    await essaiDemarre();
    await tenirRdvEssai(assistantA, dossierId, 'CONTROLE', 'Acouphènes en baisse');

    expect((await obtenirEssai(audio, dossierId))?.rdvs).toMatchObject([
      { date: aujourdhui(), type: 'CONTROLE', compteRendu: 'Acouphènes en baisse' },
    ]);
    const ligne = await prisma().essaiRdv.findFirstOrThrow();
    expect(ligne.compteRendu).toMatch(/^v1\./);
    const journal = await prisma().journalAudit.findMany({ where: { entiteType: 'ESSAI' } });
    expect(JSON.stringify(journal)).not.toContain('Acouphènes');
  });

  it('planifie dans l’agenda, pour le patient et le praticien du dossier', async () => {
    await essaiDemarre();
    await creerRdvVu(dossierId, 'CONTROLE', 'PLANIFIE');
    const type = await prisma().typeRdv.findFirstOrThrow({ where: { natureEssai: 'CONTROLE' } });
    const id = await planifierRdvEssai(audio, dossierId, {
      typeRdvId: type.id,
      date: '2030-01-07',
      heure: '10:00',
      confirmerHorsDisponibilites: true,
    });
    const dossier = await prisma().dossier.findUniqueOrThrow({ where: { id: dossierId } });
    expect(await prisma().rendezVous.findUniqueOrThrow({ where: { id } })).toMatchObject({
      dossierId,
      patientId: dossier.patientId,
      praticienId: dossier.praticienId,
      centreId: dossier.centreId,
      statut: 'PLANIFIE',
      origine: 'INTERNE',
    });
    const essai = await obtenirEssai(audio, dossierId);
    expect(essai?.rdvsPlanifies).toHaveLength(2);
    expect(essai?.typesRdv.map((t) => t.id)).toContain(type.id);
  });

  it('refuse un type qui n’est pas un type d’essai', async () => {
    await essaiDemarre();
    const type = await prisma().typeRdv.create({
      data: {
        organisationId: d.organisation.id,
        nom: 'Suivi',
        dureeMinutes: 30,
        couleur: '#000000',
        requierePraticien: true,
        requiereCabine: false,
      },
    });
    await expect(
      planifierRdvEssai(audio, dossierId, {
        typeRdvId: type.id,
        date: '2030-01-07',
        heure: '10:00',
        confirmerHorsDisponibilites: true,
      }),
    ).rejects.toBeInstanceOf(ErreurSaisie);
  });

  it('un créneau planifié ne compte pas : seul le compte rendu d’un rendez-vous vu', async () => {
    await essaiDemarre();
    const planifie = await creerRdvVu(dossierId, 'POSE', 'PLANIFIE');
    await expect(
      enregistrerCompteRendu(audio, planifie, { compteRendu: 'Prématuré' }),
    ).rejects.toThrow(/comme vu/);
    expect((await obtenirEssai(audio, dossierId))?.etat.rdvRealises).toBe(0);
  });

  it.each([
    { cas: 'dans le futur', jour: '2999-01-01' },
    { cas: 'avant le début de l’essai', jour: '2000-01-03' },
  ])('refuse un rendez-vous $cas', async ({ jour }) => {
    await essaiDemarre();
    const id = await creerRdvVu(dossierId, 'CONTROLE', 'VU', jour);
    await expect(enregistrerCompteRendu(audio, id, { compteRendu: 'x' })).rejects.toThrow(
      /entre le début de l’essai et aujourd’hui/,
    );
  });

  it('refuse un second compte rendu et un rendez-vous sans dossier', async () => {
    await essaiDemarre();
    const id = await tenirRdvEssai(audio, dossierId, 'CONTROLE');
    await expect(enregistrerCompteRendu(audio, id, { compteRendu: 'Bis' })).rejects.toBeInstanceOf(
      ErreurSaisie,
    );
    const sansDossier = await prisma().rendezVous.update({
      where: { id: await creerRdvVu(dossierId, 'POSE') },
      data: { dossierId: null },
    });
    await expect(
      enregistrerCompteRendu(audio, sansDossier.id, { compteRendu: 'x' }),
    ).rejects.toBeInstanceOf(AccesRefuseError);
  });

  it('un rendez-vous avec compte rendu ne se déplace ni ne s’annule', async () => {
    await essaiDemarre();
    const id = await tenirRdvEssai(audio, dossierId, 'CONTROLE');
    const { version } = await prisma().rendezVous.findUniqueOrThrow({ where: { id } });
    await expect(annulerRdv(audio, id, version)).rejects.toBeInstanceOf(ErreurSaisie);
    await expect(changerStatutRdv(audio, id, { version, statut: 'ABSENT' })).rejects.toThrow(
      /ne change plus/,
    );
  });

  it('est en ajout seul', async () => {
    await essaiDemarre();
    await tenirRdvEssai(audio, dossierId, 'CONTROLE');
    await expect(prisma().essaiRdv.updateMany({ data: { type: 'POSE' } })).rejects.toThrow();
    await expect(prisma().essaiRdv.deleteMany()).rejects.toThrow();
  });
});

describe('changement d’appareil en cours d’essai', () => {
  it('remet l’ancien en stock, trace l’échange et l’essai continue', async () => {
    const ancien = await essaiDemarre('SN-ANCIEN');
    const nouveau = await creerAppareil(d, catalogue.classeI, 'SN-NOUVEAU');
    await vieillirEssai(dossierId, 12);
    const debut = (await obtenirEssai(audio, dossierId))?.dateDebut;

    await changerAppareilEssai(assistantA, dossierId, changement('sn-nouveau'));

    expect(await statutDossier()).toBe('EN_ESSAI');
    expect(await appareil(ancien)).toMatchObject({ statut: 'EN_STOCK', patientId: null });
    expect(await appareil(nouveau)).toMatchObject({ statut: 'EN_ESSAI', patientId });
    const essai = await obtenirEssai(audio, dossierId);
    expect(essai).toMatchObject({ dateDebut: debut, issue: null, ecartDevis: false });
    expect(essai?.etat.joursEcoules).toBe(12);
    expect(essai?.appareils).toMatchObject([
      { numeroSerie: 'SN-ANCIEN', retireLe: aujourdhui(), motifRetrait: 'Larsen persistant' },
      { numeroSerie: 'SN-NOUVEAU', retireLe: null, motifRetrait: null },
    ]);

    const retour = await prisma().mouvementAppareil.findFirstOrThrow({
      where: { appareilId: ancien, statutApres: 'EN_STOCK', statutAvant: 'EN_ESSAI' },
    });
    expect(retour).toMatchObject({ dossierId, patientId });
    expect(retour.motif).toMatch(/^v1\./);
    const lien = await prisma().essaiAppareil.findFirstOrThrow({
      where: { appareilId: ancien },
    });
    expect(lien.motifRetrait).toMatch(/^v1\./);
    const journal = await prisma().journalAudit.findMany({
      where: { action: 'UPDATE', entiteType: { in: ['ESSAI', 'APPAREIL'] } },
    });
    expect(JSON.stringify(journal)).not.toContain('Larsen');
    expect(journal.filter((l) => l.entiteType === 'APPAREIL')).toHaveLength(3);
  });

  it('l’ancien appareil peut repartir dans un autre essai', async () => {
    await essaiDemarre('SN-ANCIEN');
    await creerAppareil(d, catalogue.classeI, 'SN-NOUVEAU');
    await changerAppareilEssai(audio, dossierId, changement('SN-NOUVEAU'));

    const autre = await creerDossierPret(d, audio, await creerPatientDevis(d));
    const devis = await devisEmisPour(autre);
    await demarrerEssai(audio, devis, debutEssai('SN-ANCIEN'));
    expect(await statutDossier(autre)).toBe('EN_ESSAI');
  });

  it('un autre modèle impose une nouvelle version du devis avant la signature', async () => {
    await essaiDemarre();
    await creerAppareil(d, catalogue.classeII, 'SN-II');
    await changerAppareilEssai(audio, dossierId, changement('SN-II'));
    await terminerPeriodeEssai(audio, dossierId);

    expect((await obtenirEssai(audio, dossierId))?.ecartDevis).toBe(true);
    await expect(signer()).rejects.toThrow(/n’est pas celui de l’offre retenue/);

    // L'offre 1.2 du même devis porte déjà ce modèle : la retenir lève l'écart.
    await enregistrerSignature(audio, devisId, {
      statutAttendu: 'EMIS',
      offreRetenue: 'AUTRE_OFFRE',
      dateSignature: aujourdhui(),
      signe: true,
    });
    expect((await obtenirEssai(audio, dossierId))?.ecartDevis).toBe(false);
  });

  it.each([
    { cas: 'le même appareil', numero: 'SN-A', message: 'Cet appareil est déjà celui de l’essai.' },
    { cas: 'un numéro inconnu', numero: 'SN-INCONNU', message: 'Numéro de série inconnu.' },
  ])('refuse $cas et laisse tout en place', async ({ numero, message }) => {
    const id = await essaiDemarre();
    await expect(changerAppareilEssai(audio, dossierId, changement(numero))).rejects.toThrow(
      message,
    );
    expect(await appareil(id)).toMatchObject({ statut: 'EN_ESSAI', patientId });
    expect((await obtenirEssai(audio, dossierId))?.appareils).toMatchObject([{ retireLe: null }]);
  });

  it('refuse une oreille sans appareil et après la signature', async () => {
    await essaiDemarre();
    await creerAppareil(d, catalogue.classeI, 'SN-B');
    await expect(
      changerAppareilEssai(audio, dossierId, changement('SN-B', { oreille: 'GAUCHE' })),
    ).rejects.toThrow('Aucun appareil n’est en essai sur cette oreille.');

    await terminerPeriodeEssai(audio, dossierId);
    await signer();
    await expect(
      changerAppareilEssai(audio, dossierId, changement('SN-B', { statutAttendu: 'DEVIS_SIGNE' })),
    ).rejects.toThrow('L’appareil se change pendant l’essai, avant la signature.');
    await expect(changerAppareilEssai(audio, dossierId, changement('SN-B'))).rejects.toThrow(
      /vient d’être modifié/,
    );
  });
});

describe('refus d’un appareil', () => {
  async function autreDossierEmis() {
    const patient = await creerPatientDevis(d);
    const dossier = await creerDossierPret(d, audio, patient);
    return { patient, dossier, devis: await devisEmisPour(dossier) };
  }

  it('déjà en essai ailleurs', async () => {
    const id = await essaiDemarre();
    const { dossier, devis } = await autreDossierEmis();

    await expect(demarrerEssai(audio, devis, debutEssai('SN-A'))).rejects.toThrow(
      'Cet appareil est déjà en essai.',
    );

    expect(await statutDossier(dossier)).toBe('DEVIS_EMIS');
    expect(await prisma().essai.count({ where: { dossierId: dossier } })).toBe(0);
    expect(await appareil(id)).toMatchObject({ statut: 'EN_ESSAI', patientId });
  });

  it('deux essais simultanés sur le même appareil : un seul passe', async () => {
    const id = await creerAppareil(d, catalogue.classeI, 'SN-A');
    const { dossier, devis } = await autreDossierEmis();

    const resultats = await Promise.allSettled([
      demarrerEssai(audio, devisId, debutEssai('SN-A')),
      demarrerEssai(audio, devis, debutEssai('SN-A')),
    ]);

    expect(resultats.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma().essaiAppareil.count({ where: { appareilId: id } })).toBe(1);
    const statuts = [await statutDossier(), await statutDossier(dossier)].sort();
    expect(statuts).toEqual(['DEVIS_EMIS', 'EN_ESSAI']);
  });

  it('le double actif est aussi interdit par la base', async () => {
    const id = await essaiDemarre();
    const { id: essaiId } = await prisma().essai.findUniqueOrThrow({ where: { dossierId } });
    await expect(
      prisma().essaiAppareil.create({
        data: {
          essaiId,
          appareilId: id,
          oreille: 'GAUCHE',
          poseLe: new Date(),
          poseParId: audio.id,
        },
      }),
    ).rejects.toThrow();
  });

  it('réservé à un autre patient, accepté pour le sien', async () => {
    const id = await creerAppareil(d, catalogue.classeI, 'SN-A');
    const { patient, devis } = await autreDossierEmis();
    await changerStatut(audio, id, {
      statut: 'RESERVE',
      statutAttendu: 'EN_STOCK',
      patientId: patient,
      motif: 'Réservation',
    });

    await expect(demarrerEssai(audio, devisId, debutEssai('SN-A'))).rejects.toThrow(
      'Cet appareil est réservé à un autre patient.',
    );
    await demarrerEssai(audio, devis, debutEssai('SN-A'));
    expect(await appareil(id)).toMatchObject({ statut: 'EN_ESSAI', patientId: patient });
  });

  it.each([
    {
      cas: 'autre centre',
      preparer: () => creerAppareil(d, catalogue.classeI, 'SN-A', d.centres.b.id),
      message: 'Cet appareil n’est pas dans le stock du centre du dossier.',
    },
    {
      cas: 'autre modèle que celui du devis',
      preparer: () => creerAppareil(d, catalogue.classeII, 'SN-A'),
      message: 'Cet appareil n’est pas le modèle prévu au devis pour cette oreille.',
    },
    {
      cas: 'numéro inconnu',
      preparer: () => Promise.resolve(''),
      message: 'Numéro de série inconnu.',
    },
  ])('$cas', async ({ preparer, message }) => {
    await preparer();
    await expect(demarrerEssai(audio, devisId, debutEssai('SN-A'))).rejects.toThrow(message);
    expect(await statutDossier()).toBe('DEVIS_EMIS');
  });

  it('indisponible (SAV), et rien sans numéro', async () => {
    const id = await creerAppareil(d, catalogue.classeI, 'SN-A');
    await changerStatut(audio, id, {
      statut: 'SAV',
      statutAttendu: 'EN_STOCK',
      patientId: '',
      motif: 'Panne',
    });
    await expect(demarrerEssai(audio, devisId, debutEssai('SN-A'))).rejects.toThrow(
      'Cet appareil n’est pas disponible : il doit être en stock ou réservé.',
    );
    await expect(demarrerEssai(audio, devisId, debutEssai(''))).rejects.toThrow(
      'Saisir le numéro de série.',
    );
  });

  it('une offre sans aide pour l’oreille est refusée', async () => {
    const dossier = await creerDossierPret(d, audio, await creerPatientDevis(d), 'LES_DEUX');
    const devis = await devisEmisPour(dossier, {
      offres: [
        offre100(catalogue, {
          aideGauche: { modeleId: catalogue.classeI, prixAvantRemise: '950', prix: '950' },
          amcGauche: '710,00',
        }),
        autreOffre(catalogue),
      ],
    });
    await creerAppareil(d, catalogue.classeII, 'SN-D');
    await expect(
      demarrerEssai(
        audio,
        devis,
        debutEssai('SN-D', { offreEssai: 'AUTRE_OFFRE', numeroSerieGauche: 'SN-G' }),
      ),
    ).rejects.toThrow('Cette offre ne couvre pas cette oreille.');
  });
});

describe('alertes et écran « Essais en cours »', () => {
  const ligne = async () => (await listerEssaisEnCours(audio, centreA(), {})).lignes[0];

  it('donne les jours écoulés et l’échéance, sans alerte au début', async () => {
    await essaiDemarre();
    expect(await ligne()).toMatchObject({
      dossierId,
      patient: 'Essai Camille',
      centre: 'Centre A',
      numerosSerie: ['SN-A'],
      joursEcoules: 0,
      joursRestants: 30,
      echeance: ajouterJours(aujourdhui(), 30),
      rdvRealises: 0,
      alertes: [],
    });
  });

  it('échéance proche et moins de 2 rendez-vous', async () => {
    await essaiDemarre();
    await vieillirEssai(dossierId, 23);
    await tenirRdvEssai(audio, dossierId, 'CONTROLE');
    expect(await ligne()).toMatchObject({
      joursRestants: 7,
      rdvRealises: 1,
      alertes: ['ECHEANCE_PROCHE', 'RDV_INSUFFISANTS'],
    });
    await tenirRdvEssai(audio, dossierId, 'CONTROLE');
    expect((await ligne())?.alertes).toEqual(['ECHEANCE_PROCHE']);
  });

  it('échéance atteinte, puis dépassement', async () => {
    await essaiDemarre();
    await tenirRdvEssai(audio, dossierId, 'CONTROLE');
    await tenirRdvEssai(audio, dossierId, 'CONTROLE');
    await vieillirEssai(dossierId, 30);
    expect((await ligne())?.alertes).toEqual(['ECHEANCE_ATTEINTE']);
    await vieillirEssai(dossierId, 33);
    expect(await ligne()).toMatchObject({ joursRestants: -3, alertes: ['ECHEANCE_DEPASSEE'] });
  });

  it('la prolongation repousse l’échéance et lève le dépassement', async () => {
    await essaiDemarre();
    await tenirRdvEssai(audio, dossierId, 'CONTROLE');
    await tenirRdvEssai(audio, dossierId, 'CONTROLE');
    await vieillirEssai(dossierId, 33);
    await enregistrerProlongation(audio, dossierId, prolongation(), SCAN);
    expect(await ligne()).toMatchObject({ joursRestants: 12, alertes: [] });
  });

  it('est cloisonné par centre et n’écrit aucune lecture', async () => {
    await essaiDemarre();
    const avant = await prisma().journalAudit.count({ where: { action: 'READ' } });

    const tous = await listerEssaisEnCours(d.acteurs.admin, { type: 'tous' }, {});
    expect(tous.lignes).toHaveLength(1);
    const autreCentre = { type: 'centre', centreId: d.centres.b.id } as const;
    expect((await listerEssaisEnCours(assistantB, autreCentre, {})).lignes).toHaveLength(0);
    expect((await listerEssaisEnCours(assistantA, centreA(), {})).lignes).toHaveLength(1);
    await expect(listerEssaisEnCours(assistantB, centreA(), {})).rejects.toThrow(AccesRefuseError);

    expect(await prisma().journalAudit.count({ where: { action: 'READ' } })).toBe(avant);
  });
});

describe('abandon', () => {
  it('clôt l’essai et remet les appareils en stock, motif chiffré', async () => {
    const id = await essaiDemarre();
    await abandonnerDossier(audio, dossierId, {
      statutAttendu: 'EN_ESSAI',
      motif: 'Gêne persistante',
    });

    expect(await statutDossier()).toBe('ABANDONNE');
    expect(await appareil(id)).toMatchObject({ statut: 'EN_STOCK', patientId: null });
    const mouvement = await prisma().mouvementAppareil.findFirstOrThrow({
      where: { appareilId: id, statutApres: 'EN_STOCK', statutAvant: 'EN_ESSAI' },
    });
    expect(mouvement).toMatchObject({ dossierId, patientId });
    expect(await obtenirEssai(audio, dossierId)).toMatchObject({
      issue: 'ABANDON',
      dateFin: aujourdhui(),
      appareils: [{ retireLe: aujourdhui(), motifRetrait: null }],
    });
    const journal = await prisma().journalAudit.findMany();
    expect(JSON.stringify(journal)).not.toContain('Gêne');
    expect((await listerEssaisEnCours(audio, centreA(), {})).lignes).toHaveLength(0);
  });

  it('fonctionne aussi après la signature', async () => {
    const id = await essaiDemarre();
    await terminerPeriodeEssai(audio, dossierId);
    await signer();
    await abandonnerDossier(audio, dossierId, { statutAttendu: 'DEVIS_SIGNE', motif: 'Refus' });
    expect((await appareil(id)).statut).toBe('EN_STOCK');
  });

  it('exige un motif, reste réservé et ne touche rien sans essai', async () => {
    const id = await essaiDemarre();
    await expect(
      abandonnerDossier(audio, dossierId, { statutAttendu: 'EN_ESSAI', motif: ' ' }),
    ).rejects.toThrow(ErreurSaisie);
    await expect(
      abandonnerDossier(assistantA, dossierId, { statutAttendu: 'EN_ESSAI', motif: 'x' }),
    ).rejects.toThrow(AccesRefuseError);
    expect((await appareil(id)).statut).toBe('EN_ESSAI');

    const autre = await creerDossierPret(d, audio, await creerPatientDevis(d));
    await abandonnerDossier(audio, autre, { statutAttendu: 'PRESCRIPTION_OK', motif: 'Décès' });
    expect(await statutDossier(autre)).toBe('ABANDONNE');
  });

  it('si le journal échoue, l’appareil et l’essai restent en place', async () => {
    const id = await essaiDemarre();
    await avecPanne('journal_audit', () =>
      abandonnerDossier(audio, dossierId, { statutAttendu: 'EN_ESSAI', motif: 'x' }),
    );
    expect((await appareil(id)).statut).toBe('EN_ESSAI');
    expect(await statutDossier()).toBe('EN_ESSAI');
    expect(await obtenirEssai(audio, dossierId)).toMatchObject({ issue: null });
  });
});

describe('stock piloté par le dossier', () => {
  it('refuse l’entrée en essai depuis la fiche', async () => {
    const id = await creerAppareil(d, catalogue.classeI, 'SN-A');
    await expect(
      changerStatut(audio, id, {
        statut: 'EN_ESSAI',
        statutAttendu: 'EN_STOCK',
        patientId,
        motif: 'x',
      }),
    ).rejects.toThrow('L’essai se pilote depuis le dossier du patient.');
    expect((await obtenirFicheAppareil(audio, id)).transitions.map((t) => t.statut)).not.toContain(
      'EN_ESSAI',
    );
  });

  it('refuse tout changement manuel d’un appareil tenu par un essai', async () => {
    const id = await essaiDemarre();
    const saisie = { statutAttendu: 'EN_ESSAI', patientId: '', motif: 'x' };
    for (const statut of ['EN_STOCK', 'SAV', 'VENDU']) {
      await expect(changerStatut(audio, id, { ...saisie, statut })).rejects.toThrow(
        /suivi par un essai/,
      );
    }
    expect(await obtenirFicheAppareil(audio, id)).toMatchObject({
      statut: 'EN_ESSAI',
      transitions: [],
      dossierEssaiId: dossierId,
    });
  });

  it('un appareil réservé par l’achat reste tenu jusqu’à la vente', async () => {
    const id = await essaiDemarre();
    await terminerPeriodeEssai(audio, dossierId);
    await signer();
    await confirmerAchat(audio, dossierId, { statutAttendu: 'DEVIS_SIGNE' });

    await expect(
      changerStatut(audio, id, {
        statut: 'EN_STOCK',
        statutAttendu: 'RESERVE',
        patientId: '',
        motif: 'x',
      }),
    ).rejects.toThrow(/suivi par un essai/);
  });
});

describe('droits et cloisonnement', () => {
  it('réserve l’achat à l’ADMIN_CLIENT et à l’AUDIO', async () => {
    await essaiDemarre();
    await terminerPeriodeEssai(audio, dossierId);
    await signer();
    await expect(
      confirmerAchat(assistantA, dossierId, { statutAttendu: 'DEVIS_SIGNE' }),
    ).rejects.toThrow(AccesRefuseError);
    expect((await obtenirEssai(assistantA, dossierId))?.actions.confirmerAchat).toBe(false);
    expect((await obtenirEssai(audio, dossierId))?.actions.confirmerAchat).toBe(true);
  });

  it('refuse un utilisateur d’un autre centre', async () => {
    await essaiDemarre();
    await creerAppareil(d, catalogue.classeI, 'SN-B');
    const rdvId = await creerRdvVu(dossierId, 'CONTROLE');
    await expect(enregistrerCompteRendu(assistantB, rdvId, { compteRendu: 'x' })).rejects.toThrow(
      AccesRefuseError,
    );
    await expect(obtenirEssai(assistantB, dossierId)).rejects.toThrow(AccesRefuseError);
    await expect(compteRenduEssai(assistantB, dossierId)).rejects.toThrow(AccesRefuseError);
    await expect(appareilsProposables(assistantB, dossierId)).rejects.toThrow(AccesRefuseError);
    await expect(changerAppareilEssai(assistantB, dossierId, changement('SN-B'))).rejects.toThrow(
      AccesRefuseError,
    );
    await expect(
      enregistrerProlongation(assistantB, dossierId, prolongation(), SCAN),
    ).rejects.toThrow(AccesRefuseError);
    await expect(lireJustificatif(assistantB, dossierId)).rejects.toThrow(AccesRefuseError);
  });
});

describe('compte rendu au prescripteur', () => {
  it('rend le courrier sans NIR, sans stockage, avec une ligne PRINT', async () => {
    await essaiDemarre();
    await tenirRdvEssai(audio, dossierId, 'CONTROLE', 'Bonne adaptation <b>');
    await enregistrerProlongation(audio, dossierId, prolongation(), SCAN);
    const objets = stockage().objets.size;

    const { contenu, nomFichier } = await compteRenduEssai(assistantA, dossierId);

    expect(nomFichier).toBe('compte-rendu-essai.pdf');
    expect(Buffer.from(contenu).toString()).toContain('%PDF');
    expect(stockage().objets.size).toBe(objets);
    const html = rendu().rendus.at(-1) ?? '';
    expect(html).toContain('Compte rendu de la période d’essai');
    expect(html).toContain('Camille Essai');
    expect(html).toContain('Agathe Démo');
    expect(html).toContain('SN-A');
    expect(html).toContain('Bonne adaptation &lt;b&gt;');
    expect(html).toContain('Prolongation de 15 jours');
    expect(html).not.toContain('150037500000042');

    const impressions = await prisma().journalAudit.findMany({
      where: { entiteType: 'ESSAI', action: 'PRINT' },
    });
    expect(impressions).toHaveLength(1);
    expect(impressions[0]).toMatchObject({ patientId, centreId: d.centres.a.id });
  });

  it('refuse sans essai', async () => {
    await expect(compteRenduEssai(audio, dossierId)).rejects.toThrow(
      'Aucun essai n’est en cours sur ce dossier.',
    );
    expect(await obtenirEssai(audio, dossierId)).toBeNull();
  });
});

describe('journal', () => {
  it('trace le démarrage, chaque appareil et la conclusion, avec le patient', async () => {
    const id = await essaiDemarre();
    await terminerPeriodeEssai(audio, dossierId);
    await signer();
    await confirmerAchat(audio, dossierId, { statutAttendu: 'DEVIS_SIGNE' });

    const essai = await prisma().journalAudit.findMany({
      where: { entiteType: 'ESSAI' },
      orderBy: { horodatage: 'asc' },
    });
    expect(essai.map((l) => l.action)).toContain('CREATE');
    expect(essai.every((l) => l.patientId === patientId)).toBe(true);
    expect(essai.some((l) => (l.details as { issue?: string }).issue === 'ACHAT')).toBe(true);
    const mouvements = await prisma().journalAudit.findMany({
      where: { entiteType: 'APPAREIL', entiteId: id, action: 'UPDATE' },
    });
    expect(mouvements.map((l) => (l.details as { statutApres: string }).statutApres)).toEqual(
      expect.arrayContaining(['EN_ESSAI', 'RESERVE']),
    );
  });
});

it('chiffre aussi via le client applicatif', async () => {
  await essaiDemarre();
  await tenirRdvEssai(audio, dossierId, 'CONTROLE');
  const ligne = await base(audio).essaiRdv.findFirstOrThrow();
  expect(ligne.compteRendu).toBe('Réglages fictifs');
});
