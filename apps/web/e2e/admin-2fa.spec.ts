import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import { codeTotp, COMPTES, motDePasseDemo, ouvrirSelecteurCentre, seConnecter } from './outils';

test.describe.configure({ mode: 'serial' });

test('l’ADMIN doit activer la 2FA, puis la saisir à chaque connexion', async ({ page }) => {
  await seConnecter(page, COMPTES.admin);

  // Première connexion : activation forcée avant tout accès.
  await expect(page).toHaveURL(/\/compte\/2fa$/);
  await page.goto('/admin/centres');
  await expect(page).toHaveURL(/\/compte\/2fa$/);

  await page.getByLabel('Mot de passe').fill(motDePasseDemo());
  await page.getByRole('button', { name: 'Commencer l’activation' }).click();
  const secret = (await page.getByTestId('secret-totp').textContent()) ?? '';
  expect(secret).toMatch(/^[A-Z2-7]+$/);

  await page.getByLabel('Code à 6 chiffres').fill(await codeTotp(secret));
  await page.getByRole('button', { name: 'Activer' }).click();
  await expect(page.getByRole('heading', { name: 'Bonjour Alex' })).toBeVisible();

  // « Tous les centres » est proposé à l'ADMIN et affiche les trois centres.
  await expect(page.getByTestId('centre-courant')).toHaveText('Tous les centres');
  expect(await ouvrirSelecteurCentre(page)).toEqual([
    'Tous les centres',
    'Centre Démo Centre',
    'Centre Démo Nord',
    'Centre Démo Sud',
  ]);
  await page.getByRole('link', { name: 'Centres' }).click();
  await expect(page.getByRole('link', { name: /^Centre Démo/ })).toHaveCount(3);

  // Reconnexion : le code TOTP est demandé.
  await page.getByRole('button', { name: 'Alex Admin' }).click();
  await page.getByRole('menuitem', { name: 'Se déconnecter' }).click();
  await expect(page).toHaveURL(/\/connexion$/);

  await seConnecter(page, COMPTES.admin);
  await expect(page).toHaveURL(/\/connexion\/2fa$/);
  await page.getByLabel('Code de vérification').fill(await codeTotp(secret));
  await page.getByRole('button', { name: 'Vérifier' }).click();
  await expect(page.getByRole('heading', { name: 'Bonjour Alex' })).toBeVisible();

  // Formulaires d'administration : utilisateur AUDIO, puis fiche praticien (RPPS contrôlé).
  await page.getByRole('link', { name: 'Utilisateurs' }).click();
  await page.getByRole('link', { name: 'Nouvel utilisateur' }).click();
  await page.getByLabel('Prénom').fill('Morgan');
  await page.getByLabel('Nom', { exact: true }).fill('Démo');
  await page.getByLabel('Adresse e-mail (identifiant de connexion)').fill('morgan@exemple.test');
  await page.getByLabel('Rôle').selectOption('AUDIO');
  await page.getByRole('checkbox', { name: 'Centre Démo Sud' }).check();
  await page.getByLabel('Mot de passe provisoire').fill('provisoire-demo-2026');
  await page.getByRole('button', { name: 'Créer le compte' }).click();
  await expect(page.getByRole('link', { name: 'Morgan Démo' })).toBeVisible();
  await expect(page.getByText('Utilisateur enregistré.')).toBeVisible();

  await page.getByRole('link', { name: 'Praticiens' }).click();
  await page.getByRole('link', { name: 'Nouvelle fiche praticien' }).click();
  await page.getByLabel('Audioprothésiste').selectOption({ label: 'Morgan Démo' });
  await page.getByLabel('N° RPPS').fill('1234');
  await page.getByRole('checkbox', { name: 'Centre Démo Sud' }).check();
  await page.getByRole('button', { name: 'Créer la fiche' }).click();
  await expect(
    page.getByText('Le numéro RPPS doit comporter exactement 11 chiffres.'),
  ).toBeVisible();
  // La saisie est conservée après l'erreur.
  await expect(page.getByLabel('Audioprothésiste')).toHaveValue(/.+/);
  await expect(page.getByRole('checkbox', { name: 'Centre Démo Sud' })).toBeChecked();

  await page.getByLabel('N° RPPS').fill('100 000 000 01');
  await page.getByRole('button', { name: 'Créer la fiche' }).click();
  await expect(page.getByRole('row', { name: /Morgan Démo 10000000001/ })).toBeVisible();

  // Journal d'audit : les actions ci-dessus sont tracées, filtrables et exportables.
  await page.getByRole('link', { name: 'Journal d’audit' }).click();
  await expect(page.getByRole('heading', { name: 'Journal d’audit' })).toBeVisible();
  await expect(page.getByRole('cell', { name: /prenom : Morgan/ })).toBeVisible();
  await expect(page.getByRole('cell', { name: /rpps : 10000000001/ })).toBeVisible();
  await expect(page.getByText('Connexion', { exact: true }).first()).toBeVisible();

  await page
    .getByLabel('Utilisateur', { exact: true })
    // Compte qu'aucun test E2E n'utilise : les tests tournent en parallèle sur la même base.
    .selectOption({ label: 'Assistante Lou (lou.assistante@exemple.test)' });
  await page.getByRole('button', { name: 'Filtrer' }).click();
  await expect(page).toHaveURL(/utilisateurId=/);
  await expect(page.getByText('Aucune action ne correspond à ces filtres.')).toBeVisible();

  await page.getByRole('link', { name: 'Réinitialiser' }).click();
  await page.getByLabel('Du', { exact: true }).fill('2026-10-31');
  await page.getByLabel('Au', { exact: true }).fill('2026-10-01');
  await page.getByRole('button', { name: 'Filtrer' }).click();
  await expect(
    page.getByText('La date de fin doit être postérieure ou égale à la date de début.'),
  ).toBeVisible();

  await expect(page.getByRole('link', { name: 'Exporter en CSV' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Réinitialiser' }).click();
  await expect(page).toHaveURL(/\/admin\/journal$/);
  const [telechargement] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Exporter en CSV' }).click(),
  ]);
  expect(telechargement.suggestedFilename()).toMatch(/^journal-audit-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = await readFile((await telechargement.path()) ?? '', 'utf8');
  expect(csv.startsWith('\uFEFFDate et heure;Utilisateur;')).toBe(true);
  expect(csv).toContain('Création;Praticien');
  expect(csv).toContain('Export;Journal d’audit');
});
