/**
 * Resume Builder workspace flows.
 *
 * This suite replaces the old signed-in Dashboard assumptions with the
 * current Workspace -> Resume Builder surface.
 *
 * These tests run under the real-auth `chromium` project.
 * They are intentionally light on data assumptions:
 * - 0 sessions   -> empty-state assertions pass
 * - 1+ sessions  -> workspace-card assertions pass
 * - 1+ viewable resume asset -> modal assertions pass
 */

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadSupabaseConfig(): { url: string; serviceKey: string } {
  const envPath = resolve(process.cwd(), 'server/.env');
  const content = readFileSync(envPath, 'utf-8');
  const get = (key: string): string => {
    const match = content.match(new RegExp(`^${key}=(.+)$`, 'm'));
    return match?.[1]?.trim() ?? '';
  };
  return {
    url: get('SUPABASE_URL'),
    serviceKey: get('SUPABASE_SERVICE_ROLE_KEY'),
  };
}

const TEST_USER_ID =
  process.env.TEST_USER_ID || '5b756a7a-3e35-4465-bcf4-69d92f160f21';

function getAuthUserId(): string {
  try {
    const state = JSON.parse(
      readFileSync(resolve(process.cwd(), '.auth/user.json'), 'utf-8'),
    );
    for (const origin of state.origins ?? []) {
      for (const item of origin.localStorage ?? []) {
        if (item.name?.includes('auth-token')) {
          const parsed = JSON.parse(item.value);
          if (parsed?.user?.id) return parsed.user.id;
        }
      }
    }
  } catch {
    /* fall through */
  }
  return TEST_USER_ID;
}

async function fetchTestSessions(): Promise<
  Array<{ id: string; pipeline_status: string | null }>
> {
  const { url, serviceKey } = loadSupabaseConfig();
  if (!url || !serviceKey) return [];

  const userId = getAuthUserId();
  const res = await fetch(
    `${url}/rest/v1/coach_sessions?user_id=eq.${userId}&select=id,pipeline_status,last_panel_data&order=created_at.desc`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    },
  );

  if (!res.ok) return [];
  return (await res.json()) as Array<{
    id: string;
    pipeline_status: string | null;
  }>;
}

async function waitForResumeBuilderReady(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/workspace\?room=resume/, { timeout: 15_000 });
  await expect(
    page.getByRole('heading', {
      name: /Your home for tailored resumes/i,
    }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('span').filter({ hasText: /^Job Workspaces$/i }).first()).toBeVisible({
    timeout: 5_000,
  });
}

async function openResumeBuilder(page: Page): Promise<void> {
  await page.goto('/workspace?room=resume');
  await waitForResumeBuilderReady(page);
}

test.describe('Resume Builder Workspace', () => {
  let allSessions: Array<{ id: string; pipeline_status: string | null }> = [];

  test.beforeAll(async () => {
    allSessions = await fetchTestSessions();
    // eslint-disable-next-line no-console
    console.log(`[resume-builder-e2e] Test data: ${allSessions.length} total sessions`);
  });

  test('resume builder loads with current workspace tabs', async ({ page }) => {
    await openResumeBuilder(page);

    await expect(page.locator('span').filter({ hasText: /^Job Workspaces$/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^Open Master Resume$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Write Cover Letter$/i })).toBeVisible();
    await expect(page.getByText(/Your home for tailored resumes/i)).toBeVisible();
  });

  test('job workspaces tab shows filters and handles empty or populated state', async ({ page }) => {
    await openResumeBuilder(page);

    await expect(page.getByRole('button', { name: /^All$/i })).toBeVisible({ timeout: 8_000 });
    await expect(page.getByRole('button', { name: /Completed/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /In Progress/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Needs Review/i })).toBeVisible();

    const hasEmptyState = await page.getByText(/No saved tailored work found for this filter/i).isVisible().catch(() => false);
    const hasWorkspaceRow = await page.getByRole('button', { name: /View Workspace|Workspace Open/i }).first().isVisible().catch(() => false);

    expect(hasEmptyState || hasWorkspaceRow).toBe(true);
  });

  test('resume asset modal opens when a viewable resume exists', async ({ page }) => {
    await openResumeBuilder(page);

    const viewResumeButton = page.getByRole('button', { name: /View Resume/i }).first();
    const hasViewableResume = await viewResumeButton.isVisible().catch(() => false);
    if (!hasViewableResume) {
      test.skip(true, 'No viewable resume asset available in current test data');
      return;
    }

    await viewResumeButton.click();
    await expect(
      page.getByRole('heading', { name: /Session Resume/i }),
    ).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /Close/i }).click();
    await expect(
      page.getByRole('heading', { name: /Session Resume/i }),
    ).not.toBeVisible({ timeout: 5_000 });
  });

  test('cover letter renders as a secondary flow inside resume builder', async ({ page }) => {
    await openResumeBuilder(page);
    await page.getByRole('button', { name: /^Write Cover Letter$/i }).click();

    await expect(
      page.getByRole('heading', {
        name: /Write the cover letter in the same workflow/i,
      }),
    ).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText(/keep the letter tied to the same job workspace/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Back to Job Workspaces/i }).first()).toBeVisible();
  });

  test('master resume tab renders current editor surface or empty state', async ({ page }) => {
    await openResumeBuilder(page);
    await page.getByRole('button', { name: /^Open Master Resume$/i }).click();

    const hasEmptyState = await page.getByText(/No master resume found/i).isVisible().catch(() => false);
    const hasSummarySection = await page.getByRole('heading', { name: /Summary/i }).isVisible().catch(() => false);
    const hasEditButton = await page.getByRole('button', { name: /^Edit$/i }).isVisible().catch(() => false);

    expect(hasEmptyState || hasSummarySection || hasEditButton).toBe(true);
    await expect(page.getByRole('button', { name: /Back to Job Workspaces/i }).first()).toBeVisible();
  });

  test('cover-letter focus route opens the embedded cover-letter tab', async ({ page }) => {
    await page.goto('/workspace?room=resume&focus=cover-letter');
    await waitForResumeBuilderReady(page);

    await expect(
      page.getByRole('heading', {
        name: /Write the cover letter in the same workflow/i,
      }),
    ).toBeVisible({ timeout: 8_000 });
  });
});
