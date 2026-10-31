import { expect, test, type Page } from '@playwright/test';

import {
  ajouterRdv,
  choisirCentre,
  COMPTES,
  creerAppareilAurore,
  creerDossier,
  etablirDevis,
  OFFRE_100,
  PDF_FICTIF,
  saisirPrescription,
  seConnecter,
  vieillirEssai,
} from './outils';

// Patients de démonstration : packages/db/prisma/seed-patients.ts (données fictives).
const MERCIER = '019a3000-0000-7000-8000-000000000507';
const CARPENTIER = 'Carpentier Monique Jeanne'; // Essai du seed, à une semaine de son échéance.

const etapeCourante = (page: Page) => page.locator('[aria-current="step"]');

const volet = (page: Page, titre: string) =>
  page.locator('details').filter({ hasText: titre }).locator('summary');

// Parcours complet, avec un rendu Chromium réel : plus long que le délai par défaut.
test.setTimeout(120_000);

test('un essai va de la pose à l’achat, avec une prolongation et un changement', async ({
  page,
}) => {
  await creerAppareilAurore('E2E-ESSAI-1');
  await creerAppareilAurore('E2E-ESSAI-2');

  await seConnecter(page, COMPTES.audioNordCentre);
  await expect(page.getByRole('heading', { name: /^Bonjour/ })).toBeVisible();
  await creerDossier(page, MERCIER, 'Oreille droite', [['Oreille droite', 'Premier appareillage']]);
  await saisirPrescription(page);
  await expect(etapeCourante(page)).toContainText('Prescription OK');
  const dossier = page.url();

  await etablirDevis(page, '950,00');
  await page.getByRole('button', { name: 'Émettre le devis' }).click();
  await expect(page.getByLabel('Offre choisie pour l’essai')).toBeVisible();
  await page.waitForLoadState('networkidle');
  const urlDevis = page.url();

  // Un numéro inconnu est refusé, puis l'appareil en stock est confié.
  await page.getByLabel('Offre choisie pour l’essai').selectOption({ label: OFFRE_100 });
  await page.getByLabel('Numéro de série, oreille droite').fill('INCONNU-1');
  await page.getByRole('button', { name: 'Démarrer l’essai' }).click();
  await expect(page.getByText('Numéro de série inconnu.').first()).toBeVisible();
  await page.getByLabel('Offre choisie pour l’essai').selectOption({ label: OFFRE_100 });
  await page.getByLabel('Numéro de série, oreille droite').fill('e2e-essai-1');
  await page.getByRole('button', { name: 'Démarrer l’essai' }).click();
  await expect(page.getByRole('button', { name: 'Déposer le scan' })).toBeVisible();

  await page.goto(dossier);
  await expect(etapeCourante(page)).toContainText('En essai');
  await expect(page.getByRole('link', { name: 'E2E-ESSAI-1' })).toBeVisible();

  // Écran « Essais en cours » : l'essai du seed et celui-ci, avec leurs alertes.
  await page.goto('/essais');
  await expect(page.getByRole('heading', { name: 'Essais en cours' })).toBeVisible();
  await choisirCentre(page, /Nord/);
  const ligneSeed = page.getByRole('row').filter({ hasText: CARPENTIER });
  await expect(ligneSeed.getByText('Échéance proche')).toBeVisible();
  await expect(ligneSeed.getByText('Moins de 2 RDV')).toBeVisible();
  const ligne = page.getByRole('row').filter({ hasText: 'Mercier Sylvie' });
  await expect(ligne).toContainText('E2E-ESSAI-1');
  await ligne.getByRole('link', { name: 'Mercier Sylvie' }).click();
  await expect(page).toHaveURL(dossier);
  await page.waitForLoadState('networkidle');

  // Changement d'appareil : l'ancien revient en stock, l'essai continue.
  await ajouterRdv(page, 'Pose', 'Pose et premiers réglages');
  await volet(page, 'Changer un appareil').click();
  await page.getByLabel('Numéro de série du nouvel appareil').fill('E2E-ESSAI-2');
  await page.getByLabel('Motif du changement').fill('Larsen persistant');
  await page.getByRole('button', { name: 'Changer l’appareil' }).click();
  await expect(page.getByRole('link', { name: 'E2E-ESSAI-2' })).toBeVisible();
  await expect(page.getByText(/Larsen persistant/)).toBeVisible();
  await expect(etapeCourante(page)).toContainText('En essai');

  // Prolongation : l'échéance passe à 45 jours.
  await vieillirEssai(page, 40);
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.getByText('Dépassement').first()).toBeVisible();
  await volet(page, 'Prolonger l’essai').click();
  const jour = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
  await page.getByLabel('Date de la demande').fill(jour);
  await page.getByLabel('Motif', { exact: true }).fill('Suivi ORL en cours');
  await page.getByLabel('Demande écrite du prescripteur').setInputFiles(PDF_FICTIF);
  await page.getByRole('button', { name: 'Enregistrer la prolongation' }).click();
  await expect(page.getByRole('link', { name: 'Ouvrir la demande du prescripteur' })).toBeVisible();
  await expect(page.getByText('Dépassement')).toHaveCount(0);

  // La signature attend l'échéance repoussée et le second rendez-vous.
  await ajouterRdv(page, 'Fin d’essai', 'Bonne adaptation');
  await page.goto(urlDevis);
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Devis signé scanné').setInputFiles(PDF_FICTIF);
  await page.getByRole('button', { name: 'Déposer le scan' }).click();
  await expect(page.getByRole('link', { name: 'Ouvrir le scan' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Offre choisie à l’issue de l’essai').selectOption({ label: OFFRE_100 });
  await page.getByLabel('Signé par le patient').check();
  await page.getByRole('button', { name: 'Enregistrer la signature' }).click();
  await expect(page.getByText('La signature se recueille à l’issue')).toBeVisible();

  await page.goto(dossier);
  await vieillirEssai(page, 45);
  await page.goto(urlDevis);
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Offre choisie à l’issue de l’essai').selectOption({ label: OFFRE_100 });
  await page.getByLabel('Signé par le patient').check();
  await page.getByRole('button', { name: 'Enregistrer la signature' }).click();
  await expect(page.getByText('Signé', { exact: true })).toBeVisible();

  // Achat : dossier à facturer, appareil réservé au patient.
  await page.goto(dossier);
  await expect(etapeCourante(page)).toContainText('Devis signé');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Confirmer l’achat' }).click();
  await expect(etapeCourante(page)).toContainText('À facturer');
  await expect(page.getByText(/Achat, le/)).toBeVisible();

  // Compte rendu téléchargé, sans nom de patient dans le fichier.
  const lien = page.getByRole('link', { name: 'Compte rendu au prescripteur' });
  const reponse = await page.request.get((await lien.getAttribute('href')) ?? '');
  expect(reponse.status()).toBe(200);
  expect(reponse.headers()['content-type']).toBe('application/pdf');
  expect(reponse.headers()['content-disposition']).toContain('compte-rendu-essai.pdf');
  expect((await reponse.body()).subarray(0, 5).toString()).toBe('%PDF-');

  await page.getByRole('link', { name: 'E2E-ESSAI-2' }).click();
  await expect(page.getByText('Réservé').first()).toBeVisible();
  await expect(page.getByText('Cet appareil est suivi par un essai')).toBeVisible();

  await page.goto('/essais');
  await expect(page.getByRole('row').filter({ hasText: 'Mercier Sylvie' })).toHaveCount(0);

  // File « À facturer » : le dossier du seed et celui-ci sont bloqués, avec leur motif.
  await page.goto('/a-facturer?etat=BLOQUE');
  await expect(page.getByRole('heading', { name: 'À facturer' })).toBeVisible();
  const motif = 'Renseigner la prise en charge complémentaire.';
  await expect(page.getByRole('row').filter({ hasText: 'Durand Claire' })).toContainText(motif);
  const bloque = page.getByRole('row').filter({ hasText: 'Mercier Sylvie' });
  await expect(bloque).toContainText(motif);
  await bloque.getByRole('link', { name: 'Mercier Sylvie' }).click();
  await expect(page).toHaveURL(dossier);
  await page.waitForLoadState('networkidle');

  // Lignes de la préparation, sans numéro de facture.
  await expect(page.getByText('P1D', { exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '2351057' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'E2E-ESSAI-2' })).toBeVisible();

  // Couverture confirmée, puis prise en charge accordée avec son justificatif : le dossier est prêt.
  await page.getByRole('button', { name: 'Confirmer la couverture saisie' }).click();
  await expect(page.getByText(/Couverture AMO confirmée le/)).toBeVisible();
  await volet(page, 'Saisir la prise en charge').click();
  await page.getByLabel('Statut de la prise en charge').selectOption({ label: 'Accordée' });
  await page.getByLabel('Organisme').fill('Mutuelle fictive');
  await page.getByLabel('Plateforme').fill('Plateforme fictive');
  await page.getByLabel('Numéro d’accord').fill('ACC-E2E-1');
  await page.getByLabel('Montant accordé (€)').fill('710,00');
  await page.getByLabel('Date', { exact: true }).fill(new Date().toISOString().slice(0, 10));
  await page.getByLabel(/^Justificatif/).setInputFiles(PDF_FICTIF);
  await page.getByRole('button', { name: 'Enregistrer la prise en charge' }).click();
  await expect(page.getByText('Prêt à exporter')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ouvrir le justificatif' })).toBeVisible();

  await page.goto('/a-facturer');
  await expect(page.getByRole('row').filter({ hasText: 'Mercier Sylvie' })).toBeVisible();
  await page.getByRole('link', { name: /^Bloqués/ }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Durand Claire' })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Mercier Sylvie' })).toHaveCount(0);
});
