import { expect, test } from '@playwright/test';

import { COMPTES, ouvrirSelecteurCentre, seConnecter } from './outils';

test('un visiteur non connecté est renvoyé vers la connexion', async ({ page }) => {
  await page.goto('/equipe');
  await expect(page).toHaveURL(/\/connexion$/);
  await expect(page).toHaveTitle(/Connexion – HA-Gestion/);
});

test('un mauvais mot de passe est refusé sans détail', async ({ page }) => {
  await page.goto('/connexion');
  await page.getByLabel('Adresse e-mail').fill(COMPTES.assistanteNord);
  await page.getByLabel('Mot de passe').fill('mauvais-mot-de-passe');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  // Filtré : l'annonceur de route de Next porte aussi role="alert".
  await expect(
    page.getByRole('alert').filter({ hasText: 'E-mail ou mot de passe incorrect' }),
  ).toHaveText('E-mail ou mot de passe incorrect, ou compte désactivé.');
});

test('une assistante du centre Nord ne voit que le centre Nord', async ({ page }) => {
  await seConnecter(page, COMPTES.assistanteNord);
  await expect(page.getByRole('heading', { name: 'Bonjour Sacha' })).toBeVisible();
  await expect(page.getByTestId('centre-courant')).toHaveText('Centre Démo Nord');
  expect(await ouvrirSelecteurCentre(page)).toEqual(['Centre Démo Nord']);

  await page.getByRole('link', { name: 'Équipe' }).click();
  // Camille apparaît comme audioprothésiste et comme membre.
  await expect(page.getByRole('cell', { name: 'Camille Audio' })).toHaveCount(2);
  await expect(page.getByRole('cell', { name: 'Sacha Assistante' })).toBeVisible();
  await expect(page.getByText('Lou Assistante')).toHaveCount(0);
  await expect(page.getByText('Centre Démo Centre')).toHaveCount(0);

  await expect(page.getByRole('link', { name: 'Centres' })).toHaveCount(0);
  const reponse = await page.goto('/admin/centres');
  expect(reponse?.status()).toBe(404);
  const exportJournal = await page.request.get('/admin/journal/export');
  expect(exportJournal.status()).toBe(404);
});

test('le menu latéral mène aux écrans métier, sans Administration pour une assistante', async ({
  page,
}) => {
  await seConnecter(page, COMPTES.assistanteNord);
  const menu = page.getByRole('navigation', { name: 'Navigation principale' });
  await expect(menu.getByRole('link')).toHaveText([
    'Agenda',
    'Patients',
    'Dossiers',
    'Stock',
    'Commandes',
    'Facturation',
    'Caisse',
    'Tiers payant',
    'SAV',
    'Relances',
    'Tableau de bord',
    'Équipe',
  ]);
  await expect(menu.getByRole('link', { name: 'Administration' })).toHaveCount(0);

  await menu.getByRole('link', { name: 'Patients' }).click();
  await expect(page).toHaveURL(/\/patients$/);
  await expect(page.getByRole('heading', { name: 'Patients' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Nouveau patient' })).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Patients' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});
