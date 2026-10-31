import { clientPlateforme } from '@ha/db';
import { prisma } from '@ha/db/admin';
import { ROLE_SUPERADMIN } from '@ha/domain';
import { beforeEach, describe, expect, it } from 'vitest';

import { creerJeuDeDonnees, viderBase, type JeuDeDonnees } from '@/test/donnees';

import {
  AccesRefuseError,
  chargerCompteConnecte,
  chargerUtilisateurConnecte,
  type SuperadminConnecte,
} from '../auth/acces';
import { ErreurSaisie } from '../erreurs';
import {
  creerOrganisation,
  listerOrganisations,
  reactiverOrganisation,
  suspendreOrganisation,
} from './organisations';

const MOT_DE_PASSE = 'mot-de-passe-provisoire';

let d: JeuDeDonnees;
let superadmin: SuperadminConnecte;

const saisie = (surcharge: object = {}) => ({
  raisonSociale: 'Audition Nouvelle SAS',
  siren: '000 000 003',
  adresseLigne1: '1 rue de l’Exemple',
  adresseLigne2: '',
  codePostal: '75001',
  ville: 'Paris',
  statut: 'ESSAI',
  adminPrenom: 'Alix',
  adminNom: 'Démo',
  adminEmail: 'alix@nouvelle.exemple.test',
  ...surcharge,
});

beforeEach(async () => {
  await viderBase();
  d = await creerJeuDeDonnees();
  const { id } = await prisma().utilisateur.create({
    data: {
      prenom: 'Claude',
      nom: 'Éditeur',
      name: 'Claude Éditeur',
      email: 'console@exemple.test',
      role: ROLE_SUPERADMIN,
      doitChangerMotDePasse: false,
    },
  });
  const compte = await chargerCompteConnecte(id);
  if (compte?.role !== ROLE_SUPERADMIN) {
    throw new Error('Compte éditeur attendu.');
  }
  superadmin = compte;
});

describe('SUPERADMIN', () => {
  it('reste hors de toute organisation', async () => {
    expect(superadmin.organisationId).toBeNull();
    expect(await chargerUtilisateurConnecte(superadmin.id)).toBeNull();
  });

  it('la base refuse un SUPERADMIN rattaché, et un utilisateur client sans organisation', async () => {
    const compte = { prenom: 'Test', nom: 'Test', name: 'Test Test' };
    await expect(
      prisma().utilisateur.create({
        data: {
          ...compte,
          email: 'a@exemple.test',
          role: ROLE_SUPERADMIN,
          organisationId: d.organisation.id,
        },
      }),
    ).rejects.toThrow(/utilisateur_superadmin_sans_organisation/);
    await expect(
      prisma().utilisateur.create({
        data: { ...compte, email: 'b@exemple.test', role: 'AUDIO', organisationId: null },
      }),
    ).rejects.toThrow(/utilisateur_superadmin_sans_organisation/);
  });

  it('le rôle plateforme ne lit aucune donnée patient', async () => {
    await expect(clientPlateforme().patient.findMany()).rejects.toThrow();
    await expect(clientPlateforme().dossier.findMany()).rejects.toThrow();
  });

  it('refuse un acteur qui n’est pas SUPERADMIN', async () => {
    const usurpateur = { ...superadmin, role: 'AUDIO' } as unknown as SuperadminConnecte;
    await expect(listerOrganisations(usurpateur)).rejects.toBeInstanceOf(AccesRefuseError);
  });
});

describe('listerOrganisations', () => {
  it('compte les centres et les utilisateurs de chaque client', async () => {
    const [organisation] = await listerOrganisations(superadmin);
    expect(organisation).toMatchObject({
      raisonSociale: 'Réseau Test',
      statut: 'ESSAI',
      centres: 4,
      utilisateurs: 6,
    });
  });
});

describe('creerOrganisation', () => {
  it('crée le client et son premier ADMIN_CLIENT, journalisés', async () => {
    const id = await creerOrganisation(superadmin, saisie(), MOT_DE_PASSE);
    const admin = await prisma().utilisateur.findFirstOrThrow({ where: { organisationId: id } });
    expect(admin).toMatchObject({
      role: 'ADMIN_CLIENT',
      email: 'alix@nouvelle.exemple.test',
      doitChangerMotDePasse: true,
    });
    expect(await prisma().compte.count({ where: { userId: admin.id } })).toBe(1);
    const ligne = await prisma().journalAudit.findFirstOrThrow({
      where: { organisationId: id, action: 'CREATE' },
    });
    expect(ligne).toMatchObject({
      utilisateurId: superadmin.id,
      role: ROLE_SUPERADMIN,
      entiteType: 'ORGANISATION',
      entiteId: id,
    });
  });

  it.each([
    { cas: 'SIREN invalide', surcharge: { siren: '123' }, mdp: MOT_DE_PASSE, champ: 'siren' },
    { cas: 'mot de passe trop court', surcharge: {}, mdp: 'court', champ: 'motDePasse' },
  ])('refuse : $cas', async ({ surcharge, mdp, champ }) => {
    const erreur = await creerOrganisation(superadmin, saisie(surcharge), mdp).catch(
      (e: unknown) => e,
    );
    expect(erreur).toBeInstanceOf(ErreurSaisie);
    expect((erreur as ErreurSaisie).erreurs[champ]).toBeDefined();
  });

  it('refuse un doublon sans créer de client à moitié', async () => {
    await creerOrganisation(superadmin, saisie(), MOT_DE_PASSE);
    const avant = await prisma().organisation.count();
    const siren = await creerOrganisation(
      superadmin,
      saisie({ adminEmail: 'autre@exemple.test' }),
      MOT_DE_PASSE,
    ).catch((e: unknown) => e);
    expect((siren as ErreurSaisie).erreurs.siren).toEqual(['Un client existe déjà avec ce SIREN.']);
    const email = await creerOrganisation(
      superadmin,
      saisie({ siren: '000000004' }),
      MOT_DE_PASSE,
    ).catch((e: unknown) => e);
    expect((email as ErreurSaisie).erreurs.adminEmail).toBeDefined();
    expect(await prisma().organisation.count()).toBe(avant);
  });
});

describe('suspension', () => {
  it('coupe la connexion et les sessions, puis la réactivation rend l’accès', async () => {
    const utilisateurId = d.utilisateurs.assistantA.id;
    await prisma().session.create({
      data: {
        token: 'jeton',
        expiresAt: new Date('2099-01-01T00:00:00.000Z'),
        userId: utilisateurId,
      },
    });

    await suspendreOrganisation(superadmin, d.organisation.id);
    expect(await chargerCompteConnecte(utilisateurId)).toBeNull();
    expect(await prisma().session.count({ where: { userId: utilisateurId } })).toBe(0);
    expect(
      await prisma().journalAudit.count({
        where: { organisationId: d.organisation.id, entiteType: 'ORGANISATION' },
      }),
    ).toBe(1);

    await reactiverOrganisation(superadmin, d.organisation.id, 'ACTIF');
    expect(await chargerCompteConnecte(utilisateurId)).not.toBeNull();
    const statut = await prisma().organisation.findUniqueOrThrow({
      where: { id: d.organisation.id },
    });
    expect(statut.statut).toBe('ACTIF');
  });

  it('un client en essai peut le rester à sa réactivation', async () => {
    await suspendreOrganisation(superadmin, d.organisation.id);
    await reactiverOrganisation(superadmin, d.organisation.id, 'ESSAI');
    const { statut } = await prisma().organisation.findUniqueOrThrow({
      where: { id: d.organisation.id },
    });
    expect(statut).toBe('ESSAI');
  });

  it('une réactivation tardive ne rétrograde pas un client déjà actif', async () => {
    await suspendreOrganisation(superadmin, d.organisation.id);
    await reactiverOrganisation(superadmin, d.organisation.id, 'ACTIF');
    const lignes = () => prisma().journalAudit.count({ where: { entiteType: 'ORGANISATION' } });
    const avant = await lignes();
    await reactiverOrganisation(superadmin, d.organisation.id, 'ESSAI');
    const { statut } = await prisma().organisation.findUniqueOrThrow({
      where: { id: d.organisation.id },
    });
    expect(statut).toBe('ACTIF');
    expect(await lignes()).toBe(avant);
  });

  it('refuse de réactiver vers un statut inconnu', async () => {
    await suspendreOrganisation(superadmin, d.organisation.id);
    await expect(
      reactiverOrganisation(superadmin, d.organisation.id, 'SUSPENDU'),
    ).rejects.toBeInstanceOf(ErreurSaisie);
  });

  it('ne journalise pas un changement sans effet', async () => {
    await suspendreOrganisation(superadmin, d.organisation.id);
    await suspendreOrganisation(superadmin, d.organisation.id);
    expect(await prisma().journalAudit.count({ where: { entiteType: 'ORGANISATION' } })).toBe(1);
  });

  it('refuse un client inconnu', async () => {
    await expect(
      suspendreOrganisation(superadmin, '019a3000-0000-7000-8000-00000000ffff'),
    ).rejects.toBeInstanceOf(AccesRefuseError);
  });
});
