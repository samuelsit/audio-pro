import { randomInt } from 'node:crypto';

import { SignatureLienDesinscription } from '@ha/adapters';
import { expect, test } from '@playwright/test';

import { baseE2e, COMPTES, seConnecter } from './outils';

test.setTimeout(120_000);

/** Un patient de démonstration de Nord, avec une adresse e-mail unique à ce test (données fictives). */
async function patientDeNord() {
  const db = baseE2e();
  const centre = await db.centre.findFirstOrThrow({ where: { nom: { contains: 'Nord' } } });
  const patient = await db.patient.findFirstOrThrow({
    where: { centreId: centre.id, fusionneDansId: null },
    orderBy: { id: 'desc' },
  });
  await db.patient.update({
    where: { id: patient.id },
    data: {
      email: `relance-${String(randomInt(1_000_000))}@exemple.test`,
      consentementEmail: true,
    },
  });
  return { centre, patient };
}

// L'ADMIN_CLIENT de démonstration doit d'abord activer sa 2FA : l'écran des modèles est couvert en intégration.
test('une campagne se compte, puis se programme', async ({ page }) => {
  await seConnecter(page, COMPTES.responsable);
  await expect(page).not.toHaveURL(/connexion/);
  const nom = `Campagne ${String(randomInt(1_000_000))}`;
  await page.goto('/relances/campagnes/nouvelle');
  await page.getByLabel('Nom de la campagne').fill(nom);
  await page.getByLabel('Modèle').selectOption({ label: 'Invitation de démonstration' });
  await page.getByLabel('Canal').selectOption({ label: 'SMS' });
  await page.getByLabel(/Nord/).check();
  await page.getByRole('button', { name: 'Compter les destinataires' }).click();
  await expect(page.getByText(/destinataires sur \d+ patients du segment/)).toBeVisible();

  await page.getByLabel('Envoi programmé le').fill('2035-01-08T10:00');
  await page.getByRole('button', { name: 'Programmer la campagne' }).click();
  await expect(page.getByRole('cell', { name: nom })).toBeVisible();
  await expect(page.getByText('Programmée').first()).toBeVisible();
});

test('une désinscription coupe le canal et se voit sur la fiche', async ({ page, browser }) => {
  const { centre, patient } = await patientDeNord();
  const db = baseE2e();
  // L'ouvrier ne tourne pas ici : le message est posé tel qu'il le laisse après l'envoi.
  const message = await db.messagePatient.create({
    data: {
      organisationId: patient.organisationId,
      centreId: centre.id,
      patientId: patient.id,
      canal: 'EMAIL',
      finalite: 'SUIVI',
      statut: 'ENVOYE',
      envoyeLe: new Date(),
      cleIdempotence: `e2e:${String(randomInt(1_000_000))}`,
    },
  });
  const jeton = new SignatureLienDesinscription(Buffer.alloc(32, 9)).signer({
    organisationId: patient.organisationId,
    messageId: message.id,
  });

  await seConnecter(page, COMPTES.assistanteNord);
  await expect(page).not.toHaveURL(/connexion/);
  await page.goto(`/patients/${patient.id}/communications`);
  await expect(page.getByText('Envoyé', { exact: true })).toBeVisible();

  const visiteur = await browser.newContext();
  const publique = await visiteur.newPage();
  await publique.goto(`${new URL(page.url()).origin}/desinscription/${jeton}`);
  await expect(publique.getByText('rappels de rendez-vous compris')).toBeVisible();
  await publique.getByRole('button', { name: 'Confirmer' }).click();
  await expect(publique.getByText('C’est fait')).toBeVisible();
  await visiteur.close();

  await page.reload();
  await expect(page.getByText('Le patient s’est opposé à : E-mail')).toBeVisible();
  await expect(page.getByText('Lien de désinscription').first()).toBeVisible();

  await page.getByLabel('Canal').selectOption({ label: 'E-mail' });
  await page.getByLabel('Suivi').check();
  await page.getByRole('button', { name: 'Noter le consentement du patient' }).click();
  await expect(page.getByText('Nouveau consentement noté').first()).toBeVisible();
  await expect(page.getByText('Le patient s’est opposé')).toBeHidden();
});
