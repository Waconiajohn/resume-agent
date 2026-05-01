import { expect, test } from '@playwright/test';
import { fillCredentials, goToAuthGate, mockAuthSuccess } from '../helpers/mock-auth-gate';

test.describe('Auth gate smoke', () => {
  test('successful sign in lands in Workspace Home', async ({ page }) => {
    await mockAuthSuccess(page);
    await goToAuthGate(page);

    await fillCredentials(page, 'test@example.com', 'password123');
    await page.getByRole('button', { name: /Sign In/i }).click();

    await expect(page).toHaveURL(/\/workspace$/, { timeout: 10_000 });
    await expect(page.getByText('Your Pipeline').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /^Find Jobs$/i }).first()).toBeVisible({ timeout: 10_000 });
  });

  test('successful sign out returns to the sales page', async ({ page }) => {
    await mockAuthSuccess(page);
    await goToAuthGate(page);

    await fillCredentials(page, 'test@example.com', 'password123');
    await page.getByRole('button', { name: /Sign In/i }).click();

    await expect(page.getByText('Your Pipeline').first()).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /Test User/i }).click();
    await page.getByRole('menuitem', { name: /^Sign out$/i }).click();

    await expect(page).toHaveURL(/\/sales$/, { timeout: 10_000 });
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10_000 });
  });
});
