import { prisma } from '@ha/db';
import { beforeEach, describe, expect, it } from 'vitest';

import { creerJeuDeDonnees, viderBase, type JeuDeDonnees } from '@/test/donnees';

import { AccesRefuseError } from '../auth/acces';
import { ErreurSaisie } from '../erreurs';
import {
  creerAccessoire,
  creerFabricant,
  creerModele,
  ErreurImportCsv,
  importerAccessoiresCsv,
  importerModelesCsv,
  listerAccessoires,
  listerFabricants,
  listerModeles,
  modifierAccessoire,
  modifierFabricant,
  modifierModele,
  obtenirAccessoire,
  obtenirFabricant,
  obtenirModele,
} from './catalogue';

let d: JeuDeDonnees;
let fabricantId: string;

const ENTETE_MODELES = 'fabricant;gamme;nom;type;classe;codes_lpp;prix_conseille;actif';
const ENTETE_ACCESSOIRES = 'nom;nature;code_lpp;prix;actif';

beforeEach(async () => {
  await viderBase();
  d = await creerJeuDeDonnees();
  await prisma().lppCode.createMany({
    data: [{ code: '2351057' }, { code: '2365119' }, { code: '2332976' }],
  });
  fabricantId = await creerFabricant(d.acteurs.admin, { nom: 'Acoustia', actif: true });
});

function modele(champs: Readonly<Record<string, unknown>> = {}) {
  return {
    fabricantId,
    gamme: 'Aurore',
    nom: 'Aurore 3',
    type: 'RIC',
    classe: 'CLASSE_I',
    codesLpp: '2351057 2365119',
    prixConseilleCentimes: '950,00',
    actif: true,
    ...champs,
  };
}

const ACCESSOIRE = {
  nom: 'Piles 13',
  nature: 'PILE',
  codeLpp: '2332976',
  prixCentimes: '1,50',
  actif: true,
};

async function erreurDe(promesse: Promise<unknown>): Promise<ErreurSaisie> {
  const erreur = await promesse.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(erreur).toBeInstanceOf(ErreurSaisie);
  return erreur as ErreurSaisie;
}

async function erreursCsv(promesse: Promise<unknown>) {
  const erreur = await promesse.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(erreur).toBeInstanceOf(ErreurImportCsv);
  return (erreur as ErreurImportCsv).erreurs;
}

describe('fabricants', () => {
  it('crée, modifie, journalise', async () => {
    await modifierFabricant(d.acteurs.admin, fabricantId, { nom: 'Acoustia France', actif: true });
    expect(await obtenirFabricant(d.acteurs.audioAB, fabricantId)).toMatchObject({
      nom: 'Acoustia France',
    });
    expect(
      await prisma().journalAudit.count({
        where: { entiteType: 'FABRICANT', entiteId: fabricantId },
      }),
    ).toBe(2);
  });

  it('refuse un nom en double', async () => {
    const erreur = await erreurDe(
      creerFabricant(d.acteurs.admin, { nom: 'Acoustia', actif: true }),
    );
    expect(erreur.erreurs['nom']).toEqual(['Ce fabricant existe déjà.']);

    const autre = await creerFabricant(d.acteurs.admin, { nom: 'Sonora', actif: true });
    const encore = await erreurDe(
      modifierFabricant(d.acteurs.admin, autre, { nom: 'Acoustia', actif: true }),
    );
    expect(encore.erreurs['nom']).toBeDefined();
  });

  it('masque les fabricants inactifs hors ADMIN', async () => {
    await modifierFabricant(d.acteurs.admin, fabricantId, { nom: 'Acoustia', actif: false });
    expect(await listerFabricants(d.acteurs.audioAB)).toEqual([]);
    expect(await listerFabricants(d.acteurs.admin)).toHaveLength(1);
  });

  it('écriture réservée à l’ADMIN, lecture cloisonnée', async () => {
    await expect(creerFabricant(d.acteurs.audioAB, { nom: 'Sonora', actif: true })).rejects.toThrow(
      AccesRefuseError,
    );
    await expect(
      modifierFabricant(d.acteurs.assistantA, fabricantId, { nom: 'x', actif: true }),
    ).rejects.toThrow(AccesRefuseError);
    await expect(obtenirFabricant(d.acteurs.admin, 'inconnu')).rejects.toThrow(AccesRefuseError);
  });
});

describe('modèles', () => {
  it('crée un modèle avec ses codes LPP et son prix en centimes', async () => {
    const id = await creerModele(d.acteurs.admin, modele());
    expect(await obtenirModele(d.acteurs.assistantA, id)).toMatchObject({
      fabricant: 'Acoustia',
      gamme: 'Aurore',
      nom: 'Aurore 3',
      type: 'RIC',
      classe: 'CLASSE_I',
      codesLpp: ['2351057', '2365119'],
      prixConseilleCentimes: 95_000,
      actif: true,
    });
  });

  it('modifie les codes et le prix, journalise les différences', async () => {
    const id = await creerModele(d.acteurs.admin, modele());

    await modifierModele(
      d.acteurs.admin,
      id,
      modele({ codesLpp: '2351057', prixConseilleCentimes: '900' }),
    );

    expect(await obtenirModele(d.acteurs.admin, id)).toMatchObject({
      codesLpp: ['2351057'],
      prixConseilleCentimes: 90_000,
    });
    const ligne = await prisma().journalAudit.findFirstOrThrow({
      where: { entiteType: 'MODELE_AIDE_AUDITIVE', entiteId: id, action: 'UPDATE' },
    });
    expect(ligne.champs).toEqual([
      { champ: 'prixConseilleCentimes', masque: false, avant: 95_000, apres: 90_000 },
      { champ: 'codesLpp', masque: false, avant: ['2351057', '2365119'], apres: ['2351057'] },
    ]);
  });

  it.each([
    {
      cas: 'code LPP inconnu',
      champs: { codesLpp: '2351057 9999999' },
      champ: 'codesLpp',
      message: 'Code(s) LPP inconnu(s) : 9999999.',
    },
    {
      cas: 'fabricant inconnu',
      champs: { fabricantId: 'inconnu' },
      champ: 'fabricantId',
      message: 'Fabricant inconnu.',
    },
    {
      cas: 'prix invalide',
      champs: { prixConseilleCentimes: 'x' },
      champ: 'prixConseilleCentimes',
      message: 'Prix invalide (exemple : 1 490,00).',
    },
  ])('refuse : $cas', async ({ champs, champ, message }) => {
    const erreur = await erreurDe(creerModele(d.acteurs.admin, modele(champs)));
    expect(erreur.erreurs[champ]).toEqual([message]);
  });

  it('refuse le même modèle dans la même gamme', async () => {
    const id = await creerModele(d.acteurs.admin, modele());
    const erreur = await erreurDe(creerModele(d.acteurs.admin, modele()));
    expect(erreur.erreurs['nom']).toBeDefined();

    const autre = await creerModele(d.acteurs.admin, modele({ nom: 'Aurore 5' }));
    expect(autre).not.toBe(id);
    const encore = await erreurDe(modifierModele(d.acteurs.admin, autre, modele()));
    expect(encore.erreurs['nom']).toBeDefined();
  });

  it('écriture réservée à l’ADMIN, inactifs masqués hors ADMIN', async () => {
    await expect(creerModele(d.acteurs.audioAB, modele())).rejects.toThrow(AccesRefuseError);
    const id = await creerModele(d.acteurs.admin, modele({ actif: false }));
    await expect(modifierModele(d.acteurs.audioAB, id, modele())).rejects.toThrow(AccesRefuseError);
    expect(await listerModeles(d.acteurs.audioAB)).toEqual([]);
    expect(await listerModeles(d.acteurs.admin)).toHaveLength(1);
    await expect(obtenirModele(d.acteurs.admin, 'inconnu')).rejects.toThrow(AccesRefuseError);
  });
});

describe('accessoires', () => {
  it('crée et modifie', async () => {
    const id = await creerAccessoire(d.acteurs.admin, ACCESSOIRE);
    await modifierAccessoire(d.acteurs.admin, id, {
      ...ACCESSOIRE,
      codeLpp: '',
      prixCentimes: '2',
    });
    expect(await obtenirAccessoire(d.acteurs.assistantA, id)).toMatchObject({
      codeLpp: null,
      prixCentimes: 200,
    });
  });

  it('refuse un code inconnu et un nom en double', async () => {
    const inconnu = await erreurDe(
      creerAccessoire(d.acteurs.admin, { ...ACCESSOIRE, codeLpp: '9999999' }),
    );
    expect(inconnu.erreurs['codeLpp']).toBeDefined();

    const id = await creerAccessoire(d.acteurs.admin, ACCESSOIRE);
    const doublon = await erreurDe(creerAccessoire(d.acteurs.admin, ACCESSOIRE));
    expect(doublon.erreurs['nom']).toBeDefined();

    const autre = await creerAccessoire(d.acteurs.admin, { ...ACCESSOIRE, nom: 'Piles 312' });
    expect(autre).not.toBe(id);
    const encore = await erreurDe(modifierAccessoire(d.acteurs.admin, autre, ACCESSOIRE));
    expect(encore.erreurs['nom']).toBeDefined();
  });

  it('écriture réservée à l’ADMIN, inactifs masqués hors ADMIN', async () => {
    await expect(creerAccessoire(d.acteurs.audioAB, ACCESSOIRE)).rejects.toThrow(AccesRefuseError);
    const id = await creerAccessoire(d.acteurs.admin, { ...ACCESSOIRE, actif: false });
    await expect(modifierAccessoire(d.acteurs.audioAB, id, ACCESSOIRE)).rejects.toThrow(
      AccesRefuseError,
    );
    expect(await listerAccessoires(d.acteurs.audioAB)).toEqual([]);
    expect(await listerAccessoires(d.acteurs.admin)).toHaveLength(1);
    await expect(obtenirAccessoire(d.acteurs.admin, 'inconnu')).rejects.toThrow(AccesRefuseError);
  });
});

describe('import CSV des modèles', () => {
  const fichier = (...lignes: readonly string[]) => [ENTETE_MODELES, ...lignes].join('\n');

  it('crée et met à jour par fabricant, gamme et nom', async () => {
    const id = await creerModele(d.acteurs.admin, modele());

    const bilan = await importerModelesCsv(
      d.acteurs.admin,
      fichier(
        'Acoustia;Aurore;Aurore 3;RIC;I;2351057;"1 000,00";oui',
        'Acoustia;Aurore;Aurore 5;contour;II;;1500;non',
      ),
    );

    expect(bilan).toEqual({ crees: 1, modifies: 1 });
    expect(await obtenirModele(d.acteurs.admin, id)).toMatchObject({
      codesLpp: ['2351057'],
      prixConseilleCentimes: 100_000,
    });
    const modeles = await listerModeles(d.acteurs.admin);
    expect(modeles.find((m) => m.nom === 'Aurore 5')).toMatchObject({
      type: 'CONTOUR',
      classe: 'CLASSE_II',
      actif: false,
    });
    const ligne = await prisma().journalAudit.findFirstOrThrow({
      where: { entiteType: 'MODELE_AIDE_AUDITIVE', details: { path: ['importCsv'], equals: true } },
    });
    expect(ligne.details).toEqual({ importCsv: true, lignes: 2, crees: 1 });
  });

  it('un second import identique ne crée rien', async () => {
    const texte = fichier('Acoustia;Aurore;Aurore 3;RIC;I;2351057;950;oui');
    await importerModelesCsv(d.acteurs.admin, texte);
    expect(await importerModelesCsv(d.acteurs.admin, texte)).toEqual({ crees: 0, modifies: 1 });
    expect(await listerModeles(d.acteurs.admin)).toHaveLength(1);
  });

  it('tout ou rien : une ligne en erreur annule tout le fichier', async () => {
    const erreurs = await erreursCsv(
      importerModelesCsv(
        d.acteurs.admin,
        fichier(
          'Acoustia;Aurore;Aurore 3;RIC;I;2351057;950;oui',
          'Inconnu;Aurore;Aurore 5;RIC;I;9999999;950;oui',
          'Acoustia;Aurore;Aurore 3;RIC;I;2351057;950;oui',
        ),
      ),
    );
    expect(erreurs).toEqual([
      { ligne: 3, message: 'Fabricant inconnu : Inconnu.' },
      { ligne: 3, message: 'Code LPP inconnu : 9999999.' },
      { ligne: 4, message: 'Même clé qu’à la ligne 2.' },
    ]);
    expect(await listerModeles(d.acteurs.admin)).toEqual([]);
  });

  it('remonte les erreurs de format', async () => {
    const erreurs = await erreursCsv(importerModelesCsv(d.acteurs.admin, 'mauvais;entete\n'));
    expect(erreurs[0]?.message).toContain('En-tête attendu');
  });

  it('réservé à l’ADMIN', async () => {
    await expect(importerModelesCsv(d.acteurs.audioAB, fichier())).rejects.toThrow(
      AccesRefuseError,
    );
  });
});

describe('import CSV des accessoires', () => {
  const fichier = (...lignes: readonly string[]) => [ENTETE_ACCESSOIRES, ...lignes].join('\n');

  it('crée et met à jour par nom', async () => {
    const id = await creerAccessoire(d.acteurs.admin, ACCESSOIRE);

    const bilan = await importerAccessoiresCsv(
      d.acteurs.admin,
      fichier('Piles 13;piles;2332976;1,75;oui', 'Cordon;accessoire;;12;oui'),
    );

    expect(bilan).toEqual({ crees: 1, modifies: 1 });
    expect((await obtenirAccessoire(d.acteurs.admin, id)).prixCentimes).toBe(175);
    expect(await listerAccessoires(d.acteurs.admin)).toHaveLength(2);
  });

  it('tout ou rien', async () => {
    const erreurs = await erreursCsv(
      importerAccessoiresCsv(
        d.acteurs.admin,
        fichier(
          'Cordon;accessoire;;12;oui',
          'Piles 13;piles;9999999;1,75;oui',
          'Cordon;accessoire;;12;oui',
        ),
      ),
    );
    expect(erreurs).toEqual([
      { ligne: 3, message: 'Code LPP inconnu : 9999999.' },
      { ligne: 4, message: 'Même clé qu’à la ligne 2.' },
    ]);
    expect(await listerAccessoires(d.acteurs.admin)).toEqual([]);
  });

  it('réservé à l’ADMIN', async () => {
    await expect(importerAccessoiresCsv(d.acteurs.assistantA, fichier())).rejects.toThrow(
      AccesRefuseError,
    );
  });
});
