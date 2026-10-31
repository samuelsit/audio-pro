import { AltchaCaptcha, FakeCaptcha } from '@ha/adapters';
import type { Captcha } from '@ha/domain';

function creerCaptcha(): Captcha {
  if (process.env.CAPTCHA === 'simulation' && process.env.NODE_ENV !== 'production') {
    return new FakeCaptcha();
  }
  const secret = process.env.CAPTCHA_CLE?.trim();
  if (!secret) {
    throw new Error('CAPTCHA_CLE n’est pas défini (voir .env.example).');
  }
  return new AltchaCaptcha(secret);
}

let instanceCaptcha: Captcha | undefined;

/** Preuve anti-robot : ALTCHA auto-hébergé, ou simulation hors production. */
export function captcha(): Captcha {
  instanceCaptcha ??= creerCaptcha();
  return instanceCaptcha;
}
