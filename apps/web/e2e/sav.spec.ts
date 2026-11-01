import { randomInt } from 'node:crypto';

import { expect, test } from '@playwright/test';

import { baseE2e, choisirCentre, COMPTES, creerAppareilAurore, seConnecter } from './outils';

test.setTimeout(120_000);

/** Un appareil du modèle de démonstration vendu à un patient de Nord, sous garantie (données fictives). */
async function appareilVendu(numeroSerie: string): Promise<string> {
  const db = baseE2e();
  const modele = await db.modeleAideAuditive.findFirstOrThrow({ where: { nom: 'Aurore 1 C' } });
  const centre = await db.centre.findFirstOrThrow({
    where: { organisationId: modele.organisationId, nom: { contains: 'Nord' } },
  });
  const patient = await db.patient.findFirstOrThrow({
    where: { organisationId: modele.organisationId, centreId: centre.id },
    orderBy: { id: 'asc' },
  });
  const { id: appareilId } = await db.appareil.create({
    data: {
      organisationId: modele.organisationId,
      modeleId: modele.id,
      fabricantId: modele.fabricantId,
      centreId: centre.id,
      numeroSerie,
      statut: 'VENDU',
      patientId: patient.id,
      dateReception: new Date('2026-01-05T00:00:00.000Z'),
      referenceBonLivraison: 'BL-E2E',
    },
  });
  const debut = new Date();
  debut.setUTCHours(0, 0, 0, 0);
  const fin = new Date(debut);
  fin.setUTCFullYear(fin.getUTCFullYear() + 4);
  await db.garantieAppareil.create({
    data: {
      organisationId: modele.organisationId,
      appareilId,
      patientId: patient.id,
      dateDebut: debut,
      dateFin: fin,
    },
  });
  return patient.id;
}

test('ticket sous garantie : envoi au fabricant, échange sous un nouveau numéro', async ({
  page,
}) => {
  const suffixe = String(randomInt(1_000_000));
  const ancien = `SAVE2E${suffixe}`;
  const nouveau = `SAVNEUF${suffixe}`;
  await appareilVendu(ancien);

  await seConnecter(page, COMPTES.audioNordCentre);
  await expect(page.getByRole('heading', { name: /^Bonjour/ })).toBeVisible();
  await page.goto('/sav/nouveau');
  await page.getByLabel('Numéro de série').fill(ancien);
  await page.getByLabel('Motif').selectOption({ label: 'Panne' });
  await page.getByLabel(/^Ce que signale le patient/).fill('Ne s’allume plus');
  await page.getByRole('button', { name: 'Ouvrir le ticket' }).click();
  await expect(page.getByRole('heading', { name: /^SAV-\d{4}-\d{6}$/ })).toBeVisible();
  await expect(page.getByText('Sous garantie')).toBeVisible();
  const ticket = page.url();

  await page.waitForLoadState('networkidle');
  await page.getByLabel('Action').selectOption({ label: 'Échange' });
  await page.getByLabel(/^Diagnostic/).fill('Électronique hors service');
  await page.getByRole('button', { name: 'Enregistrer le diagnostic' }).click();
  await expect(page.getByRole('button', { name: 'Préparer le bon de retour' })).toBeVisible();

  // Le fabricant de l'appareil est proposé : son fournisseur est présélectionné s'il existe.
  await page.getByLabel('Fournisseur').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Préparer le bon de retour' }).click();
  await expect(page.getByRole('heading', { name: /^RET-\d{4}-\d{6}$/ })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.getByLabel(/^Numéro de suivi/).fill('SUIVI-E2E');
  await page.getByRole('button', { name: 'Marquer envoyé' }).click();
  await expect(page.getByText('SUIVI-E2E')).toBeVisible();

  await page.goto(ticket);
  await page.waitForLoadState('networkidle');
  await expect(page.getByText('Chez le fabricant')).toBeVisible();
  await page.getByLabel('Nouveau numéro de série').fill(nouveau);
  await page.getByLabel('Confirmer le numéro').fill(nouveau);
  await page.getByLabel('Bon de livraison').fill('BL-ECHANGE');
  await page.getByRole('button', { name: 'Enregistrer le remplaçant' }).click();
  await page.getByRole('button', { name: 'Remettre le remplaçant au patient' }).click();
  await expect(page.getByText('Clôturé', { exact: true })).toBeVisible();

  // L'historique du stock garde l'ancien numéro, relié au nouveau.
  await page.getByRole('link', { name: ancien }).click();
  await expect(page.getByRole('heading', { name: ancien })).toBeVisible();
  await expect(page.getByText('Remplacé', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: nouveau }).click();
  await expect(page.getByRole('heading', { name: nouveau })).toBeVisible();
  await expect(page.getByText('Vendu', { exact: true })).toBeVisible();
  await expect(page.getByText('reprise de l’appareil échangé')).toBeVisible();
});

test('prêt : tracé, signalé en retard, puis rendu', async ({ page }) => {
  const serie = `PRETE2E${String(randomInt(1_000_000))}`;
  await creerAppareilAurore(serie);
  const db = baseE2e();
  await db.appareil.updateMany({ where: { numeroSerie: serie }, data: { parcPret: true } });

  await seConnecter(page, COMPTES.audioNordCentre);
  await expect(page.getByRole('heading', { name: /^Bonjour/ })).toBeVisible();
  await choisirCentre(page, /Nord/);
  await expect(page.getByRole('combobox', { name: 'Centre courant' })).toContainText('Nord');

  await page.goto('/sav/prets');
  await page
    .getByRole('listitem')
    .filter({ hasText: serie })
    .getByRole('link', { name: 'Prêter' })
    .click();
  await expect(page.getByRole('heading', { name: 'Nouveau prêt' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Patient').fill('Le');
  await page.getByRole('list', { name: 'Suggestions' }).getByRole('button').first().click();
  await page.getByRole('button', { name: 'Prêter' }).click();
  await expect(page.getByRole('heading', { name: 'Prêts', exact: true })).toBeVisible();
  await expect(page.getByText('En cours', { exact: true }).first()).toBeVisible();

  // La date prévue ne se dépasse pas autrement qu'en la reculant.
  const { id } = await db.pretAppareil.findFirstOrThrow({
    where: { appareil: { numeroSerie: serie } },
  });
  const hier = new Date();
  hier.setUTCDate(hier.getUTCDate() - 1);
  hier.setUTCHours(0, 0, 0, 0);
  await db.pretAppareil.update({
    where: { id },
    data: { dateDebut: hier, dateRetourPrevue: hier },
  });

  await page.goto('/sav');
  await expect(page.getByText('Prêts en retard')).toBeVisible();
  await page.getByRole('link', { name: /appareils? prêtés?/ }).click();
  const rang = page.getByRole('row').filter({ hasText: serie });
  await expect(rang.getByText('En retard', { exact: true })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await rang.getByRole('button', { name: 'Enregistrer le retour' }).click();
  await expect(rang.getByText('Rendu', { exact: true })).toBeVisible();
});

test('comptoir : l’assistante vend et valide des piles', async ({ page }) => {
  const db = baseE2e();
  const centre = await db.centre.findFirstOrThrow({ where: { nom: 'Centre Démo Nord' } });
  const patient = await db.patient.findFirstOrThrow({
    where: { centreId: centre.id },
    orderBy: { id: 'asc' },
  });

  await seConnecter(page, COMPTES.assistanteNord);
  await expect(page.getByRole('heading', { name: /^Bonjour/ })).toBeVisible();
  await page.goto(`/patients/${patient.id}`);
  await page.getByRole('link', { name: 'Comptoir' }).click();
  await expect(page.getByText(/^Piles remboursées en \d{4}$/)).toBeVisible();
  await expect(page.getByText(/Aucun quota en vigueur/)).toBeVisible();
  await page.waitForLoadState('networkidle');

  await page
    .getByRole('listitem')
    .filter({ hasText: /pile/i })
    .first()
    .getByLabel(/^Quantité/)
    .fill('1');
  await page.getByRole('button', { name: 'Préparer la vente' }).click();
  await expect(page.getByRole('heading', { name: 'Facture (brouillon)' })).toBeVisible();
  await page.getByRole('button', { name: 'Valider la facture' }).click();
  await expect(page.getByRole('heading', { name: /^Facture [A-Z]+-\d{6}$/ })).toBeVisible();
});
