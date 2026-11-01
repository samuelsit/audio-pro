import { generateKeyPairSync } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  chargerSignatureCaisse,
  FakeSignatureCaisse,
  SignatureCaisseEd25519,
} from './signature-caisse';

function nouvelleCle(type: 'ed25519' | 'x25519' = 'ed25519'): string {
  const { privateKey } = generateKeyPairSync(type as 'ed25519');
  return privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
}

describe('SignatureCaisseEd25519', () => {
  const signature = new SignatureCaisseEd25519(nouvelleCle());

  it('signe et vérifie', () => {
    const signee = signature.signer('empreinte');
    expect(signature.verifier('empreinte', signee, signature.cleId)).toBe(true);
  });

  it('refuse un message modifié', () => {
    expect(signature.verifier('autre', signature.signer('empreinte'), signature.cleId)).toBe(false);
  });

  it('refuse une clé inconnue', () => {
    expect(signature.verifier('m', signature.signer('m'), 'inconnue')).toBe(false);
  });

  it('refuse la signature d’une autre clé : recalculer la chaîne ne suffit pas', () => {
    const autre = new SignatureCaisseEd25519(nouvelleCle());
    expect(signature.verifier('m', autre.signer('m'), signature.cleId)).toBe(false);
  });

  it('après une rotation, vérifie encore ce que l’ancienne clé a signé', () => {
    const nouvelle = new SignatureCaisseEd25519(nouvelleCle(), [signature.clePublique]);
    expect(nouvelle.cleId).not.toBe(signature.cleId);
    expect(nouvelle.verifier('m', signature.signer('m'), signature.cleId)).toBe(true);
  });

  it('refuse une clé qui n’est pas Ed25519', () => {
    expect(() => new SignatureCaisseEd25519(nouvelleCle('x25519'))).toThrow(/Ed25519/);
  });
});

describe('FakeSignatureCaisse', () => {
  const signature = new FakeSignatureCaisse();

  it('signe et vérifie', () => {
    expect(signature.verifier('m', signature.signer('m'), 'simulation')).toBe(true);
    expect(signature.verifier('n', signature.signer('m'), 'simulation')).toBe(false);
    expect(signature.verifier('m', signature.signer('m'), 'autre')).toBe(false);
  });
});

describe('chargerSignatureCaisse', () => {
  it('prend la clé de l’environnement', () => {
    expect(
      chargerSignatureCaisse({
        CAISSE_SIGNATURE_CLE_PRIVEE: nouvelleCle(),
        CAISSE_SIGNATURE_CLES_ANCIENNES: '',
      }),
    ).toBeInstanceOf(SignatureCaisseEd25519);
  });

  it('simule hors production, refuse en production', () => {
    expect(chargerSignatureCaisse({})).toBeInstanceOf(FakeSignatureCaisse);
    expect(() => chargerSignatureCaisse({ NODE_ENV: 'production' })).toThrow(/manquante/);
  });
});
