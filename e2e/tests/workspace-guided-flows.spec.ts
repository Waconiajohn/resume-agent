import { test, expect } from '@playwright/test';
import { mockWorkspaceApp } from '../helpers/mock-workspace-app';

test.describe('workspace guided flows', () => {
  test.beforeEach(async ({ page }) => {
    await mockWorkspaceApp(page);
  });

  test('reopens a saved resume job record and runs Final Review before export acknowledgement', async ({ page }) => {
    await page.goto('/workspace?room=resume', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /Choose the resume tool you need right now/i })).toBeVisible();
    await expect(page.getByText('TechCorp').first()).toBeVisible();
    await expect(page.getByText('VP Operations').first()).toBeVisible();
    await expect(page.getByText('Interviewing').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /View Resume/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /View Cover Letter/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Open Interview Prep/i }).first()).toBeVisible();

    await page.getByRole('button', { name: /View Workspace/i }).first().click();

    await expect(page.getByText('Stage control')).toBeVisible();
    await expect(page.getByText('Unlocked next')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Offer' })).toBeVisible();

    await page.getByRole('button', { name: /^open$/i }).first().click();

    await expect(page).toHaveURL(/\/resume-builder\/session$/);
    const runFinalReviewButton = page.getByRole('button', { name: /^Run Final Review$/i }).first();
    await expect(runFinalReviewButton).toBeVisible();

    await runFinalReviewButton.click();

    await expect(page.getByText('6-Second Recruiter Scan')).toBeVisible();
    await expect(page.getByText('Priority Fixes')).toBeVisible();
    await expect(page.getByText('Export warning')).toBeVisible();

    await page.getByRole('button', { name: /I understand, enable export/i }).click();

    await expect(page.getByText('Warning acknowledged. Export is enabled, but the draft still has open review warnings.')).toBeVisible();
    await expect(page.getByRole('button', { name: /Download DOCX/i })).toBeEnabled();
    await expect(page.getByRole('button', { name: /Download PDF/i })).toBeEnabled();
  });

  test('organizes Interview Prep into sections and opens the 30-60-90 plan from Leave-behinds', async ({ page }) => {
    await page.goto('/workspace?room=interview', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Interview Prep' }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Leave-behinds', exact: true }).click();

    await expect(page.getByRole('heading', { name: '30-60-90 Day Plan' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Thank You Note' })).toBeVisible();

    await page.getByRole('button', { name: /Open 30-60-90 Day Plan/i }).click();
    await expect(page.getByRole('heading', { name: /30-60-90 Plan/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Back to Leave-behinds/i })).toBeVisible();

    await page.getByRole('button', { name: /Back to Leave-behinds/i }).click();
    await expect(page.getByRole('heading', { name: /Keep your follow-up docs tied to the same interview story/i })).toBeVisible();
  });

  test('opens the first-class job workspace and reopens exact saved later-stage assets', async ({ page }) => {
    await page.goto('/workspace?room=resume', { waitUntil: 'domcontentloaded' });

    await page.getByRole('button', { name: /Full Page/i }).first().click();
    await expect(page).toHaveURL(/\/workspace\/job\/job-offerco$/);
    await expect(page.locator('h1', { hasText: 'OfferCo' })).toBeVisible();
    await expect(page.getByText(/Exact assets reopen from here/i)).toBeVisible();

    await page.goto('/workspace/job/job-techcorp', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Open Saved Prep/i }).first().click();
    await expect(page).toHaveURL(/room=interview/);
    await expect(page).toHaveURL(/focus=prep/);
    await expect(page).toHaveURL(/session=mock-interview-prep-session/);
    await expect(page.getByText('Lead with executive operating cadence and cross-functional alignment.')).toBeVisible();

    await page.goto('/workspace/job/job-techcorp', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Open Saved Note/i }).first().click();
    await expect(page).toHaveURL(/focus=thank-you/);
    await expect(page).toHaveURL(/session=mock-thank-you-session/);
    await expect(page.getByText(/thoughtful conversation about operating cadence/i)).toBeVisible();

    await page.goto('/workspace/job/job-offerco', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Open Saved Strategy/i }).first().click();
    await expect(page).toHaveURL(/room=interview/);
    await expect(page).toHaveURL(/focus=negotiation/);
    await expect(page).toHaveURL(/session=mock-nego-session/);
    await expect(page.getByText(/scope, market position, and first-year risk offset/i)).toBeVisible();
  });

  test('job workspace fallback actions route back into Resume Builder when later-stage assets do not exist yet', async ({ page }) => {
    await page.goto('/workspace/job/job-betaco', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('h1', { hasText: 'BetaCo' })).toBeVisible();
    await expect(page.getByText(/Available now: Resume Builder/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Open Session/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Open Interview Prep/i })).toHaveCount(0);

    await page.goto('/workspace/job/job-betaco', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Reopen Tailored Work/i }).click();

    await expect(page).toHaveURL(/\/resume-builder\/session$/, { timeout: 5_000 });
    await expect(page.getByRole('heading', { name: /Requirements to Match/i })).toBeVisible({ timeout: 8_000 });
    await expect(page.getByRole('button', { name: /^Run Final Review$/i }).first()).toBeVisible({ timeout: 8_000 });
  });

  test('job workspace stage controls unlock interview and offer actions as the process advances', async ({ page }) => {
    await page.goto('/workspace/job/job-betaco', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('h1', { hasText: 'BetaCo' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Interviewing$/i })).toBeVisible();

    await page.getByRole('button', { name: /^Interviewing$/i }).click();

    await expect(page.getByText(/^Interviewing$/).first()).toBeVisible({ timeout: 8_000 });
    await expect(page.getByRole('button', { name: /Open Interview Prep/i }).first()).toBeVisible({ timeout: 8_000 });
    await expect(page.getByRole('button', { name: /Open Thank-You Notes/i }).first()).toBeVisible({ timeout: 8_000 });
    await expect(page.getByRole('button', { name: /Open 30-60-90 Plan/i }).first()).toBeVisible({ timeout: 8_000 });

    await page.getByRole('button', { name: /^Offer$/i }).click();

    await expect(page.getByText(/^Offer$/).first()).toBeVisible({ timeout: 8_000 });
    await expect(page.getByRole('button', { name: /Open Negotiation Prep/i }).first()).toBeVisible({ timeout: 8_000 });
  });

  test('redirects legacy personal-brand room links into Career Profile', async ({ page }) => {
    await page.goto('/workspace?room=personal-brand', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /Build the story every room works from/i })).toBeVisible();
    await expect(page).toHaveURL(/room=personal-brand|room=career-profile/);
  });
});
