import { expect, test, type Page } from '@playwright/test';
import { mockWorkspaceApp } from '../helpers/mock-workspace-app';

test.describe('workspace core actions — jobs', () => {
  test.beforeEach(async ({ page }) => {
    await mockWorkspaceApp(page);
  });

  const visibleJobCard = (page: Page, company: string) =>
    page.locator('div.rounded-xl.border:visible').filter({ hasText: company }).filter({ hasText: 'Open Job' });

  const chooseBroadSearchWorkMode = async (page: Page, label: string) => {
    const refineSearch = page.locator('details').filter({ hasText: 'Refine search' }).first();
    await refineSearch.getByText('Refine search').click();
    await refineSearch.getByRole('button', { name: new RegExp(`^${label}$`, 'i') }).click();
  };

  test('Job Search generates Boolean strings and searches the public board', async ({ page }) => {
    await page.goto('/workspace?room=jobs', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /Find the right jobs before you tailor/i })).toBeVisible();
    await page.getByText(/Generate search strings for external job boards/i).click();
    await expect(page.getByRole('heading', { name: 'Search Strings', exact: true })).toBeVisible();

    await page.getByRole('button', { name: /Generate Search Strings/i }).click();
    await expect(page.locator('span:visible').filter({ hasText: /^VP Operations$/ }).first()).toBeVisible();
    await expect(page.locator('span:visible').filter({ hasText: /^Chief Operating Officer$/ }).first()).toBeVisible();
    await expect(page.locator('textarea').nth(0)).toHaveValue(
      /"VP Operations" OR "Chief Operating Officer" OR "COO" OR "Chief of Staff, Operations"/i,
    );

    await page.getByPlaceholder('Job title, keywords...').fill('VP Operations');
    await chooseBroadSearchWorkMode(page, 'Remote');
    await page.getByRole('button', { name: /^Search$/i }).click();

    await expect(visibleJobCard(page, 'Northstar SaaS').first()).toBeVisible();
    await expect(visibleJobCard(page, 'ScaleCo').first()).toBeVisible();
  });

  test('Job Search lets us save a role from the public board', async ({ page }) => {
    await page.goto('/workspace?room=jobs', { waitUntil: 'domcontentloaded' });

    await page.getByPlaceholder('Job title, keywords...').fill('VP Operations');
    await chooseBroadSearchWorkMode(page, 'Remote');
    await page.getByRole('button', { name: /^Search$/i }).click();

    await expect(visibleJobCard(page, 'Northstar SaaS').first()).toBeVisible();
    await page.getByRole('button', { name: 'Save', exact: true }).first().click();
    await expect(visibleJobCard(page, 'Northstar SaaS')).toHaveCount(0);
  });

  test('Job Search pipeline add-application dialog opens and submits cleanly', async ({ page }) => {
    await page.goto('/workspace/applications', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('button', { name: /New application/i })).toBeVisible();

    await page.getByRole('button', { name: /New application/i }).click();
    await expect(page.getByText(/A new application kicks off a complete job pursuit/i)).toBeVisible();

    await page.getByPlaceholder('VP Engineering').fill('Director of Program Management');
    await page.getByPlaceholder('Acme Corp').fill('SignalWorks');
    await page.getByPlaceholder('https://acme.com/careers/vp-eng').fill('https://example.com/jobs/pm-director');
    await page.getByPlaceholder(/Paste the full job description/i).fill('Referral lead from former VP Product.');

    await page.getByRole('button', { name: /Create and open/i }).click();

    await expect(page).toHaveURL(/\/workspace\/application\/app-\d+\/resume/);
    await expect(page.getByRole('heading', { name: /Tailor your resume/i }).first()).toBeVisible();
  });

  test('Job Search watchlist manager opens, adds a company, and closes cleanly', async ({ page }) => {
    await page.goto('/workspace?room=jobs', { waitUntil: 'domcontentloaded' });

    await page.getByRole('button', { name: /^Manage$/i }).click();

    await expect(page.getByRole('dialog', { name: /Target Companies/i })).toBeVisible();
    await page.getByPlaceholder('e.g. Acme Corp').fill('Atlas Systems');
    await page.getByPlaceholder('e.g. SaaS').fill('Enterprise Software');
    await page.getByPlaceholder(/^https:\/\/\.\.\.$/).fill('https://atlas.example.com');
    await page.getByPlaceholder(/^https:\/\/\.\.\.\/careers$/).fill('https://atlas.example.com/careers');
    await page.getByRole('button', { name: /Add Company/i }).click();

    await expect(
      page.getByRole('dialog', { name: /Target Companies/i }).getByText('Atlas Systems', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Done', exact: true }).click();

    await expect(page.getByRole('dialog', { name: /Target Companies/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Atlas Systems', exact: true })).toBeVisible();
  });
});
