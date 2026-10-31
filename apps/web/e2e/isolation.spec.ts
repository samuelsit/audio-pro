import { expect, test } from '@playwright/test';

import { COMPTES, ouvrirSelecteurCentre, seConnecter } from './outils';

// Identifiants du seed (données fictives) : le réseau, vu depuis le centre indépendant.
const PATIENT_RESEAU = '019a3000-0000-7000-8000-000000000501';
const DOSSIER_RESEAU = '019a7000-0000-7000-8000-000000000001';
const CENTRE_RESEAU = '019a3000-0000-7000-8000-0000000000a1';
const FAUX_ID = '019a3000-0000-7000-8000-00000000ffff';

// Une seule connexion par test : les connexions sont limitées par adresse IP.
test('un utilisateur du centre indépendant ne voit rien du réseau', async ({ page }) => {
  await seConnecter(page, COMPTES.audioIndependant);
  await expect(page.getByRole('heading', { name: 'Bonjour Maxime' })).toBeVisible();

  for (const chemin of [
    `/patients/${PATIENT_RESEAU}`,
    `/patients/${PATIENT_RESEAU}/modifier`,
    `/patients/${PATIENT_RESEAU}/dossiers`,
    `/dossiers/${DOSSIER_RESEAU}`,
    `/dossiers/${DOSSIER_RESEAU}/devis/nouveau`,
    `/admin/centres/${CENTRE_RESEAU}`,
  ]) {
    await test.step(`page ${chemin}`, async () => {
      const reponse = await page.goto(chemin);
      expect(reponse?.status()).toBe(404);
    });
  }

  for (const chemin of [
    `/dossiers/${DOSSIER_RESEAU}/essai/compte-rendu`,
    `/dossiers/${DOSSIER_RESEAU}/essai/justificatif`,
    `/dossiers/${DOSSIER_RESEAU}/facture/justificatif`,
    `/dossiers/${DOSSIER_RESEAU}/prescriptions/${FAUX_ID}/scan`,
    `/dossiers/${DOSSIER_RESEAU}/devis/${FAUX_ID}/pdf`,
    `/dossiers/${DOSSIER_RESEAU}/devis/${FAUX_ID}/scan`,
  ]) {
    await test.step(`document ${chemin}`, async () => {
      const reponse = await page.request.get(chemin);
      expect(reponse.status()).toBe(404);
    });
  }

  await page.goto('/patients');
  await expect(page.getByRole('link', { name: 'DELORME' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'LEMAIRE' })).toHaveCount(0);
});

test('un responsable choisit parmi ses centres, sans Administration', async ({ page }) => {
  await seConnecter(page, COMPTES.responsable);
  await expect(page.getByTestId('centre-courant')).toHaveText('Tous mes centres');
  expect(await ouvrirSelecteurCentre(page)).toEqual([
    'Tous mes centres',
    'Centre Démo Centre',
    'Centre Démo Nord',
  ]);
  await expect(page.getByRole('link', { name: 'Administration' })).toHaveCount(0);
  const reponse = await page.goto('/admin/centres');
  expect(reponse?.status()).toBe(404);
});
