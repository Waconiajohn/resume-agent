import { expect, type Page } from '@playwright/test';

const AUTH_USER = {
  id: 'mock-user-id',
  email: 'test@example.com',
  aud: 'authenticated',
  user_metadata: {
    full_name: 'Test User',
    first_name: 'Test',
    last_name: 'User',
  },
};

const AUTH_SESSION = {
  access_token: 'mock-access-token',
  token_type: 'bearer',
  expires_in: 3600,
  refresh_token: 'mock-refresh-token',
  user: AUTH_USER,
};

export async function mockAuthError(page: Page, errorMessage: string): Promise<void> {
  await page.route('**/auth/v1/token**', async (route) => {
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'invalid_grant',
        error_description: errorMessage,
        message: errorMessage,
        msg: errorMessage,
      }),
    });
  });
}

export async function mockAuthSuccess(page: Page): Promise<void> {
  await page.route('**/auth/v1/token**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(AUTH_SESSION),
    });
  });

  await page.route('**/auth/v1/user**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(AUTH_USER),
    });
  });

  await page.route('**/auth/v1/logout**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });

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

    if (path === '/api/coach/recommend') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          action: 'Open Resume Builder first.',
          product: 'Resume Builder',
          room: 'resume',
          urgency: 'immediate',
          phase: 'career_profile',
          phase_label: 'Career Vault',
          rationale: 'Start from the shared profile and the strongest next action.',
        }),
      });
      return;
    }

    if (path.startsWith('/api/momentum')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ summary: null, nudges: [] }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });

  await page.route('**/rest/v1/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });
}

export async function goToAuthGate(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem('e2e_disable_mock_auth', 'true');
    window.sessionStorage.setItem('e2e_disable_mock_auth', 'true');
  });
  await page.goto('/workspace');
  await expect(page.getByRole('button', { name: /Sign In/i })).toBeVisible({ timeout: 10_000 });
}

export async function fillCredentials(page: Page, email: string, password: string): Promise<void> {
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password').fill(password);
}
