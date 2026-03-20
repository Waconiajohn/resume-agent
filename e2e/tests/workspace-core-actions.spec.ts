import { expect, test } from '@playwright/test';
import { mockWorkspaceApp } from '../helpers/mock-workspace-app';

test.describe('workspace core room actions', () => {
  test.beforeEach(async ({ page }) => {
    await mockWorkspaceApp(page);
  });

  test('workspace home entry points open Career Profile and Job Search', async ({ page }) => {
    await page.goto('/workspace', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText('Career Profile backbone').first()).toBeVisible();

    await page.getByRole('button', { name: /Review Career Profile/i }).click();
    await expect(page).toHaveURL(/room=career-profile/);
    await expect(page.getByRole('heading', { name: /One shared profile that every agent reads/i })).toBeVisible();

    await page.goto('/workspace', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Open job tracker/i }).click();
    await expect(page).toHaveURL(/room=jobs/);
    await expect(page.getByRole('heading', { name: 'Job Search', exact: true })).toBeVisible();
  });

  test('Career Profile refine flow opens the next-best questions', async ({ page }) => {
    await page.goto('/workspace?room=career-profile', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /One shared profile that every agent reads/i })).toBeVisible();
    await page.getByRole('button', { name: /Refine with AI/i }).click();

    await expect(page.getByRole('heading', { name: /One question, one confirmation, one stronger profile update/i })).toBeVisible();
    await expect(page.getByText(/What kind of leadership scope are you targeting next\?/i).first()).toBeVisible();

    await page.getByPlaceholder(/Answer in your own words/i).fill('Executive operations leadership with broad cross-functional scope and clear ownership of operating cadence.');
    await page.getByRole('button', { name: /Confirm and continue/i }).click();

    await expect(page.getByText(/What business outcome do you most want your next role to improve\?/i).first()).toBeVisible();
    await expect(page.getByText(/2\/2/)).toBeVisible();
  });

  test('LinkedIn quick optimize completes and tab switching stays usable', async ({ page }) => {
    await page.goto('/workspace?room=linkedin', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'LinkedIn', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Quick Optimize/i }).click();

    await expect(page.getByText(/Profile Quality: 87%/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Re-optimize/i })).toBeVisible();

    await page.getByRole('button', { name: 'Analytics', exact: true }).click();
    await expect(page.getByRole('heading', { name: /Profile Score/i })).toBeVisible();

    await page.getByRole('button', { name: 'Calendar', exact: true }).click();
    await expect(page.getByText(/Content Calendar/i).first()).toBeVisible();
  });

  test('Job Search runs Job Finder and keeps Radar and Daily Ops navigable', async ({ page }) => {
    await page.goto('/workspace?room=jobs', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Job Search', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Radar', exact: true }).click();

    await expect(page.getByRole('heading', { name: /Radar Search/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Smart Matches/i })).toBeVisible();

    await page.getByRole('button', { name: /Run Job Finder/i }).click();

    await expect(page.getByText('Northstar SaaS')).toBeVisible();
    await expect(page.getByText('ScaleCo')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Boolean Search Builder/i })).toBeVisible();

    await page.getByRole('button', { name: 'Daily Ops', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Daily Ops', exact: true })).toBeVisible();
    await expect(page.getByText('No scored matches yet. Run a Radar search to surface opportunities.')).toBeVisible();
  });

  test('Interview Prep section switching keeps practice, documents, and follow-up actions reachable', async ({ page }) => {
    await page.goto('/workspace?room=interview', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Interview Prep', exact: true }).first()).toBeVisible();

    await page.getByRole('button', { name: /^Practice /i }).click();
    await expect(page.getByRole('button', { name: /Start Mock Interview/i })).toBeVisible();

    await page.getByRole('button', { name: /^Documents /i }).click();
    await expect(page.getByRole('button', { name: /Open 30-60-90 Day Plan/i })).toBeVisible();

    await page.getByRole('button', { name: /^Next Steps /i }).click();

    await expect(page.getByText(/Close the loop without breaking the narrative/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Open Thank You Note/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Open Negotiation Prep/i }).first()).toBeVisible();
  });
});
