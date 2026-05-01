import { expect, test } from '@playwright/test';
import {
  fillCredentials,
  goToAuthGate,
  mockAuthError,
} from '../helpers/mock-auth-gate';

test.describe('Auth gate error handling', () => {
  test('empty submission stays in browser validation without app error state', async ({ page }) => {
    await goToAuthGate(page);

    await page.getByRole('button', { name: /Sign In/i }).click();

    const emailInput = page.getByPlaceholder('Email');
    const validityState = await emailInput.evaluate((el: HTMLInputElement) => el.validity.valid);
    expect(validityState).toBe(false);
    await expect(page.locator('[role="alert"]')).not.toBeVisible({ timeout: 1_000 });
  });

  test('invalid email format is rejected by HTML5 validation', async ({ page }) => {
    await goToAuthGate(page);

    await fillCredentials(page, 'not-an-email', 'somepassword');
    await page.getByRole('button', { name: /Sign In/i }).click();

    const emailInput = page.getByPlaceholder('Email');
    const validityState = await emailInput.evaluate((el: HTMLInputElement) => el.validity.valid);
    expect(validityState).toBe(false);
  });

  test('wrong password shows the current auth error banner', async ({ page }) => {
    await mockAuthError(page, 'Invalid login credentials');
    await goToAuthGate(page);

    await fillCredentials(page, 'jjschrup@yahoo.com', 'WrongPassword999');
    await page.getByRole('button', { name: /Sign In/i }).click();

    await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('[role="alert"]')).toContainText(/email and password did not match/i);
  });

  test('after a failed login the form stays interactive for retry', async ({ page }) => {
    await mockAuthError(page, 'Invalid login credentials');
    await goToAuthGate(page);

    await fillCredentials(page, 'jjschrup@yahoo.com', 'BadPassword');
    await page.getByRole('button', { name: /Sign In/i }).click();

    await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByRole('button', { name: /Sign In/i })).toBeEnabled({ timeout: 5_000 });
    await expect(page.getByPlaceholder('Email')).toBeEditable({ timeout: 3_000 });
  });

  test('sign up toggle reveals the current account-creation fields', async ({ page }) => {
    await goToAuthGate(page);

    await page.getByRole('button', { name: /don't have an account\? sign up/i }).click();

    await expect(page.getByPlaceholder('First name')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByPlaceholder('Last name')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByPlaceholder(/Phone \(optional\)/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: /Create Account/i })).toBeVisible({ timeout: 5_000 });
  });

  test('social sign-in options are visible on the auth gate', async ({ page }) => {
    await goToAuthGate(page);

    await expect(page.getByRole('button', { name: /Continue with Google/i })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: /Continue with Microsoft/i })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: /Continue with LinkedIn/i })).toBeVisible({ timeout: 5_000 });
  });
});
