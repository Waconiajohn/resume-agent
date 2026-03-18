import { test, expect } from '@playwright/test';
import { mockWorkspaceApp } from '../helpers/mock-workspace-app';

test.describe('workspace guided flows', () => {
  test.beforeEach(async ({ page }) => {
    await mockWorkspaceApp(page);
  });

  test('reopens a saved resume job record and runs Final Review before export acknowledgement', async ({ page }) => {
    await page.goto('/workspace?room=resume', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /One home for stage-aware job workspaces and your master resume/i })).toBeVisible();
    await expect(page.getByText('TechCorp').first()).toBeVisible();
    await expect(page.getByText('VP Operations').first()).toBeVisible();
    await expect(page.getByText('Interviewing').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /View Resume/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /View Letter/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Open Interview Lab/i }).first()).toBeVisible();

    await page.getByRole('button', { name: /^open$/i }).first().click();

    await expect(page).toHaveURL(/\/resume-builder\/session$/);
    const runFinalReviewButton = page.getByRole('button', { name: /^Run Final Review$/i }).first();
    await expect(runFinalReviewButton).toBeVisible();

    await runFinalReviewButton.click();

    await expect(page.getByText('6-Second Recruiter Scan')).toBeVisible();
    await expect(page.getByText('Priority Fixes')).toBeVisible();
    await expect(page.getByText('Export warning')).toBeVisible();

    await page.getByRole('button', { name: /I understand, enable export/i }).click();

    await expect(page.getByText('Warning acknowledged. Export is enabled.')).toBeVisible();
    await expect(page.getByRole('button', { name: /Download DOCX/i })).toBeEnabled();
    await expect(page.getByRole('button', { name: /Download PDF/i })).toBeEnabled();
  });

  test('organizes Interview Lab into sections and opens the 30-60-90 plan from Documents', async ({ page }) => {
    await page.goto('/workspace?room=interview', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Interview Lab' }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Documents' }).click();

    await expect(page.getByRole('heading', { name: '30-60-90 Day Plan' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Thank You Note' })).toBeVisible();

    await page.getByRole('button', { name: /Open 30-60-90 Day Plan/i }).click();
    await expect(page.getByRole('heading', { name: /30-60-90 Success Plan/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Back to Documents/i })).toBeVisible();

    await page.getByRole('button', { name: /Back to Documents/i }).click();
    await expect(page.getByRole('heading', { name: /Build documents without leaving the lab/i })).toBeVisible();
  });

  test('redirects legacy personal-brand room links into Career Profile', async ({ page }) => {
    await page.goto('/workspace?room=personal-brand', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /One shared profile that every agent reads/i })).toBeVisible();
    await expect(page).toHaveURL(/room=personal-brand|room=career-profile/);
  });
});
