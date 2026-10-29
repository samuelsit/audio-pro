import { defineConfig, devices } from '@playwright/test';

import { urlBaseJetable } from './test/env';

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
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm next dev --port ${port}`,
    url: `${baseURL}/connexion`,
    // Toujours un serveur dédié, branché sur la base E2E (jamais la base de dev).
    reuseExistingServer: false,
    env: { DATABASE_URL: databaseUrl, BETTER_AUTH_URL: baseURL },
  },
});
