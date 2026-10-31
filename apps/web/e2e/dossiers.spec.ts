import { expect, test, type Page } from '@playwright/test';

import {
  COMPTES,
  creerDossier,
  saisirPrescription,
  seConnecter as connexion,
  CONTENU_PDF_FICTIF as CONTENU_PDF,
} from './outils';

// Patients de démonstration : packages/db/prisma/seed-patients.ts (données fictives).
const LEFEBVRE = '019a3000-0000-7000-8000-000000000506'; // Droite délivrée il y a 2 ans.
const DUBOIS = '019a3000-0000-7000-8000-000000000508';

async function seConnecter(page: Page): Promise<void> {
  await connexion(page, COMPTES.assistanteNord);
  await expect(page.getByRole('heading', { name: /^Bonjour/ })).toBeVisible();
}

const etapeCourante = (page: Page) => page.locator('[aria-current="step"]');

test('une assistante crée un dossier mixte, joint l’ordonnance et rouvre le scan', async ({
  page,
}) => {
  await seConnecter(page);
  await creerDossier(page, DUBOIS, 'Les deux oreilles', [
    ['Oreille droite', 'Renouvellement'],
    ['Oreille gauche', 'Premier appareillage'],
  ]);
  await expect(etapeCourante(page)).toContainText('Brouillon');

  await saisirPrescription(page);
  await expect(etapeCourante(page)).toContainText('Prescription OK');
  await expect(page.getByText('Agathe Démo (ORL)')).toBeVisible();

  const lien = page.getByRole('link', { name: 'Ouvrir le scan' });
  const reponse = await page.request.get((await lien.getAttribute('href')) ?? '');
  expect(reponse.status()).toBe(200);
  expect(reponse.headers()['content-type']).toBe('application/pdf');
  expect(reponse.headers()['cache-control']).toContain('no-store');
  expect(reponse.headers()['content-disposition']).toContain('ordonnance.pdf');
  expect((await reponse.body()).toString()).toBe(CONTENU_PDF);
});

test('un renouvellement à moins de 4 ans est refusé sur la même oreille, accepté sur l’autre', async ({
  page,
}) => {
  await seConnecter(page);
  await creerDossier(page, LEFEBVRE, 'Oreille droite', [['Oreille droite', 'Renouvellement']]);
  await saisirPrescription(page);

  const blocage = page.getByRole('alert').filter({ hasText: 'Erreurs bloquantes' });
  await expect(blocage).toContainText('Oreille droite : Moins de 4 ans');
  await expect(blocage).toContainText('Seul un administrateur peut enregistrer');
  await expect(page.getByRole('button', { name: 'Enregistrer malgré tout' })).toHaveCount(0);
  await expect(etapeCourante(page)).toContainText('Brouillon');

  await creerDossier(page, LEFEBVRE, 'Oreille gauche', [['Oreille gauche', 'Renouvellement']]);
  await saisirPrescription(page);
  await expect(etapeCourante(page)).toContainText('Prescription OK');
});

test('un dossier abandonné sort du parcours, réservé à l’audioprothésiste', async ({ page }) => {
  await seConnecter(page);
  await creerDossier(page, DUBOIS, 'Oreille gauche', [['Oreille gauche', 'Premier appareillage']]);
  await expect(page.getByRole('button', { name: 'Abandonner' })).toHaveCount(0);
  const url = page.url();

  await page.context().clearCookies();
  await connexion(page, COMPTES.audioNordCentre);
  await expect(page.getByRole('heading', { name: /^Bonjour/ })).toBeVisible();
  await page.goto(url);
  await page.getByRole('button', { name: 'Abandonner' }).click();
  await page.getByLabel('Motif').fill('Patient parti sans suite');
  await page.getByRole('button', { name: 'Confirmer l’abandon' }).click();

  await expect(page.getByText('Dossier abandonné.')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/patients/${DUBOIS}/dossiers$`));
  await page.goto(url);
  await expect(page.getByText('Motif : Patient parti sans suite')).toBeVisible();
  await expect(etapeCourante(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Abandonner' })).toHaveCount(0);
});
