import { expect, test, type Page } from '@playwright/test';

import { COMPTES, seConnecter } from './outils';

// Patient de démonstration avec deux bilans : packages/db/prisma/seed-audiologie.ts (données fictives).
const LEFEBVRE = '019a3000-0000-7000-8000-000000000506';
const ANCIEN_BILAN = '019a8000-0000-7000-8000-000000000001';

test.setTimeout(120_000);

/** La connexion se termine par une redirection : une navigation lancée avant repartirait sur /connexion. */
async function connecter(page: Page, email: string): Promise<void> {
  await seConnecter(page, email);
  await expect(page).not.toHaveURL(/\/connexion/);
}

test('un bilan va de la saisie rapide à la synthèse PDF, avec comparaison', async ({ page }) => {
  await connecter(page, COMPTES.audioNordCentre);
  await page.goto(`/patients/${LEFEBVRE}/audiologie`);
  await expect(page.getByRole('link', { name: '10/03/2026' })).toBeVisible();

  await page.getByLabel('Date du bilan').fill('2026-10-30');
  await page.getByRole('button', { name: 'Nouveau bilan' }).click();
  await expect(page.getByRole('heading', { name: 'Bilan du 30/10/2026' })).toBeVisible();

  await page.getByRole('link', { name: 'Tonale' }).click();
  // Saisie rapide : Entrée passe à la fréquence suivante.
  const premiere = page.getByLabel('Oreille droite, Aérienne, 500 Hz');
  await premiere.click();
  await page.keyboard.type('30');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter'); // 750 Hz reste vide.
  await page.keyboard.type('40');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter'); // 1500 Hz reste vide.
  await page.keyboard.type('50');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter'); // 3000 Hz reste vide.
  await page.keyboard.type('nr');
  await expect(page.getByLabel('Oreille droite, Aérienne, 2000 Hz')).toHaveValue('50');
  await expect(page.getByTestId('resume-DROITE')).toContainText('60,0 dB HL, grade 3');

  // Une faute de frappe bloque l'envoi, sans devenir une absence de réponse.
  const quatreK = page.getByLabel('Oreille droite, Aérienne, 4000 Hz');
  await quatreK.fill('6O');
  await page.getByRole('button', { name: 'Enregistrer l’audiogramme' }).click();
  await expect(page.getByText('Valeurs illisibles')).toBeVisible();
  await expect(page).toHaveURL(/\/tonale$/);

  await quatreK.fill('60');
  await page.getByLabel('Oreille gauche, Aérienne, 500 Hz').fill('25');
  await page.getByLabel('Oreille gauche, Aérienne, 1000 Hz').fill('35');
  await page.getByLabel('Oreille gauche, Aérienne, 2000 Hz').fill('45');
  await page.getByLabel('Oreille gauche, Aérienne, 4000 Hz').fill('55');
  await expect(page.getByTestId('resume-GAUCHE')).toContainText('40,0 dB HL, grade 2');
  await page.getByRole('button', { name: 'Enregistrer l’audiogramme' }).click();

  await expect(page.getByRole('heading', { name: 'Audiométrie tonale' })).toBeVisible();
  await expect(page.getByText('Grade 2 – Atteinte modérée').first()).toBeVisible();
  await expect(page.getByRole('img', { name: 'Audiogramme, oreille droite' })).toBeVisible();

  const [telechargement] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Synthèse PDF' }).click(),
  ]);
  expect(telechargement.suggestedFilename()).toBe('synthese-bilan-audiologique.pdf');

  await page.goto(`/patients/${LEFEBVRE}/audiologie`);
  await expect(page.getByRole('img', { name: 'Évolution de la perte moyenne' })).toBeVisible();
  await page.getByRole('link', { name: 'Comparer deux audiogrammes' }).click();
  await page.getByLabel('Pointillés').selectOption({ label: '12/03/2024' });
  await page.getByRole('button', { name: 'Comparer' }).click();
  await expect(page.getByText('Pointillés : 12/03/2024.').first()).toBeVisible();
  await expect(page.getByText(/Écart de perte moyenne/)).toBeVisible();
});

test('une assistante saisit l’anamnèse mais pas les mesures', async ({ page }) => {
  await connecter(page, COMPTES.assistanteNord);
  await page.goto(`/patients/${LEFEBVRE}/audiologie/${ANCIEN_BILAN}/tonale`);
  await expect(page.getByText('réservée à l’audioprothésiste')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enregistrer l’audiogramme' })).toHaveCount(0);

  await page.getByRole('link', { name: 'Anamnèse' }).click();
  await expect(page.getByText('Antécédents ORL')).toBeVisible();
  await page.getByLabel('Otites à répétition').selectOption('OUI');
  await page.getByLabel('Gêne dans le bruit').fill('7');
  await page.getByRole('button', { name: 'Enregistrer' }).click();

  await expect(page.getByRole('heading', { name: 'Anamnèse' })).toBeVisible();
  await expect(page.getByText('Otites à répétition')).toBeVisible();
});
