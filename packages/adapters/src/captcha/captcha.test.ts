import { solveChallenge, type Challenge } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2';
import { describe, expect, it } from 'vitest';

import { AltchaCaptcha } from './altcha-captcha';
import { FakeCaptcha, REPONSE_CAPTCHA_SIMULEE } from './fake-captcha';

function encoder(valeur: unknown): string {
  return Buffer.from(JSON.stringify(valeur)).toString('base64');
}

async function resoudre(defi: string): Promise<{ challenge: Challenge; reponse: string }> {
  const challenge = JSON.parse(defi) as Challenge;
  const solution = await solveChallenge({ challenge, deriveKey });
  return { challenge, reponse: encoder({ challenge, solution }) };
}

describe('AltchaCaptcha', () => {
  const captcha = new AltchaCaptcha('secret-de-test');

  it('accepte la solution d’un défi qu’il a émis', async () => {
    const { reponse } = await resoudre(await captcha.creerDefi());
    await expect(captcha.verifier(reponse)).resolves.toBe(true);
  });

  it('refuse un défi signé par une autre clé', async () => {
    const { reponse } = await resoudre(await new AltchaCaptcha('autre').creerDefi());
    await expect(captcha.verifier(reponse)).resolves.toBe(false);
  });

  it.each([
    { cas: 'charabia', reponse: 'pas du base64 !' },
    { cas: 'objet vide', reponse: encoder({}) },
    { cas: 'chaîne vide', reponse: '' },
  ])('refuse sans lever d’erreur : $cas', async ({ reponse }) => {
    await expect(captcha.verifier(reponse)).resolves.toBe(false);
  });
});

describe('FakeCaptcha', () => {
  it('n’accepte que les réponses simulées', async () => {
    const captcha = new FakeCaptcha();
    expect(await captcha.creerDefi()).toContain('simulation');
    await expect(captcha.verifier(`${REPONSE_CAPTCHA_SIMULEE}-1`)).resolves.toBe(true);
    await expect(captcha.verifier('autre')).resolves.toBe(false);
  });
});
