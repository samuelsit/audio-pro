import type { FakeDocumentStore, FakePdfRenderer } from '@ha/adapters';
import { clientApplication, poserContexte } from '@ha/db';
import { prisma } from '@ha/db/admin';
import type { Audiogramme } from '@ha/domain';
import { beforeEach, describe, expect, it } from 'vitest';

import { creerJeuDeDonnees, viderBase, type JeuDeDonnees } from '@/test/donnees';

import {
  AccesRefuseError,
  chargerUtilisateurConnecte,
  type UtilisateurConnecte,
} from '../auth/acces';
import { base } from '../chiffrement';
import { stockageBrut } from '../documents';
import { ErreurSaisie } from '../erreurs';
import { rendeurPdf } from '../pdf';
import {
  creerBilan,
  enregistrerFormulaire,
  enregistrerOtoscopie,
  enregistrerTonale,
  enregistrerVocale,
  lirePhotoOtoscopie,
  listerBilans,
  MESSAGE_MESURE_IMPORTEE,
  obtenirBilan,
  syntheseBilan,
} from './audiologie';
import {
  basculerModele,
  enregistrerModele,
  listerModeles,
  obtenirModele,
} from './modeles-formulaire';
import { aujourdhui, fusionnerPatients } from './patients';

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0x02]);
const PDF = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);

const AUDIOGRAMME: Audiogramme = {
  droite: {
    aerienne: [
      { frequence: 500, seuil: 25, masque: null },
      { frequence: 1000, seuil: 35, masque: null },
      { frequence: 2000, seuil: 45, masque: null },
      { frequence: 4000, seuil: 60, masque: 70 },
    ],
    osseuse: [{ frequence: 1000, seuil: 30, masque: null }],
    inconfort: [{ frequence: 1000, seuil: 100 }],
  },
  gauche: { aerienne: [], osseuse: [], inconfort: [] },
};

const VOCALE = {
  contexte: 'CALME',
  typeBruit: null,
  courbes: [
    {
      ecoute: 'DROITE',
      transducteur: 'CASQUE',
      appareille: false,
      liste: 'Lafon',
      points: [
        { niveau: 40, pourcentage: 30 },
        { niveau: 60, pourcentage: 90 },
      ],
    },
  ],
};

const CONSTAT = { oreille: 'DROITE', conduit: 'LIBRE', tympan: 'NORMAL', observation: 'RAS' };

let d: JeuDeDonnees;
let audio: UtilisateurConnecte;
let audioC: UtilisateurConnecte;
let assistant: UtilisateurConnecte;
let admin: UtilisateurConnecte;
let patientId: string;

function creerPatient(centreId: string, nom: string) {
  const prenoms = 'Jeanne';
  return prisma().patient.create({
    data: {
      organisationId: d.organisation.id,
      centreId,
      civilite: 'MME',
      nomNaissance: nom,
      prenoms,
      dateNaissance: new Date('1950-03-12T00:00:00.000Z'),
      sexe: 'FEMININ',
      nomNaissanceRecherche: nom.toUpperCase(),
      prenomsRecherche: prenoms.toUpperCase(),
    },
    select: { id: true },
  });
}

async function journal(action: string, entiteType: string) {
  return prisma().journalAudit.findMany({
    where: { organisationId: d.organisation.id, action: action as never, entiteType },
  });
}

function bilanFrais(): Promise<string> {
  return creerBilan(audio, patientId, { dateBilan: '2026-03-10' });
}

beforeEach(async () => {
  await viderBase();
  d = await creerJeuDeDonnees();
  audio = d.acteurs.audioAB;
  assistant = d.acteurs.assistantA;
  admin = d.acteurs.admin;
  const charge = await chargerUtilisateurConnecte(d.utilisateurs.audioC.id);
  if (!charge) {
    throw new Error('audioC introuvable');
  }
  audioC = charge;
  ({ id: patientId } = await creerPatient(d.centres.a.id, 'Fictive'));
});

describe('bilan', () => {
  it('crée le bilan, le praticien, le journal et les modèles livrés une seule fois', async () => {
    const id = await bilanFrais();
    await bilanFrais();

    const bilan = await obtenirBilan(audio, id);
    expect(bilan).toMatchObject({
      patientId,
      centreId: d.centres.a.id,
      centreNom: 'Centre A',
      dateBilan: '2026-03-10',
      praticien: 'Audioab Test',
      tonale: null,
      anamnese: null,
    });
    expect(bilan.modeles.map((m) => m.nature).sort()).toEqual([
      'ANAMNESE',
      'BENEFICE',
      'SATISFACTION',
    ]);
    expect(await prisma().modeleFormulaire.count()).toBe(3);
    expect(await journal('CREATE', 'BILAN_AUDIOLOGIQUE')).toHaveLength(2);
    expect(await journal('READ', 'BILAN_AUDIOLOGIQUE')).toMatchObject([{ patientId }]);
  });

  it('une assistante crée un bilan sans praticien', async () => {
    const id = await creerBilan(assistant, patientId, { dateBilan: '2026-03-10' });
    expect((await obtenirBilan(assistant, id)).praticien).toBeNull();
  });

  it('refuse une date future', async () => {
    await expect(creerBilan(audio, patientId, { dateBilan: '2999-01-01' })).rejects.toBeInstanceOf(
      ErreurSaisie,
    );
    await expect(creerBilan(audio, patientId, { dateBilan: aujourdhui() })).resolves.toBeTypeOf(
      'string',
    );
  });

  it('refuse un audioprothésiste d’un autre centre, en lecture comme en création', async () => {
    const id = await bilanFrais();
    await expect(obtenirBilan(audioC, id)).rejects.toBeInstanceOf(AccesRefuseError);
    await expect(listerBilans(audioC, patientId)).rejects.toBeInstanceOf(AccesRefuseError);
    await expect(creerBilan(audioC, patientId, { dateBilan: '2026-03-10' })).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
  });

  it('l’historique suit le patient qui change de centre', async () => {
    const id = await bilanFrais();
    await prisma().patient.update({
      where: { id: patientId },
      data: { centreId: d.centres.c.id },
    });
    await expect(obtenirBilan(audioC, id)).resolves.toMatchObject({ centreNom: 'Centre A' });
    await expect(obtenirBilan(audio, id)).rejects.toBeInstanceOf(AccesRefuseError);
  });

  it('la fusion de patients déplace les bilans', async () => {
    const { id: doublon } = await creerPatient(d.centres.a.id, 'Fictive');
    const id = await creerBilan(audio, doublon, { dateBilan: '2026-03-10' });
    await fusionnerPatients(audio, patientId, doublon, {});
    expect((await obtenirBilan(audio, id)).patientId).toBe(patientId);
    expect((await listerBilans(audio, patientId)).map((b) => b.id)).toEqual([id]);
  });

  it('liste du plus ancien au plus récent, avec le grade', async () => {
    const recent = await creerBilan(audio, patientId, { dateBilan: '2026-03-10' });
    const ancien = await creerBilan(audio, patientId, { dateBilan: '2024-03-12' });
    await enregistrerTonale(audio, recent, { appareil: null, audiogramme: AUDIOGRAMME });

    const lignes = await listerBilans(audio, patientId);
    expect(lignes.map((l) => l.id)).toEqual([ancien, recent]);
    expect(lignes[0]?.tonale).toBeNull();
    expect(lignes[1]?.tonale?.synthese.droite).toEqual({ perteMoyenne: 41.25, grade: 2 });
    expect(await journal('READ', 'BILAN_AUDIOLOGIQUE')).toMatchObject([{ patientId }]);
  });
});

describe('mesures', () => {
  it('enregistre chiffré, relit le grade, et ne journalise aucune valeur', async () => {
    const id = await bilanFrais();
    await enregistrerTonale(audio, id, { appareil: 'Audiomètre A', audiogramme: AUDIOGRAMME });

    const brut = await prisma().mesureAudiologique.findFirstOrThrow({ where: { bilanId: id } });
    expect(brut.donnees).toMatch(/^v1\./);
    expect(brut.donnees).not.toContain('seuil');
    expect(brut).toMatchObject({ source: 'SAISIE', identifiantExterne: null, type: 'TONALE' });

    const { tonale } = await obtenirBilan(audio, id);
    expect(tonale).toMatchObject({
      source: 'SAISIE',
      date: '2026-03-10',
      appareil: 'Audiomètre A',
      audiogramme: AUDIOGRAMME,
      synthese: { droite: { perteMoyenne: 41.25, grade: 2 } },
    });

    const lignes = await journal('CREATE', 'MESURE_AUDIOLOGIQUE');
    expect(lignes).toHaveLength(1);
    expect(JSON.stringify(lignes)).not.toContain('seuil');
  });

  it('une nouvelle saisie remplace la mesure et se journalise en UPDATE', async () => {
    const id = await bilanFrais();
    await enregistrerTonale(audio, id, { appareil: null, audiogramme: AUDIOGRAMME });
    await enregistrerTonale(audio, id, { appareil: 'Autre', audiogramme: AUDIOGRAMME });
    expect(await prisma().mesureAudiologique.count({ where: { bilanId: id } })).toBe(1);
    expect(await journal('UPDATE', 'MESURE_AUDIOLOGIQUE')).toHaveLength(1);
  });

  it('refuse une saisie invalide sans rien écrire', async () => {
    const id = await bilanFrais();
    const audiogramme = {
      ...AUDIOGRAMME,
      droite: { ...AUDIOGRAMME.droite, inconfort: [{ frequence: 1000, seuil: 20 }] },
    };
    await expect(
      enregistrerTonale(audio, id, { appareil: null, audiogramme }),
    ).rejects.toBeInstanceOf(ErreurSaisie);
    expect(await prisma().mesureAudiologique.count()).toBe(0);
  });

  it('avertit sans bloquer une conduction osseuse suspecte', async () => {
    const id = await bilanFrais();
    const audiogramme = {
      ...AUDIOGRAMME,
      droite: {
        ...AUDIOGRAMME.droite,
        osseuse: [{ frequence: 1000, seuil: 60, masque: null }],
      },
    };
    await enregistrerTonale(audio, id, { appareil: null, audiogramme });
    expect((await obtenirBilan(audio, id)).tonale?.avertissements).toHaveLength(1);
  });

  it('garde une mesure par contexte en vocale', async () => {
    const id = await bilanFrais();
    await enregistrerVocale(audio, id, { appareil: null, vocale: VOCALE });
    await enregistrerVocale(audio, id, {
      appareil: null,
      vocale: {
        ...VOCALE,
        contexte: 'BRUIT',
        typeBruit: 'Cocktail party',
        courbes: [{ ...VOCALE.courbes[0], points: [{ niveau: 5, pourcentage: 70 }] }],
      },
    });
    const { vocales } = await obtenirBilan(audio, id);
    expect(vocales.map((v) => v.vocale.contexte).sort()).toEqual(['BRUIT', 'CALME']);
  });

  it('l’assistante lit les mesures sans pouvoir en saisir', async () => {
    const id = await bilanFrais();
    await enregistrerTonale(audio, id, { appareil: null, audiogramme: AUDIOGRAMME });
    await expect(obtenirBilan(assistant, id)).resolves.toBeDefined();
    await expect(
      enregistrerTonale(assistant, id, { appareil: null, audiogramme: AUDIOGRAMME }),
    ).rejects.toBeInstanceOf(AccesRefuseError);
    await expect(
      enregistrerVocale(assistant, id, { appareil: null, vocale: VOCALE }),
    ).rejects.toBeInstanceOf(AccesRefuseError);
    await expect(enregistrerOtoscopie(assistant, id, CONSTAT, null)).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
  });
});

describe('prêt pour NOAH', () => {
  function importer(bilanId: string, identifiantExterne: string | null, source = 'NOAH' as const) {
    return base({ organisationId: d.organisation.id }).mesureAudiologique.create({
      data: {
        bilanId,
        type: 'TONALE',
        source,
        mesureLe: new Date('2026-03-10T09:00:00.000Z'),
        identifiantExterne,
        importeLe: new Date('2026-03-10T10:00:00.000Z'),
        donnees: JSON.stringify(AUDIOGRAMME),
        versionSchema: 1,
      },
    });
  }

  it('affiche la source et refuse de modifier une mesure importée', async () => {
    const id = await bilanFrais();
    await importer(id, 'externe-1');

    expect((await obtenirBilan(audio, id)).tonale?.source).toBe('NOAH');
    await expect(
      enregistrerTonale(audio, id, { appareil: null, audiogramme: AUDIOGRAMME }),
    ).rejects.toThrow(MESSAGE_MESURE_IMPORTEE);
  });

  it('un même identifiant externe ne s’importe qu’une fois', async () => {
    const id = await bilanFrais();
    await importer(id, 'externe-1');
    await expect(importer(id, 'externe-1')).rejects.toThrow();
  });

  it('la base exige un identifiant externe pour une mesure importée, et seulement là', async () => {
    const id = await bilanFrais();
    await expect(importer(id, null)).rejects.toThrow();
    await expect(
      base({ organisationId: d.organisation.id }).mesureAudiologique.create({
        data: {
          bilanId: id,
          type: 'TONALE',
          mesureLe: new Date(),
          identifiantExterne: 'x',
          donnees: '{}',
          versionSchema: 1,
        },
      }),
    ).rejects.toThrow();
  });

  it('refuse de modifier une otoscopie importée', async () => {
    const id = await bilanFrais();
    await base({ organisationId: d.organisation.id }).otoscopie.create({
      data: {
        bilanId: id,
        oreille: 'DROITE',
        source: 'NOAH',
        constat: JSON.stringify({ conduit: 'LIBRE', tympan: 'NORMAL', observation: null }),
      },
    });
    await expect(enregistrerOtoscopie(audio, id, CONSTAT, null)).rejects.toThrow(
      MESSAGE_MESURE_IMPORTEE,
    );
  });
});

describe('otoscopie', () => {
  const brut = () => stockageBrut() as FakeDocumentStore;

  beforeEach(() => {
    brut().objets.clear();
  });

  it('garde le constat chiffré et la photo chiffrée, et trace la lecture', async () => {
    const id = await bilanFrais();
    await enregistrerOtoscopie(audio, id, CONSTAT, PNG);

    const ligne = await prisma().otoscopie.findFirstOrThrow({ where: { bilanId: id } });
    expect(ligne.constat).toMatch(/^v1\./);
    expect(ligne).toMatchObject({ photoType: 'image/png', photoTaille: PNG.length });
    expect(ligne.photoCle).toMatch(/^otoscopies\//);
    expect(brut().objets.get(ligne.photoCle ?? '')).not.toEqual(PNG);

    const photo = await lirePhotoOtoscopie(audio, id, 'DROITE');
    expect(photo.type).toBe('image/png');
    expect(Array.from(photo.contenu)).toEqual(Array.from(PNG));
    expect(await journal('READ', 'OTOSCOPIE')).toMatchObject([{ patientId }]);
    expect((await obtenirBilan(audio, id)).otoscopies).toMatchObject([
      { oreille: 'DROITE', photo: true, constat: { conduit: 'LIBRE' } },
    ]);
  });

  it('remplacer la photo efface l’ancienne ; sans photo, elle reste', async () => {
    const id = await bilanFrais();
    await enregistrerOtoscopie(audio, id, CONSTAT, PNG);
    await enregistrerOtoscopie(audio, id, { ...CONSTAT, observation: 'Revu' }, null);
    expect(brut().objets.size).toBe(1);
    await enregistrerOtoscopie(audio, id, CONSTAT, JPEG);
    expect(brut().objets.size).toBe(1);
    expect((await lirePhotoOtoscopie(audio, id, 'DROITE')).type).toBe('image/jpeg');
  });

  it('refuse un PDF, et n’accepte une photo que là où elle existe', async () => {
    const id = await bilanFrais();
    await expect(enregistrerOtoscopie(audio, id, CONSTAT, PDF)).rejects.toBeInstanceOf(
      ErreurSaisie,
    );
    expect(await prisma().otoscopie.count()).toBe(0);
    await enregistrerOtoscopie(audio, id, CONSTAT, null);
    await expect(lirePhotoOtoscopie(audio, id, 'DROITE')).rejects.toBeInstanceOf(AccesRefuseError);
    await expect(lirePhotoOtoscopie(audio, id, 'MILIEU')).rejects.toBeInstanceOf(AccesRefuseError);
  });

  it('retire la photo déposée si l’enregistrement échoue', async () => {
    const id = await bilanFrais();
    await base({ organisationId: d.organisation.id }).otoscopie.create({
      data: {
        bilanId: id,
        oreille: 'DROITE',
        source: 'NOAH',
        constat: JSON.stringify({ conduit: 'LIBRE', tympan: 'NORMAL', observation: null }),
      },
    });
    await expect(enregistrerOtoscopie(audio, id, CONSTAT, PNG)).rejects.toThrow();
    expect(brut().objets.size).toBe(0);
  });
});

describe('formulaires', () => {
  async function modele(bilanId: string, nature: string) {
    const { modeles } = await obtenirBilan(admin, bilanId);
    const trouve = modeles.find((m) => m.nature === nature);
    if (!trouve) {
      throw new Error(nature);
    }
    return trouve;
  }

  it('l’assistante saisit une anamnèse, chiffrée', async () => {
    const id = await bilanFrais();
    const { id: modeleId } = await modele(id, 'ANAMNESE');
    await enregistrerFormulaire(assistant, id, modeleId, { otites: 'OUI', gene_bruit: '7' });

    const brut = await prisma().reponseFormulaire.findFirstOrThrow({ where: { bilanId: id } });
    expect(brut.reponses).toMatch(/^v1\./);
    expect((await obtenirBilan(assistant, id)).anamnese?.reponses).toEqual({
      otites: 'OUI',
      gene_bruit: 7,
    });
    expect(await journal('CREATE', 'REPONSE_FORMULAIRE')).toHaveLength(1);

    await enregistrerFormulaire(assistant, id, modeleId, { otites: 'NON' });
    expect(await prisma().reponseFormulaire.count()).toBe(1);
    expect(await journal('UPDATE', 'REPONSE_FORMULAIRE')).toHaveLength(1);
  });

  it('calcule les scores à la lecture', async () => {
    const id = await bilanFrais();
    const { id: modeleId } = await modele(id, 'BENEFICE');
    await enregistrerFormulaire(audio, id, modeleId, {
      benefice_calme: '8',
      benefice_bruit: '6',
      benefice_quotidien: '7',
    });
    expect((await obtenirBilan(audio, id)).questionnaires[0]?.scores).toEqual([
      { id: 'benefice_global', libelle: 'Bénéfice global', valeur: 7 },
    ]);
  });

  it('refuse une réponse hors échelle', async () => {
    const id = await bilanFrais();
    const { id: modeleId } = await modele(id, 'BENEFICE');
    await expect(
      enregistrerFormulaire(audio, id, modeleId, { benefice_calme: '11' }),
    ).rejects.toBeInstanceOf(ErreurSaisie);
    expect(await prisma().reponseFormulaire.count()).toBe(0);
  });

  it('une réponse garde la version de son modèle ; une nouvelle version s’impose ensuite', async () => {
    const id = await bilanFrais();
    const ancien = await modele(id, 'SATISFACTION');
    await enregistrerFormulaire(audio, id, ancien.id, { satisfaction_son: '9' });

    const definition = {
      sections: [
        {
          titre: 'Nouveau',
          questions: [{ id: 'q', libelle: 'Q', type: 'TEXTE', obligatoire: false }],
        },
      ],
      scores: [],
    };
    await enregistrerModele(admin, ancien.code, {
      nature: 'SATISFACTION',
      nom: 'Satisfaction v2',
      definition,
    });

    const relu = await obtenirBilan(audio, id);
    expect(relu.questionnaires[0]?.modele).toMatchObject({ version: 1, nom: 'Satisfaction' });
    expect(relu.questionnaires[0]?.reponses).toEqual({ satisfaction_son: 9 });
    expect(relu.modeles.find((m) => m.code === ancien.code)).toMatchObject({ version: 2 });

    // Une réponse existante reste modifiable sur sa version ; une nouvelle réponse, non.
    await enregistrerFormulaire(audio, id, ancien.id, { satisfaction_son: '8' });
    const autre = await bilanFrais();
    await expect(enregistrerFormulaire(audio, autre, ancien.id, {})).rejects.toBeInstanceOf(
      ErreurSaisie,
    );
  });

  it('une seule anamnèse par bilan, même sur deux versions', async () => {
    const id = await bilanFrais();
    const ancien = await modele(id, 'ANAMNESE');
    await enregistrerFormulaire(audio, id, ancien.id, {});
    await enregistrerModele(admin, ancien.code, {
      nature: 'ANAMNESE',
      nom: 'Anamnèse v2',
      definition: ancien.definition,
    });
    const nouveau = await modele(id, 'ANAMNESE');
    await expect(enregistrerFormulaire(audio, id, nouveau.id, {})).rejects.toBeInstanceOf(
      ErreurSaisie,
    );
  });

  it('refuse un modèle d’un identifiant inconnu', async () => {
    const id = await bilanFrais();
    await expect(
      enregistrerFormulaire(audio, id, '019a0000-0000-7000-8000-000000000000', {}),
    ).rejects.toBeInstanceOf(AccesRefuseError);
  });
});

describe('modèles de formulaire', () => {
  const SAISIE = {
    nature: 'BENEFICE',
    nom: 'Mon questionnaire',
    definition: {
      sections: [
        {
          titre: 'S',
          questions: [
            { id: 'q', libelle: 'Q', type: 'ECHELLE', min: 0, max: 5, obligatoire: true },
          ],
        },
      ],
      scores: [],
    },
  };

  it('réservés à l’ADMIN_CLIENT', async () => {
    await expect(listerModeles(audio)).rejects.toBeInstanceOf(AccesRefuseError);
    await expect(obtenirModele(audio, 'x')).rejects.toBeInstanceOf(AccesRefuseError);
    await expect(enregistrerModele(audio, null, SAISIE)).rejects.toBeInstanceOf(AccesRefuseError);
    await expect(basculerModele(audio, 'x', false)).rejects.toBeInstanceOf(AccesRefuseError);
  });

  it('crée, versionne, désactive ; la nature ne change pas', async () => {
    const code = await enregistrerModele(admin, null, SAISIE);
    await enregistrerModele(admin, code, { ...SAISIE, nature: 'SATISFACTION', nom: 'V2' });

    expect(await listerModeles(admin)).toMatchObject([
      { code, version: 2, nom: 'V2', nature: 'BENEFICE', actif: true },
    ]);
    expect(await journal('CREATE', 'MODELE_FORMULAIRE')).toHaveLength(1);
    expect(await journal('UPDATE', 'MODELE_FORMULAIRE')).toHaveLength(1);

    await basculerModele(admin, code, false);
    expect(await obtenirModele(admin, code)).toMatchObject({ actif: false, version: 2 });
    expect(await obtenirModele(admin, 'inconnu')).toBeNull();
  });

  it('refuse une définition incohérente et un code inconnu', async () => {
    await expect(
      enregistrerModele(admin, null, { ...SAISIE, definition: { sections: [], scores: [] } }),
    ).rejects.toBeInstanceOf(ErreurSaisie);
    await expect(enregistrerModele(admin, 'inconnu', SAISIE)).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
    await expect(basculerModele(admin, 'inconnu', true)).rejects.toBeInstanceOf(AccesRefuseError);
  });

  it('la base interdit de réécrire une version', async () => {
    const code = await enregistrerModele(admin, null, SAISIE);
    await expect(
      clientApplication().$transaction(async (tx) => {
        await poserContexte(tx, d.organisation.id);
        await tx.modeleFormulaire.updateMany({ where: { code }, data: { nom: 'Réécrit' } });
      }),
    ).rejects.toThrow(/permission denied/);
    await expect(
      clientApplication().$transaction(async (tx) => {
        await poserContexte(tx, d.organisation.id);
        await tx.modeleFormulaire.deleteMany({ where: { code } });
      }),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('synthèse', () => {
  const rendu = () => rendeurPdf() as FakePdfRenderer;

  it('rend le PDF sans le stocker et journalise l’impression', async () => {
    rendu().rendus.length = 0;
    const id = await bilanFrais();
    await enregistrerTonale(audio, id, { appareil: null, audiogramme: AUDIOGRAMME });
    await enregistrerVocale(audio, id, { appareil: null, vocale: VOCALE });
    await enregistrerOtoscopie(audio, id, CONSTAT, null);
    const { modeles } = await obtenirBilan(audio, id);
    for (const { id: modeleId } of modeles) {
      await enregistrerFormulaire(audio, id, modeleId, {});
    }

    const { contenu, nomFichier } = await syntheseBilan(audio, id);

    expect(contenu.length).toBeGreaterThan(0);
    expect(nomFichier).toBe('synthese-bilan-audiologique.pdf');
    const [html] = rendu().rendus;
    expect(html).toContain('Jeanne Fictive');
    expect(html).toContain('Grade 2');
    expect(html).toContain('Audioab Test');
    expect(await journal('PRINT', 'BILAN_AUDIOLOGIQUE')).toMatchObject([{ patientId }]);
  });
});
