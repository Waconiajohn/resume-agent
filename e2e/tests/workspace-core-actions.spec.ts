import { expect, test } from '@playwright/test';
import { mockWorkspaceApp } from '../helpers/mock-workspace-app';

test.describe('workspace core room actions', () => {
  test.beforeEach(async ({ page }) => {
    await mockWorkspaceApp(page);
  });

  test('workspace home entry points open Your Profile and Job Search', async ({ page }) => {
    await page.goto('/workspace', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('button', { name: 'Open Resume Builder', exact: true })).toBeVisible();

    await page.getByRole('button', { name: /Review story/i }).click();
    await expect(page).toHaveURL(/room=career-profile/);
    await expect(page.getByRole('heading', { name: 'Your Profile', exact: true })).toBeVisible();

    await page.goto('/workspace', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Open jobs/i }).click();
    await expect(page).toHaveURL(/room=jobs/);
    await expect(page.getByRole('heading', { name: /One job board, one shortlist, one pipeline/i })).toBeVisible();
  });

  test('Career Profile keeps the Why Me prompts visible and editable', async ({ page }) => {
    await page.goto('/workspace?room=career-profile', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Your Profile', exact: true })).toBeVisible();
    await expect(page.getByText(/Three questions that sharpen the story every tool uses/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: /What did your colleagues come to you for\?/i })).toBeVisible();

    await page.getByPlaceholder(/People came to me when a complex project was going off the rails/i).fill(
      'People came to me when execution was drifting because I could bring leaders back to one cadence and one set of decisions.',
    );
    await expect(
      page.getByText(/People came to me when execution was drifting because I could bring leaders back to one cadence/i),
    ).toBeVisible();
  });

  test('LinkedIn quick optimize completes and support workspaces stay reachable', async ({ page }) => {
    await page.goto('/workspace?room=linkedin', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText('LinkedIn workflow')).toBeVisible();
    await page.getByRole('button', { name: /Quick Optimize/i }).click();

    await expect(page.getByText(/Profile Score/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Re-optimize/i })).toBeVisible();

    await page.getByRole('button', { name: 'Results', exact: true }).click();
    await expect(page.getByText(/Current Profile Score/i)).toBeVisible();

    await page.getByRole('button', { name: 'Write', exact: true }).click();
    await page.getByRole('button', { name: /Plan posts/i }).click();
    await expect(page.getByText(/Support workspace/i).first()).toBeVisible();
    await expect(page.getByText('Content Plan', { exact: true })).toBeVisible();
  });

  test('LinkedIn Write drafts and approves a post', async ({ page }) => {
    await page.goto('/workspace?room=linkedin', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText('LinkedIn workflow')).toBeVisible();
    await page.getByRole('button', { name: 'Write', exact: true }).click();
    await page.getByRole('button', { name: /Write a Post/i }).click();

    await expect(page.getByRole('heading', { name: /Choose a Topic/i })).toBeVisible();
    await page.getByRole('button', { name: /The operating cadence most leadership teams skip/i }).click();

    await expect(page.getByRole('heading', { name: /Post Draft/i })).toBeVisible();
    await expect(page.getByText(/The meetings were happening, but the business still was not moving/i)).toBeVisible();

    await page.getByRole('button', { name: /Approve Post/i }).click();

    await expect(page.getByRole('heading', { name: /Post Draft Ready/i })).toBeVisible();
    await expect(page.getByText(/Saved to Library/i)).toBeVisible();
  });

  test('LinkedIn Profile rewrites sections and completes', async ({ page }) => {
    await page.goto('/workspace?room=linkedin', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText('LinkedIn workflow')).toBeVisible();
    await page.getByRole('button', { name: 'Profile', exact: true }).click();
    await page.getByRole('button', { name: /Edit Profile/i }).click();

    await expect(page.getByRole('heading', { name: 'Headline', exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Executive operator who builds operating cadence/i)).toBeVisible();

    await page.getByRole('button', { name: /^Approve$/i }).click();

    await expect(page.getByRole('heading', { name: /About Section/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Executive operator known for turning complexity into operating rhythm/i)).toBeVisible();

    await page.getByRole('button', { name: /^Approve$/i }).click();

    await expect(page.getByRole('heading', { name: /Updated Profile Sections/i })).toBeVisible({ timeout: 10_000 });
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

  test('Smart Referrals keeps network matches and bonus search in one room', async ({ page }) => {
    await page.goto('/workspace?room=networking', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Smart Referrals', exact: true })).toBeVisible();
    await expect(page.getByText('Use your existing connections first').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Connections', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Bonus Search', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Referral Bonus', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Connections', exact: true }).click();
    await expect(page.getByPlaceholder('Search companies...')).toBeVisible();
    await expect(page.getByText('Northstar SaaS', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Job Matches', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Job Matches', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Your Network \(1\)/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Bonus Search \(1\)/i })).toBeVisible();
    await expect(page.getByText('VP Operations', { exact: true })).toBeVisible();

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
    await expect(page.getByRole('button', { name: /Open 30-60-90 Day Plan/i })).toBeVisible();

    await page.getByRole('button', { name: /Step 4 Follow-up/i }).click();
    await expect(page.getByRole('button', { name: /Open Thank You Note/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Open Negotiation Prep/i }).first()).toBeVisible();
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
