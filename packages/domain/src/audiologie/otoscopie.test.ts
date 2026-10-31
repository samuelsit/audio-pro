import { describe, expect, it } from 'vitest';

import { otoscopieSaisieSchema, verifierPhotoOtoscopie } from './otoscopie';

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff]);
const PDF = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d]);

describe('otoscopieSaisieSchema', () => {
  it.each([
    {
      cas: 'constat complet',
      saisie: { oreille: 'DROITE', conduit: 'LIBRE', tympan: 'NORMAL', observation: 'RAS' },
      valide: true,
    },
    {
      cas: 'sans observation',
      saisie: { oreille: 'GAUCHE', conduit: 'BOUCHON', tympan: 'NON_VISIBLE', observation: '' },
      valide: true,
    },
    {
      cas: 'état inconnu',
      saisie: { oreille: 'DROITE', conduit: 'PROPRE', tympan: 'NORMAL', observation: '' },
      valide: false,
    },
    {
      cas: 'observation trop longue',
      saisie: {
        oreille: 'DROITE',
        conduit: 'LIBRE',
        tympan: 'NORMAL',
        observation: 'x'.repeat(2001),
      },
      valide: false,
    },
  ])('$cas', ({ saisie, valide }) => {
    expect(otoscopieSaisieSchema.safeParse(saisie).success).toBe(valide);
  });
});

describe('verifierPhotoOtoscopie', () => {
  it.each([
    { cas: 'PNG', contenu: PNG, attendu: { valide: true, type: 'image/png' } },
    { cas: 'JPEG', contenu: JPEG, attendu: { valide: true, type: 'image/jpeg' } },
    {
      cas: 'PDF refusé',
      contenu: PDF,
      attendu: { valide: false, message: 'La photo doit être un JPEG ou un PNG.' },
    },
    {
      cas: 'vide',
      contenu: new Uint8Array(),
      attendu: { valide: false, message: 'La photo est vide.' },
    },
  ])('$cas', ({ contenu, attendu }) => {
    expect(verifierPhotoOtoscopie(contenu)).toEqual(attendu);
  });
});
