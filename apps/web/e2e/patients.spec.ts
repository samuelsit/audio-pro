import { expect, test, type Page } from '@playwright/test';

import { COMPTES, seConnecter as connexion } from './outils';

// Patients de démonstration : packages/db/prisma/seed-patients.ts (données fictives).
const GAUTHIER_NORD = '019a3000-0000-7000-8000-000000000509';
const GAUTHIER_CENTRE = '019a3000-0000-7000-8000-000000000510';

/** Connexion terminée (page d'accueil affichée) avant de naviguer ailleurs. */
async function seConnecter(page: Page, email: string): Promise<void> {
  await connexion(page, email);
  await expect(page.getByRole('heading', { name: /^Bonjour/ })).toBeVisible();
}

async function remplirIdentite(
  page: Page,
  identite: { nom: string; prenoms: string; naissance: string; civilite: string; sexe: string },
): Promise<void> {
  await page.getByLabel('Civilité').selectOption({ label: identite.civilite });
  await page.getByLabel('Sexe').selectOption({ label: identite.sexe });
  await page.getByLabel('Nom de naissance').fill(identite.nom);
  await page.getByLabel('Prénoms').fill(identite.prenoms);
  await page.getByLabel('Date de naissance').fill(identite.naissance);
}

test('une assistante crée un patient, le retrouve par nom et par NIR, et ouvre sa fiche', async ({
  page,
}) => {
  await seConnecter(page, COMPTES.assistanteNord);
  await page.goto('/patients');
  // Cloisonnement : patients du centre Nord seulement.
  await expect(page.getByRole('link', { name: 'FONTAINE' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'SANTONI' })).toHaveCount(0);

  await page.getByRole('link', { name: 'Nouveau patient' }).click();
  await remplirIdentite(page, {
    nom: 'Testeur-Élan',
    prenoms: 'Maxime',
    naissance: '1985-05-01',
    civilite: 'M.',
    sexe: 'Masculin',
  });
  await page.getByLabel('Téléphone').fill('06 12 34 56 78');
  await page.getByLabel('NIR (clé comprise)').fill('1 85 05 78 006 048 30');
  await page.getByLabel('ALD').check();
  await page.getByRole('button', { name: 'Créer la fiche' }).click();

  await expect(page.getByRole('heading', { name: 'M. Maxime TESTEUR-ÉLAN' })).toBeVisible();
  await expect(page.getByText('1 85 05 78 006 048 30')).toBeVisible();
  await expect(page.getByText('ALD', { exact: true })).toBeVisible();
  const urlFiche = page.url();

  // Recherche par nom, sans accent ni casse.
  await page.goto('/patients?nom=testeur%20elan');
  await expect(page.getByRole('link', { name: 'TESTEUR-ÉLAN' })).toBeVisible();

  // Recherche par NIR : POST, redirection directe vers l'unique fiche, NIR absent de l'URL.
  await page.goto('/patients');
  await page.getByLabel('NIR exact (15 caractères, clé comprise)').fill('185057800604830');
  await page.getByRole('button', { name: 'Rechercher par NIR' }).click();
  await expect(page).toHaveURL(urlFiche);
  expect(page.url()).not.toContain('1850578006');

  // Ressaisie de la même personne : doublon signalé, puis création confirmée.
  await page.goto('/patients/nouveau');
  await remplirIdentite(page, {
    nom: 'Testeur Elan',
    prenoms: 'Max',
    naissance: '1985-05-01',
    civilite: 'M.',
    sexe: 'Masculin',
  });
  await page.getByRole('button', { name: 'Créer la fiche' }).click();
  const alerte = page.getByRole('alert').filter({ hasText: 'Ce patient existe peut-être déjà' });
  await expect(alerte).toContainText('Maxime TESTEUR-ÉLAN');
  await expect(alerte).toContainText('même nom et même date de naissance');
  await page.getByRole('button', { name: 'Créer quand même' }).click();
  await expect(page.getByRole('heading', { name: 'M. Max TESTEUR ELAN' })).toBeVisible();
  await expect(page.getByText('Doublons possibles')).toBeVisible();
  // L'assistante ne fusionne pas.
  await expect(page.getByRole('link', { name: 'Fusionner' })).toHaveCount(0);
});

test('un doublon dans un autre centre est signalé sans révéler l’identité', async ({ page }) => {
  await seConnecter(page, COMPTES.assistanteNord);
  await page.goto('/patients/nouveau');
  await remplirIdentite(page, {
    nom: 'Santoni',
    prenoms: 'Paul',
    naissance: '1947-06-18',
    civilite: 'M.',
    sexe: 'Masculin',
  });
  await page.getByRole('button', { name: 'Créer la fiche' }).click();
  const alerte = page.getByRole('alert').filter({ hasText: 'Ce patient existe peut-être déjà' });
  await expect(alerte).toContainText(
    'Un patient correspondant (même nom et même date de naissance) existe au centre Centre Démo Sud : contactez l’administrateur.',
  );
  await expect(alerte.getByRole('link')).toHaveCount(0);
});

test('un audioprothésiste fusionne deux fiches en double', async ({ page }) => {
  await seConnecter(page, COMPTES.audioNordCentre);
  await page.goto(`/patients/${GAUTHIER_NORD}`);
  await expect(page.getByRole('heading', { name: 'Mme Denise GAUTHIER' })).toBeVisible();
  await page.getByRole('link', { name: 'Fusionner' }).click();

  await expect(page.getByRole('heading', { name: 'Fusion de fiches' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Couverture AMO' })).toBeVisible();
  await page.getByRole('radio', { name: 'patient10@exemple.test' }).check();
  await page.getByRole('button', { name: 'Fusionner les fiches' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Fusionner' }).click();

  await expect(page).toHaveURL(new RegExp(`/patients/${GAUTHIER_NORD}$`));
  await expect(page.getByText('patient10@exemple.test')).toBeVisible();
  await expect(page.getByText('Fiche créée lors d’un dépannage au centre.')).toBeVisible();
  await expect(page.getByText('Doublons possibles')).toHaveCount(0);

  // La fiche fusionnée renvoie vers la fiche conservée.
  await page.goto(`/patients/${GAUTHIER_CENTRE}`);
  await expect(page).toHaveURL(new RegExp(`/patients/${GAUTHIER_NORD}$`));
});
