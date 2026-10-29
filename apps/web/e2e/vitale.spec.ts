import { expect, test, type Page } from '@playwright/test';

import { COMPTES, seConnecter as connexion } from './outils';

// Cartes fictives : fixtures/vitale (lecteur simulé, VITALE_LECTEUR=simulation dans playwright.config.ts).
// Patients de démonstration : packages/db/prisma/seed-patients.ts.

async function seConnecter(page: Page, email: string): Promise<void> {
  await connexion(page, email);
  await expect(page.getByRole('heading', { name: /^Bonjour/ })).toBeVisible();
}

/** Choisit la carte « insérée » dans le lecteur simulé et attend l'enregistrement du choix. */
async function insererCarte(page: Page, libelle: string): Promise<void> {
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'POST'),
    page.getByLabel('Carte insérée (simulation)').selectOption({ label: libelle }),
  ]);
}

async function lireCarte(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Lire la carte Vitale' }).click();
}

test('famille : choix du bénéficiaire inconnu, création pré-remplie, puis fiche existante reconnue', async ({
  page,
}) => {
  await seConnecter(page, COMPTES.assistanteNord);
  await page.goto('/patients');
  await insererCarte(page, 'Famille Durand (3 bénéficiaires)');
  await lireCarte(page);

  await expect(page).toHaveURL(/\/patients\/vitale$/);
  await expect(page.getByRole('heading', { name: 'Choisissez le bénéficiaire' })).toBeVisible();
  await page.getByRole('link', { name: /JULES DURAND/ }).click();
  await expect(page.getByText('Aucune fiche ne correspond à ce bénéficiaire')).toBeVisible();
  await page.getByRole('link', { name: 'Créer la fiche depuis la carte' }).click();

  // Formulaire pré-rempli ; le NIR ne passe jamais par l'URL.
  await expect(page.getByLabel('Nom de naissance')).toHaveValue('DURAND');
  await expect(page.getByLabel('Prénoms')).toHaveValue('JULES');
  await expect(page.getByLabel('NIR (clé comprise)')).toHaveValue('281045999910127');
  expect(page.url()).not.toContain('2810459999');
  await page.getByLabel('Civilité').selectOption({ label: 'M.' });
  await page.getByLabel('Sexe').selectOption({ label: 'Masculin' });
  await page.getByRole('button', { name: 'Créer la fiche' }).click();

  await expect(page.getByRole('heading', { name: 'M. JULES DURAND' })).toBeVisible();
  await expect(page.getByText(/Carte Vitale — dernière lecture Vitale le/)).toBeVisible();

  // Nouvelle lecture depuis la fiche : l'enfant Hugo est reconnu (même NIR, rang 1, même date).
  await lireCarte(page);
  await page.getByRole('link', { name: /HUGO DURAND/ }).click();
  await expect(page.getByText('Fiche existante :')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Hugo DURAND', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Terminer la lecture' }).click();
  await expect(page).toHaveURL(/\/patients$/);
});

test('assuré seul : comparaison champ par champ, une mise à jour acceptée et une refusée', async ({
  page,
}) => {
  await seConnecter(page, COMPTES.assistanteNord);
  await page.goto('/patients');
  await insererCarte(page, 'Assuré seul (Michel Lefebvre)');
  await lireCarte(page);

  // Un seul bénéficiaire : choisi d'office.
  await page.getByRole('link', { name: 'Comparer avec la carte' }).click();
  await expect(page.getByRole('heading', { name: 'Comparer avec la carte Vitale' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Caisse', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Fin de droits', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Couverture AMC', exact: true })).toBeVisible();

  await page.getByLabel('Caisse : garder la base').check();
  await page.getByRole('button', { name: 'Enregistrer les mises à jour' }).click();

  await expect(page.getByRole('heading', { name: 'M. Michel LEFEBVRE' })).toBeVisible();
  await expect(page.getByText('01 / 999 / 9999')).toBeVisible();
  await expect(page.getByText('30/06/2027')).toBeVisible();
  await expect(page.getByText('Mutuelle Démo Avenir')).toBeVisible();
  // Mise à jour refusée en partie : la couverture n'est plus celle de la carte.
  await expect(page.getByText(/^Saisie manuelle — dernière lecture Vitale le/)).toBeVisible();
});

test('erreurs de lecture : carte bloquée, aucun lecteur, panne', async ({ page }) => {
  await seConnecter(page, COMPTES.assistanteNord);
  await page.goto('/patients');

  for (const [carte, message] of [
    ['Carte bloquée (Paul Moreau)', 'Cette carte Vitale est bloquée'],
    ['Aucun lecteur', 'Aucun lecteur de carte Vitale n’est détecté'],
    ['Lecteur sans carte', 'Aucune carte n’est insérée'],
    ['Carte illisible', 'La carte insérée est illisible'],
    ['Panne du lecteur', 'La lecture de la carte a échoué'],
  ] as const) {
    await insererCarte(page, carte);
    await lireCarte(page);
    await expect(page.getByRole('alert').filter({ hasText: message })).toBeVisible();
    await expect(page).toHaveURL(/\/patients$/);
  }
});

test('droits expirés : bandeau d’alerte à la lecture et sur la fiche créée', async ({ page }) => {
  await seConnecter(page, COMPTES.assistanteNord);
  await page.goto('/patients');
  await insererCarte(page, 'Droits expirés (Bernard Petit)');
  await lireCarte(page);

  await expect(page.getByRole('alert').filter({ hasText: 'Droits expirés' })).toBeVisible();
  await expect(page.getByText('Les droits AMO ont pris fin le 31/12/2025.')).toBeVisible();
  await page.getByRole('link', { name: 'Créer la fiche depuis la carte' }).click();
  await page.getByLabel('Civilité').selectOption({ label: 'M.' });
  await page.getByLabel('Sexe').selectOption({ label: 'Masculin' });
  await page.getByRole('button', { name: 'Créer la fiche' }).click();

  await expect(page.getByRole('heading', { name: 'M. BERNARD PETIT' })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'Droits expirés' })).toBeVisible();
});

test('C2S : badge sur la lecture, la fiche et la page de modification', async ({ page }) => {
  await seConnecter(page, COMPTES.assistanteNord);
  await page.goto('/patients');
  await insererCarte(page, 'Bénéficiaire C2S (Odile Lambert)');
  await lireCarte(page);

  await expect(
    page.getByText('Bénéficiaire de la complémentaire santé solidaire (C2S)'),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Créer la fiche depuis la carte' }).click();
  await page.getByLabel('Civilité').selectOption({ label: 'Mme' });
  await page.getByLabel('Sexe').selectOption({ label: 'Féminin' });
  await page.getByRole('button', { name: 'Créer la fiche' }).click();

  const entete = page.locator('h1 + div');
  await expect(page.getByRole('heading', { name: 'Mme ODILE LAMBERT' })).toBeVisible();
  await expect(entete.getByText('C2S', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Modifier' }).click();
  await expect(page.getByRole('heading', { name: /^Modifier : Mme ODILE LAMBERT/ })).toBeVisible();
  await expect(entete.getByText('C2S', { exact: true })).toBeVisible();

  await page.goto('/patients?nom=lambert');
  await expect(page.getByRole('row', { name: /LAMBERT/ }).getByText('C2S')).toBeVisible();
});
