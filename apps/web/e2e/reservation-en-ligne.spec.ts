import { randomInt } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { SignatureLienRdv } from '@ha/adapters';
import { expect, test, type Page } from '@playwright/test';

import { FICHIER_NOTIFICATIONS_E2E } from '../test/env';

import { baseE2e, COMPTES, seConnecter } from './outils';

// Parcours public du centre Nord, ouvert par le seed. Les créneaux suivent la vraie date (horizon), et ces tests
// se disputeraient le premier d'entre eux : ils s'exécutent à la suite.
test.describe.configure({ mode: 'serial' });
// Un site tiers simulé est public aux yeux de Chrome, qui lui refuserait d'appeler le serveur local : propre au
// test, un vrai widget charge le script depuis une adresse publique.
test.use({ launchOptions: { args: ['--disable-features=LocalNetworkAccessChecks'] } });

const PAGE = '/rdv/reseau-demo/nord';
const CENTRE_NORD = '019a3000-0000-7000-8000-0000000000a1';

function telephoneFictif(): string {
  return `06${String(randomInt(10_000_000, 99_999_999))}`;
}

function posterVisiteur(page: Page) {
  // Limitation par adresse IP : chaque test vient d'un poste distinct.
  return page.setExtraHTTPHeaders({
    'x-forwarded-for': `10.1.${String(randomInt(256))}.${String(randomInt(256))}`,
  });
}

function codeSms(telephone: string): string {
  const canonique = `+33${telephone.slice(1)}`;
  const messages = readFileSync(FICHIER_NOTIFICATIONS_E2E, 'utf8').trim().split('\n');
  const dernier = messages
    .map((ligne) => JSON.parse(ligne) as { destinataire: string; texte: string })
    .findLast((m) => m.destinataire === canonique);
  const code = dernier ? /\d{6}/.exec(dernier.texte)?.[0] : undefined;
  if (code === undefined) {
    throw new Error('Aucun code reçu.');
  }
  return code;
}

async function reserver(page: Page, telephone: string, nom: string): Promise<void> {
  await posterVisiteur(page);
  await page.goto(PAGE);
  await page
    .getByRole('button', { name: /^\d{2}h\d{2}$/ })
    .first()
    .click();
  await page.getByLabel('Nom', { exact: false }).first().fill(nom);
  await page.getByLabel('Prénom').fill('Alex');
  await page.getByLabel('Date de naissance').fill('12/03/1950');
  await page.getByLabel('Téléphone mobile').fill(telephone);
  await page.getByLabel(/J’accepte que mes données/).check();
  await page.getByRole('button', { name: 'Recevoir le code' }).click();
  await expect(page.getByLabel('Code reçu par SMS')).toBeVisible();
  await page.getByLabel('Code reçu par SMS').fill(codeSms(telephone));
  await page.getByRole('button', { name: 'Confirmer le rendez-vous' }).click();
}

async function derniereReservation(telephone: string) {
  return baseE2e().reservationEnLigne.findFirstOrThrow({
    where: { telephone: `+33${telephone.slice(1)}` },
    orderBy: { createdAt: 'desc' },
    include: { rendezVous: true },
  });
}

function lienDe(reservation: { id: string; organisationId: string }): string {
  const signature = new SignatureLienRdv(Buffer.alloc(32, 9));
  const jeton = signature.signer({
    organisationId: reservation.organisationId,
    reservationId: reservation.id,
  });
  return `/rdv/lien/${jeton}`;
}

test('un patient réserve seul, et devient un prospect de l’agenda', async ({ page }) => {
  const telephone = telephoneFictif();
  await reserver(page, telephone, 'Prospecte');
  await expect(page.getByRole('heading', { name: 'Rendez-vous confirmé' })).toBeVisible();
  const reservation = await derniereReservation(telephone);
  expect(reservation.rendezVous).toMatchObject({
    statut: 'CONFIRME',
    origine: 'EN_LIGNE',
    prospectNom: 'Prospecte Alex',
  });
  await expect(
    baseE2e().notification.count({ where: { reservationId: reservation.id } }),
  ).resolves.toBe(1);
});

test('le patient annule par son lien, sans qu’ouvrir la page suffise', async ({ page }) => {
  const telephone = telephoneFictif();
  await reserver(page, telephone, 'Annulant');
  await expect(page.getByRole('heading', { name: 'Rendez-vous confirmé' })).toBeVisible();
  const reservation = await derniereReservation(telephone);
  await page.goto(lienDe(reservation));
  await expect(page.getByRole('heading', { name: 'Votre rendez-vous' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Annulant');
  expect((await derniereReservation(telephone)).rendezVous?.statut).toBe('CONFIRME');
  await page.getByRole('button', { name: 'Annuler ce rendez-vous' }).click();
  await page.getByRole('button', { name: 'Confirmer l’annulation' }).click();
  await expect(page.getByRole('heading', { name: 'Rendez-vous annulé' })).toBeVisible();
  expect((await derniereReservation(telephone)).rendezVous?.statut).toBe('ANNULE');
});

test('un lien falsifié répond comme une page inconnue', async ({ page }) => {
  const reponse = await page.goto('/rdv/lien/org.res.signature');
  expect(reponse?.status()).toBe(404);
});

test('une adresse inconnue répond 404 sans passer par la connexion', async ({ page }) => {
  const reponse = await page.goto('/rdv/reseau-demo/inconnu');
  expect(reponse?.status()).toBe(404);
  await expect(page).not.toHaveURL(/connexion/);
});

test('le widget s’intègre à un site tiers, le logiciel non', async ({ page, baseURL, request }) => {
  const siteDuClient = 'https://site-du-client.test/';
  await page.route(siteDuClient, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><body><h1>Site du client</h1><script src="${String(baseURL)}/rdv-widget.js" data-client="reseau-demo" data-centre="nord"></script></body></html>`,
    }),
  );
  await page.goto(siteDuClient);
  const cadre = page.frameLocator('iframe');
  await expect(cadre.getByRole('heading', { name: /Prendre rendez-vous/ })).toBeVisible();
  await expect(cadre.getByText('Horaires d’ouverture')).toHaveCount(0);
  // Un créneau se verrouille depuis le cadre : les server actions y fonctionnent, sans cookie.
  await cadre
    .getByRole('button', { name: /^\d{2}h\d{2}$/ })
    .first()
    .click();
  await expect(cadre.getByLabel('Prénom')).toBeVisible();

  const publique = await request.get(PAGE);
  expect(publique.headers()['content-security-policy']).toBe('frame-ancestors *');
  const logiciel = await request.get('/connexion');
  expect(logiciel.headers()['content-security-policy']).toBe("frame-ancestors 'none'");
  const lien = await request.get('/rdv/lien/org.res.signature');
  expect(lien.headers()['x-frame-options']).toBe('DENY');
  expect(lien.headers()['referrer-policy']).toBe('no-referrer');
});

test('en validation manuelle, le centre accepte la demande', async ({ page, browser }) => {
  await baseE2e().parametresReservation.update({
    where: { centreId: CENTRE_NORD },
    data: { validation: 'MANUELLE' },
  });
  try {
    const telephone = telephoneFictif();
    await reserver(page, telephone, 'Demandeur');
    await expect(page.getByRole('heading', { name: 'Demande enregistrée' })).toBeVisible();

    const contexte = await browser.newContext();
    const accueil = await contexte.newPage();
    await seConnecter(accueil, COMPTES.assistanteNord);
    await expect(accueil.getByRole('heading', { name: /Bonjour/ })).toBeVisible();
    await accueil.goto('/agenda/demandes');
    const ligne = accueil.getByRole('listitem').filter({ hasText: 'Demandeur' });
    await ligne.getByRole('button', { name: 'Accepter' }).click();
    await expect(ligne).toHaveCount(0);
    expect((await derniereReservation(telephone)).rendezVous?.statut).toBe('CONFIRME');
    await contexte.close();
  } finally {
    await baseE2e().parametresReservation.update({
      where: { centreId: CENTRE_NORD },
      data: { validation: 'AUTOMATIQUE' },
    });
  }
});

test('un responsable règle son centre et trouve le lien à publier', async ({ page }) => {
  await seConnecter(page, COMPTES.responsable);
  await expect(page.getByRole('heading', { name: /Bonjour/ })).toBeVisible();
  await page.goto('/agenda/parametres');
  await expect(page.getByRole('heading', { name: 'Réservation en ligne' })).toBeVisible();
  await expect(page.getByText(/\/rdv\/reseau-demo\//).first()).toBeVisible();
  await page.getByLabel('Horizon de réservation (jours)').fill('45');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByText(/Réservation en ligne enregistrée/)).toBeVisible();
});
