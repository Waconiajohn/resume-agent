import { test, expect, type Page } from '@playwright/test';
import { mockWorkspaceApp } from '../helpers/mock-workspace-app';

test.describe('workspace guided flows', () => {
  test.beforeEach(async ({ page }) => {
    await mockWorkspaceApp(page);
  });

  const savedResumeRow = (page: Page, company: string) =>
    page.locator('div.px-5.py-4').filter({ hasText: company }).first();

  test('reopens a saved resume job record inside the application workspace', async ({ page }) => {
    await page.goto('/workspace?room=resume&focus=job-workspaces', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /Reopen resumes built for specific jobs/i })).toBeVisible();
    const techCorpRow = savedResumeRow(page, 'TechCorp');
    await expect(techCorpRow).toBeVisible();
    await expect(techCorpRow.getByText(/Resume .* Cover Letter/i)).toBeVisible();
    await expect(techCorpRow.getByRole('button', { name: /^Open$/i })).toBeVisible();

    await techCorpRow.getByRole('button', { name: /Details/i }).click();

    await expect(page.getByText('Stage control')).toBeVisible();
    await expect(page.getByText('Unlocked next')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Offer', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /View Resume/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /View Cover Letter/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Open Saved Prep/i }).first()).toBeVisible();

    await techCorpRow.getByRole('button', { name: /^Open$/i }).click();

    await expect(page).toHaveURL(/\/workspace\/application\/job-techcorp\/resume\?sessionId=mock-resume-session$/);
    await expect(page.getByRole('heading', { name: /Tailor your resume/i }).first()).toBeVisible();
  });

  test('organizes Interview Prep into sections and opens the 30-60-90 plan from Leave-behinds', async ({ page }) => {
    await page.goto('/workspace?room=interview', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /Prep, practice, and follow-up in one place/i })).toBeVisible();
    await page.getByRole('button', { name: /Step 3 Leave-behinds/i }).click();

    await expect(page.getByRole('heading', { name: /30-60-90 Plan/i }).first()).toBeVisible();
    await expect(page.getByText(/Draft a role-specific 30-60-90 plan/i)).toBeVisible();
  });

  test('opens saved later-stage assets from the saved tailored resume details panel', async ({ page }) => {
    await page.goto('/workspace?room=resume&focus=job-workspaces', { waitUntil: 'domcontentloaded' });

    const techCorpRow = savedResumeRow(page, 'TechCorp');
    await techCorpRow.getByRole('button', { name: /Details/i }).click();
    await page.getByRole('button', { name: /Open Saved Prep/i }).first().click();
    await expect(page).toHaveURL(/room=interview/);
    await expect(page).toHaveURL(/focus=prep/);
    await expect(page).toHaveURL(/session=mock-interview-prep-session/);
    await expect(page.getByText('Lead with executive operating cadence and cross-functional alignment.')).toBeVisible();

    await page.goto('/workspace?room=resume&focus=job-workspaces', { waitUntil: 'domcontentloaded' });
    await savedResumeRow(page, 'TechCorp').getByRole('button', { name: /Details/i }).click();
    await page.getByRole('button', { name: /Open Saved Note/i }).first().click();
    await expect(page).toHaveURL(/focus=thank-you/);
    await expect(page).toHaveURL(/session=mock-thank-you-session/);
    await expect(page.getByText(/thoughtful conversation about operating cadence/i)).toBeVisible();

    await page.goto('/workspace?room=resume&focus=job-workspaces', { waitUntil: 'domcontentloaded' });
    await savedResumeRow(page, 'OfferCo').getByRole('button', { name: /Details/i }).click();
    await page.getByRole('button', { name: /Open Saved Strategy/i }).first().click();
    await expect(page).toHaveURL(/room=interview/);
    await expect(page).toHaveURL(/focus=negotiation/);
    await expect(page).toHaveURL(/session=mock-nego-session/);
    await expect(page.getByText(/scope, market position, and first-year risk offset/i)).toBeVisible();
  });

  test('job workspace fallback actions route back into Tailor Resume when later-stage assets do not exist yet', async ({ page }) => {
    await page.goto('/workspace?room=resume&focus=job-workspaces', { waitUntil: 'domcontentloaded' });

    const betaCoRow = savedResumeRow(page, 'BetaCo');
    await expect(betaCoRow).toBeVisible();
    await betaCoRow.getByRole('button', { name: /Details/i }).click();
    await expect(page.getByText(/Available now: Tailor Resume/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Open Session/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Open Interview Prep/i })).toHaveCount(0);

    await page.getByRole('button', { name: /Reopen Tailored Work/i }).click();

    await expect(page).toHaveURL(/\/workspace\/application\/job-betaco\/resume\?sessionId=mock-second-resume-session$/, { timeout: 5_000 });
    await expect(page.getByRole('heading', { name: /Tailor your resume/i }).first()).toBeVisible({ timeout: 8_000 });
  });

  test('job workspace stage controls unlock interview and offer actions as the process advances', async ({ page }) => {
    await page.goto('/workspace?room=resume&focus=job-workspaces', { waitUntil: 'domcontentloaded' });

    await savedResumeRow(page, 'BetaCo').getByRole('button', { name: /Details/i }).click();
    await expect(page.getByText('Stage control')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Interviewing$/i })).toBeEnabled();

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

    await expect(page.getByRole('heading', { name: 'Benchmark Profile', exact: true })).toBeVisible();
    await expect(page.getByText(/Three answers that define how LinkedIn Growth, Find Jobs, Tailor Resume, Interview & Offer/i)).toBeVisible();
    await expect(page).toHaveURL(/room=career-profile/);
  });
});
