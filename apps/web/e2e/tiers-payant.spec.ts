import { expect, test } from '@playwright/test';

import {
  baseE2e,
  choisirCentre,
  COMPTES,
  creerDossier,
  etablirDevis,
  saisirPrescription,
  seConnecter,
} from './outils';

// Patients de démonstration : packages/db/prisma/seed-patients.ts (données fictives).
const PATIENT_VENTE = '019a3000-0000-7000-8000-000000000505';
const PATIENT_DEVIS = '019a3000-0000-7000-8000-000000000502';

test.setTimeout(120_000);

test('une PEC se demande depuis le devis, et son refus se lit sur la part AMC', async ({
  page,
}) => {
  await seConnecter(page, COMPTES.audioNordCentre);
  await expect(page.getByRole('heading', { name: /^Bonjour/ })).toBeVisible();
  await creerDossier(page, PATIENT_DEVIS, 'Oreille droite', [
    ['Oreille droite', 'Premier appareillage'],
  ]);
  await saisirPrescription(page);
  await etablirDevis(page, '950,00');

  // La demande reprend le poste de l'offre ; la plateforme simulée refuse ce numéro d'adhérent.
  await page.getByLabel('Statut de la prise en charge').selectOption({ label: 'À demander' });
  await page.getByLabel(/^Complémentaire/).selectOption({ label: 'Mutuelle Démo Avenir' });
  await page.getByLabel(/^Numéro d’adhérent/).fill('ADH-0');
  await expect(page.getByLabel(/^Oreille droite/)).not.toHaveValue('');
  await page.getByRole('button', { name: 'Enregistrer la prise en charge' }).click();
  await expect(page.getByText('Prise en charge enregistrée.')).toBeVisible();
  await page.getByRole('button', { name: 'Demander par la plateforme' }).click();
  await expect(page.getByText('Réponse de la plateforme enregistrée.')).toBeVisible();

  await page.reload();
  await expect(page.getByLabel('Statut de la prise en charge')).toHaveValue('REFUSEE');
});

test('un virement se lettre sur une créance, qui s’exporte', async ({ page }) => {
  await seConnecter(page, COMPTES.responsable);
  await expect(page.getByRole('heading', { name: /^Bonjour/ })).toBeVisible();
  await choisirCentre(page, /Centre Démo Nord/);

  await page.goto(`/factures/nouvelle?patient=${PATIENT_VENTE}`);
  await page.waitForLoadState('networkidle');
  await page.locator('#centreId').selectOption({ label: 'Centre Démo Nord' });
  await page.getByRole('button', { name: 'Ouvrir la vente' }).click();
  await expect(page.getByRole('heading', { name: 'Facture (brouillon)' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Type de ligne').selectOption({ label: 'Piles' });
  const article = await page
    .locator('select[name="accessoireId"] option', { hasText: /pile/i })
    .first()
    .getAttribute('value');
  await page.getByLabel(/^Article/).selectOption(article ?? '');
  await page.getByLabel(/^Libellé/).fill('Piles fictives');
  await page.getByLabel(/^Quantité/).fill('2');
  await page.getByLabel(/^Prix unitaire TTC/).fill('3,00');
  await page.getByRole('button', { name: 'Ajouter la ligne' }).click();
  await expect(page.getByRole('cell', { name: 'Piles fictives' })).toBeVisible();
  await page.getByRole('button', { name: 'Valider la facture' }).click();
  await expect(page.getByRole('heading', { name: /^Facture FA-\d{6}$/ })).toBeVisible();

  // Une vente sans prescription n'a pas de part AMO : la créance est posée directement.
  const factureId = page.url().split('/').at(-1) ?? '';
  const db = baseE2e();
  const facture = await db.facture.findUniqueOrThrow({ where: { id: factureId } });
  await db.creance.create({
    data: {
      organisationId: facture.organisationId,
      centreId: facture.centreId,
      factureId,
      patientId: facture.patientId,
      type: 'AMO',
      organisme: 'CPAM démo',
      montantCentimes: 5_000,
      soldeCentimes: 5_000,
      dateEmission: new Date('2026-01-05T00:00:00.000Z'),
      echeanceAttendue: new Date('2026-01-12T00:00:00.000Z'),
    },
  });

  await page.goto('/tiers-payant');
  await expect(page.getByRole('link', { name: 'CPAM démo' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tiers payant' })).toBeVisible();

  // Un impayé, puisque son échéance est passée.
  await page.goto('/tiers-payant/impayes');
  await expect(page.getByRole('cell', { name: 'CPAM démo' })).toBeVisible();

  await page.goto('/tiers-payant/reglements');
  await page.waitForLoadState('networkidle');
  await page.getByText('Saisir un virement reçu').click();
  await page.getByLabel(/^Organisme/).fill('CPAM démo');
  await page.getByLabel(/^Référence du virement/).fill('VIR-E2E-1');
  await page.getByLabel(/^Part AMO/).fill('30,00');
  await page.getByRole('button', { name: 'Enregistrer le virement' }).click();
  await expect(page.getByRole('heading', { name: 'Règlement VIR-E2E-1' })).toBeVisible();
  await page.waitForLoadState('networkidle');

  // Lettrage partiel : la créance garde son solde.
  await page.getByLabel(/^Montant à lettrer sur/).fill('30,00');
  await page.getByRole('button', { name: 'Lettrer' }).click();
  await expect(page.getByText(/reste à lettrer 0,00/)).toBeVisible();

  await page.goto('/tiers-payant?statut=PARTIELLE');
  await expect(page.getByRole('cell', { name: '20,00 €' }).first()).toBeVisible();

  const csv = await page.request.get('/tiers-payant/export');
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain('CPAM démo');
});
