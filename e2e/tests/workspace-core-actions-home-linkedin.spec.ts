import { expect, test } from '@playwright/test';
import { mockWorkspaceApp } from '../helpers/mock-workspace-app';

test.describe('workspace core actions — home, profile, linkedin', () => {
  test.beforeEach(async ({ page }) => {
    await mockWorkspaceApp(page);
  });

  test('workspace home entry points open Career Vault and Find Jobs', async ({ page }) => {
    await page.goto('/workspace', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText('Your Applications').first()).toBeVisible();

    await page.getByRole('button', { name: /Why They Pick You Strong/i }).click();
    await expect(page).toHaveURL(/room=career-profile/);
    await expect(page.getByRole('heading', { name: 'Career Vault', exact: true })).toBeVisible();

    await page.goto('/workspace', { waitUntil: 'domcontentloaded' });
    await page.locator('section', { hasText: 'Your Applications' }).getByRole('button', { name: /^Find Jobs$/i }).click();
    await expect(page).toHaveURL(/room=jobs/);
    await expect(page.getByRole('heading', { name: /Find the right jobs before you tailor/i })).toBeVisible();
  });

  test('Career Vault keeps the story prompts visible and editable', async ({ page }) => {
    await page.goto('/workspace?room=career-profile', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Career Vault', exact: true })).toBeVisible();
    await expect(page.getByText(/Three questions that sharpen the story every tool uses/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: /What did your colleagues come to you for\?/i })).toBeVisible();

    await page.getByPlaceholder(/People came to me when a complex project was going off the rails/i).fill(
      'People came to me when execution was drifting because I could bring leaders back to one cadence and one set of decisions.',
    );
    await expect(
      page.getByText(/People came to me when execution was drifting because I could bring leaders back to one cadence/i),
    ).toBeVisible();
  });

  test('LinkedIn profile audit and content workspaces stay reachable', async ({ page }) => {
    await page.goto('/workspace?room=linkedin', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /Become discoverable on LinkedIn/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Optimize Profile/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Edit Profile/i })).toBeVisible();

    await page.getByRole('button', { name: 'Content', exact: true }).click();
    await page.locator('summary').filter({ hasText: 'Content Plan' }).click();
    await expect(page.getByText(/Build Content Plan/i)).toBeVisible();
  });

  test('LinkedIn Write drafts and approves a post', async ({ page }) => {
    await page.goto('/workspace?room=linkedin', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /Become discoverable on LinkedIn/i })).toBeVisible();
    await page.getByRole('button', { name: 'Content', exact: true }).click();
    await page.getByRole('button', { name: /Write a Post/i }).click();

    await expect(page.getByRole('heading', { name: /Choose a Topic/i })).toBeVisible();
    await page.getByRole('button', { name: /The operating cadence most leadership teams skip/i }).click();

    await expect(page.getByRole('heading', { name: /Post Draft/i })).toBeVisible();
    await expect(page.getByText(/The meetings were happening, but the business still was not moving/i)).toBeVisible();

    await page.getByRole('button', { name: /Approve & Save Post/i }).click();

    await expect(page.getByRole('heading', { name: /Post Draft Ready/i })).toBeVisible();
    await expect(page.getByText(/Saved to Library/i)).toBeVisible();
  });

  test('LinkedIn Profile rewrites sections and completes', async ({ page }) => {
    await page.goto('/workspace?room=linkedin', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /Become discoverable on LinkedIn/i })).toBeVisible();
    await page.getByRole('button', { name: /Edit Profile/i }).click();

    await expect(page.getByRole('heading', { name: 'Headline', exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Executive operator who builds operating cadence/i)).toBeVisible();

    await page.getByRole('button', { name: /^Approve & Save$/i }).click();

    await expect(page.getByRole('heading', { name: /About Section/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Executive operator known for turning complexity into operating rhythm/i)).toBeVisible();

    await page.getByRole('button', { name: /^Approve & Save$/i }).click();

    await expect(page.getByRole('heading', { name: /Updated Profile Sections/i })).toBeVisible({ timeout: 10_000 });
  });
});
