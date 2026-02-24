import { test as setup } from '@playwright/test';

/**
 * Global setup: real Supabase login → save storageState to .auth/user.json.
 * Runs once before all other test projects that depend on 'setup'.
 */
setup('authenticate', async ({ page }) => {
  // /app shows AuthGate (/ shows SalesPage)
  await page.goto('/app');

  // Fill login form
  await page.getByPlaceholder('Email').fill('jjschrup@yahoo.com');
  await page.getByPlaceholder('Password').fill('Scout123');
  await page.getByRole('button', { name: /Sign In/i }).click();

  // Wait for authenticated landing screen
  await page.getByRole('button', { name: /Start New Session/i }).waitFor({ timeout: 15_000 });

  // Save auth state
  await page.context().storageState({ path: '.auth/user.json' });
});
