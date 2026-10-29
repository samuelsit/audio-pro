import { base32 } from '@better-auth/utils/base32';
import { createOTP } from '@better-auth/utils/otp';
import { expect, type Page } from '@playwright/test';

// Comptes de démonstration créés par packages/db/prisma/seed.ts (données fictives).
export const COMPTES = {
  admin: 'admin@exemple.test',
  assistanteNord: 'sacha.assistante@exemple.test',
} as const;

export function motDePasseDemo(): string {
  const mdp = process.env.SEED_MOT_DE_PASSE_DEMO;
  if (!mdp) {
    throw new Error('SEED_MOT_DE_PASSE_DEMO n’est pas défini (voir .env.example).');
  }
  return mdp;
}

export async function seConnecter(page: Page, email: string): Promise<void> {
  await page.goto('/connexion');
  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(motDePasseDemo());
  await page.getByRole('button', { name: 'Se connecter' }).click();
}

/** Code TOTP courant pour le secret Base32 affiché à l'activation. */
export async function codeTotp(secretBase32: string): Promise<string> {
  return createOTP(base32.decode(secretBase32)).totp();
}

export async function ouvrirSelecteurCentre(page: Page): Promise<string[]> {
  await page.getByRole('combobox', { name: 'Centre courant' }).click();
  const options = await page.getByRole('option').allTextContents();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('option')).toHaveCount(0);
  return options;
}
