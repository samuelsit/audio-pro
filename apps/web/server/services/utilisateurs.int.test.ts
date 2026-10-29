import { prisma } from '@ha/db';
import { verifyPassword } from 'better-auth/crypto';
import { beforeEach, describe, expect, it } from 'vitest';

import { creerJeuDeDonnees, viderBase, type JeuDeDonnees } from '@/test/donnees';

import { AccesRefuseError } from '../auth/acces';
import { ErreurSaisie } from '../erreurs';
import {
  creerUtilisateur,
  modifierUtilisateur,
  obtenirUtilisateur,
  reinitialiserMotDePasse,
} from './utilisateurs';

let d: JeuDeDonnees;

beforeEach(async () => {
  await viderBase();
  d = await creerJeuDeDonnees();
});

const saisie = (surcharge: object = {}) => ({
  prenom: 'Nina',
  nom: 'Nouvelle',
  email: ' Nina.Nouvelle@Exemple.test ',
  role: 'ASSISTANT',
  centreIds: [] as string[],
  actif: true,
  ...surcharge,
});

async function erreurDe(promesse: Promise<unknown>): Promise<ErreurSaisie> {
  const erreur = await promesse.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(erreur).toBeInstanceOf(ErreurSaisie);
  return erreur as ErreurSaisie;
}

async function ouvrirSession(userId: string): Promise<void> {
  await prisma().session.create({
    data: { userId, token: `jeton-${userId}`, expiresAt: new Date(Date.now() + 3_600_000) },
  });
}

describe('creerUtilisateur', () => {
  it('crée le compte, ses rattachements et un mot de passe à changer', async () => {
    const id = await creerUtilisateur(
      d.acteurs.admin,
      saisie({ centreIds: [d.centres.a.id] }),
      'mot-de-passe-initial',
    );
    const u = await prisma().utilisateur.findUniqueOrThrow({
      where: { id },
      include: { comptes: true, centres: true },
    });
    expect(u).toMatchObject({
      email: 'nina.nouvelle@exemple.test',
      name: 'Nina Nouvelle',
      doitChangerMotDePasse: true,
      twoFactorEnabled: false,
    });
    expect(u.centres.map((c) => c.centreId)).toEqual([d.centres.a.id]);
    const hash = u.comptes[0]?.password ?? '';
    expect(await verifyPassword({ hash, password: 'mot-de-passe-initial' })).toBe(true);
  });

  it.each([
    {
      cas: 'e-mail déjà utilisé',
      donnees: { email: 'assistanta@exemple.test' },
      mdp: 'mot-de-passe-initial',
      champ: 'email',
    },
    {
      cas: 'assistant sans centre',
      donnees: {},
      mdp: 'mot-de-passe-initial',
      champ: 'centreIds',
      sansCentre: true,
    },
    {
      cas: 'centre inconnu',
      donnees: { centreIds: ['inconnu'] },
      mdp: 'mot-de-passe-initial',
      champ: 'centreIds',
    },
    { cas: 'mot de passe trop court', donnees: {}, mdp: 'court', champ: 'motDePasse' },
  ])('refuse : $cas', async ({ donnees, mdp, champ, sansCentre }) => {
    const centreIds = sansCentre ? [] : [d.centres.a.id];
    const erreur = await erreurDe(
      creerUtilisateur(d.acteurs.admin, saisie({ centreIds, ...donnees }), mdp),
    );
    expect(erreur.erreurs[champ]).toHaveLength(1);
  });

  it('est réservé à l’ADMIN', async () => {
    await expect(
      creerUtilisateur(
        d.acteurs.assistantA,
        saisie({ centreIds: [d.centres.a.id] }),
        'x'.repeat(12),
      ),
    ).rejects.toThrow(AccesRefuseError);
  });
});

describe('modifierUtilisateur', () => {
  const pour = (j: JeuDeDonnees, surcharge: object) => ({
    prenom: 'Assistanta',
    nom: 'Test',
    email: 'assistanta@exemple.test',
    role: 'ASSISTANT',
    centreIds: [j.centres.a.id],
    actif: true,
    ...surcharge,
  });

  it('change les rattachements', async () => {
    const id = d.utilisateurs.assistantA.id;
    await modifierUtilisateur(
      d.acteurs.admin,
      id,
      pour(d, { centreIds: [d.centres.b.id, d.centres.c.id] }),
    );
    expect((await obtenirUtilisateur(d.acteurs.admin, id)).centreIds.sort()).toEqual(
      [d.centres.b.id, d.centres.c.id].sort(),
    );
  });

  it('la désactivation ferme les sessions ouvertes', async () => {
    const id = d.utilisateurs.assistantA.id;
    await ouvrirSession(id);
    await modifierUtilisateur(d.acteurs.admin, id, pour(d, { actif: false }));
    expect(await prisma().session.count({ where: { userId: id } })).toBe(0);
  });

  it('l’ADMIN ne peut ni se rétrograder ni se désactiver', async () => {
    const erreur = await erreurDe(
      modifierUtilisateur(d.acteurs.admin, d.utilisateurs.admin.id, {
        prenom: 'Admin',
        nom: 'Test',
        email: 'admin@exemple.test',
        role: 'ASSISTANT',
        centreIds: [d.centres.a.id],
        actif: true,
      }),
    );
    expect(erreur.message).toMatch(/propre rôle administrateur/);
  });

  it('protège la cohérence de la fiche praticien', async () => {
    const id = d.utilisateurs.audioAB.id;
    const base = { prenom: 'Audioab', nom: 'Test', email: 'audioab@exemple.test', actif: true };

    const changementRole = await erreurDe(
      modifierUtilisateur(d.acteurs.admin, id, {
        ...base,
        role: 'ASSISTANT',
        centreIds: [d.centres.a.id, d.centres.b.id],
      }),
    );
    expect(changementRole.erreurs.role).toHaveLength(1);

    const retraitCentre = await erreurDe(
      modifierUtilisateur(d.acteurs.admin, id, {
        ...base,
        role: 'AUDIO',
        centreIds: [d.centres.a.id],
      }),
    );
    expect(retraitCentre.erreurs.centreIds).toHaveLength(1);
  });
});

describe('reinitialiserMotDePasse', () => {
  it('remplace le hash, force le changement et ferme les sessions', async () => {
    const id = d.utilisateurs.assistantB.id;
    await prisma().compte.create({
      data: { accountId: id, providerId: 'credential', userId: id, password: 'ancien' },
    });
    await ouvrirSession(id);

    await reinitialiserMotDePasse(d.acteurs.admin, id, 'nouveau-mot-de-passe');

    const u = await prisma().utilisateur.findUniqueOrThrow({
      where: { id },
      include: { comptes: true, sessions: true },
    });
    expect(u.doitChangerMotDePasse).toBe(true);
    expect(u.sessions).toEqual([]);
    expect(
      await verifyPassword({
        hash: u.comptes[0]?.password ?? '',
        password: 'nouveau-mot-de-passe',
      }),
    ).toBe(true);
  });
});
