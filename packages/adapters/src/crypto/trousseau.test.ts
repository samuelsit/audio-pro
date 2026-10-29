import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { ErreurConfigurationChiffrement } from './chiffreur';
import { chargerTrousseau } from './trousseau';

const CLE = randomBytes(32).toString('base64');
const AUTRE = randomBytes(32).toString('base64');

describe('chargerTrousseau', () => {
  it('lit plusieurs clés et la clé active', () => {
    const trousseau = chargerTrousseau({
      CHIFFREMENT_CLES: ` k2026a:${CLE} , k2026-b_2:${AUTRE} `,
      CHIFFREMENT_CLE_ACTIVE: ' k2026-b_2 ',
    });
    expect(trousseau.idActif).toBe('k2026-b_2');
    expect([...trousseau.cles.keys()]).toEqual(['k2026a', 'k2026-b_2']);
    expect(trousseau.cles.get('k2026a')).toEqual(Buffer.from(CLE, 'base64'));
  });

  it.each([
    {
      cas: 'clés absentes',
      env: { CHIFFREMENT_CLE_ACTIVE: 'a' },
      message: 'CHIFFREMENT_CLES n’est pas défini (voir .env.example).',
    },
    {
      cas: 'clés vides',
      env: { CHIFFREMENT_CLES: '  ', CHIFFREMENT_CLE_ACTIVE: 'a' },
      message: 'CHIFFREMENT_CLES est vide (voir .env.example).',
    },
    {
      cas: 'clé active absente',
      env: { CHIFFREMENT_CLES: `a:${CLE}` },
      message: 'CHIFFREMENT_CLE_ACTIVE n’est pas défini (voir .env.example).',
    },
    {
      cas: 'clé active vide',
      env: { CHIFFREMENT_CLES: `a:${CLE}`, CHIFFREMENT_CLE_ACTIVE: '' },
      message: 'CHIFFREMENT_CLE_ACTIVE est vide (voir .env.example).',
    },
    {
      cas: 'clé trop courte (16 octets)',
      env: {
        CHIFFREMENT_CLES: `a:${randomBytes(16).toString('base64')}`,
        CHIFFREMENT_CLE_ACTIVE: 'a',
      },
      message:
        'Entrée n° 1 de CHIFFREMENT_CLES invalide : format attendu <identifiant>:<clé de 32 octets en base64>.',
    },
    {
      cas: 'identifiant avec un point',
      env: { CHIFFREMENT_CLES: `a:${CLE},b.1:${AUTRE}`, CHIFFREMENT_CLE_ACTIVE: 'a' },
      message:
        'Entrée n° 2 de CHIFFREMENT_CLES invalide : format attendu <identifiant>:<clé de 32 octets en base64>.',
    },
    {
      cas: 'séparateur en trop',
      env: { CHIFFREMENT_CLES: `a:${CLE}:x`, CHIFFREMENT_CLE_ACTIVE: 'a' },
      message:
        'Entrée n° 1 de CHIFFREMENT_CLES invalide : format attendu <identifiant>:<clé de 32 octets en base64>.',
    },
    {
      cas: 'identifiant seul',
      env: { CHIFFREMENT_CLES: 'a', CHIFFREMENT_CLE_ACTIVE: 'a' },
      message:
        'Entrée n° 1 de CHIFFREMENT_CLES invalide : format attendu <identifiant>:<clé de 32 octets en base64>.',
    },
    {
      cas: 'identifiant en double',
      env: { CHIFFREMENT_CLES: `a:${CLE},a:${AUTRE}`, CHIFFREMENT_CLE_ACTIVE: 'a' },
      message: 'Identifiant de clé en double : « a ».',
    },
    {
      cas: 'clé active inconnue',
      env: { CHIFFREMENT_CLES: `a:${CLE}`, CHIFFREMENT_CLE_ACTIVE: 'b' },
      message: 'CHIFFREMENT_CLE_ACTIVE (« b ») ne correspond à aucune clé de CHIFFREMENT_CLES.',
    },
  ])('refuse : $cas', ({ env, message }) => {
    let erreur: unknown;
    try {
      chargerTrousseau(env);
    } catch (e) {
      erreur = e;
    }
    expect(erreur).toBeInstanceOf(ErreurConfigurationChiffrement);
    expect((erreur as Error).message).toBe(message);
    expect((erreur as Error).message).not.toContain(CLE);
  });
});
