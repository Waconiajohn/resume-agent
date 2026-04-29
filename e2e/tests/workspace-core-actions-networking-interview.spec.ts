import { expect, test } from '@playwright/test';
import { mockWorkspaceApp } from '../helpers/mock-workspace-app';

test.describe('workspace core actions — networking and interview', () => {
  test.beforeEach(async ({ page }) => {
    await mockWorkspaceApp(page);
  });

  test('Smart Referrals keeps network matches and bonus search in one room', async ({ page }) => {
    await page.goto('/workspace?room=networking', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Insider Jobs', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Network path', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Bonus path', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Connections', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Matches', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Outreach', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Connections', exact: true }).click();
    await expect(page.getByPlaceholder('Search companies...')).toBeVisible();
    await expect(page.getByText('Northstar SaaS', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Matches', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Network Matches', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Your Network \(1\)/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Bonus Search \(1\)/i })).toBeVisible();
    await expect(page.getByText('VP Operations', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Bonus path', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Bonus Search', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Referral Bonus', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Bonus Search', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'High-Bonus Company Search', exact: true })).toBeVisible();
    await expect(page.getByText('Atlas Systems', { exact: true })).toBeVisible();
  });

  test('Interview Prep section switching keeps practice, leave-behinds, and follow-up reachable', async ({ page }) => {
    await page.goto('/workspace?room=interview', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText('Interview workflow')).toBeVisible();

    await page.getByRole('button', { name: /Step 2 Practice/i }).click();
    await expect(page.getByRole('button', { name: /Start Mock Interview/i })).toBeVisible();

    await page.getByRole('button', { name: /Step 3 Leave-behinds/i }).click();
    await expect(page.getByRole('heading', { name: /30-60-90 Plan/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Draft Plan|Start New Draft/i }).first()).toBeVisible();

    await page.getByRole('button', { name: /Step 4 Follow-up/i }).click();
    await expect(page.getByRole('button', { name: /^Thank You Note$/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^Negotiation Prep$/i }).first()).toBeVisible();
  });

  test('Interview Prep follow-up section adds interview history and saves a debrief', async ({ page }) => {
    await page.goto('/workspace?room=interview', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText('Interview workflow')).toBeVisible();
    await page.getByRole('button', { name: /Step 4 Follow-up/i }).click();

    await expect(page.getByRole('heading', { name: /Interview History/i })).toBeVisible();
    await page.getByRole('button', { name: /Add Interview/i }).click();
    await page.getByPlaceholder('Company').fill('BrightPath Schools');
    await page.getByPlaceholder('Role').fill('School Principal');
    await page.getByPlaceholder(/Notes \(optional\)/i).fill('Panel focused on leadership philosophy and staff development.');
    await page.getByRole('button', { name: /^Save$/i }).click();

    await expect(page.getByText('BrightPath Schools', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: /Add Debrief/i }).click();
    await expect(page.getByRole('heading', { name: /Post-Interview Debrief/i })).toBeVisible();

    await page.getByPlaceholder('Company name').fill('BrightPath Schools');
    await page.getByPlaceholder(/VP of Supply Chain/i).fill('School Principal');
    await page.getByRole('button', { name: 'Positive', exact: true }).click();
    await page.getByRole('button', { name: /Save Debrief/i }).click();

    await expect(page.getByText(/Debrief saved\./i)).toBeVisible({ timeout: 10_000 });
  });

  test('Interview Prep mock interview starts, completes, and returns to the lab', async ({ page }) => {
    await page.goto('/workspace?room=interview', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText('Interview workflow')).toBeVisible();
    await page.getByRole('button', { name: /Step 2 Practice/i }).click();
    await page.getByRole('button', { name: /Start Mock Interview/i }).click();

    await expect(page.getByRole('heading', { name: 'Mock Interview', exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Tell me about a time you had to align multiple leaders around one operating cadence\./i)).toBeVisible();

    await page
      .getByPlaceholder(/Type your answer here/i)
      .fill('I aligned product, support, and operations leaders around one weekly cadence and clarified ownership for each decision.');
    await page.getByRole('button', { name: /Submit Answer/i }).click();

    await expect(page.getByText(/Overall Score/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Strong foundation\. Add one metric and keep this as a core interview story\./i)).toBeVisible();

    await page.getByRole('button', { name: /Back to Interview Prep/i }).first().click();
    await expect(page.getByText('Interview workflow')).toBeVisible();
  });
});
