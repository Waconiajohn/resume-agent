import { test as setup } from '@playwright/test';

/**
 * Global setup: real Supabase login → save storageState to .auth/user.json.
 * Runs once before all other test projects that depend on 'setup'.
 */
setup('authenticate', async ({ page }) => {
  // /app shows AuthGate (/ shows SalesPage)
  await page.goto('/app');

  const emailField = page.getByPlaceholder('Email');
  const hasLoginForm = await emailField.isVisible().catch(() => false);

  if (hasLoginForm) {
    await emailField.fill('jjschrup@yahoo.com');
    await page.getByPlaceholder('Password').fill('Scout123');
    await page.getByRole('button', { name: /Sign In/i }).click();
  }

  // Wait for the authenticated workspace shell. The app now lands in Workspace.
  await Promise.race([
    page.getByText('Your Pipeline').waitFor({ timeout: 20_000 }),
    page.getByRole('button', { name: /Open Benchmark Profile|Find Jobs/i }).first().waitFor({ timeout: 20_000 }),
  ]);

  // Save auth state
  await page.context().storageState({ path: '.auth/user.json' });
});
