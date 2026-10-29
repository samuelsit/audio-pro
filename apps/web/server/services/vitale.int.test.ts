import path from 'node:path';

import {
  FakeClock,
  FakeVitaleReader,
  formaterInstantParis,
  type SimulationVitale,
} from '@ha/adapters';
import {
  CODES_ERREUR_VITALE,
  type CodeErreurVitale,
  type VitaleReadResult,
  type VitaleReader,
} from '@ha/domain';
import { prisma } from '@ha/db';
import { beforeEach, describe, expect, it } from 'vitest';

import { creerJeuDeDonnees, viderBase, type JeuDeDonnees } from '@/test/donnees';

import type { UtilisateurConnecte } from '../auth/acces';
import { ErreurLectureExpiree } from '../vitale/jeton';
import { creerPatient, ErreurDoublonPossible, obtenirPatient } from './patients';
import {
  appliquerCarteAuPatient,
  creerPatientDepuisCarte,
  lectureEnCours,
  lireCarte,
  preparerComparaison,
  rechercherBeneficiaire,
} from './vitale';

const FIXTURES = path.resolve(import.meta.dirname, '../../../../fixtures/vitale');

// NIR des cartes fictives (fixtures/vitale).
const NIR_DURAND = '281045999910127';
const NIR_LEFEBVRE = '152015999920387';

let d: JeuDeDonnees;

beforeEach(async () => {
  await viderBase();
  d = await creerJeuDeDonnees();
});

const tous = { type: 'tous' } as const;
const centre = (id: string) => ({ type: 'centre', centreId: id }) as const;

/** Lecteur simulé dont l'horloge est à l'heure réelle (le jeton expire 15 min après la lecture). */
function lecteur(simulation: SimulationVitale, instant = formaterInstantParis(new Date())) {
  return new FakeVitaleReader({ dossier: FIXTURES, simulation, clock: new FakeClock(instant) });
}

const carte = (fichier: string): SimulationVitale => ({ type: 'carte', fichier });

/** « Tous les centres » pour l'ADMIN, sinon le premier centre de l'acteur. */
function perimetreDe(acteur: UtilisateurConnecte) {
  const premier = acteur.centreIds[0];
  return acteur.role === 'ADMIN' || premier === undefined ? tous : centre(premier);
}

async function jeton(acteur: UtilisateurConnecte, fichier: string): Promise<string> {
  const r = await lireCarte(acteur, perimetreDe(acteur), lecteur(carte(fichier)));
  if (!r.ok) {
    throw new Error(`lecture en échec : ${r.code}`);
  }
  return r.jeton;
}

async function rejet<E>(
  promesse: Promise<unknown>,
  classe: new (...args: never[]) => E,
): Promise<E> {
  const erreur = await promesse.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(erreur).toBeInstanceOf(classe);
  return erreur as E;
}

/** Saisie de formulaire valide (champs vides = chaînes vides). */
function saisie(centreId: string, autres: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    centreId,
    civilite: 'M',
    nomNaissance: 'Lefebvre',
    nomUsage: '',
    prenoms: 'Michel',
    dateNaissance: '1952-01-09',
    sexe: 'MASCULIN',
    adresseLigne1: '',
    adresseLigne2: '',
    codePostal: '',
    ville: '',
    telephone: '',
    email: '',
    medecinTraitant: '',
    consentementSms: false,
    consentementEmail: false,
    consentementCourrier: false,
    notes: '',
    amoNir: NIR_LEFEBVRE,
    amoRangNaissance: '1',
    amoQualite: 'ASSURE',
    amoRegime: '01',
    amoCaisse: '999',
    amoCentreGestionnaire: '9999',
    amoFinDroits: '',
    amoC2s: false,
    amoAld: false,
    amcOrganismeNom: '',
    amcOrganismeIdentifiant: '',
    amcNumeroAdherent: '',
    amcTypeContrat: '',
    amcDebutValidite: '',
    amcFinValidite: '',
    ...autres,
  };
}

/** Famille Durand : Claire (assurée) et Hugo au centre A, Léa (rang 1, autre date) au centre B. */
async function creerFamilleDurand(centreHugo = d.centres.a.id) {
  const famille = {
    amoNir: NIR_DURAND,
    nomNaissance: 'Durand',
    amoCaisse: '999',
  };
  const claire = await creerPatient(
    d.acteurs.admin,
    saisie(d.centres.a.id, {
      ...famille,
      civilite: 'MME',
      sexe: 'FEMININ',
      nomNaissance: 'Lemaire',
      nomUsage: 'Durand',
      prenoms: 'Claire',
      dateNaissance: '1981-04-12',
    }),
  );
  const hugo = await creerPatient(
    d.acteurs.admin,
    saisie(centreHugo, {
      ...famille,
      prenoms: 'Hugo',
      dateNaissance: '2012-06-20',
      amoQualite: 'AYANT_DROIT',
    }),
    { confirmerDoublon: true },
  );
  const lea = await creerPatient(
    d.acteurs.admin,
    saisie(d.centres.b.id, {
      ...famille,
      civilite: 'MME',
      sexe: 'FEMININ',
      prenoms: 'Léa',
      dateNaissance: '2015-02-08',
      amoQualite: 'AYANT_DROIT',
    }),
    { confirmerDoublon: true },
  );
  return { claire, hugo, lea };
}

describe('lireCarte : historique', () => {
  it('une lecture réussie écrit une ligne sans contenu de la carte et rend un jeton chiffré', async () => {
    const r = await lireCarte(
      d.acteurs.audioAB,
      centre(d.centres.a.id),
      lecteur(carte('famille.json')),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) {
      return;
    }
    expect(r.lecture.resultat.beneficiaires).toHaveLength(3);
    expect(r.jeton).toMatch(/^v1\./);
    expect(r.jeton).not.toContain('DURAND');

    const lignes = await prisma().lectureVitale.findMany();
    expect(lignes).toHaveLength(1);
    const ligne = lignes[0];
    expect(ligne).toMatchObject({
      id: r.lecture.lectureId,
      organisationId: d.organisation.id,
      utilisateurId: d.acteurs.audioAB.id,
      centreId: d.centres.a.id,
      resultat: 'SUCCES',
      source: 'CARTE',
      nombreBeneficiaires: 3,
    });
    const brut = JSON.stringify(ligne);
    expect(brut).not.toContain('DURAND');
    expect(brut).not.toContain(NIR_DURAND.slice(0, 13));
  });

  it.each<{ simulation: SimulationVitale; code: CodeErreurVitale }>([
    { simulation: { type: 'aucun-lecteur' }, code: 'AUCUN_LECTEUR' },
    { simulation: { type: 'lecteur-vide' }, code: 'CARTE_ABSENTE' },
    { simulation: { type: 'illisible' }, code: 'CARTE_INVALIDE' },
    { simulation: carte('carte-bloquee.json'), code: 'CARTE_BLOQUEE' },
    { simulation: { type: 'panne' }, code: 'ERREUR_TECHNIQUE' },
  ])('$code : historisé, sans jeton', async ({ simulation, code }) => {
    const r = await lireCarte(d.acteurs.admin, tous, lecteur(simulation));
    expect(r).toEqual({ ok: false, code });
    const ligne = await prisma().lectureVitale.findFirstOrThrow();
    expect(ligne).toMatchObject({
      resultat: code,
      source: null,
      nombreBeneficiaires: null,
      centreId: null,
    });
  });

  it('couvre tous les codes d’erreur du port', () => {
    expect(CODES_ERREUR_VITALE).toHaveLength(5);
  });

  it('erreur inattendue du lecteur → ERREUR_TECHNIQUE ; résultat invalide → CARTE_INVALIDE', async () => {
    const enPanne = { readCard: () => Promise.reject(new Error('port série')) };
    expect(await lireCarte(d.acteurs.admin, tous, enPanne)).toEqual({
      ok: false,
      code: 'ERREUR_TECHNIQUE',
    });
    // Adaptateur fautif : résultat hors contrat (aucun bénéficiaire), revalidé par le service.
    const invalide: VitaleReader = {
      readCard: () =>
        Promise.resolve({
          beneficiaires: [],
          source: 'CARTE',
          dateLecture: '2026-10-29T10:00:00Z',
        } as unknown as VitaleReadResult),
    };
    expect(await lireCarte(d.acteurs.admin, tous, invalide)).toEqual({
      ok: false,
      code: 'CARTE_INVALIDE',
    });
    expect(
      (await prisma().lectureVitale.findMany({ orderBy: { horodatage: 'asc' } })).map(
        (l) => l.resultat,
      ),
    ).toEqual(['ERREUR_TECHNIQUE', 'CARTE_INVALIDE']);
  });

  it('l’historique est en ajout seul', async () => {
    await lireCarte(d.acteurs.admin, tous, lecteur({ type: 'panne' }));
    await expect(prisma().lectureVitale.deleteMany()).rejects.toThrow();
  });
});

describe('jeton de lecture', () => {
  it('s’ouvre pour son auteur seulement', async () => {
    const j = await jeton(d.acteurs.audioAB, 'famille.json');
    expect(lectureEnCours(d.acteurs.audioAB, j)?.resultat.beneficiaires).toHaveLength(3);
    expect(lectureEnCours(d.acteurs.assistantA, j)).toBeNull();
    await rejet(rechercherBeneficiaire(d.acteurs.assistantA, j, 0), ErreurLectureExpiree);
  });

  it('refusé s’il est absent, altéré ou expiré', async () => {
    const j = await jeton(d.acteurs.admin, 'famille.json');
    expect(lectureEnCours(d.acteurs.admin, undefined)).toBeNull();
    await rejet(
      rechercherBeneficiaire(d.acteurs.admin, `${j.slice(0, -4)}AAAA`, 0),
      ErreurLectureExpiree,
    );

    const ilYA20Minutes = formaterInstantParis(new Date(Date.now() - 20 * 60 * 1000));
    const r = await lireCarte(d.acteurs.admin, tous, lecteur(carte('famille.json'), ilYA20Minutes));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(lectureEnCours(d.acteurs.admin, r.jeton)).toBeNull();
      await rejet(rechercherBeneficiaire(d.acteurs.admin, r.jeton, 0), ErreurLectureExpiree);
    }
  });
});

describe('rechercherBeneficiaire : choix du bénéficiaire → fiche', () => {
  it('chaque bénéficiaire de la famille mène à sa propre fiche', async () => {
    const { claire, hugo } = await creerFamilleDurand();
    const j = await jeton(d.acteurs.audioAB, 'famille.json');

    const parent = await rechercherBeneficiaire(d.acteurs.audioAB, j, 0);
    expect(parent.beneficiaire.prenom).toBe('CLAIRE');
    expect(parent.visibles.map((f) => f.id)).toEqual([claire]);

    // Hugo et Léa : même NIR, même rang 1, dates différentes → seule la fiche de Hugo.
    const enfant = await rechercherBeneficiaire(d.acteurs.audioAB, j, '1');
    expect(enfant.visibles.map((f) => f.id)).toEqual([hugo]);
    expect(enfant.horsPerimetre).toEqual([]);

    const inconnu = await rechercherBeneficiaire(d.acteurs.audioAB, j, 2);
    expect(inconnu.beneficiaire.prenom).toBe('JULES');
    expect(inconnu.visibles).toEqual([]);
    expect(inconnu.horsPerimetre).toEqual([]);
  });

  it('fiche hors périmètre : seul le centre est révélé', async () => {
    await creerFamilleDurand(d.centres.c.id);
    const j = await jeton(d.acteurs.assistantA, 'famille.json');
    const enfant = await rechercherBeneficiaire(d.acteurs.assistantA, j, 1);
    expect(enfant.visibles).toEqual([]);
    expect(enfant.horsPerimetre).toEqual([{ centreNom: 'Centre C' }]);
  });

  it.each([3, -1, 'x'])('bénéficiaire %s inexistant : erreur de saisie', async (index) => {
    const j = await jeton(d.acteurs.admin, 'famille.json');
    await expect(rechercherBeneficiaire(d.acteurs.admin, j, index)).rejects.toThrow();
  });
});

describe('preparerComparaison et appliquerCarteAuPatient : mises à jour', () => {
  it('compare base et carte, journalise l’ouverture de la fiche', async () => {
    const id = await creerPatient(d.acteurs.assistantA, saisie(d.centres.a.id));
    const j = await jeton(d.acteurs.assistantA, 'assure-seul.json');
    await prisma().$executeRawUnsafe('TRUNCATE journal_audit');

    const c = await preparerComparaison(d.acteurs.assistantA, j, 0, id);
    expect(c.correspond).toBe(true);
    // Carte : caisse 591, droits jusqu'au 30/06/2027, complémentaire ; nom et prénom identiques (casse).
    expect(c.champs).toEqual(['caisse', 'finDroits', 'amc']);

    const lignes = await prisma().journalAudit.findMany();
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatchObject({
      action: 'READ',
      patientId: id,
      details: { lectureVitale: c.lectureId },
    });
  });

  it('applique les champs acceptés, garde les refusés, et journalise les deux listes', async () => {
    const id = await creerPatient(d.acteurs.assistantA, saisie(d.centres.a.id));
    const j = await jeton(d.acteurs.assistantA, 'assure-seul.json');
    const { lecture } = { lecture: lectureEnCours(d.acteurs.assistantA, j) };

    await appliquerCarteAuPatient(d.acteurs.assistantA, j, 0, id, ['finDroits', 'amc']);

    const r = await obtenirPatient(d.acteurs.assistantA, id);
    if (r.type !== 'fiche') {
      throw new Error('fiche fusionnée');
    }
    expect(r.fiche.amo).toMatchObject({
      caisse: '999',
      finDroits: '2027-06-30',
      origine: 'SAISIE',
      derniereLectureVitale: new Date(lecture?.resultat.dateLecture ?? '').toISOString(),
    });
    expect(r.fiche.amc).toMatchObject({
      organismeNom: 'Mutuelle Démo Avenir',
      numeroAdherent: 'AV-0206',
    });

    const maj = await prisma().journalAudit.findFirstOrThrow({ where: { action: 'UPDATE' } });
    expect(maj.details).toEqual({
      lectureVitale: lecture?.lectureId,
      champsAcceptes: ['finDroits', 'amc'],
      champsRefuses: ['caisse'],
    });
    expect(JSON.stringify(maj)).not.toContain('AV-0206');
    expect(JSON.stringify(maj)).not.toContain('591');
  });

  it('tout accepter : couverture d’origine Vitale, plus aucune différence', async () => {
    const id = await creerPatient(d.acteurs.assistantA, saisie(d.centres.a.id));
    const j = await jeton(d.acteurs.assistantA, 'assure-seul.json');
    await appliquerCarteAuPatient(d.acteurs.assistantA, j, 0, id, ['caisse', 'finDroits', 'amc']);

    const brut = await prisma().couvertureAmo.findUniqueOrThrow({ where: { patientId: id } });
    expect(brut.origine).toBe('VITALE');
    expect((await preparerComparaison(d.acteurs.assistantA, j, 0, id)).champs).toEqual([]);
  });

  it('fiche d’un autre NIR : comparable, signalée comme ne correspondant pas', async () => {
    const id = await creerPatient(
      d.acteurs.assistantA,
      saisie(d.centres.a.id, {
        amoNir: '',
        amoCaisse: '',
        amoRegime: '',
        amoCentreGestionnaire: '',
      }),
    );
    const j = await jeton(d.acteurs.assistantA, 'assure-seul.json');
    const c = await preparerComparaison(d.acteurs.assistantA, j, 0, id);
    expect(c.correspond).toBe(false);
    expect(c.champs).toEqual(['amo', 'amc']);

    await appliquerCarteAuPatient(d.acteurs.assistantA, j, 0, id, ['amo']);
    const brut = await prisma().couvertureAmo.findUniqueOrThrow({ where: { patientId: id } });
    expect(brut.origine).toBe('VITALE');
  });

  it('refuse une fiche hors périmètre et un champ inconnu', async () => {
    const id = await creerPatient(d.acteurs.admin, saisie(d.centres.c.id));
    const j = await jeton(d.acteurs.assistantA, 'assure-seul.json');
    await expect(preparerComparaison(d.acteurs.assistantA, j, 0, id)).rejects.toThrow();
    await expect(
      appliquerCarteAuPatient(d.acteurs.assistantA, j, 0, id, ['caisse']),
    ).rejects.toThrow();
    const jAdmin = await jeton(d.acteurs.admin, 'assure-seul.json');
    await expect(
      appliquerCarteAuPatient(d.acteurs.admin, jAdmin, 0, id, ['notes']),
    ).rejects.toThrow();
    expect(await prisma().journalAudit.count({ where: { action: 'UPDATE' } })).toBe(0);
  });
});

describe('creerPatientDepuisCarte', () => {
  function saisieJules(autres: Record<string, unknown> = {}) {
    return saisie(d.centres.a.id, {
      civilite: 'M',
      nomNaissance: 'DURAND',
      prenoms: 'JULES',
      dateNaissance: '2023-03-15',
      amoNir: NIR_DURAND,
      amoQualite: 'AYANT_DROIT',
      amoRegime: '01',
      amoCaisse: '999',
      amoCentreGestionnaire: '9999',
      amoFinDroits: '2027-03-31',
      ...autres,
    });
  }

  it('crée la fiche pré-remplie, d’origine Vitale, et note la lecture dans le journal', async () => {
    const j = await jeton(d.acteurs.audioAB, 'famille.json');
    const lecture = lectureEnCours(d.acteurs.audioAB, j);
    const id = await creerPatientDepuisCarte(d.acteurs.audioAB, j, 2, saisieJules());

    const brut = await prisma().couvertureAmo.findUniqueOrThrow({ where: { patientId: id } });
    expect(brut.origine).toBe('VITALE');
    expect(brut.derniereLectureVitale?.toISOString()).toBe(
      new Date(lecture?.resultat.dateLecture ?? '').toISOString(),
    );
    const creation = await prisma().journalAudit.findFirstOrThrow({ where: { action: 'CREATE' } });
    expect(creation.details).toEqual({ lectureVitale: lecture?.lectureId });

    // La fiche créée est désormais reconnue à la lecture suivante.
    const jules = await rechercherBeneficiaire(d.acteurs.audioAB, j, 2);
    expect(jules.visibles.map((f) => f.id)).toEqual([id]);
  });

  it('couverture retouchée : origine saisie manuelle', async () => {
    const j = await jeton(d.acteurs.audioAB, 'famille.json');
    const id = await creerPatientDepuisCarte(
      d.acteurs.audioAB,
      j,
      2,
      saisieJules({ amoCaisse: '591' }),
    );
    const brut = await prisma().couvertureAmo.findUniqueOrThrow({ where: { patientId: id } });
    expect(brut.origine).toBe('SAISIE');
  });

  it('les doublons possibles sont toujours signalés', async () => {
    await creerPatient(
      d.acteurs.admin,
      saisieJules({
        amoNir: '',
        amoCaisse: '',
        amoRegime: '',
        amoCentreGestionnaire: '',
        amoFinDroits: '',
      }),
    );
    const j = await jeton(d.acteurs.audioAB, 'famille.json');
    await rejet(
      creerPatientDepuisCarte(d.acteurs.audioAB, j, 2, saisieJules()),
      ErreurDoublonPossible,
    );
    await creerPatientDepuisCarte(d.acteurs.audioAB, j, 2, saisieJules(), {
      confirmerDoublon: true,
    });
  });

  it('jeton expiré : rien n’est créé', async () => {
    await rejet(
      creerPatientDepuisCarte(d.acteurs.audioAB, 'v1.faux', 0, saisieJules()),
      ErreurLectureExpiree,
    );
    expect(await prisma().patient.count()).toBe(0);
  });
});
