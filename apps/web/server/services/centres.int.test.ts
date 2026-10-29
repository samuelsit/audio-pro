import { beforeEach, describe, expect, it } from 'vitest';

import { creerJeuDeDonnees, viderBase, type JeuDeDonnees } from '@/test/donnees';

import { AccesRefuseError } from '../auth/acces';
import { ErreurSaisie } from '../erreurs';
import { creerCentre, listerCentres, modifierCentre, obtenirCentre } from './centres';

let d: JeuDeDonnees;

beforeEach(async () => {
  await viderBase();
  d = await creerJeuDeDonnees();
});

const saisie = (surcharge: object = {}) => ({
  nom: 'Centre D',
  adresseLigne1: '4 place Fictive',
  adresseLigne2: '',
  codePostal: '69000',
  ville: 'Lyon',
  finess: '69 000 0000',
  numeroFacturationAm: '',
  email: 'd@exemple.test',
  telephone: '04 00 00 00 04',
  actif: true,
  ...surcharge,
});

describe('creerCentre / modifierCentre', () => {
  it('crée puis modifie un centre', async () => {
    const id = await creerCentre(d.acteurs.admin, saisie());
    expect(await obtenirCentre(d.acteurs.admin, id)).toMatchObject({
      nom: 'Centre D',
      finess: '690000000',
      numeroFacturationAm: null,
      telephone: '0400000004',
    });

    await modifierCentre(d.acteurs.admin, id, saisie({ finess: '', actif: false }));
    expect(await obtenirCentre(d.acteurs.admin, id)).toMatchObject({ finess: null, actif: false });
    const tous = await listerCentres(d.acteurs.admin, { type: 'tous' });
    expect(tous.map((c) => c.nom)).toContain('Centre D');
  });

  it.each([
    {
      cas: 'nom déjà pris',
      surcharge: { nom: 'Centre A' },
      champ: 'nom',
      message: 'Un centre porte déjà ce nom.',
    },
    {
      cas: 'code postal invalide',
      surcharge: { codePostal: '690' },
      champ: 'codePostal',
      message: 'Le code postal doit comporter 5 chiffres.',
    },
  ])('refuse : $cas', async ({ surcharge, champ, message }) => {
    const erreur = await creerCentre(d.acteurs.admin, saisie(surcharge)).catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(ErreurSaisie);
    expect((erreur as ErreurSaisie).erreurs[champ]).toEqual([message]);
  });

  it('refuse un FINESS déjà utilisé', async () => {
    await creerCentre(d.acteurs.admin, saisie());
    const erreur = await creerCentre(d.acteurs.admin, saisie({ nom: 'Centre E' })).catch(
      (e: unknown) => e,
    );
    expect((erreur as ErreurSaisie).erreurs.finess).toEqual([
      'Ce numéro FINESS est déjà utilisé par un autre centre.',
    ]);
  });

  it('est réservé à l’ADMIN', async () => {
    await expect(creerCentre(d.acteurs.audioAB, saisie())).rejects.toThrow(AccesRefuseError);
    await expect(modifierCentre(d.acteurs.assistantA, d.centres.a.id, saisie())).rejects.toThrow(
      AccesRefuseError,
    );
  });

  it('un non-ADMIN ne voit pas un centre inactif auquel il est rattaché', async () => {
    await expect(obtenirCentre(d.acteurs.admin, d.centres.ferme.id)).resolves.toBeDefined();
    const assistant = { ...d.acteurs.assistantA, centreIds: [d.centres.ferme.id] };
    await expect(obtenirCentre(assistant, d.centres.ferme.id)).rejects.toThrow(AccesRefuseError);
  });
});
