import { expect, test } from '@playwright/test';

import { COMPTES, seConnecter } from './outils';

test('une assistante crée un prescripteur à la volée, puis le retrouve par la recherche rapide', async ({
  page,
}) => {
  await seConnecter(page, COMPTES.assistanteNord);
  await expect(page.getByRole('heading', { name: /^Bonjour/ })).toBeVisible();
  await page.getByRole('link', { name: 'Prescripteurs' }).click();
  await expect(page.getByRole('heading', { name: 'Prescripteurs' })).toBeVisible();

  const recherche = page.getByLabel('Rechercher un prescripteur');
  await recherche.fill('Volée-Démo');
  await expect(page.getByText('Aucun prescripteur trouvé.')).toBeVisible();

  await page.getByRole('button', { name: 'Créer un prescripteur' }).click();
  const fiche = page.getByRole('dialog');
  await fiche.getByLabel('Nom', { exact: true }).fill('Volée-Démo');
  await fiche.getByLabel('Prénom').fill('Élise');
  await expect(fiche.getByLabel('Formation en otologie médicale')).toHaveCount(0);
  await fiche.getByLabel('Spécialité').selectOption({ label: 'Médecin généraliste' });
  await fiche.getByLabel('Formation en otologie médicale').selectOption({ label: 'Oui' });
  await fiche.getByLabel('N° RPPS').fill('123');
  await fiche.getByRole('button', { name: 'Créer et sélectionner' }).click();
  await expect(
    fiche.getByText('Le numéro RPPS doit comporter exactement 11 chiffres.'),
  ).toBeVisible();

  await fiche.getByLabel('N° RPPS').fill('100 000 009 91');
  await fiche.getByRole('button', { name: 'Créer et sélectionner' }).click();
  await expect(fiche).toHaveCount(0);
  await expect(
    page.getByText(/Élise Volée-Démo · Médecin généraliste · 10000000991/),
  ).toBeVisible();

  // Sans accent ni tiret, par le nom puis par le RPPS.
  await page.getByRole('button', { name: 'Changer' }).click();
  await recherche.fill('volee demo');
  await expect(page.getByRole('button', { name: /Élise Volée-Démo/ })).toBeVisible();
  await recherche.fill('10000000991');
  await page.getByRole('button', { name: /Élise Volée-Démo/ }).click();
  await expect(page.getByRole('button', { name: 'Changer' })).toBeVisible();

  // Liste filtrable, sans lien de modification pour une assistante.
  await page.goto('/prescripteurs?q=volee');
  await expect(page.getByRole('cell', { name: 'Volée-Démo Élise' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Volée-Démo Élise' })).toHaveCount(0);
});

test('la création par le formulaire complet revient à la liste', async ({ page }) => {
  await seConnecter(page, COMPTES.audioNordCentre);
  await expect(page.getByRole('heading', { name: /^Bonjour/ })).toBeVisible();
  await page.goto('/prescripteurs/nouveau');
  await page.getByLabel('Nom', { exact: true }).fill('Formulaire-Démo');
  await page.getByLabel('Prénom').fill('Yanis');
  await page.getByLabel('Spécialité').selectOption({ label: 'ORL' });
  await page.getByLabel('E-mail ou adresse MSSanté').fill('yanis@mssante.exemple.test');
  await page.getByRole('button', { name: 'Créer la fiche' }).click();
  await expect(page).toHaveURL(/\/prescripteurs$/);
  await expect(page.getByText('Prescripteur enregistré.')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Formulaire-Démo Yanis' })).toBeVisible();
});
