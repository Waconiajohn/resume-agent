import { test, expect } from '@playwright/test';

test.describe('Auth smoke tests', () => {
  test('valid login shows landing screen', async ({ page }) => {
    await page.goto('/app');
    await page.getByPlaceholder('Email').fill('jjschrup@yahoo.com');
    await page.getByPlaceholder('Password').fill('Scout123');
    await page.getByRole('button', { name: /Sign In/i }).click();

    await expect(
      page.getByRole('button', { name: /Start New Session/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('invalid login shows error', async ({ page }) => {
    await page.goto('/app');
    await page.getByPlaceholder('Email').fill('jjschrup@yahoo.com');
    await page.getByPlaceholder('Password').fill('WrongPassword999');
    await page.getByRole('button', { name: /Sign In/i }).click();

    // Error message appears (Supabase returns "Invalid login credentials")
    await expect(page.locator('.text-red-400')).toBeVisible({ timeout: 10_000 });
  });
});
