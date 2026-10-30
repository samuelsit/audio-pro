import { prisma } from '@ha/db';
import { beforeEach, describe, expect, it } from 'vitest';

import { creerJeuDeDonnees, viderBase, type JeuDeDonnees } from '@/test/donnees';

import { AccesRefuseError } from '../auth/acces';
import { ErreurSaisie } from '../erreurs';
import {
  changerActivationPrescripteur,
  creerPrescripteur,
  listerPrescripteurs,
  modifierPrescripteur,
  obtenirPrescripteur,
  rechercherPrescripteurs,
} from './prescripteurs';

let d: JeuDeDonnees;

beforeEach(async () => {
  await viderBase();
  d = await creerJeuDeDonnees();
});

const ORL = {
  nom: 'Lefèvre-Château',
  prenom: 'Héloïse',
  rpps: '10000000001',
  specialite: 'ORL',
  cabinet: 'Cabinet ORL du Parc',
  contact: 'heloise.lefevre@mssante.exemple.test',
};
const GENERALISTE = {
  nom: 'Martin',
  prenom: 'Noé',
  rpps: '',
  specialite: 'MEDECIN_GENERALISTE',
  formationOtologie: 'oui',
};

async function erreurDe(promesse: Promise<unknown>): Promise<unknown> {
  return promesse.then(
    () => undefined,
    (e: unknown) => e,
  );
}

describe('creerPrescripteur', () => {
  it.each(['admin', 'audioAB', 'assistantA'] as const)('ouvert au rôle %s', async (cle) => {
    const p = await creerPrescripteur(d.acteurs[cle], ORL);
    expect(p).toMatchObject({ nom: 'Lefèvre-Château', rpps: '10000000001', actif: true });
    const ligne = await prisma().prescripteur.findUniqueOrThrow({ where: { id: p.id } });
    expect(ligne).toMatchObject({
      organisationId: d.organisation.id,
      nomRecherche: 'LEFEVRE CHATEAU',
      prenomRecherche: 'HELOISE',
    });
  });

  it('journalise la création', async () => {
    const p = await creerPrescripteur(d.acteurs.assistantA, ORL);
    const ligne = await prisma().journalAudit.findFirstOrThrow({
      where: { entiteType: 'PRESCRIPTEUR', entiteId: p.id },
    });
    expect(ligne.action).toBe('CREATE');
    expect(JSON.stringify(ligne.champs)).toContain('10000000001');
  });

  it('accepte une fiche sans RPPS, plusieurs fois', async () => {
    await creerPrescripteur(d.acteurs.audioAB, GENERALISTE);
    const autre = await creerPrescripteur(d.acteurs.audioAB, { ...GENERALISTE, nom: 'Durand' });
    expect(autre.rpps).toBeNull();
    expect(autre.formationOtologie).toBe(true);
  });

  it('refuse un RPPS déjà enregistré', async () => {
    await creerPrescripteur(d.acteurs.admin, ORL);
    const erreur = await erreurDe(creerPrescripteur(d.acteurs.admin, { ...ORL, nom: 'Autre' }));
    expect(erreur).toBeInstanceOf(ErreurSaisie);
    expect((erreur as ErreurSaisie).erreurs['rpps']).toEqual([
      'Ce numéro RPPS est déjà enregistré pour un autre prescripteur.',
    ]);
  });

  it('exige la formation d’un généraliste', async () => {
    const erreur = await erreurDe(
      creerPrescripteur(d.acteurs.admin, { ...GENERALISTE, formationOtologie: '' }),
    );
    expect((erreur as ErreurSaisie).erreurs['formationOtologie']).toBeDefined();
  });
});

describe('recherche de prescripteur', () => {
  beforeEach(async () => {
    await creerPrescripteur(d.acteurs.admin, ORL);
    await creerPrescripteur(d.acteurs.admin, GENERALISTE);
    await creerPrescripteur(d.acteurs.admin, {
      ...GENERALISTE,
      nom: 'Martinez',
      prenom: 'Inès',
      formationOtologie: 'non',
      rpps: '10000000002',
    });
  });

  it.each([
    { cas: 'nom sans accent ni casse', q: 'lefevre', attendu: ['Lefèvre-Château'] },
    { cas: 'nom composé, sans tiret', q: 'lefevre chateau', attendu: ['Lefèvre-Château'] },
    { cas: 'prénom accentué', q: 'héloïse', attendu: ['Lefèvre-Château'] },
    { cas: 'prénom puis nom', q: 'noe martin', attendu: ['Martin'] },
    { cas: 'début de nom', q: 'mart', attendu: ['Martin', 'Martinez'] },
    { cas: 'RPPS complet', q: '10000000002', attendu: ['Martinez'] },
    { cas: 'début de RPPS', q: '1000000', attendu: ['Lefèvre-Château', 'Martinez'] },
    { cas: 'aucun résultat', q: 'zzz', attendu: [] },
    { cas: 'recherche vide', q: '   ', attendu: [] },
  ])('$cas', async ({ q, attendu }) => {
    const resultats = await rechercherPrescripteurs(d.acteurs.assistantA, q);
    expect(resultats.map((p) => p.nom)).toEqual(attendu);
  });

  it('écarte un prescripteur désactivé', async () => {
    const [p] = await rechercherPrescripteurs(d.acteurs.admin, 'lefevre');
    await changerActivationPrescripteur(d.acteurs.admin, p?.id ?? '', false);
    expect(await rechercherPrescripteurs(d.acteurs.assistantA, 'lefevre')).toEqual([]);
  });

  it('est cloisonnée par organisation', async () => {
    const autre = await prisma().organisation.create({ data: { nom: 'Autre réseau' } });
    await prisma().prescripteur.create({
      data: {
        organisationId: autre.id,
        nom: 'Lefèvre',
        prenom: 'Sam',
        specialite: 'ORL',
        nomRecherche: 'LEFEVRE',
        prenomRecherche: 'SAM',
      },
    });
    const resultats = await rechercherPrescripteurs(d.acteurs.admin, 'lefevre');
    expect(resultats.map((p) => p.prenom)).toEqual(['Héloïse']);
  });

  it('la liste pagine et filtre ; les inactifs ne sont vus que par l’ADMIN', async () => {
    const { prescripteurs, pagination, q } = await listerPrescripteurs(d.acteurs.audioAB, {
      q: 'Mart',
    });
    expect(q).toBe('MART');
    expect(prescripteurs).toHaveLength(2);
    expect(pagination.total).toBe(2);

    const [inactif] = prescripteurs;
    await changerActivationPrescripteur(d.acteurs.admin, inactif?.id ?? '', false);
    expect((await listerPrescripteurs(d.acteurs.audioAB, {})).pagination.total).toBe(2);
    expect((await listerPrescripteurs(d.acteurs.admin, {})).pagination.total).toBe(3);
  });
});

describe('modifierPrescripteur', () => {
  it('l’ADMIN modifie la fiche et les formes de recherche', async () => {
    const { id } = await creerPrescripteur(d.acteurs.admin, ORL);

    await modifierPrescripteur(d.acteurs.admin, id, { ...ORL, nom: 'Renard' });

    expect(await obtenirPrescripteur(d.acteurs.audioAB, id)).toMatchObject({ nom: 'Renard' });
    expect((await rechercherPrescripteurs(d.acteurs.admin, 'renard')).length).toBe(1);
    const ligne = await prisma().journalAudit.findFirstOrThrow({
      where: { entiteType: 'PRESCRIPTEUR', entiteId: id, action: 'UPDATE' },
    });
    expect(ligne.champs).toEqual([
      { champ: 'nom', masque: false, avant: 'Lefèvre-Château', apres: 'Renard' },
    ]);
  });

  it('le changement de spécialité efface la formation', async () => {
    const { id } = await creerPrescripteur(d.acteurs.admin, GENERALISTE);
    await modifierPrescripteur(d.acteurs.admin, id, { ...GENERALISTE, specialite: 'ORL' });
    expect((await obtenirPrescripteur(d.acteurs.admin, id)).formationOtologie).toBeNull();
  });

  it('refuse un RPPS en doublon', async () => {
    await creerPrescripteur(d.acteurs.admin, ORL);
    const { id } = await creerPrescripteur(d.acteurs.admin, GENERALISTE);
    const erreur = await erreurDe(
      modifierPrescripteur(d.acteurs.admin, id, { ...GENERALISTE, rpps: ORL.rpps }),
    );
    expect((erreur as ErreurSaisie).erreurs['rpps']).toBeDefined();
  });

  it.each(['audioAB', 'assistantA'] as const)('refusé au rôle %s', async (cle) => {
    const { id } = await creerPrescripteur(d.acteurs.admin, ORL);
    await expect(modifierPrescripteur(d.acteurs[cle], id, ORL)).rejects.toThrow(AccesRefuseError);
    await expect(changerActivationPrescripteur(d.acteurs[cle], id, false)).rejects.toThrow(
      AccesRefuseError,
    );
  });

  it('ne donne pas accès à une fiche d’une autre organisation', async () => {
    await expect(obtenirPrescripteur(d.acteurs.admin, 'inconnu')).rejects.toThrow(AccesRefuseError);
  });
});
