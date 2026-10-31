import { expect, test } from '@playwright/test';

import { codeTotp, COMPTES, motDePasseDemo, seConnecter } from './outils';

test.describe.configure({ mode: 'serial' });

let secret = '';

test('le SUPERADMIN active la 2FA et arrive sur la console, pas sur le métier', async ({
  page,
}) => {
  await seConnecter(page, COMPTES.superadmin);
  await expect(page).toHaveURL(/\/compte\/2fa$/);
  await page.getByLabel('Mot de passe').fill(motDePasseDemo());
  await page.getByRole('button', { name: 'Commencer l’activation' }).click();
  secret = (await page.getByTestId('secret-totp').textContent()) ?? '';
  await page.getByLabel('Code à 6 chiffres').fill(await codeTotp(secret));
  await page.getByRole('button', { name: 'Activer' }).click();

  await expect(page).toHaveURL(/\/console$/);
  await expect(page.getByRole('heading', { name: 'Clients' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Réseau Démo Audition' })).toBeVisible();

  await page.goto('/patients');
  await expect(page).toHaveURL(/\/console$/);
});

test('crée un client, le suspend : son compte ne se connecte plus', async ({ page, browser }) => {
  await seConnecter(page, COMPTES.superadmin);
  await page.getByLabel(/Code/).fill(await codeTotp(secret));
  await page.getByRole('button', { name: 'Vérifier' }).click();
  await expect(page).toHaveURL(/\/console$/);

  await page.getByRole('link', { name: 'Nouveau client' }).click();
  await page.getByLabel('Raison sociale').fill('Audition E2E SAS');
  await page.getByLabel('SIREN').fill('000000009');
  await page.getByLabel('Adresse', { exact: true }).fill('1 rue de l’Exemple');
  await page.getByLabel('Code postal').fill('75001');
  await page.getByLabel('Ville').fill('Paris');
  await page.getByLabel('Prénom').fill('Andrea');
  await page.getByLabel('Nom', { exact: true }).fill('Démo');
  await page.getByLabel('E-mail').fill('andrea@e2e.exemple.test');
  await page.getByLabel('Mot de passe provisoire').fill(motDePasseDemo());
  await page.getByRole('button', { name: 'Créer le client' }).click();

  const ligne = page.getByRole('row', { name: /Audition E2E SAS/ });
  await expect(ligne).toBeVisible();
  await ligne.getByRole('button', { name: 'Suspendre' }).click();
  await expect(ligne.getByRole('button', { name: 'Réactiver en essai' })).toBeVisible();

  const contexte = await browser.newContext({ baseURL: 'http://localhost:3100' });
  const autre = await contexte.newPage();
  await seConnecter(autre, 'andrea@e2e.exemple.test');
  await expect(autre.getByText(/E-mail ou mot de passe incorrect/)).toBeVisible();
  await contexte.close();
});

test('un utilisateur d’un client n’atteint pas la console', async ({ page }) => {
  await seConnecter(page, COMPTES.assistanteNord);
  await expect(page.getByRole('heading', { name: 'Bonjour Sacha' })).toBeVisible();
  const reponse = await page.goto('/console');
  expect(reponse?.status()).toBe(404);
});
