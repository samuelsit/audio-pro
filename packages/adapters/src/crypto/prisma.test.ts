import { describe, expect, it, vi } from 'vitest';

import type { Chiffreur } from './chiffreur';
import { ErreurChampChiffre, extensionChampsChiffres, gestionnaireChampsChiffres } from './prisma';

// Chiffreur lisible pour vérifier ce que reçoit la base : « chiffré(contexte)[clair] ».
const chiffreurTemoin: Chiffreur = {
  chiffrer: (clair, contexte) => `chiffré(${contexte})[${clair}]`,
  dechiffrer: (enveloppe, contexte) => {
    const prefixe = `chiffré(${contexte})[`;
    if (!enveloppe.startsWith(prefixe)) {
      throw new Error('contexte inattendu');
    }
    return enveloppe.slice(prefixe.length, -1);
  },
};

const CONFIG = { Patient: { nir: 'patient.nir', note: 'patient.note' } };
const gerer = gestionnaireChampsChiffres(chiffreurTemoin, CONFIG);

/** Exécute une opération ; la « base » renvoie `reponse` et on capture les arguments reçus. */
async function executer(operation: string, args: unknown, reponse: unknown, model = 'Patient') {
  const query = vi.fn<(args: unknown) => Promise<unknown>>(async () => reponse);
  const resultat = await gerer({ model, operation, args, query });
  return { resultat, recu: query.mock.calls[0]?.[0] };
}

const enBase = (clair: string, champ = 'nir') => `chiffré(patient.${champ})[${clair}]`;

describe('écritures', () => {
  it.each([
    {
      operation: 'create',
      args: { data: { nom: 'Fictif', nir: '1850578006084', note: null } },
      attendu: { data: { nom: 'Fictif', nir: enBase('1850578006084'), note: null } },
    },
    {
      operation: 'update',
      args: { where: { id: '1' }, data: { nir: { set: '2' }, note: { set: null } } },
      attendu: { where: { id: '1' }, data: { nir: { set: enBase('2') }, note: { set: null } } },
    },
    {
      operation: 'updateMany',
      args: { where: { id: '1' }, data: { note: 'n' } },
      attendu: { where: { id: '1' }, data: { note: enBase('n', 'note') } },
    },
    {
      operation: 'createMany',
      args: { data: [{ nir: '1' }, { nom: 'sans nir' }] },
      attendu: { data: [{ nir: enBase('1') }, { nom: 'sans nir' }] },
    },
    {
      operation: 'upsert',
      args: { where: { id: '1' }, create: { nir: '1' }, update: { nir: '2' } },
      attendu: { where: { id: '1' }, create: { nir: enBase('1') }, update: { nir: enBase('2') } },
    },
  ])('$operation chiffre les champs configurés', async ({ operation, args, attendu }) => {
    const { recu } = await executer(operation, args, { count: 1 });
    expect(recu).toEqual(attendu);
  });

  it('ne modifie pas les arguments de l’appelant', async () => {
    const args = { data: { nir: '1' } };
    await executer('create', args, {});
    expect(args).toEqual({ data: { nir: '1' } });
  });

  it.each([{ nir: 12 }, { nir: { increment: 1 } }, { nir: true }])(
    'refuse une valeur non texte : %o',
    async (data) => {
      await expect(executer('create', { data }, {})).rejects.toThrow(
        new ErreurChampChiffre('Patient.nir : seule une valeur texte peut être chiffrée.'),
      );
    },
  );

  it('laisse passer une donnée qui n’est pas un objet', async () => {
    const { recu } = await executer('updateMany', { data: null }, { count: 0 });
    expect(recu).toEqual({ data: null });
  });
});

describe('lectures', () => {
  it.each([
    {
      operation: 'findUnique',
      reponse: { id: '1', nir: enBase('1') },
      attendu: { id: '1', nir: '1' },
    },
    { operation: 'findFirst', reponse: null, attendu: null },
    {
      operation: 'findMany',
      reponse: [
        { nir: enBase('1'), note: null },
        { nir: enBase('2'), note: enBase('n', 'note') },
      ],
      attendu: [
        { nir: '1', note: null },
        { nir: '2', note: 'n' },
      ],
    },
    { operation: 'create', reponse: { id: '1' }, attendu: { id: '1' } },
    { operation: 'count', reponse: 3, attendu: 3 },
    { operation: 'updateMany', reponse: { count: 2 }, attendu: { count: 2 } },
  ])('$operation', async ({ operation, reponse, attendu }) => {
    const { resultat } = await executer(operation, {}, reponse);
    expect(resultat).toEqual(attendu);
  });

  it('transmet tels quels les arguments non objets', async () => {
    const { recu } = await executer('findMany', undefined, []);
    expect(recu).toBeUndefined();
  });
});

describe('filtres et tris interdits sur un champ chiffré', () => {
  it.each([
    {
      cas: 'where',
      args: { where: { nir: '1' } },
      message: 'Patient.nir est chiffré : filtre impossible.',
    },
    {
      cas: 'where imbriqué (OR)',
      args: { where: { OR: [{ nom: 'a' }, { AND: { note: 'b' } }] } },
      message: 'Patient.note est chiffré : filtre impossible.',
    },
    {
      cas: 'cursor',
      args: { cursor: { nir: '1' } },
      message: 'Patient.nir est chiffré : filtre impossible.',
    },
    {
      cas: 'orderBy',
      args: { orderBy: [{ nom: 'asc' }, { nir: 'asc' }] },
      message: 'Patient.nir est chiffré : tri impossible.',
    },
    {
      cas: 'distinct',
      args: { distinct: ['nir'] },
      message: 'Patient.nir est chiffré : regroupement impossible.',
    },
    {
      cas: 'groupBy',
      args: { by: 'note' },
      message: 'Patient.note est chiffré : regroupement impossible.',
    },
  ])('$cas', async ({ args, message }) => {
    await expect(executer('findMany', args, [])).rejects.toThrow(message);
  });

  it('accepte les autres champs', async () => {
    const { recu } = await executer(
      'findMany',
      { where: { nom: 'a', NOT: { id: '1' } }, distinct: ['nom'] },
      [],
    );
    expect(recu).toEqual({ where: { nom: 'a', NOT: { id: '1' } }, distinct: ['nom'] });
  });
});

describe('modèles non configurés', () => {
  it.each([{ model: 'Centre' }, { model: undefined }])(
    'passent sans transformation ($model)',
    async ({ model }) => {
      const query = vi.fn<(args: unknown) => Promise<unknown>>(async () => ({ nir: 'clair' }));
      const args = { where: { nir: '1' }, data: { nir: '1' } };
      expect(
        await gerer({ ...(model ? { model } : {}), operation: 'update', args, query }),
      ).toEqual({
        nir: 'clair',
      });
      expect(query).toHaveBeenCalledWith(args);
    },
  );
});

describe('extensionChampsChiffres', () => {
  it('expose le gestionnaire sous $allModels.$allOperations', () => {
    const extension = extensionChampsChiffres(chiffreurTemoin, CONFIG);
    expect(extension.name).toBe('champs-chiffres');
    expect(typeof extension.query.$allModels.$allOperations).toBe('function');
  });
});
