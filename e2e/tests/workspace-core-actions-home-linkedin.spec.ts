import { expect, test } from '@playwright/test';
import { mockWorkspaceApp } from '../helpers/mock-workspace-app';

test.describe('workspace core actions — home, profile, linkedin', () => {
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
});
