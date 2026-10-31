import { prisma } from '@ha/db/admin';
import { beforeEach, describe, expect, it } from 'vitest';

import { creerJeuDeDonnees, viderBase, type JeuDeDonnees } from '@/test/donnees';

import { AccesRefuseError } from '../auth/acces';
import { ErreurSaisie } from '../erreurs';
import {
  creerPraticien,
  listerAudiosSansFiche,
  modifierPraticien,
  obtenirPraticien,
} from './praticiens';

let d: JeuDeDonnees;

beforeEach(async () => {
  await viderBase();
  d = await creerJeuDeDonnees();
});

async function nouvelAudio(centreIds: string[]): Promise<string> {
  const u = await prisma().utilisateur.create({
    data: {
      organisationId: d.organisation.id,
      prenom: 'Nouvel',
      nom: 'Audio',
      name: 'Nouvel Audio',
      email: 'nouvel.audio@exemple.test',
      role: 'AUDIO',
      centres: { create: centreIds.map((centreId) => ({ centreId })) },
    },
  });
  return u.id;
}

async function erreurDe(promesse: Promise<unknown>): Promise<ErreurSaisie> {
  const erreur = await promesse.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(erreur).toBeInstanceOf(ErreurSaisie);
  return erreur as ErreurSaisie;
}

describe('creerPraticien', () => {
  it('crée la fiche d’un AUDIO avec RPPS normalisé', async () => {
    const utilisateurId = await nouvelAudio([d.centres.a.id, d.centres.c.id]);
    expect((await listerAudiosSansFiche(d.acteurs.admin)).map((u) => u.id)).toEqual([
      utilisateurId,
    ]);

    const id = await creerPraticien(d.acteurs.admin, {
      utilisateurId,
      rpps: '100 000 000 01',
      adeli: '',
      centreIds: [d.centres.c.id],
    });

    const fiche = await obtenirPraticien(d.acteurs.admin, id);
    expect(fiche).toMatchObject({ rpps: '10000000001', adeli: null, centreIds: [d.centres.c.id] });
    expect(await listerAudiosSansFiche(d.acteurs.admin)).toEqual([]);
  });

  it.each([
    {
      cas: 'RPPS de 10 chiffres',
      rpps: '1000000000',
      champ: 'rpps',
      message: 'Le numéro RPPS doit comporter exactement 11 chiffres.',
    },
    {
      cas: 'RPPS avec lettre',
      rpps: '1000000000A',
      champ: 'rpps',
      message: 'Le numéro RPPS doit comporter exactement 11 chiffres.',
    },
    {
      cas: 'RPPS déjà utilisé',
      rpps: '19999999907',
      champ: 'rpps',
      message: 'Ce numéro RPPS est déjà enregistré pour un autre praticien.',
    },
  ])('refuse : $cas', async ({ rpps, champ, message }) => {
    const utilisateurId = await nouvelAudio([d.centres.a.id]);
    const erreur = await erreurDe(
      creerPraticien(d.acteurs.admin, { utilisateurId, rpps, centreIds: [d.centres.a.id] }),
    );
    expect(erreur.erreurs[champ]).toEqual([message]);
  });

  it('refuse un ADELI déjà utilisé', async () => {
    await prisma().praticien.update({
      where: { id: d.praticiens.praticienC.id },
      data: { adeli: '594600001' },
    });
    const utilisateurId = await nouvelAudio([d.centres.a.id]);
    const erreur = await erreurDe(
      creerPraticien(d.acteurs.admin, {
        utilisateurId,
        rpps: '10000000001',
        adeli: '594600001',
        centreIds: [d.centres.a.id],
      }),
    );
    expect(erreur.erreurs.adeli).toEqual([
      'Ce numéro ADELI est déjà enregistré pour un autre praticien.',
    ]);
  });

  it('refuse un utilisateur qui n’est pas AUDIO', async () => {
    const erreur = await erreurDe(
      creerPraticien(d.acteurs.admin, {
        utilisateurId: d.utilisateurs.assistantA.id,
        rpps: '10000000001',
        centreIds: [d.centres.a.id],
      }),
    );
    expect(erreur.erreurs.utilisateurId).toEqual([
      'Seul un utilisateur de rôle Audioprothésiste peut avoir une fiche praticien.',
    ]);
  });

  it('refuse un AUDIO qui a déjà une fiche', async () => {
    const erreur = await erreurDe(
      creerPraticien(d.acteurs.admin, {
        utilisateurId: d.utilisateurs.audioC.id,
        rpps: '10000000001',
        centreIds: [d.centres.c.id],
      }),
    );
    expect(erreur.erreurs.utilisateurId).toEqual(['Cet utilisateur a déjà une fiche praticien.']);
  });

  it('refuse un centre d’exercice hors des rattachements', async () => {
    const utilisateurId = await nouvelAudio([d.centres.a.id]);
    const erreur = await erreurDe(
      creerPraticien(d.acteurs.admin, {
        utilisateurId,
        rpps: '10000000001',
        centreIds: [d.centres.a.id, d.centres.b.id],
      }),
    );
    expect(erreur.erreurs.centreIds).toHaveLength(1);
  });

  it('est réservé à l’ADMIN_CLIENT', async () => {
    const utilisateurId = await nouvelAudio([d.centres.a.id]);
    await expect(
      creerPraticien(d.acteurs.audioAB, {
        utilisateurId,
        rpps: '10000000001',
        centreIds: [d.centres.a.id],
      }),
    ).rejects.toThrow(AccesRefuseError);
  });
});

describe('modifierPraticien', () => {
  it('met à jour RPPS, ADELI et centres d’exercice sans changer d’utilisateur', async () => {
    const id = d.praticiens.praticienAB.id;
    await modifierPraticien(d.acteurs.admin, id, {
      utilisateurId: d.utilisateurs.audioC.id,
      rpps: '10000000001',
      adeli: '2a4600001',
      centreIds: [d.centres.b.id],
    });
    expect(await obtenirPraticien(d.acteurs.admin, id)).toMatchObject({
      utilisateurId: d.utilisateurs.audioAB.id,
      rpps: '10000000001',
      adeli: '2A4600001',
      centreIds: [d.centres.b.id],
    });
  });

  it('refuse une fiche d’une autre organisation ou inconnue', async () => {
    await expect(obtenirPraticien(d.acteurs.admin, 'inconnu')).rejects.toThrow(AccesRefuseError);
  });
});

describe('journal d’audit', () => {
  it('journalise la création et la modification d’une fiche', async () => {
    const utilisateurId = await nouvelAudio([d.centres.a.id, d.centres.c.id]);
    const id = await creerPraticien(d.acteurs.admin, {
      utilisateurId,
      rpps: '100 000 000 01',
      adeli: '',
      centreIds: [d.centres.c.id],
    });
    await modifierPraticien(d.acteurs.admin, id, {
      rpps: '10000000001',
      adeli: '',
      centreIds: [d.centres.a.id, d.centres.c.id],
    });

    const lignes = await prisma().journalAudit.findMany({ orderBy: { horodatage: 'asc' } });
    expect(lignes.map((l) => [l.action, l.entiteType, l.entiteId])).toEqual([
      ['CREATE', 'PRATICIEN', id],
      ['UPDATE', 'PRATICIEN', id],
    ]);
    expect(lignes[0]?.champs).toContainEqual({
      champ: 'rpps',
      masque: false,
      apres: '10000000001',
    });
    expect(lignes[1]?.champs).toEqual([
      {
        champ: 'centreIds',
        masque: false,
        avant: [d.centres.c.id],
        apres: [d.centres.a.id, d.centres.c.id],
      },
    ]);
  });
});
