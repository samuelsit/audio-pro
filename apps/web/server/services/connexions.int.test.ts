import { prisma } from '@ha/db/admin';
import { beforeEach, describe, expect, it } from 'vitest';

import { creerJeuDeDonnees, viderBase, type JeuDeDonnees } from '@/test/donnees';

import {
  journaliserConnexion,
  journaliserDeconnexion,
  journaliserEchecConnexion,
} from './connexions';

let d: JeuDeDonnees;

beforeEach(async () => {
  await viderBase();
  d = await creerJeuDeDonnees();
});

const lignes = () =>
  prisma().journalAudit.findMany({
    orderBy: { horodatage: 'asc' },
    select: {
      action: true,
      entiteType: true,
      utilisateurId: true,
      utilisateurLibelle: true,
      organisationId: true,
      details: true,
    },
  });

describe('journalisation des connexions', () => {
  it('connexion et déconnexion', async () => {
    await journaliserConnexion(d.acteurs.assistantA);
    await journaliserDeconnexion(d.acteurs.assistantA);
    expect(await lignes()).toEqual([
      expect.objectContaining({
        action: 'CONNEXION',
        entiteType: 'SESSION',
        utilisateurId: d.utilisateurs.assistantA.id,
      }),
      expect.objectContaining({
        action: 'DECONNEXION',
        utilisateurId: d.utilisateurs.assistantA.id,
      }),
    ]);
  });

  it.each([
    {
      cas: 'compte existant',
      email: 'assistanta@exemple.test',
      motif: 'IDENTIFIANTS' as const,
      attendu: () => ({
        utilisateurId: d.utilisateurs.assistantA.id,
        utilisateurLibelle: 'Assistanta Test <assistanta@exemple.test>',
        organisationId: d.organisation.id,
        details: { motif: 'E-mail ou mot de passe incorrect, ou compte désactivé' },
      }),
    },
    {
      cas: 'compte inconnu',
      email: 'inconnu@exemple.test',
      motif: 'IDENTIFIANTS' as const,
      attendu: () => ({
        utilisateurId: null,
        utilisateurLibelle: 'inconnu@exemple.test',
        organisationId: null,
      }),
    },
    {
      cas: 'second facteur',
      email: null,
      motif: 'CODE_2FA' as const,
      attendu: () => ({
        utilisateurId: null,
        utilisateurLibelle: 'Inconnu (second facteur)',
        details: { motif: 'Code de vérification en deux étapes invalide' },
      }),
    },
  ])('échec de connexion : $cas', async ({ email, motif, attendu }) => {
    await journaliserEchecConnexion(email, motif);
    expect(await lignes()).toEqual([
      expect.objectContaining({ action: 'ECHEC_CONNEXION', entiteType: 'SESSION', ...attendu() }),
    ]);
  });
});
