import { expect, test, type Page } from '@playwright/test';

import { COMPTES, seConnecter } from './outils';

test('inventaire : pointage, comptage et écart à justifier', async ({ page }) => {
  await seConnecter(page, COMPTES.responsable);
  await expect(page.getByRole('heading', { name: /^Bonjour/ })).toBeVisible();
  await page.goto('/stock');
  await expect(page.getByText(/^Valeur du stock : /)).toBeVisible();
  await page.goto('/stock/inventaires');
  await page.waitForLoadState('networkidle');
  await page.locator('#centreId').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Ouvrir un inventaire' }).click();
  await expect(page.getByRole('heading', { name: /^Inventaire – / })).toBeVisible();
  await page.waitForLoadState('networkidle');

  await page.getByLabel('Numéro de série').fill('INCONNU-E2E');
  await page.getByRole('button', { name: 'Pointer' }).click();
  await expect(page.getByText('INCONNU-E2E : pointé, non attendu dans ce centre.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Appareils en excédent (1)' })).toBeVisible();
  await page.getByLabel('Justification de INCONNU-E2E').fill('Retour non saisi');
  await page.getByRole('button', { name: 'Justifier' }).first().click();
  await page.waitForLoadState('networkidle');

  await page.getByRole('button', { name: 'Clôturer l’inventaire' }).click();
  await expect(page.getByText(/Il reste \d+ accessoire\(s\) à compter\./)).toBeVisible();
});

/** À l'hydratation, React réapplique le `defaultValue` d'un <select> : on attend qu'elle soit finie. */
async function formulairePret(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
}

test('réception à la douchette, recherche, transfert et réservation d’un appareil', async ({
  page,
}) => {
  const suffixe = Date.now().toString(36).toUpperCase();
  const premier = `E2E${suffixe}A`;
  const second = `E2E${suffixe}B`;

  await seConnecter(page, COMPTES.audioNordCentre);
  await expect(page.getByRole('heading', { name: /^Bonjour/ })).toBeVisible();
  await page.goto('/stock');
  await expect(page.getByRole('link', { name: 'Réception' })).toHaveAttribute(
    'href',
    '/stock/reception',
  );
  await page.goto('/stock/reception');
  await formulairePret(page);

  await page.getByLabel('Modèle').selectOption({ index: 1 });
  await page.getByLabel('Référence du bon de livraison').fill(`BL-${suffixe}`);
  await expect(page.getByLabel(/Prix d’achat/)).toHaveCount(0);

  // Une douchette tape le numéro puis Entrée : la touche n'envoie pas le formulaire.
  const scan = page.getByLabel(/^Numéros de série/);
  await scan.fill(premier.toLowerCase());
  await scan.press('Enter');
  await scan.pressSequentially(second);
  await scan.press('Enter');
  await expect(scan).toBeFocused();
  await expect(page.getByLabel('Numéros de série (2)')).toBeVisible();
  await scan.fill(premier);
  await scan.press('Enter');
  await expect(page.getByText(`${premier} est déjà dans la liste.`)).toBeVisible();
  await expect(
    page.getByRole('list', { name: 'Numéros saisis' }).getByRole('listitem'),
  ).toHaveCount(2);

  await page.getByRole('button', { name: 'Enregistrer la réception' }).click();
  await expect(page.getByText('2 appareil(s) reçu(s).')).toBeVisible();
  await expect(page.getByRole('link', { name: premier })).toBeVisible();

  // Un numéro déjà connu du fabricant est refusé, et la liste reste à l'écran.
  await page.goto('/stock/reception');
  await formulairePret(page);
  await page.getByLabel('Modèle').selectOption({ index: 1 });
  await page.getByLabel('Référence du bon de livraison').fill('BL-AUTRE');
  await scan.fill(second);
  await scan.press('Enter');
  await page.getByRole('button', { name: 'Enregistrer la réception' }).click();
  await expect(page.getByText(`Déjà enregistré chez ce fabricant : ${second}.`)).toBeVisible();
  await expect(page.getByLabel('Numéros de série (1)')).toBeVisible();

  // La recherche ignore la casse et ouvre la fiche.
  await page.goto('/stock');
  await page.getByLabel('Rechercher un numéro de série').fill(premier.toLowerCase());
  await page.getByLabel('Rechercher un numéro de série').press('Enter');
  await expect(page.getByRole('heading', { name: premier })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Réception', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Annuler la vente' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Vendre' })).toHaveCount(0);

  // Le panneau s'ouvre côté client : un clic avant l'hydratation serait perdu.
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Transférer' }).click();
  const transfert = page.getByRole('dialog');
  await transfert.getByLabel('Centre de destination').selectOption({ label: 'Centre Démo Nord' });
  await transfert.getByLabel('Motif').fill('Besoin du centre');
  await transfert.getByRole('button', { name: 'Confirmer' }).click();
  await expect(transfert).toHaveCount(0);
  await expect(
    page.getByRole('cell', { name: 'Centre Démo Centre → Centre Démo Nord' }),
  ).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Besoin du centre' })).toBeVisible();

  await page.getByRole('button', { name: 'Réserver' }).click();
  const reservation = page.getByRole('dialog');
  await reservation.getByLabel('Motif').fill('Réservé pour un essai');
  await reservation.getByRole('button', { name: 'Confirmer' }).click();
  await expect(reservation.getByRole('alert')).toHaveText('Choisir un patient.');
  // La recherche couvre le nom de naissance ; l'écran affiche le nom d'usage.
  await reservation.getByLabel('Patient').fill('Lemaire');
  await reservation.getByRole('button', { name: /Durand Claire/ }).click();
  await reservation.getByRole('button', { name: 'Confirmer' }).click();
  await expect(reservation).toHaveCount(0);
  await expect(page.getByRole('cell', { name: 'En stock → Réservé' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Durand Claire' })).toBeVisible();
  // Un appareil réservé ne se transfère plus.
  await expect(page.getByRole('button', { name: 'Transférer' })).toHaveCount(0);

  // Le centre courant reste Centre Démo Centre : l'appareil transféré n'y figure plus.
  await page.goto('/stock?statut=EN_STOCK');
  await expect(page.getByRole('link', { name: second })).toBeVisible();
  await expect(page.getByRole('link', { name: premier })).toHaveCount(0);
  const csv = await page.request.get('/stock/export?statut=EN_STOCK');
  expect(csv.ok()).toBe(true);
  const contenu = await csv.text();
  expect(contenu).toContain(second);
  expect(contenu).not.toContain(premier);
  expect(contenu).not.toContain('Prix');
});

test('les accessoires suivent une quantité par centre et refusent un stock négatif', async ({
  page,
}) => {
  await seConnecter(page, COMPTES.audioNordCentre);
  await expect(page.getByRole('heading', { name: /^Bonjour/ })).toBeVisible();
  await page.goto('/stock/accessoires/mouvement');
  await formulairePret(page);
  await page.getByLabel('Mouvement', { exact: true }).selectOption({ label: 'Sortie' });
  await page.getByLabel('Accessoire').selectOption({ label: 'Kit d’entretien Démo' });
  await page.getByLabel('Quantité').fill('100000');
  await page.getByLabel('Motif').fill('Trop');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.locator('#quantite-erreur')).toHaveText('Stock insuffisant dans ce centre.');

  await page.getByLabel('Quantité').fill('1');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('heading', { name: 'Accessoires et piles' })).toBeVisible();
  await page.getByRole('link', { name: 'Kit d’entretien Démo' }).first().click();
  await expect(page.getByRole('cell', { name: 'Sortie' })).toBeVisible();
});
