import { base32 } from '@better-auth/utils/base32';
import { createOTP } from '@better-auth/utils/otp';
import { expect, type Page } from '@playwright/test';

// Comptes de démonstration créés par packages/db/prisma/seed.ts (données fictives).
export const COMPTES = {
  admin: 'admin@exemple.test',
  assistanteNord: 'sacha.assistante@exemple.test',
  audioNordCentre: 'camille.audio@exemple.test',
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

export const CONTENU_PDF_FICTIF = '%PDF-1.7 ordonnance fictive';
export const PDF_FICTIF = {
  name: 'ordonnance.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from(CONTENU_PDF_FICTIF),
};

/** Crée un dossier depuis l'onglet « Dossiers » de la fiche patient. */
export async function creerDossier(
  page: Page,
  patientId: string,
  oreilles: string,
  types: readonly [string, string][],
): Promise<void> {
  await page.goto(`/patients/${patientId}`);
  await page.getByRole('link', { name: 'Dossiers', exact: true }).last().click();
  await expect(page).toHaveURL(new RegExp(`/patients/${patientId}/dossiers$`));
  await page.getByRole('link', { name: 'Nouveau dossier' }).click();
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Audioprothésiste').selectOption({ label: 'Camille Audio' });
  await page.getByLabel('Oreilles à appareiller').selectOption({ label: oreilles });
  for (const [oreille, type] of types) {
    await page.getByLabel(`${oreille} : type d’appareillage`).selectOption({ label: type });
  }
  await page.getByRole('button', { name: 'Créer le dossier' }).click();
  await expect(page.getByText('Dossier créé.')).toBeVisible();
  await page.waitForLoadState('networkidle');
}

export async function saisirPrescription(page: Page): Promise<void> {
  await page.getByLabel('Rechercher un prescripteur').fill('Agathe');
  await page.getByRole('button', { name: /Agathe Démo/ }).click();
  await page.getByLabel('Date de la prescription').fill('2026-01-15');
  await page.getByLabel('Oreilles prescrites').selectOption({ label: 'Les deux oreilles' });
  await page.getByLabel('Scan de l’ordonnance').setInputFiles(PDF_FICTIF);
  await page.getByRole('button', { name: 'Enregistrer la prescription' }).click();
}
