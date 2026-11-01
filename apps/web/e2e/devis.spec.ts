import { SignatureLienDocument } from '@ha/adapters';
import { expect, test, type Page } from '@playwright/test';

import {
  ajouterRdv,
  baseE2e,
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

// Patient de démonstration : packages/db/prisma/seed-patients.ts (données fictives).
const FONTAINE = '019a3000-0000-7000-8000-000000000504';

const etapeCourante = (page: Page) => page.locator('[aria-current="step"]');

/** Statut du devis : une notification ne s'affiche qu'à un changement de chemin (ADR-011). */
const statutDevis = (page: Page, statut: string) =>
  expect(page.getByText(statut, { exact: true })).toBeVisible();

// Parcours complet, avec un rendu Chromium réel : plus long que le délai par défaut.
test.setTimeout(120_000);

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

  await creerAppareilAurore('E2E-DEVIS-1');
  await page.getByLabel('Offre choisie pour l’essai').selectOption({ label: OFFRE_100 });
  await page.getByLabel('Numéro de série, oreille droite').fill('E2E-DEVIS-1');
  await page.getByRole('button', { name: 'Démarrer l’essai' }).click();
  await expect(page.getByRole('button', { name: 'Déposer le scan' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  const urlDevis = page.url();

  // La signature se recueille à l'issue de l'essai : 30 jours et 2 rendez-vous.
  await page.goto(dossier);
  await vieillirEssai(page, 30);
  await ajouterRdv(page, 'Pose', 'Pose et réglages');
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
  await statutDevis(page, 'Signé');

  await page.goto(dossier);
  await expect(etapeCourante(page)).toContainText('Devis signé');
  await page.getByRole('link', { name: /^Devis \d{4}-\d{6} v1$/ }).click();

  // Toute modification d'un devis signé passe par une nouvelle version.
  await page.getByRole('button', { name: 'Nouvelle version' }).click();
  await expect(page.getByText('Nouvelle version créée.')).toBeVisible();
  await expect(page.getByRole('heading', { name: /v2$/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Modifier' })).toBeVisible();

  // La version 2 se signe à l'écran, sur la tablette du centre, puis part au patient par lien.
  await page.getByRole('button', { name: 'Émettre le devis' }).click();
  await statutDevis(page, 'Émis');
  const urlV2 = page.url();
  await page.getByRole('link', { name: 'Signer à l’écran' }).click();
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Offre choisie à l’issue de l’essai').selectOption({ label: OFFRE_100 });
  await page.getByLabel(/Bon pour accord/).check();
  const cadre = await page.getByRole('img', { name: 'Cadre de signature' }).boundingBox();
  await page.mouse.move((cadre?.x ?? 0) + 40, (cadre?.y ?? 0) + 40);
  await page.mouse.down();
  await page.mouse.move((cadre?.x ?? 0) + 200, (cadre?.y ?? 0) + 120, { steps: 8 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Valider la signature' }).click();
  await statutDevis(page, 'Signé');
  await expect(page.getByRole('link', { name: 'Ouvrir le devis signé' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Télécharger la preuve' })).toBeVisible();

  const devisId = new URL(urlV2).pathname.split('/')[4] ?? '';
  const { dossier: dossierLu } = await baseE2e().devis.findUniqueOrThrow({
    where: { id: devisId },
    select: { dossier: { select: { id: true, organisationId: true, patientId: true } } },
  });
  await baseE2e().patient.update({
    where: { id: dossierLu.patientId },
    data: {
      email: 'patient.fictif@exemple.test',
      consentementEmail: true,
      dateNaissance: new Date('1950-03-12T00:00:00.000Z'),
    },
  });
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Canal').selectOption({ label: 'E-mail' });
  await page.getByRole('button', { name: 'Envoyer un lien sécurisé' }).click();
  await expect(page.getByText('Lien envoyé au patient.')).toBeVisible();

  // Le worker ne tourne pas ici : le jeton se recalcule, comme il le ferait pour le message.
  const lienEnvoye = await baseE2e().lienDocument.findFirstOrThrow({
    where: { dossierId: dossierLu.id },
    orderBy: { createdAt: 'desc' },
  });
  const jeton = new SignatureLienDocument(Buffer.alloc(32, 9)).signer({
    organisationId: dossierLu.organisationId,
    lienId: lienEnvoye.id,
  });
  const visiteur = await page.context().browser()?.newContext();
  const pagePublique = await visiteur?.newPage();
  if (!pagePublique) {
    throw new Error('Contexte de navigation indisponible.');
  }
  await pagePublique.goto(`${new URL(page.url()).origin}/document/${jeton}`);
  await pagePublique.getByLabel('Date de naissance').fill('1999-01-01');
  await pagePublique.getByRole('button', { name: 'Ouvrir le document' }).click();
  await expect(pagePublique.getByRole('alert')).toContainText('ne convient pas');
  const ouverture = await pagePublique.request.post(
    `${new URL(page.url()).origin}/document/${jeton}/ouvrir`,
    { form: { dateNaissance: '1950-03-12' } },
  );
  expect(ouverture.headers()['content-type']).toBe('application/pdf');
  await visiteur?.close();
});
