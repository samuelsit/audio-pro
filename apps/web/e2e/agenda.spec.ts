import { expect, test, type Page } from '@playwright/test';

import { baseE2e, COMPTES, seConnecter } from './outils';

// Lundis d'hiver lointains : aucun rendez-vous de démonstration n'y tombe. Un lundi par test, car ils
// tournent en parallèle sur la même base.
const LUNDI = '2030-01-07';
const LUNDI_SUIVANT = '2030-01-14';
const LUNDI_RECHERCHE = '2030-01-21';
const LUNDI_DUREE = '2030-01-28';
const PX_PAR_MINUTE = 1.2;

/** La connexion redirige vers l'accueil : naviguer avant serait renvoyé à la connexion. */
async function connecter(page: Page, email: string): Promise<void> {
  await seConnecter(page, email);
  await expect(page.getByRole('heading', { name: /^Bonjour/ })).toBeVisible();
}

async function creerProspect(page: Page, heure: string, nom: string): Promise<void> {
  await page.getByRole('button', { name: 'Nouveau rendez-vous' }).click();
  await page.getByLabel('Type').selectOption({ label: 'Suivi' });
  await page.getByLabel('Prospect').check();
  await page.getByLabel('Nom', { exact: true }).fill(nom);
  await page.getByLabel('Téléphone').fill('0123456789');
  await page.getByLabel('Heure').fill(heure);
  await page.getByLabel('Praticien').selectOption({ label: 'Camille Audio' });
  await page.getByRole('button', { name: 'Créer le rendez-vous' }).click();
  await expect(page.getByRole('button', { name: new RegExp(nom) })).toBeVisible();
}

async function glisser(page: Page, nom: string, minutes: number): Promise<void> {
  const carte = page.getByRole('button', { name: new RegExp(nom) });
  const boite = await carte.boundingBox();
  if (!boite) {
    throw new Error('Carte introuvable.');
  }
  const x = boite.x + boite.width / 2;
  const y = boite.y + 8;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + (minutes * PX_PAR_MINUTE) / 2, { steps: 4 });
  await page.mouse.move(x, y + minutes * PX_PAR_MINUTE, { steps: 4 });
  await page.mouse.up();
}

test('créer un prospect, glisser son rendez-vous, puis heurter un créneau pris', async ({
  page,
}) => {
  await connecter(page, COMPTES.assistanteNord);
  await page.goto(`/agenda?vue=praticiens&date=${LUNDI}`);
  await expect(page.getByText('Camille Audio', { exact: true })).toBeVisible();
  await expect(page.getByText('Alix Audio', { exact: true })).toBeVisible();

  await creerProspect(page, '09:00', 'E2E Glissé');
  await glisser(page, 'E2E Glissé', 60);
  await expect(page.getByRole('button', { name: /^10:00 Suivi E2E Glissé/ })).toBeVisible();
  await expect
    .poll(async () => {
      const rdv = await baseE2e().rendezVous.findFirst({ where: { prospectNom: 'E2E Glissé' } });
      return rdv?.debut.toISOString();
    })
    .toBe('2030-01-07T09:00:00.000Z');

  await creerProspect(page, '09:00', 'E2E Bloqueur');
  await glisser(page, 'E2E Bloqueur', 60);
  await expect(page.getByText('Le praticien a déjà un rendez-vous sur ce créneau.')).toBeVisible();
  await expect(page.getByRole('button', { name: /^09:00 Suivi E2E Bloqueur/ })).toBeVisible();
});

test('hors disponibilités, le déplacement demande une confirmation', async ({ page }) => {
  await connecter(page, COMPTES.assistanteNord);
  await page.goto(`/agenda?vue=praticiens&date=${LUNDI_SUIVANT}`);
  await creerProspect(page, '11:00', 'E2E Midi');
  await glisser(page, 'E2E Midi', 120);
  await expect(page.getByText('Ce créneau est hors des disponibilités.')).toBeVisible();
  await page.getByRole('button', { name: 'Confirmer' }).click();
  await expect(page.getByRole('button', { name: /^13:00 Suivi E2E Midi/ })).toBeVisible();
});

test('redimensionner change la durée', async ({ page }) => {
  await connecter(page, COMPTES.assistanteNord);
  await page.goto(`/agenda?vue=praticiens&date=${LUNDI_DUREE}`);
  await creerProspect(page, '09:00', 'E2E Durée');
  const carte = page.getByRole('button', { name: /E2E Durée/ });
  const boite = await carte.boundingBox();
  if (!boite) {
    throw new Error('Carte introuvable.');
  }
  const x = boite.x + boite.width / 2;
  const y = boite.y + boite.height - 3;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 15 * PX_PAR_MINUTE, { steps: 3 });
  await page.mouse.move(x, y + 30 * PX_PAR_MINUTE, { steps: 3 });
  await page.mouse.up();
  await expect
    .poll(async () => {
      const rdv = await baseE2e().rendezVous.findFirst({ where: { prospectNom: 'E2E Durée' } });
      return rdv && (rdv.fin.getTime() - rdv.debut.getTime()) / 60_000;
    })
    .toBe(60);
  await expect(page.getByRole('button', { name: /^09:00 Suivi E2E Durée/ })).toBeVisible();
});

test('un rendez-vous sur un autre centre grise son seul jour, sans identité', async ({ page }) => {
  const centre = await baseE2e().centre.findFirstOrThrow({
    where: { nom: 'Centre Démo Centre' },
  });
  const type = await baseE2e().typeRdv.findFirstOrThrow({
    where: { organisationId: centre.organisationId, nom: 'Suivi' },
  });
  const praticien = await baseE2e().praticien.findFirstOrThrow({
    where: { utilisateur: { email: COMPTES.audioNordCentre } },
  });
  const auteur = await baseE2e().utilisateur.findFirstOrThrow({ where: { email: COMPTES.admin } });
  await baseE2e().rendezVous.create({
    data: {
      centreId: centre.id,
      typeRdvId: type.id,
      praticienId: praticien.id,
      prospectNom: 'E2E Ailleurs',
      prospectTelephone: '0123456789',
      debut: new Date('2030-02-07T14:00:00.000Z'),
      fin: new Date('2030-02-07T14:30:00.000Z'),
      origine: 'INTERNE',
      createdById: auteur.id,
    },
  });
  await connecter(page, COMPTES.assistanteNord);
  await page.goto(`/agenda?vue=semaine&date=2030-02-04&praticien=${praticien.id}`);
  await expect(page.getByTestId('colonne-2030-02-07').getByText('Autre centre')).toBeVisible();
  await expect(page.getByText('Autre centre')).toHaveCount(1);
  await expect(page.getByText('E2E Ailleurs')).toHaveCount(0);
});

test('un prospect arrive, devient patient et passe en salle d’attente', async ({ page }) => {
  const centre = await baseE2e().centre.findFirstOrThrow({ where: { nom: 'Centre Démo Nord' } });
  const type = await baseE2e().typeRdv.findFirstOrThrow({
    where: { organisationId: centre.organisationId, nom: 'Suivi' },
  });
  const praticien = await baseE2e().praticien.findFirstOrThrow({
    where: { utilisateur: { email: 'alix.audio@exemple.test' } },
  });
  const auteur = await baseE2e().utilisateur.findFirstOrThrow({
    where: { email: COMPTES.admin },
  });
  // Tard le soir : aucun rendez-vous de démonstration à cette heure-là.
  const debut = new Date();
  debut.setUTCHours(21, 0, 0, 0);
  await baseE2e().rendezVous.create({
    data: {
      centreId: centre.id,
      typeRdvId: type.id,
      praticienId: praticien.id,
      prospectNom: 'E2E Arrivant',
      prospectTelephone: '0123456789',
      debut,
      fin: new Date(debut.getTime() + 30 * 60_000),
      origine: 'TELEPHONE',
      createdById: auteur.id,
    },
  });

  await connecter(page, COMPTES.assistanteNord);
  await page.goto('/agenda/salle-attente');
  const attendus = page.getByRole('region', { name: 'Attendus' });
  await attendus.getByRole('button', { name: /E2E Arrivant/ }).click();

  await page.getByLabel('Nom de naissance').fill('Nouveauvenu');
  await page.getByLabel('Prénoms').fill('Claude');
  await page.getByLabel('Date de naissance').fill('12/03/1950');
  await page.getByLabel('Civilité').selectOption({ label: 'M.' });
  await page.getByLabel('Sexe').selectOption({ label: 'Masculin' });
  await page.getByRole('button', { name: 'Enregistrer l’arrivée' }).click();

  const arrives = page.getByRole('region', { name: 'Arrivé' });
  await expect(arrives.getByRole('button', { name: /Nouveauvenu Claude/ })).toBeVisible();
  await arrives.getByRole('button', { name: /Nouveauvenu Claude/ }).click();
  await page.getByRole('button', { name: 'Prendre en charge' }).click();
  await expect(
    page.getByRole('region', { name: 'En cours' }).getByRole('button', { name: /Nouveauvenu/ }),
  ).toBeVisible();
});

test('la recherche du prochain créneau mène à la réservation', async ({ page }) => {
  await connecter(page, COMPTES.assistanteNord);
  await page.goto('/agenda/creneaux');
  await page.getByLabel('Type').selectOption({ label: 'Suivi' });
  await page.getByLabel('Praticien').selectOption({ label: 'Alix Audio' });
  await page.getByLabel('À partir du').fill(LUNDI_RECHERCHE);
  await page.getByRole('button', { name: 'Chercher' }).click();
  await expect(page.getByRole('row', { name: /21\/01\/2030 09:00 Alix Audio/ })).toBeVisible();
  await page.getByRole('link', { name: 'Réserver' }).first().click();
  await expect(page.getByRole('heading', { name: 'Nouveau rendez-vous' })).toBeVisible();
  await expect(page.getByLabel('Heure')).toHaveValue('09:00');
});

test('les paramètres sont réservés à la gestion', async ({ page }) => {
  await connecter(page, COMPTES.assistanteNord);
  const refus = await page.goto('/agenda/parametres');
  expect(refus?.status()).toBe(404);
});

test('le responsable règle les cabines de son centre, sans toucher aux types', async ({ page }) => {
  await connecter(page, COMPTES.responsable);
  await page.goto('/agenda/parametres');
  await expect(page.getByRole('heading', { name: 'Paramètres de l’agenda' })).toBeVisible();
  await expect(page.getByText('Cabine 1')).toBeVisible();
  const nom = `Cabine E2E ${String(Date.now())}`;
  await page.getByLabel('Nom de la cabine').fill(nom);
  await page.getByRole('button', { name: 'Ajouter la cabine' }).click();
  await expect(page.getByText(nom)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Types de rendez-vous' })).toHaveCount(0);
  await baseE2e().cabine.deleteMany({ where: { nom } });
});
