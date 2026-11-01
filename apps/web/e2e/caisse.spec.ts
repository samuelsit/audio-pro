import { expect, test } from '@playwright/test';

import { choisirCentre, COMPTES, seConnecter } from './outils';

// Patient de démonstration : packages/db/prisma/seed-patients.ts (données fictives).
const PATIENT = '019a3000-0000-7000-8000-000000000504';

test.setTimeout(120_000);

test('la caisse s’ouvre, encaisse, se compte et se vérifie', async ({ page }) => {
  await seConnecter(page, COMPTES.responsable);
  await expect(page.getByRole('heading', { name: /^Bonjour/ })).toBeVisible();

  await choisirCentre(page, /Centre Démo Nord/);

  // Vente directe validée, de deux boîtes à 3,00 €.
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
  await page.getByRole('button', { name: 'Valider la facture' }).click();
  await expect(page.getByRole('heading', { name: /^Facture FA-\d{6}$/ })).toBeVisible();
  const facture = page.url();

  // Ouverture de la caisse, avec son fond.
  await page.goto('/caisse');
  await page.waitForLoadState('networkidle');
  await page.getByLabel(/^Fond de caisse/).fill('50,00');
  await page.getByRole('button', { name: 'Ouvrir la caisse' }).click();
  await expect(page.getByText('Espèces attendues')).toBeVisible();

  // Encaissement partiel en espèces, avec rendu de monnaie.
  await page.goto(facture);
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Mode de paiement').selectOption('ESPECES');
  await page.getByLabel(/^Montant \(€\)/).fill('2,00');
  await page.getByLabel(/^Montant remis/).fill('5,00');
  await page.getByRole('button', { name: 'Encaisser' }).click();
  await expect(page.getByText('Encaissement enregistré.')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Encaissement', exact: true })).toBeVisible();

  // Comptage : un écart se justifie.
  await page.goto('/caisse');
  await page.waitForLoadState('networkidle');
  await page.getByLabel(/^Espèces comptées/).fill('51,00');
  await page.getByRole('button', { name: 'Enregistrer le comptage' }).click();
  await expect(page.getByText('Justifiez l’écart de caisse.').first()).toBeVisible();
  await page.getByLabel(/^Justification de l’écart/).fill('Erreur de rendu fictive');
  await page.getByRole('button', { name: 'Enregistrer le comptage' }).click();
  await expect(page.getByText('Comptage enregistré.')).toBeVisible();

  // La journée en cours ne se clôture pas.
  await page.goto('/caisse/clotures');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Lancer la clôture' }).click();
  await expect(page.getByText(/^Clôtures : 0 journée/)).toBeVisible();

  await page.goto('/caisse/verification');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Vérifier la chaîne' }).click();
  await expect(page.getByText(/^Chaîne intègre/)).toBeVisible();

  await page.goto('/caisse/journal');
  await expect(page.getByRole('cell', { name: 'Comptage de caisse' }).first()).toBeVisible();

  const jour = new Date().toISOString().slice(0, 10);
  const debut = `${jour.slice(0, 7)}-01`;
  const reponse = await page.request.get(`/caisse/export/ecritures?debut=${debut}&fin=${jour}`);
  expect(reponse.status()).toBe(200);
  expect(await reponse.text()).toContain('Encaissement, Espèces');
});

test('le guichet n’accède ni aux clôtures ni à l’export', async ({ page }) => {
  await seConnecter(page, COMPTES.assistanteNord);
  await expect(page.getByRole('heading', { name: /^Bonjour/ })).toBeVisible();
  await page.goto('/caisse');
  await expect(page.getByRole('heading', { name: 'Caisse du jour' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Clôtures' })).toHaveCount(0);
  expect((await page.goto('/caisse/verification'))?.status()).toBe(404);
  expect((await page.goto('/caisse/clotures'))?.status()).toBe(404);
});
