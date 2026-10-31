import { defineConfig, devices } from '@playwright/test';

import { CHIFFREMENT_TEST, urlBaseJetable, urlsDesRoles } from './test/env';

const port = 3100;
const baseURL = `http://localhost:${port}`;
const databaseUrl = urlBaseJetable('DATABASE_URL_E2E');

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  use: {
    baseURL,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    // Connexions limitées par adresse IP : chaque worker est un poste distinct.
    extraHTTPHeaders: { 'x-forwarded-for': `10.0.0.${process.env.TEST_WORKER_INDEX ?? '0'}` },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm next dev --port ${port}`,
    url: `${baseURL}/connexion`,
    // Toujours un serveur dédié, branché sur la base E2E (jamais la base de dev).
    reuseExistingServer: false,
    env: {
      ...urlsDesRoles(databaseUrl),
      BETTER_AUTH_URL: baseURL,
      VITALE_LECTEUR: 'simulation',
      ...CHIFFREMENT_TEST,
    },
  },
});
