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
    await expect(page.getByRole('button', { name: /Generate Calendar/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Something went wrong/i })).toHaveCount(0);
  });

  test('LinkedIn Post Composer writes and approves a post', async ({ page }) => {
    await page.goto('/workspace?room=linkedin', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'LinkedIn', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Write a Post/i }).click();

    await expect(page.getByRole('heading', { name: /Choose a Topic/i })).toBeVisible();
    await page.getByRole('button', { name: /The operating cadence most leadership teams skip/i }).click();

    await expect(page.getByRole('heading', { name: /Post Draft/i })).toBeVisible();
    await expect(page.getByText(/The meetings were happening, but the business still was not moving/i)).toBeVisible();

    await page.getByRole('button', { name: /Approve Post/i }).click();

    await expect(page.getByRole('heading', { name: /Your Post is Ready/i })).toBeVisible();
    await expect(page.getByText(/Saved to Library/i)).toBeVisible();
  });

  test('LinkedIn Profile Editor advances through section review and completes', async ({ page }) => {
    await page.goto('/workspace?room=linkedin', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'LinkedIn', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Profile Editor', exact: true }).click();
    await page.getByRole('button', { name: /Edit Profile/i }).click();

    await expect(page.getByRole('heading', { name: 'Headline', exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Executive operator who builds operating cadence/i)).toBeVisible();

    await page.getByRole('button', { name: /^Approve$/i }).click();

    await expect(page.getByRole('heading', { name: /About Section/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Executive operator known for turning complexity into operating rhythm/i)).toBeVisible();

    await page.getByRole('button', { name: /^Approve$/i }).click();

    await expect(page.getByRole('heading', { name: /Profile Optimization Complete/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Headline', { exact: true })).toBeVisible();
    await expect(page.getByText('About Section', { exact: true })).toBeVisible();
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

  test('Job Search smart match action routes into Resume Builder', async ({ page }) => {
    await page.goto('/workspace?room=jobs', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Job Search', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Radar', exact: true }).click();
    await page.getByRole('button', { name: /Run Job Finder/i }).click();

    await expect(page.getByText('Northstar SaaS')).toBeVisible();
    await page.getByRole('button', { name: /Resume \+ Letter/i }).first().click();

    await expect(page).toHaveURL(/\/workspace\?room=resume/, { timeout: 5_000 });
    await expect(page.getByRole('heading', { name: /One home for stage-aware job workspaces and your master resume/i })).toBeVisible();
  });

  test('Job Search pipeline add-application dialog opens and submits cleanly', async ({ page }) => {
    await page.goto('/workspace?room=jobs', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Job Search', exact: true })).toBeVisible();
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

    await page.getByRole('button', { name: /Open Thank You Note/i }).first().click();
    await expect(page.getByRole('heading', { name: /Thank You Note Writer/i })).toBeVisible();

    await page.getByRole('button', { name: /Open Negotiation Prep/i }).first().click();
    await expect(page.getByRole('heading', { name: /Build one clear compensation strategy before you respond/i })).toBeVisible();
  });
});
