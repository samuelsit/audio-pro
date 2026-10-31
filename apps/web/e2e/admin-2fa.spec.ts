import { readFile } from 'node:fs/promises';

import { ENTETES_CSV_MODELES } from '@ha/domain';
import { expect, test } from '@playwright/test';

import { codeTotp, COMPTES, motDePasseDemo, ouvrirSelecteurCentre, seConnecter } from './outils';

test.describe.configure({ mode: 'serial' });

// Dossier de démonstration : packages/db/prisma/seed-dossiers.ts (données fictives).
const DOSSIER_RENOUVELLEMENT = '019a7000-0000-7000-8000-000000000001';
const PDF_FICTIF = {
  name: 'ordonnance.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.7 ordonnance fictive'),
};

let secret = '';

test('l’ADMIN_CLIENT doit activer la 2FA, puis la saisir à chaque connexion', async ({ page }) => {
  await seConnecter(page, COMPTES.admin);

  // Première connexion : activation forcée avant tout accès.
  await expect(page).toHaveURL(/\/compte\/2fa$/);
  await page.goto('/admin/centres');
  await expect(page).toHaveURL(/\/compte\/2fa$/);

  await page.getByLabel('Mot de passe').fill(motDePasseDemo());
  await page.getByRole('button', { name: 'Commencer l’activation' }).click();
  secret = (await page.getByTestId('secret-totp').textContent()) ?? '';
  expect(secret).toMatch(/^[A-Z2-7]+$/);

  await page.getByLabel('Code à 6 chiffres').fill(await codeTotp(secret));
  await page.getByRole('button', { name: 'Activer' }).click();
  await expect(page.getByRole('heading', { name: 'Bonjour Alex' })).toBeVisible();

  // « Tous mes centres » est proposé à l'ADMIN_CLIENT et affiche les trois centres.
  await expect(page.getByTestId('centre-courant')).toHaveText('Tous mes centres');
  expect(await ouvrirSelecteurCentre(page)).toEqual([
    'Tous mes centres',
    'Centre Démo Centre',
    'Centre Démo Nord',
    'Centre Démo Sud',
  ]);
  await page.getByRole('link', { name: 'Centres' }).click();
  await expect(page.getByRole('link', { name: /^Centre Démo/ })).toHaveCount(3);

  // Reconnexion : le code TOTP est demandé.
  await page.getByRole('button', { name: 'Alex Admin' }).click();
  await page.getByRole('menuitem', { name: 'Se déconnecter' }).click();
  await expect(page).toHaveURL(/\/connexion$/);

  await seConnecter(page, COMPTES.admin);
  await expect(page).toHaveURL(/\/connexion\/2fa$/);
  await page.getByLabel('Code de vérification').fill(await codeTotp(secret));
  await page.getByRole('button', { name: 'Vérifier' }).click();
  await expect(page.getByRole('heading', { name: 'Bonjour Alex' })).toBeVisible();

  // Formulaires d'administration : utilisateur AUDIO, puis fiche praticien (RPPS contrôlé).
  await page.getByRole('link', { name: 'Utilisateurs' }).click();
  await page.getByRole('link', { name: 'Nouvel utilisateur' }).click();
  await page.getByLabel('Prénom').fill('Morgan');
  await page.getByLabel('Nom', { exact: true }).fill('Démo');
  await page.getByLabel('Adresse e-mail (identifiant de connexion)').fill('morgan@exemple.test');
  await page.getByLabel('Rôle').selectOption('AUDIO');
  await page.getByRole('checkbox', { name: 'Centre Démo Sud' }).check();
  await page.getByLabel('Mot de passe provisoire').fill('provisoire-demo-2026');
  await page.getByRole('button', { name: 'Créer le compte' }).click();
  await expect(page.getByRole('link', { name: 'Morgan Démo' })).toBeVisible();
  await expect(page.getByText('Utilisateur enregistré.')).toBeVisible();

  await page.getByRole('link', { name: 'Praticiens' }).click();
  await page.getByRole('link', { name: 'Nouvelle fiche praticien' }).click();
  await page.getByLabel('Audioprothésiste').selectOption({ label: 'Morgan Démo' });
  await page.getByLabel('N° RPPS').fill('1234');
  await page.getByRole('checkbox', { name: 'Centre Démo Sud' }).check();
  await page.getByRole('button', { name: 'Créer la fiche' }).click();
  await expect(
    page.getByText('Le numéro RPPS doit comporter exactement 11 chiffres.'),
  ).toBeVisible();
  // La saisie est conservée après l'erreur.
  await expect(page.getByLabel('Audioprothésiste')).toHaveValue(/.+/);
  await expect(page.getByRole('checkbox', { name: 'Centre Démo Sud' })).toBeChecked();

  await page.getByLabel('N° RPPS').fill('100 000 000 01');
  await page.getByRole('button', { name: 'Créer la fiche' }).click();
  await expect(page.getByRole('row', { name: /Morgan Démo 10000000001/ })).toBeVisible();

  // Catalogue : modèles du seed, création avec contrôle des codes LPP, import CSV tout ou rien.
  await page.getByRole('link', { name: 'Modèles', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Aurore 1 C' })).toBeVisible();
  await page.getByRole('link', { name: 'Nouveau modèle' }).click();
  await page.getByLabel('Fabricant').selectOption({ label: 'Sonora Démo' });
  await page.getByLabel('Gamme').fill('Lyra');
  await page.getByLabel('Modèle', { exact: true }).fill('Lyra Test');
  await page.getByLabel('Type').selectOption({ label: 'RIC' });
  await page.getByLabel('Classe').selectOption({ label: 'Classe II' });
  await page.getByLabel('Codes LPP associés').fill('2392530 9999999');
  await page.getByLabel('Prix de vente conseillé (€)').fill('1 290,00');
  await page.getByRole('button', { name: 'Créer le modèle' }).click();
  await expect(page.locator('#codesLpp-erreur')).toHaveText('Code(s) LPP inconnu(s) : 9999999.');
  await page.getByLabel('Codes LPP associés').fill('2392530 2341840');
  await page.getByRole('button', { name: 'Créer le modèle' }).click();
  await expect(
    page.getByRole('row', { name: /Lyra Test Sonora Démo Lyra RIC Classe II 2/ }),
  ).toBeVisible();

  const entete = ENTETES_CSV_MODELES.join(';');
  const fichierCsv = (lignes: string) => ({
    name: 'modeles.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(`\uFEFF${entete}\n${lignes}\n`),
  });
  await page
    .getByLabel('Fichier CSV')
    .setInputFiles(fichierCsv('Inconnu;G;M;RIC;I;;950;;;;;;;;;;oui'));
  await page.getByRole('button', { name: 'Importer' }).click();
  await expect(page.getByText('Ligne 2 : Fabricant inconnu : Inconnu.')).toBeVisible();
  await page
    .getByLabel('Fichier CSV')
    .setInputFiles(fichierCsv('Vibra Démo;Écho;Écho CSV;intra;I;2351057;900;;;;;;;;;;oui'));
  await page.getByRole('button', { name: 'Importer' }).click();
  await expect(page.getByText('Import terminé : 1 créé(s), 0 mis à jour.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Écho CSV' })).toBeVisible();

  // Journal d'audit : les actions ci-dessus sont tracées, filtrables et exportables.
  await page.getByRole('link', { name: 'Journal d’audit' }).click();
  await expect(page.getByRole('heading', { name: 'Journal d’audit' })).toBeVisible();
  await expect(page.getByRole('cell', { name: /prenom : Morgan/ })).toBeVisible();
  await expect(page.getByRole('cell', { name: /rpps : 10000000001/ })).toBeVisible();
  await expect(page.getByText('Connexion', { exact: true }).first()).toBeVisible();

  await page
    .getByLabel('Utilisateur', { exact: true })
    // Compte qu'aucun test E2E n'utilise : les tests tournent en parallèle sur la même base.
    .selectOption({ label: 'Assistante Lou (lou.assistante@exemple.test)' });
  await page.getByRole('button', { name: 'Filtrer' }).click();
  await expect(page).toHaveURL(/utilisateurId=/);
  await expect(page.getByText('Aucune action ne correspond à ces filtres.')).toBeVisible();

  await page.getByRole('link', { name: 'Réinitialiser' }).click();
  await page.getByLabel('Du', { exact: true }).fill('2026-10-31');
  await page.getByLabel('Au', { exact: true }).fill('2026-10-01');
  await page.getByRole('button', { name: 'Filtrer' }).click();
  await expect(
    page.getByText('La date de fin doit être postérieure ou égale à la date de début.'),
  ).toBeVisible();

  await expect(page.getByRole('link', { name: 'Exporter en CSV' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Réinitialiser' }).click();
  await expect(page).toHaveURL(/\/admin\/journal$/);
  const [telechargement] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Exporter en CSV' }).click(),
  ]);
  expect(telechargement.suggestedFilename()).toMatch(/^journal-audit-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = await readFile((await telechargement.path()) ?? '', 'utf8');
  expect(csv.startsWith('\uFEFFDate et heure;Utilisateur;')).toBe(true);
  expect(csv).toContain('Création;Praticien');
  expect(csv).toContain('Export;Journal d’audit');
});

test('l’ADMIN_CLIENT force un renouvellement refusé, avec un motif et sans rechoisir le fichier', async ({
  page,
}) => {
  await seConnecter(page, COMPTES.admin);
  await page.getByLabel('Code de vérification').fill(await codeTotp(secret));
  await page.getByRole('button', { name: 'Vérifier' }).click();
  await expect(page.getByRole('heading', { name: 'Bonjour Alex' })).toBeVisible();

  await page.goto(`/dossiers/${DOSSIER_RENOUVELLEMENT}`);
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Rechercher un prescripteur').fill('Agathe');
  await page.getByRole('button', { name: /Agathe Démo/ }).click();
  await page.getByLabel('Date de la prescription').fill('2026-01-15');
  await page.getByLabel('Scan de l’ordonnance').setInputFiles(PDF_FICTIF);
  await page.getByRole('button', { name: 'Enregistrer la prescription' }).click();

  const blocage = page.getByRole('alert').filter({ hasText: 'Erreurs bloquantes' });
  await expect(blocage).toContainText('Moins de 4 ans depuis la dernière délivrance');
  await expect(blocage).toContainText('Prise en charge à partir du');

  // Sans motif, le navigateur refuse l'envoi ; le fichier choisi reste en place.
  await expect(page.getByLabel('Scan de l’ordonnance')).toHaveValue(/ordonnance\.pdf$/);
  await page.getByLabel('Motif du forçage').fill('Aide hors d’usage, accord de la caisse reçu');
  await page.getByRole('button', { name: 'Enregistrer malgré tout' }).click();

  await expect(page.getByRole('listitem').and(page.locator('[aria-current="step"]'))).toContainText(
    'Prescription OK',
  );
  await expect(page.getByText('Enregistrée par forçage : Alex Admin')).toBeVisible();
  await expect(page.getByText('Motif : Aide hors d’usage, accord de la caisse reçu')).toBeVisible();

  // Le journal trace le forçage sans le texte du motif.
  await page.goto('/admin/journal');
  await expect(page.getByRole('row', { name: /RENOUVELLEMENT_AVANT_DELAI/ })).toBeVisible();
  await expect(page.locator('main')).not.toContainText('accord de la caisse');
});
