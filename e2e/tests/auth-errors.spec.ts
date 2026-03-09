/**
 * Auth error flow tests — verify the AuthGate component handles error
 * scenarios correctly without a real backend.
 *
 * These tests run under the 'auth-smoke' project (no storageState —
 * starts unauthenticated) and mock the Supabase auth endpoints to
 * simulate error responses.
 *
 * Each test navigates to /app which renders AuthGate for unauthenticated users.
 */

import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Intercept Supabase auth /token endpoint and return an error response.
 * Call this BEFORE page.goto() so the handler is registered early.
 */
async function mockAuthError(page: Page, errorMessage: string): Promise<void> {
  await page.route('**/auth/v1/token**', async (route) => {
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'invalid_grant',
        error_description: errorMessage,
      }),
    });
  });
}

/**
 * Intercept Supabase auth /token endpoint and return a successful login.
 * Also stubs /auth/v1/user so the app resolves the session.
 */
async function mockAuthSuccess(page: Page): Promise<void> {
  await page.route('**/auth/v1/token**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'mock-access-token',
        token_type: 'bearer',
        expires_in: 3600,
        refresh_token: 'mock-refresh-token',
        user: {
          id: 'mock-user-id',
          email: 'test@example.com',
          aud: 'authenticated',
        },
      }),
    });
  });

  await page.route('**/auth/v1/user**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'mock-user-id',
        email: 'test@example.com',
        aud: 'authenticated',
      }),
    });
  });

  // Stub backend API calls that fire after auth
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/sessions') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ sessions: [] }),
      });
      return;
    }
    if (path.startsWith('/api/resumes')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ resumes: [] }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  // Stub Supabase REST table reads
  await page.route('**/rest/v1/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });
}

/**
 * Navigate to /app and wait for the AuthGate to be visible.
 * /app shows AuthGate when there is no authenticated user.
 */
async function goToAuthGate(page: Page): Promise<void> {
  await page.goto('/app');
  // AuthGate renders a "Sign In" button inside the form
  await expect(
    page.getByRole('button', { name: /Sign In/i }),
  ).toBeVisible({ timeout: 10_000 });
}

/**
 * Fill the email + password fields on the AuthGate form.
 */
async function fillCredentials(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password').fill(password);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Auth error scenarios', () => {
  // No storageState — these tests run as unauthenticated users.

  test('empty form submission shows HTML5 validation (no API call)', async ({ page }) => {
    await goToAuthGate(page);

    // Click Sign In without filling anything — HTML5 required validation fires
    // before any network call is made.
    const signInBtn = page.getByRole('button', { name: /Sign In/i });
    await signInBtn.click();

    // The email input should be in an invalid state (browser validation)
    const emailInput = page.getByPlaceholder('Email');
    const validityState = await emailInput.evaluate(
      (el: HTMLInputElement) => el.validity.valid,
    );
    expect(validityState).toBe(false);

    // No error banner from the app should appear (the error state is empty)
    await expect(page.locator('[role="alert"]')).not.toBeVisible({ timeout: 1_000 });
  });

  test('invalid email format is rejected by HTML5 email validation', async ({ page }) => {
    await goToAuthGate(page);

    await page.getByPlaceholder('Email').fill('not-an-email');
    await page.getByPlaceholder('Password').fill('somepassword');
    await page.getByRole('button', { name: /Sign In/i }).click();

    // Browser validates type="email" — input is invalid before fetch fires
    const emailInput = page.getByPlaceholder('Email');
    const validityState = await emailInput.evaluate(
      (el: HTMLInputElement) => el.validity.valid,
    );
    expect(validityState).toBe(false);
  });

  test('wrong password shows "Invalid login credentials" error message', async ({
    page,
  }) => {
    await mockAuthError(page, 'Invalid login credentials');
    await goToAuthGate(page);

    await fillCredentials(page, 'jjschrup@yahoo.com', 'WrongPassword999');
    await page.getByRole('button', { name: /Sign In/i }).click();

    // AuthGate renders the error in a <p role="alert"> element
    await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('[role="alert"]')).toContainText(/Invalid login credentials/i);
  });

  test('after failed login the form is still interactive for a retry', async ({
    page,
  }) => {
    await mockAuthError(page, 'Invalid login credentials');
    await goToAuthGate(page);

    await fillCredentials(page, 'jjschrup@yahoo.com', 'BadPassword');
    await page.getByRole('button', { name: /Sign In/i }).click();

    // Wait for error to appear
    await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 8_000 });

    // The Sign In button must still be enabled (not permanently disabled)
    await expect(
      page.getByRole('button', { name: /Sign In/i }),
    ).toBeEnabled({ timeout: 5_000 });

    // The email field must still be editable
    const emailInput = page.getByPlaceholder('Email');
    await expect(emailInput).toBeEditable({ timeout: 3_000 });
  });

  test('logout from authenticated app redirects to auth gate', async ({ page }) => {
    // Set up a successful auth so we can log in first
    await mockAuthSuccess(page);

    await page.goto('/app');

    // The page starts with AuthGate (no storage state). Sign in via the form.
    await expect(
      page.getByRole('button', { name: /Sign In/i }),
    ).toBeVisible({ timeout: 10_000 });

    await page.getByPlaceholder('Email').fill('test@example.com');
    await page.getByPlaceholder('Password').fill('password123');
    await page.getByRole('button', { name: /Sign In/i }).click();

    // After sign-in, the app should render the authenticated landing screen.
    await expect(
      page.getByRole('button', { name: /Start New Session/i }),
    ).toBeVisible({ timeout: 15_000 });

    // Click the sign-out button in the Header (aria-label="Sign out")
    const signOutBtn = page.getByRole('button', { name: /Sign out/i });
    await expect(signOutBtn).toBeVisible({ timeout: 5_000 });
    await signOutBtn.click();

    // After sign-out, Supabase clears the user — the app should show AuthGate
    // or the sales page.  In either case, "Start New Session" must be gone.
    await expect(
      page.getByRole('button', { name: /Start New Session/i }),
    ).not.toBeVisible({ timeout: 8_000 });
  });
});
