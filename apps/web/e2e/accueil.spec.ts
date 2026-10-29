import { expect, test } from '@playwright/test';

test('la page d’accueil affiche HA-Gestion', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/HA-Gestion/);
  await expect(page.getByRole('heading', { level: 1, name: 'HA-Gestion' })).toBeVisible();
});
