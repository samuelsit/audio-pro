import { expect, test } from '@playwright/test';

import { COMPTES, seConnecter } from './outils';

// Patient de démonstration : packages/db/prisma/seed-patients.ts (données fictives).
const PATIENT = '019a3000-0000-7000-8000-000000000503';

// Rendu Chromium réel du PDF : plus long que le délai par défaut.
test.setTimeout(120_000);

test('une vente directe se valide, s’imprime, puis se reprend par un avoir', async ({ page }) => {
  await seConnecter(page, COMPTES.responsable);
  await expect(page.getByRole('heading', { name: /^Bonjour/ })).toBeVisible();

  // Brouillon sans numéro, ouvert depuis la fiche du patient.
  await page.goto(`/factures/nouvelle?patient=${PATIENT}`);
  await page.waitForLoadState('networkidle');
  await page.locator('#centreId').selectOption({ label: 'Centre Démo Nord' });
  await page.getByRole('button', { name: 'Ouvrir la vente' }).click();
  await expect(page.getByRole('heading', { name: 'Facture (brouillon)' })).toBeVisible();
  await page.waitForLoadState('networkidle');

  await page.getByLabel('Type de ligne').selectOption({ label: 'Piles' });
  const article = await page
    .locator('select[name="accessoireId"] option', { hasText: /pile/i })
    .first()
    .getAttribute('value');
  await page.getByLabel(/^Article/).selectOption(article ?? '');
  await page.getByLabel(/^Libellé/).fill('Piles fictives');
  await page.getByLabel(/^Quantité/).fill('2');
  await page.getByLabel(/^Prix unitaire TTC/).fill('3,00');
  await page.getByRole('button', { name: 'Ajouter la ligne' }).click();
  await expect(page.getByRole('cell', { name: 'Piles fictives' })).toBeVisible();

  // Validation : la pièce reçoit son numéro et ne se modifie plus.
  await page.getByRole('button', { name: 'Valider la facture' }).click();
  await expect(page.getByRole('heading', { name: /^Facture FA-\d{6}$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retirer' })).toHaveCount(0);

  // Première sortie : l'original. La seconde : un duplicata.
  const pdf = `${page.url()}/pdf`;
  const original = await page.request.get(pdf);
  expect(original.status()).toBe(200);
  expect(original.headers()['content-type']).toBe('application/pdf');
  expect((await original.body()).subarray(0, 5).toString()).toBe('%PDF-');
  expect(original.headers()['content-disposition']).not.toContain('duplicata');
  const duplicata = await page.request.get(pdf);
  expect(duplicata.headers()['content-disposition']).toContain('duplicata-FA-');

  // Avoir partiel, lié à la facture d'origine.
  await page.getByLabel('Type d’avoir').selectOption({ value: 'PARTIEL' });
  await page.getByLabel(/^Motif/).fill('Geste commercial fictif');
  await page.getByLabel('Piles fictives').fill('2,00');
  await page.getByRole('button', { name: 'Émettre l’avoir' }).click();
  await expect(page.getByRole('heading', { name: /^Avoir FA-\d{6}$/ })).toBeVisible();
  await page.getByRole('link', { name: /^Facture FA-\d{6}$/ }).click();
  await expect(page.getByRole('link', { name: /^Avoir FA-\d{6}$/ })).toBeVisible();
});
