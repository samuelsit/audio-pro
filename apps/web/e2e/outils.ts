import { base32 } from '@better-auth/utils/base32';
import { createOTP } from '@better-auth/utils/otp';
import { prisma } from '@ha/db';
import { expect, type Page } from '@playwright/test';

import { urlBaseJetable } from '../test/env';

// Comptes de démonstration créés par packages/db/prisma/seed.ts (données fictives).
export const COMPTES = {
  admin: 'admin@exemple.test',
  assistanteNord: 'sacha.assistante@exemple.test',
  audioNordCentre: 'camille.audio@exemple.test',
} as const;

export function motDePasseDemo(): string {
  const mdp = process.env.SEED_MOT_DE_PASSE_DEMO;
  if (!mdp) {
    throw new Error('SEED_MOT_DE_PASSE_DEMO n’est pas défini (voir .env.example).');
  }
  return mdp;
}

export async function seConnecter(page: Page, email: string): Promise<void> {
  await page.goto('/connexion');
  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(motDePasseDemo());
  await page.getByRole('button', { name: 'Se connecter' }).click();
}

/** Code TOTP courant pour le secret Base32 affiché à l'activation. */
export async function codeTotp(secretBase32: string): Promise<string> {
  return createOTP(base32.decode(secretBase32)).totp();
}

export async function ouvrirSelecteurCentre(page: Page): Promise<string[]> {
  await page.getByRole('combobox', { name: 'Centre courant' }).click();
  const options = await page.getByRole('option').allTextContents();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('option')).toHaveCount(0);
  return options;
}

export async function choisirCentre(page: Page, nom: RegExp): Promise<void> {
  await page.getByRole('combobox', { name: 'Centre courant' }).click();
  await page.getByRole('option', { name: nom }).click();
  await page.waitForLoadState('networkidle');
}

export const CONTENU_PDF_FICTIF = '%PDF-1.7 ordonnance fictive';
export const PDF_FICTIF = {
  name: 'ordonnance.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from(CONTENU_PDF_FICTIF),
};

/** Crée un dossier depuis l'onglet « Dossiers » de la fiche patient. */
export async function creerDossier(
  page: Page,
  patientId: string,
  oreilles: string,
  types: readonly [string, string][],
): Promise<void> {
  await page.goto(`/patients/${patientId}`);
  await page.getByRole('link', { name: 'Dossiers', exact: true }).last().click();
  await expect(page).toHaveURL(new RegExp(`/patients/${patientId}/dossiers$`));
  await page.getByRole('link', { name: 'Nouveau dossier' }).click();
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Audioprothésiste').selectOption({ label: 'Camille Audio' });
  await page.getByLabel('Oreilles à appareiller').selectOption({ label: oreilles });
  for (const [oreille, type] of types) {
    await page.getByLabel(`${oreille} : type d’appareillage`).selectOption({ label: type });
  }
  await page.getByRole('button', { name: 'Créer le dossier' }).click();
  await expect(page.getByText('Dossier créé.')).toBeVisible();
  await page.waitForLoadState('networkidle');
}

export const OFFRE_100 = 'Offre 100 % santé';

/** Rédige un devis droite de classe I depuis le dossier, jusqu'au brouillon enregistré. */
export async function etablirDevis(page: Page, prix: string): Promise<void> {
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

function baseE2e() {
  process.env.DATABASE_URL = urlBaseJetable('DATABASE_URL_E2E');
  return prisma();
}

/** Place en stock du centre Nord un appareil du modèle du devis (données fictives). */
export async function creerAppareilAurore(numeroSerie: string): Promise<void> {
  const db = baseE2e();
  const modele = await db.modeleAideAuditive.findFirstOrThrow({ where: { nom: 'Aurore 1 C' } });
  const centre = await db.centre.findFirstOrThrow({
    where: { organisationId: modele.organisationId, nom: { contains: 'Nord' } },
  });
  await db.appareil.create({
    data: {
      organisationId: modele.organisationId,
      modeleId: modele.id,
      fabricantId: modele.fabricantId,
      centreId: centre.id,
      numeroSerie,
      dateReception: new Date('2026-01-05T00:00:00.000Z'),
      referenceBonLivraison: 'BL-E2E',
    },
  });
}

/** Recule le début de l'essai du dossier ouvert : la durée ne s'obtient pas autrement. */
export async function vieillirEssai(page: Page, jours: number): Promise<void> {
  const dossierId = new URL(page.url()).pathname.split('/')[2] ?? '';
  const debut = new Date();
  debut.setUTCDate(debut.getUTCDate() - jours);
  debut.setUTCHours(0, 0, 0, 0);
  await baseE2e().essai.update({ where: { dossierId }, data: { dateDebut: debut } });
}

/** Trace un rendez-vous du jour depuis le bloc Essai du dossier. */
export async function ajouterRdv(page: Page, type: string, compteRendu: string): Promise<void> {
  const volet = page.locator('details').filter({ hasText: 'Ajouter un rendez-vous' });
  if ((await volet.getAttribute('open')) === null) {
    await volet.locator('summary').click();
  }
  await page.getByLabel('Type', { exact: true }).selectOption({ label: type });
  await page.getByLabel('Compte rendu').fill(compteRendu);
  await page.getByRole('button', { name: 'Ajouter le rendez-vous' }).click();
  await expect(page.getByText(compteRendu).first()).toBeVisible();
  await page.waitForLoadState('networkidle');
}

export async function saisirPrescription(page: Page): Promise<void> {
  await page.getByLabel('Rechercher un prescripteur').fill('Agathe');
  await page.getByRole('button', { name: /Agathe Démo/ }).click();
  await page.getByLabel('Date de la prescription').fill('2026-01-15');
  await page.getByLabel('Oreilles prescrites').selectOption({ label: 'Les deux oreilles' });
  await page.getByLabel('Scan de l’ordonnance').setInputFiles(PDF_FICTIF);
  await page.getByRole('button', { name: 'Enregistrer la prescription' }).click();
}
