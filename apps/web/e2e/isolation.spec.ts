import { expect, test } from '@playwright/test';

import { codeTotp, COMPTES, motDePasseDemo, ouvrirSelecteurCentre, seConnecter } from './outils';

// Identifiants du seed (données fictives) : ceux du réseau, vus depuis le centre indépendant.
const PATIENT_RESEAU = '019a3000-0000-7000-8000-000000000501';
const DOSSIER_RESEAU = '019a7000-0000-7000-8000-000000000007';
const DEVIS_RESEAU = '019a7000-0000-7000-8000-000000000009';
const PRESCRIPTION_RESEAU = '019a7000-0000-7000-8000-000000000008';
const PRESCRIPTEUR_RESEAU = '019a7000-0000-7000-8000-000000000101';
const CENTRE_RESEAU = '019a3000-0000-7000-8000-0000000000a1';
const UTILISATEUR_RESEAU = '019a3000-0000-7000-8000-000000000201';
const PRATICIEN_RESEAU = '019a3000-0000-7000-8000-000000000301';
const FABRICANT_RESEAU = '019a4000-0000-7000-8000-000000000001';
const ACCESSOIRE_RESEAU = '019a5000-0000-7000-8000-000000000003';

/** Chemins ouverts à tout utilisateur connecté : le 404 y vient de l'isolation, pas du rôle. */
const CHEMINS_METIER = [
  `/patients/${PATIENT_RESEAU}`,
  `/patients/${PATIENT_RESEAU}/modifier`,
  `/patients/${PATIENT_RESEAU}/dossiers`,
  `/patients/${PATIENT_RESEAU}/dossiers/nouveau`,
  `/dossiers/${DOSSIER_RESEAU}`,
  `/dossiers/${DOSSIER_RESEAU}/devis/nouveau`,
  `/dossiers/${DOSSIER_RESEAU}/devis/${DEVIS_RESEAU}`,
  `/dossiers/${DOSSIER_RESEAU}/devis/${DEVIS_RESEAU}/modifier`,
  `/prescripteurs/${PRESCRIPTEUR_RESEAU}`,
];

const DOCUMENTS = [
  `/dossiers/${DOSSIER_RESEAU}/devis/${DEVIS_RESEAU}/pdf`,
  `/dossiers/${DOSSIER_RESEAU}/devis/${DEVIS_RESEAU}/scan`,
  `/dossiers/${DOSSIER_RESEAU}/essai/compte-rendu`,
  `/dossiers/${DOSSIER_RESEAU}/essai/justificatif`,
  `/dossiers/${DOSSIER_RESEAU}/facture/justificatif`,
  `/dossiers/${DOSSIER_RESEAU}/prescriptions/${PRESCRIPTION_RESEAU}/scan`,
];

/** Pages d'Administration : seul un ADMIN_CLIENT les atteint, donc lui seul prouve l'isolation. */
const CHEMINS_ADMIN = [
  `/admin/centres/${CENTRE_RESEAU}`,
  `/admin/utilisateurs/${UTILISATEUR_RESEAU}`,
  `/admin/praticiens/${PRATICIEN_RESEAU}`,
  `/admin/fabricants/${FABRICANT_RESEAU}`,
  `/admin/accessoires/${ACCESSOIRE_RESEAU}`,
];

// Une seule connexion par test : les connexions sont limitées par adresse IP.
test('un utilisateur du centre indépendant ne voit rien du réseau', async ({ page }) => {
  await seConnecter(page, COMPTES.audioIndependant);
  await expect(page.getByRole('heading', { name: 'Bonjour Maxime' })).toBeVisible();

  for (const chemin of CHEMINS_METIER) {
    await test.step(`page ${chemin}`, async () => {
      const reponse = await page.goto(chemin);
      expect(reponse?.status()).toBe(404);
    });
  }
  for (const chemin of DOCUMENTS) {
    await test.step(`document ${chemin}`, async () => {
      const reponse = await page.request.get(chemin);
      expect(reponse.status()).toBe(404);
    });
  }

  await page.goto('/patients');
  await expect(page.getByRole('link', { name: 'DELORME' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'LEMAIRE' })).toHaveCount(0);
});

test('un admin du centre indépendant ne voit rien du réseau, même en Administration', async ({
  page,
}) => {
  await seConnecter(page, COMPTES.adminIndependant);
  await expect(page).toHaveURL(/\/compte\/2fa$/);
  await page.getByLabel('Mot de passe').fill(motDePasseDemo());
  await page.getByRole('button', { name: 'Commencer l’activation' }).click();
  const secret = (await page.getByTestId('secret-totp').textContent()) ?? '';
  await page.getByLabel('Code à 6 chiffres').fill(await codeTotp(secret));
  await page.getByRole('button', { name: 'Activer' }).click();
  await expect(page.getByRole('heading', { name: 'Bonjour Robin' })).toBeVisible();

  for (const chemin of CHEMINS_ADMIN) {
    await test.step(`page ${chemin}`, async () => {
      const reponse = await page.goto(chemin);
      expect(reponse?.status()).toBe(404);
    });
  }
  await page.goto('/admin/centres');
  await expect(page.getByRole('link', { name: 'Centre Démo Rennes' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Centre Démo Nord' })).toHaveCount(0);
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
