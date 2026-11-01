import { randomInt } from 'node:crypto';

import { expect, test, type Page } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';

import { choisirCentre, COMPTES, seConnecter } from './outils';

const FOURNISSEUR = 'Acoustia Démo';

test.setTimeout(180_000);

/** Vraie facture PDF, générée : l'extraction lit sa couche texte. */
async function facturePdf(lignes: readonly string[]): Promise<Buffer> {
  const document = await PDFDocument.create();
  const police = await document.embedFont(StandardFonts.Helvetica);
  const page = document.addPage();
  lignes.forEach((texte, rang) => {
    page.drawText(texte, { x: 40, y: 780 - rang * 18, size: 10, font: police });
  });
  return Buffer.from(await document.save());
}

async function ouvrirCommande(page: Page, numero: string): Promise<void> {
  await page.goto('/commandes');
  await page.getByRole('link', { name: numero }).click();
  await expect(page.getByRole('heading', { name: `Commande ${numero}` })).toBeVisible();
}

test('de la demande à l’écart de prix sur la facture', async ({ browser }) => {
  const suffixe = String(randomInt(1_000_000));
  const serie1 = `E2E${suffixe}A`;

  // L'assistante demande, sans voir aucun prix.
  const assistante = await (await browser.newContext()).newPage();
  await seConnecter(assistante, COMPTES.assistanteNord);
  await expect(assistante.getByRole('heading', { name: /^Bonjour/ })).toBeVisible();
  await assistante.goto('/commandes/nouvelle');
  await assistante.getByLabel('Centre livré').selectOption({ label: 'Centre Démo Nord' });
  await assistante.getByLabel('Fournisseur').selectOption({ label: FOURNISSEUR });
  await assistante.getByRole('button', { name: 'Créer la demande' }).click();
  const titre = assistante.getByRole('heading', { name: /^Commande CMD-/ });
  await expect(titre).toBeVisible();
  const numero = ((await titre.textContent()) ?? '').replace('Commande ', '');

  await assistante.getByLabel('Produit').selectOption({ index: 1 });
  await assistante.getByLabel('Quantité').fill('2');
  await assistante.getByRole('button', { name: 'Ajouter la ligne' }).click();
  await expect(assistante.getByRole('button', { name: 'Retirer' })).toBeVisible();
  await expect(assistante.getByText('Prix d’achat')).toHaveCount(0);

  // Sans règle pour ce fabricant, la demande attend une approbation.
  await assistante.getByRole('button', { name: 'Soumettre' }).click();
  await assistante.getByRole('button', { name: 'Confirmer' }).click();
  await expect(assistante.getByText('À approuver', { exact: true })).toBeVisible();
  await expect(assistante.getByRole('button', { name: 'Approuver' })).toHaveCount(0);

  // Le responsable approuve : le bon part.
  const responsable = await (await browser.newContext()).newPage();
  await seConnecter(responsable, COMPTES.responsable);
  await expect(responsable.getByRole('heading', { name: /^Bonjour/ })).toBeVisible();
  await choisirCentre(responsable, /Centre Démo Nord/);
  await ouvrirCommande(responsable, numero);
  await responsable.getByRole('button', { name: 'Approuver' }).click();
  await responsable.getByRole('button', { name: 'Confirmer' }).click();
  await expect(responsable.getByText('Envoyée', { exact: true })).toBeVisible();
  await expect(responsable.getByText('Envoi en attente')).toBeVisible();

  // L'assistante pointe une livraison partielle.
  await assistante.reload();
  await assistante.getByRole('link', { name: 'Pointer une livraison' }).click();
  await assistante.getByLabel('Bon de livraison').fill(`BL-${suffixe}`);
  await assistante.getByLabel(/^Numéros de série/).fill(serie1);
  await assistante.getByLabel(/^Numéros de série/).press('Enter');
  await assistante.getByRole('button', { name: 'Enregistrer la réception' }).click();
  await expect(assistante.getByText('Partiellement reçue', { exact: true })).toBeVisible();

  // La facture arrive, plus chère que la commande : l'écart se voit avant de valider.
  await responsable.goto('/commandes/factures');
  await responsable.getByLabel('Facture en PDF').setInputFiles({
    name: 'facture.pdf',
    mimeType: 'application/pdf',
    buffer: await facturePdf([
      `Facture n° FA-${suffixe}`,
      'Date : 07/01/2030',
      'Modele Demo 1 999,00 999,00',
      `S/N ${serie1}`,
      'Total HT 999,00',
      'TVA 199,80',
      'Total TTC 1 198,80',
    ]),
  });
  await responsable.getByRole('button', { name: 'Déposer' }).click();
  await expect(responsable.getByLabel(/^Numéro/).first()).toHaveValue(`FA-${suffixe}`);
  await expect(responsable.getByLabel(/^Total HT/)).toHaveValue('999,00');

  await responsable.getByLabel(/^Fournisseur/).selectOption({ label: FOURNISSEUR });
  await responsable.getByRole('button', { name: 'Enregistrer' }).click();

  // Le numéro de série reçu désigne la ligne de commande.
  await expect(responsable.getByLabel('Ligne de commande')).not.toHaveValue('');
  await responsable.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(responsable.getByText(/^Écart de prix/)).toBeVisible();

  await responsable.getByRole('button', { name: 'Valider la facture' }).click();
  await responsable.getByRole('button', { name: 'Confirmer' }).click();
  await expect(responsable.getByText('Validée', { exact: true })).toBeVisible();

  await responsable.goto('/commandes/ecarts');
  const ecart = responsable.getByRole('row', { name: new RegExp(`FA-${suffixe}`) });
  await expect(ecart.getByText('Écart de prix')).toBeVisible();
  await ecart.getByLabel('Traitement').selectOption({ label: 'Accepter' });
  await ecart.getByLabel('Commentaire').fill('Hausse de tarif');
  await ecart.getByRole('button', { name: 'Enregistrer' }).click();
  // L'écran montre les écarts ouverts : celui-ci en sort.
  await expect(ecart).toHaveCount(0);
});

test('une commande de piles sous le plafond part sans approbation', async ({ page }) => {
  await seConnecter(page, COMPTES.responsable);
  await expect(page.getByRole('heading', { name: /^Bonjour/ })).toBeVisible();
  await choisirCentre(page, /Centre Démo Nord/);
  await page.goto('/commandes/nouvelle');
  await page.getByLabel('Centre livré').selectOption({ label: 'Centre Démo Nord' });
  await page.getByLabel('Fournisseur').selectOption({ label: 'Piles et Accessoires Démo' });
  await page.getByRole('button', { name: 'Créer la demande' }).click();
  await page.getByLabel('Produit').selectOption({ index: 1 });
  await page.getByLabel('Quantité').fill('2');
  await page.getByRole('button', { name: 'Ajouter la ligne' }).click();
  await expect(page.getByRole('button', { name: 'Retirer' })).toBeVisible();
  await page.getByRole('button', { name: 'Soumettre' }).click();
  await page.getByRole('button', { name: 'Confirmer' }).click();
  await expect(page.getByText('Envoyée', { exact: true })).toBeVisible();
  await expect(page.getByText('Sans approbation, selon une règle')).toBeVisible();
});
