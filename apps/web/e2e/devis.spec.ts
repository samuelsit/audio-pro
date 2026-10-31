import { expect, test, type Page } from '@playwright/test';

import { COMPTES, creerDossier, PDF_FICTIF, saisirPrescription, seConnecter } from './outils';

// Patient de démonstration : packages/db/prisma/seed-patients.ts (données fictives).
const FONTAINE = '019a3000-0000-7000-8000-000000000504';

const OFFRE_100 = 'Offre 100 % santé';

async function etablirDevis(page: Page, prix: string): Promise<void> {
  await page.getByRole('link', { name: 'Établir le devis' }).click();
  await page.waitForLoadState('networkidle');
  await page.getByLabel(`Aide auditive, ${OFFRE_100}, oreille droite`).selectOption({
    label: 'Acoustia Démo Aurore Aurore 1 C',
  });
  await page.getByLabel(`Prix TTC (€), ${OFFRE_100}, oreille droite`).fill(prix);
  await page.getByLabel(`Part AMC estimée (€), ${OFFRE_100}, oreille droite`).fill('710,00');
  await page.getByLabel('Présentation de la bobine T réalisée').check();
  await page.getByLabel('Fiche technique jointe').check();
  await page.getByRole('button', { name: 'Enregistrer le brouillon' }).click();
  await expect(page.getByText('Devis enregistré.')).toBeVisible();
  await page.waitForLoadState('networkidle');
}

const etapeCourante = (page: Page) => page.locator('[aria-current="step"]');

/** Statut du devis : une notification ne s'affiche qu'à un changement de chemin (ADR-011). */
const statutDevis = (page: Page, statut: string) =>
  expect(page.getByText(statut, { exact: true })).toBeVisible();

// Parcours complet, avec un rendu Chromium réel : plus long que le délai par défaut.
test.setTimeout(90_000);

test('un devis passe du brouillon à la signature, puis à une nouvelle version', async ({
  page,
}) => {
  await seConnecter(page, COMPTES.audioNordCentre);
  await expect(page.getByRole('heading', { name: /^Bonjour/ })).toBeVisible();
  await creerDossier(page, FONTAINE, 'Oreille droite', [
    ['Oreille droite', 'Premier appareillage'],
  ]);
  await saisirPrescription(page);
  await expect(etapeCourante(page)).toContainText('Prescription OK');
  const dossier = page.url();

  // Un dépassement du prix limite est signalé et bloque l'émission.
  await etablirDevis(page, '950,01');
  await expect(page.getByRole('alert').filter({ hasText: 'Points bloquants' })).toContainText(
    'dépasse le prix limite',
  );
  await page.getByRole('button', { name: 'Émettre le devis' }).click();
  await expect(page.getByText('Le devis ne peut pas être émis')).toBeVisible();

  await page.getByRole('link', { name: 'Modifier' }).click();
  await page.waitForLoadState('networkidle');
  await page.getByLabel(`Prix TTC (€), ${OFFRE_100}, oreille droite`).fill('950,00');
  await page.getByRole('button', { name: 'Enregistrer le brouillon' }).click();
  await expect(page.getByText('Devis enregistré.')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('alert').filter({ hasText: 'Points bloquants' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Émettre le devis' }).click();
  await statutDevis(page, 'Émis');

  const lien = page.getByRole('link', { name: 'Imprimer le devis' });
  const reponse = await page.request.get((await lien.getAttribute('href')) ?? '');
  expect(reponse.status()).toBe(200);
  expect(reponse.headers()['content-type']).toBe('application/pdf');
  expect(reponse.headers()['cache-control']).toContain('no-store');
  expect((await reponse.body()).subarray(0, 5).toString()).toBe('%PDF-');

  // Un devis émis ne se modifie plus directement.
  await expect(page.getByRole('link', { name: 'Modifier' })).toHaveCount(0);

  await page.getByLabel('Offre choisie pour l’essai').selectOption({ label: OFFRE_100 });
  await page.getByRole('button', { name: 'Démarrer l’essai' }).click();
  await expect(page.getByRole('button', { name: 'Déposer le scan' })).toBeVisible();
  await page.waitForLoadState('networkidle');

  await page.getByLabel('Devis signé scanné').setInputFiles(PDF_FICTIF);
  await page.getByRole('button', { name: 'Déposer le scan' }).click();
  await expect(page.getByRole('link', { name: 'Ouvrir le scan' })).toBeVisible();
  await page.waitForLoadState('networkidle');

  await page.getByLabel('Offre choisie à l’issue de l’essai').selectOption({ label: OFFRE_100 });
  await page.getByLabel('Signé par le patient').check();
  await page.getByRole('button', { name: 'Enregistrer la signature' }).click();
  await statutDevis(page, 'Signé');

  await page.goto(dossier);
  await expect(etapeCourante(page)).toContainText('Devis signé');
  await page.getByRole('link', { name: /^Devis \d{4}-\d{6} v1$/ }).click();

  // Toute modification d'un devis signé passe par une nouvelle version.
  await page.getByRole('button', { name: 'Nouvelle version' }).click();
  await expect(page.getByText('Nouvelle version créée.')).toBeVisible();
  await expect(page.getByRole('heading', { name: /v2$/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Modifier' })).toBeVisible();
});
