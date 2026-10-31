import { ErreurChampChiffre } from '@ha/adapters';
import { prisma } from '@ha/db/admin';
import { beforeEach, describe, expect, it } from 'vitest';

import { creerJeuDeDonnees, viderBase, type JeuDeDonnees } from '@/test/donnees';

import {
  AccesRefuseError,
  chargerUtilisateurConnecte,
  type UtilisateurConnecte,
} from '../auth/acces';
import { base } from '../chiffrement';
import { ErreurSaisie } from '../erreurs';
import {
  creerPatient,
  doublonsDeLaFiche,
  ErreurDoublonPossible,
  fusionnerPatients,
  listerPatients,
  modifierPatient,
  obtenirPatient,
  preparerFusion,
  rechercherParNir,
  type PatientDetail,
} from './patients';

let d: JeuDeDonnees;
let audioC: UtilisateurConnecte;

beforeEach(async () => {
  await viderBase();
  d = await creerJeuDeDonnees();
  const charge = await chargerUtilisateurConnecte(d.utilisateurs.audioC.id);
  if (!charge) {
    throw new Error('audioC introuvable');
  }
  audioC = charge;
});

// NIR fictifs (clés valides) ; voir packages/domain/src/patient/nir.test.ts.
const NIR_JEANNE = '269014999912339';
const NIR_CORSE = '185052A99912382';

/** Saisie de formulaire valide (champs vides = chaînes vides). */
function saisie(centreId: string, autres: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    centreId,
    civilite: 'MME',
    nomNaissance: 'Lefèvre',
    nomUsage: '',
    prenoms: 'Jeanne',
    dateNaissance: '05/03/1950',
    sexe: 'FEMININ',
    adresseLigne1: '',
    adresseLigne2: '',
    codePostal: '',
    ville: '',
    telephone: '06 00 00 00 01',
    email: '',
    medecinTraitant: '',
    consentementSms: true,
    consentementEmail: false,
    consentementCourrier: false,
    notes: 'Note confidentielle',
    amoNir: NIR_JEANNE,
    amoRangNaissance: '1',
    amoQualite: 'ASSURE',
    amoRegime: '01',
    amoCaisse: '751',
    amoCentreGestionnaire: '',
    amoFinDroits: '',
    amoC2s: false,
    amoAld: true,
    amcOrganismeNom: '',
    amcOrganismeIdentifiant: '',
    amcNumeroAdherent: '',
    amcTypeContrat: '',
    amcDebutValidite: '',
    amcFinValidite: '',
    ...autres,
  };
}

const lignesAudit = () =>
  prisma().journalAudit.findMany({ orderBy: [{ horodatage: 'asc' }, { id: 'asc' }] });

async function ouvrir(acteur: UtilisateurConnecte, id: string): Promise<PatientDetail> {
  const r = await obtenirPatient(acteur, id);
  if (r.type !== 'fiche') {
    throw new Error('fiche fusionnée');
  }
  return r.fiche;
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

const tous = { type: 'tous' } as const;
const centre = (id: string) => ({ type: 'centre', centreId: id }) as const;

describe('creerPatient et obtenirPatient', () => {
  it('crée la fiche, chiffre NIR, ALD et notes, et journalise la création puis l’ouverture', async () => {
    const id = await creerPatient(d.acteurs.assistantA, saisie(d.centres.a.id));

    const brut = await prisma().couvertureAmo.findUniqueOrThrow({ where: { patientId: id } });
    expect(brut.nir).toMatch(/^v1\./);
    expect(brut.ald).toMatch(/^v1\./);
    expect(brut.nir).not.toContain('2690149999');
    expect(brut.nirEmpreinte).toMatch(/^[0-9a-f]{64}$/);
    expect(brut.origine).toBe('SAISIE');
    const patientBrut = await prisma().patient.findUniqueOrThrow({ where: { id } });
    expect(patientBrut.notes).toMatch(/^v1\./);
    expect(patientBrut.nomNaissanceRecherche).toBe('LEFEVRE');

    const fiche = await ouvrir(d.acteurs.assistantA, id);
    expect(fiche).toMatchObject({
      nomNaissance: 'Lefèvre',
      dateNaissance: '1950-03-05',
      telephone: '0600000001',
      notes: 'Note confidentielle',
      centre: { id: d.centres.a.id, nom: 'Centre A' },
      amo: { nir: NIR_JEANNE, rangNaissance: 1, qualite: 'ASSURE', ald: true, c2s: false },
      amc: null,
    });
    expect(fiche.age).toBeGreaterThanOrEqual(76);

    const lignes = await lignesAudit();
    expect(lignes.map((l) => [l.action, l.entiteType, l.patientId, l.centreId])).toEqual([
      ['CREATE', 'PATIENT', id, d.centres.a.id],
      ['READ', 'PATIENT', id, d.centres.a.id],
    ]);
    const journal = JSON.stringify(lignes);
    expect(journal).not.toContain('2690149999');
    expect(journal).not.toContain('Lefèvre');
    expect(journal).not.toContain('confidentielle');
  });

  it('refuse un filtre sur un champ chiffré (extension active sur le modèle)', async () => {
    await expect(
      base(d.acteurs.admin).couvertureAmo.findFirst({ where: { nir: NIR_JEANNE } }),
    ).rejects.toThrow(ErreurChampChiffre);
  });

  it('la base refuse un NIR écrit en clair', async () => {
    const id = await creerPatient(
      d.acteurs.admin,
      saisie(d.centres.a.id, { amoNir: '', amoRegime: '', amoCaisse: '', amoAld: false }),
    );
    await expect(
      prisma().couvertureAmo.create({
        data: {
          patientId: id,
          nir: NIR_JEANNE,
          nirEmpreinte: 'a'.repeat(64),
          rangNaissance: 1,
          qualite: 'ASSURE',
          ald: 'NON',
          origine: 'SAISIE',
        },
      }),
    ).rejects.toThrow();
  });

  it.each([
    { cas: 'date future', autres: { dateNaissance: '01/01/2999' }, champ: 'dateNaissance' },
    { cas: 'NIR invalide', autres: { amoNir: '269014999912338' }, champ: 'amoNir' },
    { cas: 'centre inconnu', autres: { centreId: 'inconnu' }, champ: 'centreId' },
  ])('refuse : $cas', async ({ autres, champ }) => {
    const erreur = await rejet(
      creerPatient(d.acteurs.admin, saisie(d.centres.a.id, autres)),
      ErreurSaisie,
    );
    expect(Object.keys(erreur.erreurs)).toContain(champ);
  });

  it('refuse un centre fermé', async () => {
    const erreur = await rejet(
      creerPatient(d.acteurs.admin, saisie(d.centres.ferme.id)),
      ErreurSaisie,
    );
    expect(erreur.erreurs.centreId).toEqual(['Centre de rattachement inconnu ou non autorisé.']);
  });
});

describe('doublons', () => {
  it('même NIR (deux assurés) : création suspendue, puis confirmée', async () => {
    const premier = await creerPatient(d.acteurs.assistantA, saisie(d.centres.a.id));
    // Même NIR saisi pour un assuré au nom et à la date différents (erreur de saisie probable).
    const autre = saisie(d.centres.a.id, { nomNaissance: 'Lefebvre', dateNaissance: '03/05/1950' });

    const erreur = await rejet(creerPatient(d.acteurs.assistantA, autre), ErreurDoublonPossible);
    expect(erreur.doublons).toEqual({
      visibles: [
        expect.objectContaining({
          id: premier,
          prenoms: 'Jeanne',
          centreNom: 'Centre A',
          motifs: ['MEME_NIR'],
          qualite: 'ASSURE',
          rangNaissance: 1,
        }),
      ],
      horsPerimetre: [],
    });
    expect(await prisma().patient.count()).toBe(1);

    const second = await creerPatient(d.acteurs.assistantA, autre, { confirmerDoublon: true });
    expect(second).not.toBe(premier);
    const creation = (await lignesAudit()).filter((l) => l.action === 'CREATE').at(-1);
    expect(creation?.details).toEqual({
      creationMalgreDoublon: true,
      doublonsVisibles: [premier],
      doublonsHorsPerimetre: 0,
    });
  });

  it('ayant droit sur le NIR de l’assuré : pas un doublon', async () => {
    await creerPatient(d.acteurs.assistantA, saisie(d.centres.a.id));
    await expect(
      creerPatient(
        d.acteurs.assistantA,
        saisie(d.centres.a.id, {
          prenoms: 'Paul',
          dateNaissance: '2015-06-01',
          amoQualite: 'AYANT_DROIT',
        }),
      ),
    ).resolves.toEqual(expect.any(String));
  });

  it('même nom (sans accent, nom d’usage croisé) et même date de naissance, sans NIR', async () => {
    await creerPatient(
      d.acteurs.assistantA,
      saisie(d.centres.a.id, {
        nomNaissance: 'Martin',
        nomUsage: 'LEFEVRE',
        amoNir: '',
        amoRegime: '',
        amoCaisse: '',
        amoAld: false,
      }),
    );
    const erreur = await rejet(
      creerPatient(
        d.acteurs.assistantA,
        saisie(d.centres.a.id, { amoNir: '', amoRegime: '', amoCaisse: '', amoAld: false }),
      ),
      ErreurDoublonPossible,
    );
    expect(erreur.doublons.visibles.map((v) => v.motifs)).toEqual([['MEME_IDENTITE']]);
  });

  it('pas de doublon : autre date de naissance et autre NIR', async () => {
    await creerPatient(d.acteurs.assistantA, saisie(d.centres.a.id));
    await expect(
      creerPatient(
        d.acteurs.assistantA,
        saisie(d.centres.a.id, { dateNaissance: '06/03/1950', amoNir: NIR_CORSE }),
      ),
    ).resolves.toEqual(expect.any(String));
  });

  it('doublon hors périmètre : seul le centre est révélé', async () => {
    await creerPatient(d.acteurs.assistantB, saisie(d.centres.b.id));
    const erreur = await rejet(
      creerPatient(d.acteurs.assistantA, saisie(d.centres.a.id)),
      ErreurDoublonPossible,
    );
    expect(erreur.doublons).toEqual({
      visibles: [],
      horsPerimetre: [{ centreNom: 'Centre B', motifs: ['MEME_NIR', 'MEME_IDENTITE'] }],
    });
    expect(JSON.stringify(erreur.doublons)).not.toContain('Jeanne');
  });

  it('bandeau de la fiche : doublons possibles hors fiche elle-même', async () => {
    const a = await creerPatient(d.acteurs.audioAB, saisie(d.centres.a.id));
    const b = await creerPatient(d.acteurs.audioAB, saisie(d.centres.b.id), {
      confirmerDoublon: true,
    });
    const doublons = await doublonsDeLaFiche(d.acteurs.audioAB, await ouvrir(d.acteurs.audioAB, a));
    expect(doublons.visibles.map((v) => v.id)).toEqual([b]);
  });
});

describe('cloisonnement par centre', () => {
  let patientA: string;
  let patientB: string;

  beforeEach(async () => {
    patientA = await creerPatient(d.acteurs.admin, saisie(d.centres.a.id));
    patientB = await creerPatient(
      d.acteurs.admin,
      saisie(d.centres.b.id, { nomNaissance: 'Bernard', amoNir: NIR_CORSE }),
    );
  });

  const ids = async (
    acteur: UtilisateurConnecte,
    perimetre: Parameters<typeof listerPatients>[1],
  ) => (await listerPatients(acteur, perimetre, {})).patients.map((p) => p.id).sort();

  it('l’assistante de A ne voit, n’ouvre ni ne modifie une fiche de B', async () => {
    expect(await ids(d.acteurs.assistantA, centre(d.centres.a.id))).toEqual([patientA]);
    await rejet(listerPatients(d.acteurs.assistantA, centre(d.centres.b.id), {}), AccesRefuseError);
    await rejet(listerPatients(d.acteurs.assistantA, tous, {}), AccesRefuseError);
    await rejet(obtenirPatient(d.acteurs.assistantA, patientB), AccesRefuseError);
    await rejet(
      modifierPatient(d.acteurs.assistantA, patientB, saisie(d.centres.b.id)),
      AccesRefuseError,
    );
    expect((await lignesAudit()).filter((l) => l.action === 'READ')).toEqual([]);
  });

  it('l’assistante de A ne crée pas en B et ne déplace pas une fiche vers B', async () => {
    const creation = await rejet(
      creerPatient(d.acteurs.assistantA, saisie(d.centres.b.id, { nomNaissance: 'Autre' }), {
        confirmerDoublon: true,
      }),
      ErreurSaisie,
    );
    expect(creation.erreurs.centreId).toBeDefined();
    const deplacement = await rejet(
      modifierPatient(d.acteurs.assistantA, patientA, saisie(d.centres.b.id)),
      ErreurSaisie,
    );
    expect(deplacement.erreurs.centreId).toBeDefined();
  });

  it('l’AUDIO de A et B voit A et B ; le périmètre « centre » restreint ; l’ADMIN_CLIENT voit tout', async () => {
    expect(await ids(d.acteurs.audioAB, centre(d.centres.b.id))).toEqual([patientB]);
    expect((await ouvrir(d.acteurs.audioAB, patientA)).id).toBe(patientA);
    expect(await ids(d.acteurs.admin, tous)).toEqual([patientA, patientB].sort());
    expect(await ids(d.acteurs.admin, centre(d.centres.a.id))).toEqual([patientA]);
    await rejet(obtenirPatient(audioC, patientA), AccesRefuseError);
  });

  it('recherche par NIR exact, limitée au périmètre', async () => {
    const r = await rechercherParNir(d.acteurs.audioAB, centre(d.centres.b.id), {
      nir: '1 85 05 2a 999 123 82',
    });
    expect(r.patientId).toBe(patientB);
    const liste = await listerPatients(d.acteurs.audioAB, centre(d.centres.b.id), {
      empreinte: r.empreinte,
    });
    expect(liste.patients.map((p) => p.id)).toEqual([patientB]);

    const horsPerimetre = await rechercherParNir(d.acteurs.assistantA, centre(d.centres.a.id), {
      nir: NIR_CORSE,
    });
    expect(horsPerimetre.patientId).toBeNull();
    await rejet(
      rechercherParNir(d.acteurs.assistantA, centre(d.centres.a.id), { nir: '123' }),
      ErreurSaisie,
    );
  });

  it('recherche par nom (sans accent), prénom et date de naissance', async () => {
    const chercher = (criteres: Record<string, string>) =>
      listerPatients(d.acteurs.admin, tous, criteres).then((r) => r.patients.map((p) => p.id));
    expect(await chercher({ nom: 'lefevre' })).toEqual([patientA]);
    expect(await chercher({ nom: 'ber' })).toEqual([patientB]);
    expect((await chercher({ prenom: 'jeanne' })).sort()).toEqual([patientA, patientB].sort());
    expect((await chercher({ dateNaissance: '05/03/1950' })).length).toBe(2);
    expect(await chercher({ dateNaissance: '06/03/1950' })).toEqual([]);
  });
});

describe('modifierPatient', () => {
  it('modifie la fiche et les couvertures ; une saisie manuelle repasse l’AMO en SAISIE', async () => {
    const id = await creerPatient(d.acteurs.assistantA, saisie(d.centres.a.id));
    await prisma().couvertureAmo.update({
      where: { patientId: id },
      data: { origine: 'VITALE', derniereLectureVitale: new Date('2026-10-01T10:00:00Z') },
    });

    // Fiche sans changement AMO : l'origine reste VITALE.
    await modifierPatient(d.acteurs.assistantA, id, saisie(d.centres.a.id, { ville: 'Lille' }));
    expect((await ouvrir(d.acteurs.assistantA, id)).amo?.origine).toBe('VITALE');

    await modifierPatient(
      d.acteurs.assistantA,
      id,
      saisie(d.centres.a.id, { amoC2s: true, amcOrganismeNom: 'Mutuelle Démo' }),
    );
    const fiche = await ouvrir(d.acteurs.assistantA, id);
    expect(fiche.amo).toMatchObject({
      c2s: true,
      origine: 'SAISIE',
      derniereLectureVitale: '2026-10-01T10:00:00.000Z',
    });
    expect(fiche.amc?.organismeNom).toBe('Mutuelle Démo');

    await modifierPatient(
      d.acteurs.assistantA,
      id,
      saisie(d.centres.a.id, { amoNir: '', amoRegime: '', amoCaisse: '', amoAld: false }),
    );
    expect((await ouvrir(d.acteurs.assistantA, id)).amo).toBeNull();

    const maj = (await lignesAudit()).filter((l) => l.action === 'UPDATE');
    expect(maj).toHaveLength(3);
    // La ville revient à vide (non ressaisie) : modifiée, valeur masquée comme tout champ patient.
    expect(maj[1]?.champs).toEqual([
      { champ: 'ville', masque: true },
      { champ: 'amo', masque: true },
      { champ: 'amc', masque: true },
    ]);
  });
});

describe('fusion', () => {
  let conservee: string;
  let doublon: string;

  beforeEach(async () => {
    conservee = await creerPatient(
      d.acteurs.admin,
      saisie(d.centres.a.id, { telephone: '', notes: 'Note A' }),
    );
    doublon = await creerPatient(
      d.acteurs.admin,
      saisie(d.centres.b.id, {
        telephone: '06 00 00 00 02',
        email: 'jeanne@exemple.test',
        notes: 'Note B',
        amcOrganismeNom: 'Mutuelle Démo',
      }),
      { confirmerDoublon: true },
    );
  });

  it('refusée à l’ASSISTANT et sans accès aux deux centres', async () => {
    await rejet(preparerFusion(d.acteurs.assistantA, conservee, doublon), AccesRefuseError);
    await rejet(fusionnerPatients(d.acteurs.assistantA, conservee, doublon, {}), AccesRefuseError);
    await rejet(fusionnerPatients(audioC, conservee, doublon, {}), AccesRefuseError);
    await rejet(fusionnerPatients(d.acteurs.audioAB, conservee, conservee, {}), ErreurSaisie);
  });

  it('prépare l’écran (deux READ) puis fusionne ; le doublon disparaît des listes', async () => {
    const preparation = await preparerFusion(d.acteurs.audioAB, conservee, doublon);
    expect(preparation.champs).toEqual([
      { champ: 'centreId', parDefaut: 'conservee' },
      { champ: 'telephone', parDefaut: 'doublon' },
      { champ: 'email', parDefaut: 'doublon' },
      { champ: 'amc', parDefaut: 'doublon' },
    ]);

    await fusionnerPatients(d.acteurs.audioAB, conservee, doublon, { email: 'conservee' });

    const fiche = await ouvrir(d.acteurs.audioAB, conservee);
    expect(fiche).toMatchObject({
      centre: { id: d.centres.a.id },
      telephone: '0600000002',
      email: null,
      notes: 'Note A\n\nNote B',
      amc: { organismeNom: 'Mutuelle Démo' },
      amo: { nir: NIR_JEANNE },
    });
    expect(await obtenirPatient(d.acteurs.audioAB, doublon)).toEqual({
      type: 'fusionnee',
      conserveeId: conservee,
    });
    const liste = await listerPatients(d.acteurs.admin, tous, {});
    expect(liste.patients.map((p) => p.id)).toEqual([conservee]);
    const parNir = await rechercherParNir(d.acteurs.admin, tous, { nir: NIR_JEANNE });
    expect(parNir.patientId).toBe(conservee);

    const lignes = await lignesAudit();
    const fusion = lignes.filter((l) => l.details !== null && 'fusion' in (l.details as object));
    expect(fusion.map((l) => [l.action, l.patientId])).toEqual([
      ['UPDATE', conservee],
      ['UPDATE', doublon],
    ]);
    expect(lignes.filter((l) => l.action === 'READ').map((l) => l.patientId)).toEqual([
      conservee,
      doublon,
      conservee,
    ]);

    await rejet(fusionnerPatients(d.acteurs.admin, conservee, doublon, {}), ErreurSaisie);
  });

  it('refuse un choix de fusion invalide', async () => {
    await rejet(
      fusionnerPatients(d.acteurs.admin, conservee, doublon, { email: 'les-deux' }),
      ErreurSaisie,
    );
  });
});
