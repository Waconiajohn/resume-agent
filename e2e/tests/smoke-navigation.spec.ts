import { expect, test, type Page } from '@playwright/test';
import { mockWorkspaceApp } from '../helpers/mock-workspace-app';

const DEFAULT_BILLING_RESPONSE = {
  subscription: null,
  plan: {
    id: 'free',
    name: 'Free',
    monthly_price_cents: 0,
    included_sessions: 3,
    max_sessions_per_month: 3,
  },
  usage: {
    sessions_this_period: 0,
    cost_usd_this_period: 0,
  },
} as const;

async function mockBillingApis(
  page: Page,
  {
    subscriptionResponse = DEFAULT_BILLING_RESPONSE,
    checkoutUrl = '/workspace?room=resume',
    portalUrl = '/workspace?room=career-profile',
  }: {
    subscriptionResponse?: typeof DEFAULT_BILLING_RESPONSE | {
      subscription: {
        id: string;
        plan_id: string;
        status: string;
        current_period_start: string;
        current_period_end: string;
        stripe_subscription_id: string | null;
        stripe_customer_id: string | null;
        updated_at: string;
      } | null;
      plan: {
        id: string;
        name: string;
        monthly_price_cents: number;
        included_sessions: number;
        max_sessions_per_month: number | null;
      };
      usage: {
        sessions_this_period: number;
        cost_usd_this_period: number;
      };
    };
    checkoutUrl?: string;
    portalUrl?: string;
  } = {},
) {
  await page.route('**/api/billing/subscription', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(subscriptionResponse),
    });
  });

  await page.route('**/api/billing/checkout', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ url: checkoutUrl }),
    });
  });

  await page.route('**/api/billing/portal', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ url: portalUrl }),
    });
  });
}

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    const knownBenign = [
      'supabase',
      'ResizeObserver',
      'Non-Error promise rejection',
      'net::ERR_',
      'Failed to fetch',
      'ERR_FAILED',
      'ERR_BLOCKED',
    ];
    if (knownBenign.some((item) => text.toLowerCase().includes(item.toLowerCase()))) return;
    errors.push(text);
  });
  return errors;
}

async function setupSignedInApp(page: Page) {
  await mockWorkspaceApp(page);
  await mockBillingApis(page);
}

async function expectWorkspaceHome(page: Page) {
  await expect(page).toHaveURL(/\/workspace$/, { timeout: 10_000 });
  await expect(page.getByRole('button', { name: 'Open Resume Builder', exact: true })).toBeVisible({ timeout: 10_000 });
}

test.describe('Smoke: major routes and redirects', () => {
  test('sales page renders without crashing', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 5_000 });
    expect(errors).toHaveLength(0);
  });

  test('app entry redirects to workspace home for signed-in users', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await setupSignedInApp(page);
    await page.goto('/app', { waitUntil: 'domcontentloaded' });
    await expectWorkspaceHome(page);
    expect(errors).toHaveLength(0);
  });

  test('dashboard redirects to workspace home', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await setupSignedInApp(page);
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await expectWorkspaceHome(page);
    expect(errors).toHaveLength(0);
  });

  test('tools collapses into workspace home', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await setupSignedInApp(page);
    await page.goto('/tools', { waitUntil: 'domcontentloaded' });
    await expectWorkspaceHome(page);
    expect(errors).toHaveLength(0);
  });

  test('cover-letter redirects into the resume workspace focus', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await setupSignedInApp(page);
    await page.goto('/cover-letter', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/workspace\?room=resume&focus=cover-letter/, { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: 'Cover Letter' }).first()).toBeVisible({ timeout: 10_000 });
    expect(errors).toHaveLength(0);
  });

  test('resume-builder redirects into the resume workspace', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await setupSignedInApp(page);
    await page.goto('/resume-builder', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/workspace\?room=resume/, { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: /Choose the resume tool you need right now/i })).toBeVisible({
      timeout: 10_000,
    });
    expect(errors).toHaveLength(0);
  });

  test('legacy salary-negotiation room redirects into Interview Prep', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await setupSignedInApp(page);
    await page.goto('/workspace?room=salary-negotiation', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/room=interview/, { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: /Prep, practice, and follow-up in one place/i })).toBeVisible({
      timeout: 10_000,
    });
    expect(errors).toHaveLength(0);
  });

  test('career-iq entry redirects into workspace home', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await setupSignedInApp(page);
    await page.goto('/career-iq', { waitUntil: 'domcontentloaded' });
    await expectWorkspaceHome(page);
    expect(errors).toHaveLength(0);
  });
});

test.describe('Smoke: shell navigation', () => {
  test.beforeEach(async ({ page }) => {
    await setupSignedInApp(page);
    await page.goto('/app', { waitUntil: 'domcontentloaded' });
    await expectWorkspaceHome(page);
  });

  test('primary header no longer exposes Tools or Pricing', async ({ page }) => {
    await expect(page.getByRole('button', { name: /^Tools$/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Pricing$/i })).toHaveCount(0);
  });

  test('header workspace button returns to workspace home', async ({ page }) => {
    await page.goto('/workspace?room=resume', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Choose the resume tool you need right now/i })).toBeVisible();

    await page.getByRole('button', { name: /^Workspace$/i }).click();
    await expectWorkspaceHome(page);
  });

  test('workspace home resume builder entry opens the resume workspace', async ({ page }) => {
    await page.getByRole('button', { name: 'Open Resume Builder', exact: true }).click();
    await expect(page).toHaveURL(/\/resume-builder\/session/, { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: /Build Your Tailored Resume/i })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('billing is no longer exposed as a direct workspace-shell button', async ({ page }) => {
    await expect(page.getByRole('navigation').getByRole('button', { name: /^Billing$/i })).toHaveCount(0);
    await expect(page.getByRole('banner').getByRole('button', { name: /^Billing$/i })).toHaveCount(0);
  });
});

test.describe('Smoke: billing entry points', () => {
  test('pricing redirects signed-in users into billing', async ({ page }) => {
    await setupSignedInApp(page);
    await page.goto('/pricing', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/billing/, { timeout: 10_000 });
    await expect(page.getByText('Usage this month')).toBeVisible({ timeout: 10_000 });
  });

  test('billing upgrade button starts checkout from the free plan', async ({ page }) => {
    await setupSignedInApp(page);
    await page.goto('/billing', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('button', { name: /^Upgrade$/i })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /^Upgrade$/i }).click();

    await expect(page).toHaveURL(/\/workspace\?room=resume/, { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: /Choose the resume tool you need right now/i })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('billing manage button opens the portal flow for an active paid plan', async ({ page }) => {
    await mockWorkspaceApp(page);
    await mockBillingApis(page, {
      subscriptionResponse: {
        subscription: {
          id: 'sub-starter',
          plan_id: 'starter',
          status: 'active',
          current_period_start: '2026-03-01T00:00:00.000Z',
          current_period_end: '2026-04-01T00:00:00.000Z',
          stripe_subscription_id: 'stripe-sub-123',
          stripe_customer_id: 'stripe-customer-123',
          updated_at: '2026-03-20T00:00:00.000Z',
        },
        plan: {
          id: 'starter',
          name: 'Starter',
          monthly_price_cents: 1999,
          included_sessions: 15,
          max_sessions_per_month: 50,
        },
        usage: {
          sessions_this_period: 4,
          cost_usd_this_period: 1.24,
        },
      },
      portalUrl: '/workspace?room=career-profile',
    });

    await page.goto('/billing', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: /^Manage$/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /^Upgrade$/i })).toHaveCount(0);

    await page.getByRole('button', { name: /^Manage$/i }).click();
    await expect(page).toHaveURL(/\/workspace\?room=career-profile/, { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: 'Your Profile', exact: true })).toBeVisible({ timeout: 10_000 });
  });
});
