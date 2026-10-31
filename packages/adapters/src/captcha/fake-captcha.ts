import type { Captcha } from '@ha/domain';

/** Réponse acceptée par la simulation. */
export const REPONSE_CAPTCHA_SIMULEE = 'captcha-simule';

/** Captcha simulé, pour le développement et les tests : aucun calcul côté navigateur. */
export class FakeCaptcha implements Captcha {
  async creerDefi(): Promise<string> {
    return JSON.stringify({ simulation: true });
  }

  async verifier(reponse: string): Promise<boolean> {
    return reponse === REPONSE_CAPTCHA_SIMULEE;
  }
}
