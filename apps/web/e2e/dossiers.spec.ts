import { expect, test, type Page } from '@playwright/test';

import { COMPTES, seConnecter as connexion } from './outils';

// Patients de démonstration : packages/db/prisma/seed-patients.ts (données fictives).
const LEFEBVRE = '019a3000-0000-7000-8000-000000000506'; // Droite délivrée il y a 2 ans.
const DUBOIS = '019a3000-0000-7000-8000-000000000508';

const CONTENU_PDF = '%PDF-1.7 ordonnance fictive';
const PDF_FICTIF = {
  name: 'ordonnance.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from(CONTENU_PDF),
};

async function seConnecter(page: Page): Promise<void> {
  await connexion(page, COMPTES.assistanteNord);
  await expect(page.getByRole('heading', { name: /^Bonjour/ })).toBeVisible();
}

/** Crée un dossier depuis l'onglet « Dossiers » de la fiche patient. */
async function creerDossier(
  page: Page,
  patientId: string,
  oreilles: string,
  types: readonly [string, string][],
): Promise<void> {
  await page.goto(`/patients/${patientId}`);
  await page.getByRole('link', { name: 'Dossiers', exact: true }).last().click();
  await expect(page).toHaveURL(new RegExp(`/patients/${patientId}/dossiers$`));
  await page.getByRole('link', { name: 'Nouveau dossier' }).click();
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Audioprothésiste').selectOption({ label: 'Camille Audio' });
  await page.getByLabel('Oreilles à appareiller').selectOption({ label: oreilles });
  for (const [oreille, type] of types) {
    await page.getByLabel(`${oreille} : type d’appareillage`).selectOption({ label: type });
  }
  await page.getByRole('button', { name: 'Créer le dossier' }).click();
  await expect(page.getByText('Dossier créé.')).toBeVisible();
  await page.waitForLoadState('networkidle');
}

async function saisirPrescription(page: Page): Promise<void> {
  await page.getByLabel('Rechercher un prescripteur').fill('Agathe');
  await page.getByRole('button', { name: /Agathe Démo/ }).click();
  await page.getByLabel('Date de la prescription').fill('2026-01-15');
  await page.getByLabel('Oreilles prescrites').selectOption({ label: 'Les deux oreilles' });
  await page.getByLabel('Scan de l’ordonnance').setInputFiles(PDF_FICTIF);
  await page.getByRole('button', { name: 'Enregistrer la prescription' }).click();
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
