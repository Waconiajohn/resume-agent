import { expect, test } from '@playwright/test';
import { mockWorkspaceApp } from '../helpers/mock-workspace-app';

test.describe('workspace core actions — jobs', () => {
  test.beforeEach(async ({ page }) => {
    await mockWorkspaceApp(page);
  });

  test('Job Search generates Boolean strings and searches the public board', async ({ page }) => {
    await page.goto('/workspace?room=jobs', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /One job board, one shortlist, one pipeline/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Search Strings', exact: true })).toBeVisible();

    await page.getByRole('button', { name: /Generate Search Strings/i }).click();
    await expect(page.locator('span:visible').filter({ hasText: /^VP Operations$/ }).first()).toBeVisible();
    await expect(page.locator('span:visible').filter({ hasText: /^Chief Operating Officer$/ }).first()).toBeVisible();
    await expect(page.locator('textarea').nth(0)).toHaveValue(
      /"VP Operations" OR "Chief Operating Officer" OR "COO" OR "Chief of Staff, Operations"/i,
    );

    await page.getByPlaceholder('Job title, keywords...').fill('VP Operations');
    await page.getByPlaceholder('Location or Remote').fill('Remote');
    await page.getByRole('button', { name: /^Search$/i }).click();

    await expect(page.getByText('Northstar SaaS', { exact: true })).toBeVisible();
    await expect(page.getByText('ScaleCo', { exact: true })).toBeVisible();
  });

  test('Job Search lets us save a role and work it from the shortlist', async ({ page }) => {
    await page.goto('/workspace?room=jobs', { waitUntil: 'domcontentloaded' });

    await page.getByPlaceholder('Job title, keywords...').fill('VP Operations');
    await page.getByPlaceholder('Location or Remote').fill('Remote');
    await page.getByRole('button', { name: /^Search$/i }).click();

    await expect(page.getByText('Northstar SaaS', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Save', exact: true }).first().click();

    await page.getByRole('button', { name: /Open Shortlist/i }).first().click();
    await expect(page.getByRole('heading', { name: /Application Pipeline/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Shortlist', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('div:visible', { hasText: 'Northstar SaaS' }).first()).toBeVisible();
  });

  test('Job Search pipeline add-application dialog opens and submits cleanly', async ({ page }) => {
    await page.goto('/workspace?room=jobs', { waitUntil: 'domcontentloaded' });

    await page.getByRole('button', { name: 'Pipeline', exact: true }).click();
    await expect(page.getByRole('button', { name: /Add Application/i })).toBeVisible();

    await page.getByRole('button', { name: /Add Application/i }).click();
    await expect(page.getByRole('dialog', { name: /Add opportunity/i })).toBeVisible();

    await page.getByPlaceholder('e.g. VP Operations').fill('Director of Program Management');
    await page.getByPlaceholder('e.g. Acme Corp').fill('SignalWorks');
    await page.getByPlaceholder('https://...').fill('https://example.com/jobs/pm-director');
    await page.getByPlaceholder('Any notes about this role...').fill('Referral lead from former VP Product.');

    await page.getByRole('button', { name: /Add to Pipeline/i }).click();

    await expect(page.getByRole('dialog', { name: /Add opportunity/i })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /Application Pipeline/i })).toBeVisible();
  });

  test('Job Search watchlist manager opens, adds a company, and closes cleanly', async ({ page }) => {
    await page.goto('/workspace?room=jobs', { waitUntil: 'domcontentloaded' });

    await page.locator('button[title=\"Manage watchlist\"]:visible').first().click();

    await expect(page.getByRole('dialog', { name: /Manage watchlist/i })).toBeVisible();
    await page.getByPlaceholder('e.g. Acme Corp').fill('Atlas Systems');
    await page.getByPlaceholder('e.g. SaaS').fill('Enterprise Software');
    await page.getByPlaceholder(/^https:\/\/\.\.\.$/).fill('https://atlas.example.com');
    await page.getByPlaceholder(/^https:\/\/\.\.\.\/careers$/).fill('https://atlas.example.com/careers');
    await page.getByRole('button', { name: /Add Company/i }).click();

    await expect(
      page.getByRole('dialog', { name: /Manage watchlist/i }).getByText('Atlas Systems', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Done', exact: true }).click();

    await expect(page.getByRole('dialog', { name: /Manage watchlist/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Atlas Systems', exact: true })).toBeVisible();
  });
});
