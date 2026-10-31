import { AltchaCaptcha, FakeCaptcha } from '@ha/adapters';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ContexteNonSecurise, resoudreDefi } from '@/lib/captcha-navigateur';

// Le code du navigateur (WebCrypto) face au vrai vérificateur du serveur : les E2E tournent en simulation.
describe('resoudreDefi', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('un cadre sur un site en HTTP n’a pas WebCrypto : il le dit, au lieu d’échouer en silence', async () => {
    const defi = await new AltchaCaptcha('secret-de-test').creerDefi();
    vi.stubGlobal('crypto', {});
    await expect(resoudreDefi(defi)).rejects.toBeInstanceOf(ContexteNonSecurise);
  });

  it('produit une réponse acceptée par ALTCHA, sans remontée en clair du secret', async () => {
    const captcha = new AltchaCaptcha('secret-de-test');
    const reponse = await resoudreDefi(await captcha.creerDefi());
    await expect(captcha.verifier(reponse)).resolves.toBe(true);
    expect(atob(reponse)).not.toContain('secret-de-test');
  });

  it('en simulation, chaque réponse est unique et acceptée', async () => {
    const captcha = new FakeCaptcha();
    const defi = await captcha.creerDefi();
    const [a, b] = await Promise.all([resoudreDefi(defi), resoudreDefi(defi)]);
    expect(a).not.toBe(b);
    await expect(captcha.verifier(a)).resolves.toBe(true);
  });
});
