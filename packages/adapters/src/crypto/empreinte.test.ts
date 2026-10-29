import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { ErreurConfigurationChiffrement } from './chiffreur';
import { chargerCleEmpreinte, EmpreinteHmac } from './empreinte';

const CLE = randomBytes(32);

describe('EmpreinteHmac', () => {
  const empreinte = new EmpreinteHmac(CLE);

  it('est déterministe et hexadécimale', () => {
    const a = empreinte.calculer('1850578006048', 'patient.nir');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(empreinte.calculer('1850578006048', 'patient.nir')).toBe(a);
    expect(a).not.toContain('1850578006048');
  });

  it('change avec la valeur, le contexte et la clé', () => {
    const a = empreinte.calculer('1850578006048', 'patient.nir');
    expect(empreinte.calculer('1850578006049', 'patient.nir')).not.toBe(a);
    expect(empreinte.calculer('1850578006048', 'autre.nir')).not.toBe(a);
    expect(new EmpreinteHmac(randomBytes(32)).calculer('1850578006048', 'patient.nir')).not.toBe(a);
  });

  it('refuse une clé qui ne fait pas 32 octets', () => {
    expect(() => new EmpreinteHmac(randomBytes(16))).toThrow(ErreurConfigurationChiffrement);
  });
});

describe('chargerCleEmpreinte', () => {
  it('lit la clé base64', () => {
    expect(chargerCleEmpreinte({ EMPREINTE_CLE: ` ${CLE.toString('base64')} ` })).toEqual(CLE);
  });

  it.each([
    { cas: 'absente', env: {}, message: 'EMPREINTE_CLE n’est pas défini (voir .env.example).' },
    {
      cas: 'vide',
      env: { EMPREINTE_CLE: ' ' },
      message: 'EMPREINTE_CLE n’est pas défini (voir .env.example).',
    },
    {
      cas: 'trop courte',
      env: { EMPREINTE_CLE: randomBytes(16).toString('base64') },
      message: 'EMPREINTE_CLE invalide : format attendu une clé de 32 octets en base64.',
    },
  ])('refuse une clé $cas', ({ env, message }) => {
    expect(() => chargerCleEmpreinte(env)).toThrow(message);
  });

  it('ne cite pas la clé dans le message', () => {
    const invalide = 'secret-a-ne-pas-afficher';
    expect(() => chargerCleEmpreinte({ EMPREINTE_CLE: invalide })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining(invalide) as unknown }),
    );
  });
});
