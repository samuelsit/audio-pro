import { prisma } from '@ha/db/admin';
import { AucunCentreAccessibleError } from '@ha/domain';
import { beforeEach, describe, expect, it } from 'vitest';

import { creerJeuDeDonnees, viderBase, type JeuDeDonnees } from '@/test/donnees';

import { listerCentres, obtenirCentre } from '../services/centres';
import { listerPraticiens } from '../services/praticiens';
import { listerUtilisateurs, obtenirUtilisateur } from '../services/utilisateurs';
import {
  AccesRefuseError,
  chargerUtilisateurConnecte,
  resoudrePerimetreActeur,
  verifierAccesCentre,
} from './acces';

let d: JeuDeDonnees;

beforeEach(async () => {
  await viderBase();
  d = await creerJeuDeDonnees();
});

describe('un ASSISTANT du centre A ne voit rien du centre B', () => {
  it('n’est rattaché qu’au centre A', () => {
    expect(d.acteurs.assistantA.centreIds).toEqual([d.centres.a.id]);
  });

  it.each([
    { cas: 'cookie absent', choix: undefined },
    { cas: 'cookie forgé vers B', choix: 'B' },
    { cas: 'cookie forgé « tous »', choix: 'tous' },
    { cas: 'cookie forgé vers un id inconnu', choix: 'inconnu' },
  ])('$cas → périmètre limité au centre A', async ({ choix }) => {
    const valeur = choix === 'B' ? d.centres.b.id : choix;
    const { perimetre, centres } = await resoudrePerimetreActeur(d.acteurs.assistantA, valeur);
    expect(perimetre).toEqual({ type: 'centre', centreId: d.centres.a.id });
    expect(centres.map((c) => c.nom)).toEqual(['Centre A']);
  });

  it('refuse l’accès direct au centre B', async () => {
    expect(() => verifierAccesCentre(d.acteurs.assistantA, d.centres.b.id)).toThrow(
      AccesRefuseError,
    );
    await expect(obtenirCentre(d.acteurs.assistantA, d.centres.b.id)).rejects.toThrow(
      AccesRefuseError,
    );
  });

  it.each([
    {
      cas: 'centre B',
      perimetre: (j: JeuDeDonnees) => ({ type: 'centre', centreId: j.centres.b.id }) as const,
    },
    { cas: 'tous les centres', perimetre: () => ({ type: 'tous' }) as const },
  ])('refuse un périmètre forgé : $cas', async ({ perimetre }) => {
    const p = perimetre(d);
    await expect(listerCentres(d.acteurs.assistantA, p)).rejects.toThrow(AccesRefuseError);
    await expect(listerUtilisateurs(d.acteurs.assistantA, p)).rejects.toThrow(AccesRefuseError);
    await expect(listerPraticiens(d.acteurs.assistantA, p)).rejects.toThrow(AccesRefuseError);
  });

  it('ne liste que les données du centre A, sans révéler le centre B', async () => {
    const perimetreA = { type: 'centre', centreId: d.centres.a.id } as const;

    const centres = await listerCentres(d.acteurs.assistantA, perimetreA);
    expect(centres.map((c) => c.nom)).toEqual(['Centre A']);

    const utilisateurs = await listerUtilisateurs(d.acteurs.assistantA, perimetreA);
    expect(utilisateurs.map((u) => u.prenom).sort()).toEqual(['Assistanta', 'Audioab']);
    const audio = utilisateurs.find((u) => u.prenom === 'Audioab');
    expect(audio?.centres.map((c) => c.nom)).toEqual(['Centre A']);

    const praticiens = await listerPraticiens(d.acteurs.assistantA, perimetreA);
    expect(praticiens.map((p) => p.prenom)).toEqual(['Audioab']);
    expect(praticiens[0]?.centres.map((c) => c.nom)).toEqual(['Centre A']);

    const toutCeQuiEstVu = JSON.stringify({ centres, utilisateurs, praticiens });
    expect(toutCeQuiEstVu).not.toContain(d.centres.b.id);
    expect(toutCeQuiEstVu).not.toContain('Centre B');
    expect(toutCeQuiEstVu).not.toContain('Assistantb');
  });

  it('n’a pas accès aux fiches d’administration', async () => {
    await expect(
      obtenirUtilisateur(d.acteurs.assistantA, d.utilisateurs.assistantB.id),
    ).rejects.toThrow(AccesRefuseError);
  });
});

describe('ADMIN_CLIENT et « Tous mes centres »', () => {
  it('voit les centres A, B et C (et les centres inactifs)', async () => {
    const { perimetre, centres } = await resoudrePerimetreActeur(d.acteurs.admin, 'tous');
    expect(perimetre).toEqual({ type: 'tous' });
    expect(centres.map((c) => c.nom)).toEqual(['Centre A', 'Centre B', 'Centre C']);

    const tous = await listerCentres(d.acteurs.admin, perimetre);
    expect(tous.map((c) => c.nom)).toEqual(['Centre A', 'Centre B', 'Centre C', 'Centre Fermé']);
    expect(await listerPraticiens(d.acteurs.admin, perimetre)).toHaveLength(2);
    expect(await listerUtilisateurs(d.acteurs.admin, perimetre)).toHaveLength(6);
  });

  it('peut se restreindre à un centre', async () => {
    const { perimetre } = await resoudrePerimetreActeur(d.acteurs.admin, d.centres.c.id);
    const praticiens = await listerPraticiens(d.acteurs.admin, perimetre);
    expect(praticiens.map((p) => p.prenom)).toEqual(['Audioc']);
  });
});

describe('profil chargé depuis la base', () => {
  it('ignore les rattachements à un centre inactif', async () => {
    const u = await chargerUtilisateurConnecte(d.utilisateurs.assistantFerme.id);
    if (!u) {
      throw new Error('profil attendu');
    }
    expect(u.centreIds).toEqual([]);
    await expect(resoudrePerimetreActeur(u, undefined)).rejects.toThrow(AucunCentreAccessibleError);
  });

  it('renvoie null pour un compte désactivé ou inconnu', async () => {
    await prisma().utilisateur.update({
      where: { id: d.utilisateurs.assistantB.id },
      data: { actif: false },
    });
    expect(await chargerUtilisateurConnecte(d.utilisateurs.assistantB.id)).toBeNull();
    expect(await chargerUtilisateurConnecte('inconnu')).toBeNull();
  });

  it('un AUDIO rattaché à A et B peut passer de l’un à l’autre', async () => {
    const { perimetre, centres } = await resoudrePerimetreActeur(d.acteurs.audioAB, d.centres.b.id);
    expect(perimetre).toEqual({ type: 'centre', centreId: d.centres.b.id });
    expect(centres.map((c) => c.nom)).toEqual(['Centre A', 'Centre B']);
    const equipeB = await listerUtilisateurs(d.acteurs.audioAB, perimetre);
    expect(equipeB.map((u) => u.prenom).sort()).toEqual(['Assistantb', 'Audioab']);
  });
});
