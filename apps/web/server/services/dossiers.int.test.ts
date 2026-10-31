import { prisma } from '@ha/db/admin';
import type { FakeDocumentStore } from '@ha/adapters';
import { ajouterJours, decomposerDate, type StatutDossier } from '@ha/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { creerJeuDeDonnees, viderBase, type JeuDeDonnees } from '@/test/donnees';

import { AccesRefuseError, type UtilisateurConnecte } from '../auth/acces';
import { withAudit } from '../audit/journal';
import { clientTransactions } from '../chiffrement';
import { documents, stockageBrut } from '../documents';
import { ErreurSaisie } from '../erreurs';
import {
  abandonnerDossier,
  appliquerTransition,
  creerDossier,
  donneesCreationDossier,
  enregistrerPrescription,
  ErreurConflitDossier,
  ErreurPrescriptionBloquee,
  listerDossiersDuPatient,
  lireScan,
  obtenirDossier,
} from './dossiers';
import { aujourdhui, fusionnerPatients, obtenirPatient } from './patients';

const SCAN = Buffer.from('%PDF-1.7 ordonnance fictive', 'utf8');
const MOTIF = 'Accord de la caisse pour une aide hors d’usage';

let d: JeuDeDonnees;
let admin: UtilisateurConnecte;
let audio: UtilisateurConnecte;
let assistantA: UtilisateurConnecte;
let assistantB: UtilisateurConnecte;
let patientA: string;
let prescripteurId: string;

const stockage = () => stockageBrut() as FakeDocumentStore;

async function creerPatient(centreId: string, nom: string, dateNaissance = '1950-03-15') {
  const patient = await prisma().patient.create({
    data: {
      organisationId: d.organisation.id,
      centreId,
      civilite: 'MME',
      nomNaissance: nom,
      prenoms: 'Test',
      dateNaissance: new Date(`${dateNaissance}T00:00:00.000Z`),
      sexe: 'MASCULIN',
      nomNaissanceRecherche: nom.toUpperCase(),
      prenomsRecherche: 'TEST',
    },
  });
  return patient.id;
}

function delivrance(patientId: string, oreille: 'DROITE' | 'GAUCHE', dateDelivrance: string) {
  return prisma().delivrance.create({
    data: {
      organisationId: d.organisation.id,
      patientId,
      oreille,
      dateDelivrance: new Date(`${dateDelivrance}T00:00:00.000Z`),
      origine: 'REPRISE',
    },
  });
}

function saisieDossier(surcharge: Record<string, unknown> = {}) {
  return {
    centreId: d.centres.a.id,
    praticienId: d.praticiens.praticienAB.id,
    oreilles: 'DROITE',
    typeDroite: 'RENOUVELLEMENT',
    typeGauche: '',
    surdicecite: false,
    ...surcharge,
  };
}

function saisiePrescription(surcharge: Record<string, unknown> = {}) {
  return {
    prescripteurId,
    datePrescription: '2026-01-15',
    oreilles: 'LES_DEUX',
    mentionRenouvellement: true,
    statutAttendu: 'BROUILLON',
    forcer: false,
    motifForcage: '',
    ...surcharge,
  };
}

/** `ajouterMois` n'accepte que des durées positives : date recomposée, jour borné à 28. */
function moisAvant(date: string, mois: number): string {
  const [annee, moisDate, jour] = decomposerDate(date);
  const total = annee * 12 + moisDate - 1 - mois;
  const mm = String((total % 12) + 1).padStart(2, '0');
  const jj = String(Math.min(jour, 28)).padStart(2, '0');
  return `${String(Math.floor(total / 12))}-${mm}-${jj}`;
}

const ilYa = (mois: number) => moisAvant(aujourdhui(), mois);

function lignesAudit(entiteType: string, action?: 'READ' | 'CREATE' | 'UPDATE') {
  return prisma().journalAudit.findMany({
    where: { entiteType, ...(action ? { action } : {}) },
    orderBy: { horodatage: 'asc' },
  });
}

function forcerStatut(dossierId: string, statut: StatutDossier) {
  return prisma().dossier.update({ where: { id: dossierId }, data: { statut } });
}

beforeEach(async () => {
  await viderBase();
  stockage().objets.clear();
  d = await creerJeuDeDonnees();
  admin = d.acteurs.admin;
  audio = d.acteurs.audioAB;
  assistantA = d.acteurs.assistantA;
  assistantB = d.acteurs.assistantB;
  patientA = await creerPatient(d.centres.a.id, 'Alpha');
  const prescripteur = await prisma().prescripteur.create({
    data: {
      organisationId: d.organisation.id,
      nom: 'Orl',
      prenom: 'Test',
      rpps: '10000000001',
      specialite: 'ORL',
      nomRecherche: 'ORL',
      prenomRecherche: 'TEST',
    },
  });
  prescripteurId = prescripteur.id;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('creerDossier', () => {
  it('ouvre un dossier en brouillon, tracé dans l’historique et le journal', async () => {
    const id = await creerDossier(assistantA, patientA, saisieDossier());
    const dossier = await prisma().dossier.findUniqueOrThrow({ where: { id } });
    expect(dossier).toMatchObject({
      statut: 'BROUILLON',
      oreilles: 'DROITE',
      typeDroite: 'RENOUVELLEMENT',
      typeGauche: null,
    });
    expect(await prisma().transitionDossier.findMany({ where: { dossierId: id } })).toMatchObject([
      { statutAvant: null, statutApres: 'BROUILLON', utilisateurId: assistantA.id },
    ]);
    expect(await lignesAudit('DOSSIER', 'CREATE')).toMatchObject([
      { entiteId: id, patientId: patientA, centreId: d.centres.a.id },
    ]);
  });

  it('accepte un type différent pour chaque oreille', async () => {
    const id = await creerDossier(
      audio,
      patientA,
      saisieDossier({ oreilles: 'LES_DEUX', typeGauche: 'PRIMO' }),
    );
    const detail = await obtenirDossier(audio, id);
    expect(detail).toMatchObject({ typeDroite: 'RENOUVELLEMENT', typeGauche: 'PRIMO' });
  });

  it('chiffre la surdicécité en base', async () => {
    const id = await creerDossier(audio, patientA, saisieDossier({ surdicecite: true }));
    const [{ surdicecite } = { surdicecite: '' }] = await prisma().$queryRaw<
      { surdicecite: string }[]
    >`SELECT surdicecite FROM dossier WHERE id = ${id}`;
    expect(surdicecite).toMatch(/^v1\./);
    expect((await obtenirDossier(audio, id)).surdicecite).toBe(true);
  });

  it('exige le type de chaque oreille concernée', async () => {
    await expect(
      creerDossier(audio, patientA, saisieDossier({ oreilles: 'LES_DEUX' })),
    ).rejects.toMatchObject({ erreurs: { typeGauche: ['Choisir le type.'] } });
  });

  it('refuse un patient ou un centre hors des droits', async () => {
    const patientB = await creerPatient(d.centres.b.id, 'Beta');
    await expect(creerDossier(assistantA, patientB, saisieDossier())).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
    await expect(
      creerDossier(assistantA, patientA, saisieDossier({ centreId: d.centres.b.id })),
    ).rejects.toBeInstanceOf(AccesRefuseError);
  });

  it('refuse une fiche fusionnée, un centre fermé et un audioprothésiste d’un autre centre', async () => {
    const doublon = await creerPatient(d.centres.a.id, 'Doublon');
    await prisma().patient.update({ where: { id: doublon }, data: { fusionneDansId: patientA } });
    await expect(creerDossier(admin, doublon, saisieDossier())).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
    await expect(
      creerDossier(admin, patientA, saisieDossier({ centreId: d.centres.ferme.id })),
    ).rejects.toMatchObject({ erreurs: { centreId: ['Centre inconnu ou fermé.'] } });
    await expect(
      creerDossier(admin, patientA, saisieDossier({ praticienId: d.praticiens.praticienC.id })),
    ).rejects.toMatchObject({
      erreurs: { praticienId: ['Cet audioprothésiste n’exerce pas dans ce centre.'] },
    });
  });

  it('propose les centres accessibles et leurs audioprothésistes', async () => {
    const { fiche } = (await obtenirPatient(audio, patientA)) as Extract<
      Awaited<ReturnType<typeof obtenirPatient>>,
      { type: 'fiche' }
    >;
    const donnees = await donneesCreationDossier(audio, fiche);
    expect(donnees.centres.map((c) => c.nom)).toEqual(['Centre A', 'Centre B']);
    expect(donnees.centres[0]?.praticiens).toEqual([
      { id: d.praticiens.praticienAB.id, nom: 'Audioab Test' },
    ]);
    expect(donnees).toMatchObject({
      centreParDefaut: d.centres.a.id,
      praticienParDefaut: d.praticiens.praticienAB.id,
    });
    const autre = await donneesCreationDossier(assistantB, fiche);
    expect(autre).toMatchObject({ centreParDefaut: null, praticienParDefaut: null });
  });
});

describe('enregistrerPrescription', () => {
  let dossierId: string;

  beforeEach(async () => {
    dossierId = await creerDossier(assistantA, patientA, saisieDossier());
  });

  it('passe le dossier en PRESCRIPTION_OK et chiffre le scan au stockage', async () => {
    await enregistrerPrescription(assistantA, dossierId, saisiePrescription(), SCAN);

    const detail = await obtenirDossier(assistantA, dossierId);
    expect(detail.statut).toBe('PRESCRIPTION_OK');
    expect(detail.passages.map((p) => p.statut)).toEqual(['BROUILLON', 'PRESCRIPTION_OK']);
    expect(detail.prescriptions).toMatchObject([
      { prescripteur: 'Test Orl', mentionRenouvellement: true, scanTaille: SCAN.length },
    ]);

    const [objet] = [...stockage().objets.values()];
    expect(stockage().objets.size).toBe(1);
    expect(Buffer.from(objet ?? []).includes(SCAN)).toBe(false);
    expect(await lignesAudit('PRESCRIPTION', 'CREATE')).toMatchObject([
      { patientId: patientA, details: { forcage: false, codesForces: [] } },
    ]);
    expect(await lignesAudit('DOSSIER', 'UPDATE')).toMatchObject([
      { details: { statutAvant: 'BROUILLON', statutApres: 'PRESCRIPTION_OK' } },
    ]);
  });

  it('refuse un renouvellement à moins de 4 ans sur la même oreille, sans rien écrire', async () => {
    await delivrance(patientA, 'DROITE', ilYa(24));

    const erreur = await enregistrerPrescription(
      assistantA,
      dossierId,
      saisiePrescription(),
      SCAN,
    ).catch((e: unknown) => e);

    expect(erreur).toBeInstanceOf(ErreurPrescriptionBloquee);
    expect(erreur).toMatchObject({
      forcable: false,
      controle: {
        erreurs: [{ code: 'RENOUVELLEMENT_AVANT_DELAI', oreille: 'DROITE' }],
        refusRenouvellement: [{ oreille: 'DROITE' }],
      },
    });
    expect(stockage().objets.size).toBe(0);
    expect(await prisma().prescription.count()).toBe(0);
    expect(await prisma().dossier.findUniqueOrThrow({ where: { id: dossierId } })).toMatchObject({
      statut: 'BROUILLON',
    });
    expect(await lignesAudit('PRESCRIPTION')).toEqual([]);
  });

  it('accepte le renouvellement sur l’autre oreille', async () => {
    await delivrance(patientA, 'DROITE', ilYa(24));
    const gauche = await creerDossier(
      assistantA,
      patientA,
      saisieDossier({ oreilles: 'GAUCHE', typeDroite: '', typeGauche: 'RENOUVELLEMENT' }),
    );

    await enregistrerPrescription(assistantA, gauche, saisiePrescription(), SCAN);

    expect((await obtenirDossier(assistantA, gauche)).statut).toBe('PRESCRIPTION_OK');
  });

  it('accepte une délivrance de plus de 4 ans', async () => {
    await delivrance(patientA, 'DROITE', ilYa(49));
    await enregistrerPrescription(assistantA, dossierId, saisiePrescription(), SCAN);
    expect((await obtenirDossier(assistantA, dossierId)).statut).toBe('PRESCRIPTION_OK');
  });

  it('accepte si les 4 ans sont atteints à la première délivrance possible', async () => {
    await delivrance(patientA, 'DROITE', moisAvant(ajouterJours(aujourdhui(), 20), 48));
    await enregistrerPrescription(assistantA, dossierId, saisiePrescription(), SCAN);
    expect((await obtenirDossier(assistantA, dossierId)).statut).toBe('PRESCRIPTION_OK');
  });

  it('tient compte des délivrances d’un autre centre', async () => {
    const autreCentre = await creerPatient(d.centres.b.id, 'Gamma');
    await delivrance(autreCentre, 'DROITE', ilYa(24));
    const dossier = await creerDossier(audio, autreCentre, saisieDossier());
    await expect(
      enregistrerPrescription(audio, dossier, saisiePrescription(), SCAN),
    ).rejects.toBeInstanceOf(ErreurPrescriptionBloquee);
  });

  it('un ADMIN_CLIENT force avec un motif, chiffré et absent du journal', async () => {
    await delivrance(patientA, 'DROITE', ilYa(24));
    const blocage = await enregistrerPrescription(
      admin,
      dossierId,
      saisiePrescription(),
      SCAN,
    ).catch((e: unknown) => e);
    expect(blocage).toMatchObject({ forcable: true });

    await enregistrerPrescription(
      admin,
      dossierId,
      saisiePrescription({ forcer: true, motifForcage: MOTIF }),
      SCAN,
    );

    const detail = await obtenirDossier(admin, dossierId);
    expect(detail.statut).toBe('PRESCRIPTION_OK');
    expect(detail.prescriptions[0]).toMatchObject({
      forceePar: 'Admin Test',
      motifForcage: MOTIF,
      controles: { erreursForcees: [{ code: 'RENOUVELLEMENT_AVANT_DELAI', oreille: 'DROITE' }] },
    });

    const [ligne] = await prisma().$queryRaw<{ motif_forcage: string }[]>`
      SELECT motif_forcage FROM prescription`;
    expect(ligne?.motif_forcage).toMatch(/^v1\./);

    const journal = await lignesAudit('PRESCRIPTION', 'CREATE');
    expect(journal).toMatchObject([
      {
        utilisateurId: admin.id,
        details: { forcage: true, codesForces: ['RENOUVELLEMENT_AVANT_DELAI'] },
      },
    ]);
    expect(JSON.stringify(await prisma().journalAudit.findMany())).not.toContain('caisse');
  });

  it('exige un motif pour forcer et conserve le blocage', async () => {
    await delivrance(patientA, 'DROITE', ilYa(24));
    const erreur = await enregistrerPrescription(
      admin,
      dossierId,
      saisiePrescription({ forcer: true, motifForcage: '   ' }),
      SCAN,
    ).catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(ErreurPrescriptionBloquee);
    expect(erreur).toMatchObject({
      erreurs: { motifForcage: ['Le motif est obligatoire pour forcer.'] },
    });
    expect(stockage().objets.size).toBe(0);
  });

  it.each(['audio', 'assistant'] as const)('refuse le forçage par : %s', async (qui) => {
    await delivrance(patientA, 'DROITE', ilYa(24));
    await expect(
      enregistrerPrescription(
        qui === 'audio' ? audio : assistantA,
        dossierId,
        saisiePrescription({ forcer: true, motifForcage: MOTIF }),
        SCAN,
      ),
    ).rejects.toBeInstanceOf(AccesRefuseError);
    expect(await prisma().prescription.count()).toBe(0);
  });

  it('ignore un forçage sans objet', async () => {
    await enregistrerPrescription(
      admin,
      dossierId,
      saisiePrescription({ forcer: true, motifForcage: MOTIF }),
      SCAN,
    );
    const [prescription] = (await obtenirDossier(admin, dossierId)).prescriptions;
    expect(prescription).toMatchObject({ forceePar: null, motifForcage: null });
  });

  it('refuse une oreille non prescrite, erreur que l’ADMIN_CLIENT peut forcer', async () => {
    await expect(
      enregistrerPrescription(
        assistantA,
        dossierId,
        saisiePrescription({ oreilles: 'GAUCHE' }),
        SCAN,
      ),
    ).rejects.toMatchObject({
      controle: { erreurs: [{ code: 'OREILLE_NON_PRESCRITE', oreille: 'DROITE' }] },
    });
  });

  it('conserve les avertissements sans bloquer', async () => {
    const generaliste = await prisma().prescripteur.create({
      data: {
        organisationId: d.organisation.id,
        nom: 'Generaliste',
        prenom: 'Test',
        specialite: 'MEDECIN_GENERALISTE',
        formationOtologie: false,
        nomRecherche: 'GENERALISTE',
        prenomRecherche: 'TEST',
      },
    });
    const primo = await creerDossier(assistantA, patientA, saisieDossier({ typeDroite: 'PRIMO' }));
    await enregistrerPrescription(
      assistantA,
      primo,
      saisiePrescription({ prescripteurId: generaliste.id }),
      SCAN,
    );
    const detail = await obtenirDossier(assistantA, primo);
    expect(detail.statut).toBe('PRESCRIPTION_OK');
    expect(detail.prescriptions[0]?.controles.avertissements).toEqual([
      { code: 'RPPS_PRESCRIPTEUR_MANQUANT', oreille: null },
      { code: 'PRESCRIPTEUR_NON_CONFORME', oreille: 'DROITE' },
    ]);
  });

  it.each([
    {
      cas: 'date future, même pour un ADMIN_CLIENT',
      saisie: { datePrescription: '2099-01-01', forcer: true, motifForcage: MOTIF },
      contenu: SCAN,
      champ: 'datePrescription',
    },
    { cas: 'scan absent', saisie: {}, contenu: Buffer.alloc(0), champ: 'scan' },
    {
      cas: 'scan d’un type refusé',
      saisie: {},
      contenu: Buffer.from('<html></html>'),
      champ: 'scan',
    },
  ])('refuse : $cas', async ({ saisie, contenu, champ }) => {
    const erreur = await enregistrerPrescription(
      admin,
      dossierId,
      saisiePrescription(saisie),
      contenu,
    ).catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(ErreurSaisie);
    expect(erreur).not.toBeInstanceOf(ErreurPrescriptionBloquee);
    expect((erreur as ErreurSaisie).erreurs).toHaveProperty(champ);
    expect(stockage().objets.size).toBe(0);
  });

  it('refuse un prescripteur désactivé', async () => {
    await prisma().prescripteur.update({
      where: { id: prescripteurId },
      data: { actif: false },
    });
    await expect(
      enregistrerPrescription(assistantA, dossierId, saisiePrescription(), SCAN),
    ).rejects.toMatchObject({ erreurs: { prescripteurId: expect.anything() as unknown } });
  });

  it('une correction ajoute une version et garde l’ancienne avec son scan', async () => {
    await enregistrerPrescription(assistantA, dossierId, saisiePrescription(), SCAN);
    await enregistrerPrescription(
      assistantA,
      dossierId,
      saisiePrescription({ statutAttendu: 'PRESCRIPTION_OK', mentionRenouvellement: false }),
      SCAN,
    );

    const detail = await obtenirDossier(assistantA, dossierId);
    expect(detail.prescriptions.map((p) => p.mentionRenouvellement)).toEqual([false, true]);
    expect(detail.passages).toHaveLength(2);
    expect(stockage().objets.size).toBe(2);
    expect(await lignesAudit('DOSSIER', 'UPDATE')).toHaveLength(1);
  });

  it('fige la prescription dès l’émission du devis', async () => {
    await enregistrerPrescription(assistantA, dossierId, saisiePrescription(), SCAN);
    await forcerStatut(dossierId, 'DEVIS_EMIS');
    await expect(
      enregistrerPrescription(
        assistantA,
        dossierId,
        saisiePrescription({ statutAttendu: 'DEVIS_EMIS' }),
        SCAN,
      ),
    ).rejects.toThrow('La prescription ne se modifie plus après l’émission du devis.');
    expect((await obtenirDossier(assistantA, dossierId)).prescriptionModifiable).toBe(false);
  });

  it('refuse une page périmée', async () => {
    await enregistrerPrescription(assistantA, dossierId, saisiePrescription(), SCAN);
    await expect(
      enregistrerPrescription(assistantA, dossierId, saisiePrescription(), SCAN),
    ).rejects.toBeInstanceOf(ErreurConflitDossier);
  });

  it('deux enregistrements simultanés : un gagnant, et aucun scan orphelin', async () => {
    const resultats = await Promise.allSettled([
      enregistrerPrescription(assistantA, dossierId, saisiePrescription(), SCAN),
      enregistrerPrescription(assistantA, dossierId, saisiePrescription(), SCAN),
    ]);
    const rejets = resultats.filter((r) => r.status === 'rejected');
    expect(rejets).toHaveLength(1);
    expect(rejets[0]?.reason).toBeInstanceOf(ErreurConflitDossier);
    expect(await prisma().prescription.count()).toBe(1);
    expect(stockage().objets.size).toBe(1);
  });

  it('retire le scan déposé si la transaction échoue', async () => {
    vi.spyOn(clientTransactions(), '$transaction').mockRejectedValueOnce(new Error('panne'));
    await expect(
      enregistrerPrescription(assistantA, dossierId, saisiePrescription(), SCAN),
    ).rejects.toThrow('panne');
    expect(stockage().objets.size).toBe(0);
  });

  it('n’écrit rien si le dépôt du scan échoue', async () => {
    vi.spyOn(stockageBrut(), 'put').mockRejectedValueOnce(new Error('stockage indisponible'));
    await expect(
      enregistrerPrescription(assistantA, dossierId, saisiePrescription(), SCAN),
    ).rejects.toThrow('stockage indisponible');
    expect(await prisma().prescription.count()).toBe(0);
  });

  it('cloisonne le dossier par centre', async () => {
    await expect(
      enregistrerPrescription(assistantB, dossierId, saisiePrescription(), SCAN),
    ).rejects.toBeInstanceOf(AccesRefuseError);
  });

  it('les prescriptions sont en ajout seul', async () => {
    await enregistrerPrescription(assistantA, dossierId, saisiePrescription(), SCAN);
    await expect(
      prisma().$executeRaw`UPDATE prescription SET mention_renouvellement = false`,
    ).rejects.toThrow();
    await expect(prisma().$executeRaw`DELETE FROM prescription`).rejects.toThrow();
  });
});

describe('lireScan', () => {
  it('rend le document, avec une ligne READ et un nom neutre', async () => {
    const id = await creerDossier(assistantA, patientA, saisieDossier());
    await enregistrerPrescription(assistantA, id, saisiePrescription(), SCAN);
    const [prescription] = (await obtenirDossier(assistantA, id)).prescriptions;
    const prescriptionId = prescription?.id ?? '';

    const scan = await lireScan(assistantA, id, prescriptionId);

    expect(Buffer.from(scan.contenu)).toEqual(SCAN);
    expect(scan).toMatchObject({ type: 'application/pdf', nomFichier: 'ordonnance.pdf' });
    expect(await lignesAudit('PRESCRIPTION', 'READ')).toMatchObject([
      { entiteId: prescriptionId, patientId: patientA, details: { document: 'SCAN_ORDONNANCE' } },
    ]);
    await expect(lireScan(assistantB, id, prescriptionId)).rejects.toBeInstanceOf(AccesRefuseError);
  });

  it('refuse une prescription d’un autre dossier', async () => {
    const [un, deux] = [
      await creerDossier(assistantA, patientA, saisieDossier()),
      await creerDossier(assistantA, patientA, saisieDossier()),
    ];
    await enregistrerPrescription(assistantA, un, saisiePrescription(), SCAN);
    const [prescription] = (await obtenirDossier(assistantA, un)).prescriptions;
    await expect(lireScan(assistantA, deux, prescription?.id ?? '')).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
  });

  it('documents() relit ce qui a été déposé', async () => {
    await documents().put('tests/a', SCAN, 'application/pdf');
    expect(Buffer.from(await documents().get('tests/a'))).toEqual(SCAN);
  });
});

describe('appliquerTransition', () => {
  it.each([
    { de: 'BROUILLON', vers: 'DEVIS_EMIS' },
    { de: 'PRESCRIPTION_OK', vers: 'EN_ESSAI' },
    { de: 'CLOS', vers: 'BROUILLON' },
  ] as const)('refuse le saut $de → $vers', async ({ de, vers }) => {
    const id = await creerDossier(audio, patientA, saisieDossier());
    await forcerStatut(id, de);
    await expect(
      withAudit(audio, (tx) => appliquerTransition(tx, audio, { id, statut: de }, vers), {
        action: 'UPDATE',
        entiteType: 'DOSSIER',
        entiteId: id,
      }),
    ).rejects.toThrow('Ce changement de statut n’est pas autorisé.');
    expect(await prisma().dossier.findUniqueOrThrow({ where: { id } })).toMatchObject({
      statut: de,
    });
  });

  it('avance d’une étape et refuse un statut lu périmé', async () => {
    const id = await creerDossier(audio, patientA, saisieDossier());
    const passer = (statut: StatutDossier, vers: StatutDossier) =>
      withAudit(audio, (tx) => appliquerTransition(tx, audio, { id, statut }, vers), {
        action: 'UPDATE',
        entiteType: 'DOSSIER',
        entiteId: id,
      });

    await passer('BROUILLON', 'PRESCRIPTION_OK');
    await expect(passer('BROUILLON', 'PRESCRIPTION_OK')).rejects.toBeInstanceOf(
      ErreurConflitDossier,
    );
    expect(await prisma().transitionDossier.count({ where: { dossierId: id } })).toBe(2);
  });

  it('l’historique est en ajout seul', async () => {
    await creerDossier(audio, patientA, saisieDossier());
    await expect(prisma().$executeRaw`DELETE FROM transition_dossier`).rejects.toThrow();
  });
});

describe('abandonnerDossier', () => {
  const ABANDON = { statutAttendu: 'BROUILLON', motif: 'Patient parti sans suite' };

  it('abandonne avec un motif chiffré, absent du journal', async () => {
    const id = await creerDossier(audio, patientA, saisieDossier());
    expect(await abandonnerDossier(audio, id, ABANDON)).toBe(patientA);

    const detail = await obtenirDossier(audio, id);
    expect(detail).toMatchObject({
      statut: 'ABANDONNE',
      abandonnable: false,
      prescriptionModifiable: false,
    });
    expect(detail.passages.at(-1)?.motif).toBe(ABANDON.motif);
    const [ligne] = await prisma().$queryRaw<{ motif: string }[]>`
      SELECT motif FROM transition_dossier WHERE statut_apres = 'ABANDONNE'`;
    expect(ligne?.motif).toMatch(/^v1\./);
    expect(JSON.stringify(await prisma().journalAudit.findMany())).not.toContain('sans suite');
  });

  it('refuse l’assistant, un dossier d’un autre centre et un dossier trop avancé', async () => {
    const id = await creerDossier(audio, patientA, saisieDossier());
    await expect(abandonnerDossier(assistantA, id, ABANDON)).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
    await forcerStatut(id, 'A_FACTURER');
    await expect(
      abandonnerDossier(audio, id, { ...ABANDON, statutAttendu: 'A_FACTURER' }),
    ).rejects.toThrow('Ce changement de statut n’est pas autorisé.');
    await expect(abandonnerDossier(audio, id, ABANDON)).rejects.toBeInstanceOf(
      ErreurConflitDossier,
    );
  });
});

describe('lecture', () => {
  it('ouvrir un dossier écrit une ligne READ, cloisonnée par centre', async () => {
    const id = await creerDossier(assistantA, patientA, saisieDossier());
    await obtenirDossier(assistantA, id);
    expect(await lignesAudit('DOSSIER', 'READ')).toMatchObject([
      { entiteId: id, patientId: patientA, utilisateurId: assistantA.id },
    ]);
    await expect(obtenirDossier(assistantB, id)).rejects.toBeInstanceOf(AccesRefuseError);
  });

  it('ouvre un dossier dont la fiche est rattachée à un autre centre', async () => {
    const id = await creerDossier(admin, patientA, saisieDossier({ centreId: d.centres.b.id }));
    expect((await obtenirDossier(assistantB, id)).fiche.id).toBe(patientA);
  });

  it('liste les dossiers des centres de l’utilisateur, sans ligne READ', async () => {
    await creerDossier(admin, patientA, saisieDossier());
    await creerDossier(admin, patientA, saisieDossier({ centreId: d.centres.b.id }));

    expect(await listerDossiersDuPatient(admin, patientA)).toHaveLength(2);
    const vus = await listerDossiersDuPatient(assistantA, patientA);
    expect(vus.map((v) => v.centre)).toEqual(['Centre A']);
    expect(vus[0]).toMatchObject({ praticien: 'Audioab Test', statut: 'BROUILLON' });
    expect(await lignesAudit('DOSSIER', 'READ')).toEqual([]);
  });
});

describe('fusion de patients', () => {
  it('les dossiers et délivrances suivent la fiche conservée', async () => {
    const doublon = await creerPatient(d.centres.a.id, 'Alpha');
    const dossier = await creerDossier(audio, doublon, saisieDossier());
    await delivrance(doublon, 'GAUCHE', ilYa(12));

    await fusionnerPatients(admin, patientA, doublon, {});

    expect(await prisma().dossier.findUniqueOrThrow({ where: { id: dossier } })).toMatchObject({
      patientId: patientA,
    });
    expect(await prisma().delivrance.findFirstOrThrow()).toMatchObject({ patientId: patientA });

    const gauche = await creerDossier(
      audio,
      patientA,
      saisieDossier({ oreilles: 'GAUCHE', typeDroite: '', typeGauche: 'RENOUVELLEMENT' }),
    );
    await expect(
      enregistrerPrescription(audio, gauche, saisiePrescription(), SCAN),
    ).rejects.toBeInstanceOf(ErreurPrescriptionBloquee);
  });
});

describe('contraintes en base', () => {
  it('refuse un type d’oreille incohérent', async () => {
    const id = await creerDossier(audio, patientA, saisieDossier());
    await expect(
      prisma().dossier.update({ where: { id }, data: { typeGauche: 'PRIMO' } }),
    ).rejects.toThrow();
  });
});
