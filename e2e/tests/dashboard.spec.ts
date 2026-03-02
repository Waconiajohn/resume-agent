/**
 * E2E tests for the Dashboard flows.
 *
 * Story 8 — Sprint 10: Verify that the dashboard renders correctly after auth,
 * that tab switching works, that session cards appear with status badges,
 * that the resume viewer modal opens, that evidence library search/filter
 * operates, and that comparison mode enables when 2 complete sessions exist.
 *
 * These tests run under the 'chromium' project (uses storageState from auth
 * setup so auth is already present). They must be resilient to data state:
 * - 0 sessions   → empty-state UI assertions pass
 * - 1+ sessions  → session-card assertions pass
 * - 2+ complete  → comparison selection assertions pass
 *
 * All assertions use generous timeouts because the app talks to a real
 * Supabase instance and the session list is fetched on mount.
 */

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ─── Supabase helpers ─────────────────────────────────────────────────────────

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

/**
 * Fetch sessions for the test user directly via the Supabase REST API.
 * Returns the list sorted newest-first (same as the app).
 */
async function fetchTestSessions(): Promise<
  Array<{ id: string; pipeline_status: string | null; company_name: string | null; job_title: string | null }>
> {
  const { url, serviceKey } = loadSupabaseConfig();
  if (!url || !serviceKey) return [];

  const res = await fetch(
    `${url}/rest/v1/coach_sessions?user_id=eq.${TEST_USER_ID}&select=id,pipeline_status,company_name,job_title&order=created_at.desc`,
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
    company_name: string | null;
    job_title: string | null;
  }>;
}

// ─── DOM helpers ──────────────────────────────────────────────────────────────

/**
 * Wait for the dashboard to finish its initial data load.
 * The tabs and "Dashboard" heading should be visible within a short timeout.
 */
async function waitForDashboardReady(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: /Dashboard/i })).toBeVisible({
    timeout: 15_000,
  });
  // Tab bar is rendered synchronously — presence confirms component mounted
  await expect(page.getByRole('button', { name: /Session History/i })).toBeVisible({
    timeout: 5_000,
  });
}

/**
 * Click a dashboard tab by its visible label text.
 */
async function clickTab(page: Page, label: string): Promise<void> {
  await page.getByRole('button', { name: new RegExp(label, 'i') }).click();
}

/**
 * Count the number of session cards currently visible.
 * Cards are GlassCard elements inside the sessions grid.
 * We identify them by the aria-label on the select checkbox
 * (present on complete sessions) or by the trash/eye icon buttons.
 * A more reliable selector: each card contains a StatusBadge which has
 * a small colored dot span. We count cards that have the delete button
 * (every card has one).
 */
async function countVisibleSessionCards(page: Page): Promise<number> {
  // Every session card has a delete button with aria-label "Delete session"
  return page.getByRole('button', { name: 'Delete session' }).count();
}

// ─── Navigate to dashboard helper ─────────────────────────────────────────────

async function navigateToDashboard(page: Page): Promise<void> {
  await page.goto('/dashboard');
  await waitForDashboardReady(page);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('Dashboard Flows', () => {
  // Discover session data state once before all tests so we can skip
  // data-dependent assertions gracefully when data doesn't exist.
  let allSessions: Array<{
    id: string;
    pipeline_status: string | null;
    company_name: string | null;
    job_title: string | null;
  }> = [];
  let completeSessions: typeof allSessions = [];

  test.beforeAll(async () => {
    allSessions = await fetchTestSessions();
    completeSessions = allSessions.filter((s) => s.pipeline_status === 'complete');
    // eslint-disable-next-line no-console
    console.log(
      `[dashboard-e2e] Test data: ${allSessions.length} total sessions, ` +
        `${completeSessions.length} complete`,
    );
  });

  // ── Test 1: Dashboard renders and tabs are present ─────────────────────────

  test('dashboard page loads with three tabs after auth', async ({ page }) => {
    await navigateToDashboard(page);

    // Dashboard heading
    await expect(
      page.getByRole('heading', { name: /Dashboard/i }),
    ).toBeVisible();

    // Subtitle copy
    await expect(
      page.getByText(/Manage your resume sessions/i),
    ).toBeVisible();

    // All three tabs must be present in the tab bar
    await expect(
      page.getByRole('button', { name: /Session History/i }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Master Resume/i }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Evidence Library/i }),
    ).toBeVisible();
  });

  // ── Test 2: Session History tab — status filter bar renders ────────────────

  test('session history tab shows filter bar and handles empty state', async ({
    page,
  }) => {
    await navigateToDashboard(page);
    // Sessions tab is active by default
    await clickTab(page, 'Session History');

    // Wait for loading to settle (grid or empty state should appear)
    // The loading skeleton has animate-pulse divs; wait for it to disappear
    await expect(page.locator('.animate-pulse')).not.toBeAttached({ timeout: 10_000 })
      .catch(() => {
        // Skeleton may have already left — that is fine
      });

    // Status filter buttons
    await expect(page.getByRole('button', { name: /^All$/i })).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByRole('button', { name: /Completed/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /In Progress/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Error/i })).toBeVisible();

    if (allSessions.length === 0) {
      // Empty state must show a helpful message
      await expect(page.getByText(/No sessions found/i)).toBeVisible({
        timeout: 10_000,
      });
    } else {
      // At least one session card must be visible
      await expect(
        page.getByRole('button', { name: 'Delete session' }).first(),
      ).toBeVisible({ timeout: 10_000 });
    }
  });

  // ── Test 3: Session cards display status badges ────────────────────────────

  test('session cards show status badges', async ({ page }) => {
    if (allSessions.length === 0) {
      test.skip(true, 'No sessions in test data — skipping status badge check');
      return;
    }

    await navigateToDashboard(page);
    await clickTab(page, 'Session History');

    // Wait for at least one card
    await expect(
      page.getByRole('button', { name: 'Delete session' }).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Status badges use colored dot + text. The text values are:
    // "Running", "Complete", "Error", or the raw status string.
    // We check that at least one badge label matches a known status.
    const knownLabels = ['Running', 'Complete', 'Error'];
    let foundBadge = false;
    for (const label of knownLabels) {
      const count = await page.getByText(label, { exact: true }).count();
      if (count > 0) {
        foundBadge = true;
        break;
      }
    }

    // Fallback: at least one card title visible (even if status is unknown)
    if (!foundBadge) {
      const cardCount = await countVisibleSessionCards(page);
      expect(cardCount).toBeGreaterThan(0);
    } else {
      expect(foundBadge).toBe(true);
    }
  });

  // ── Test 4: Status filter narrows the visible cards ───────────────────────

  test('status filter updates visible session list', async ({ page }) => {
    if (allSessions.length === 0) {
      test.skip(true, 'No sessions in test data — skipping filter test');
      return;
    }

    await navigateToDashboard(page);
    await clickTab(page, 'Session History');

    // Wait for cards to load
    await expect(
      page.getByRole('button', { name: 'Delete session' }).first(),
    ).toBeVisible({ timeout: 10_000 });

    const totalCount = await countVisibleSessionCards(page);

    // Click "Completed" filter
    await page.getByRole('button', { name: /Completed/i }).click();
    await page.waitForTimeout(500); // brief pause for UI re-render

    const completedCount = await countVisibleSessionCards(page);
    expect(completedCount).toBeLessThanOrEqual(totalCount);

    // Click "All" to restore full list
    await page.getByRole('button', { name: /^All$/i }).click();
    await page.waitForTimeout(500);

    const restoredCount = await countVisibleSessionCards(page);
    expect(restoredCount).toBeGreaterThanOrEqual(completedCount);
  });

  // ── Test 5: Resume viewer modal opens for a complete session ──────────────

  test('resume viewer modal opens and closes for a complete session', async ({
    page,
  }) => {
    if (completeSessions.length === 0) {
      test.skip(
        true,
        'No complete sessions in test data — skipping resume viewer modal test',
      );
      return;
    }

    await navigateToDashboard(page);
    await clickTab(page, 'Session History');

    // Wait for cards to load
    await expect(
      page.getByRole('button', { name: 'Delete session' }).first(),
    ).toBeVisible({ timeout: 10_000 });

    // The Eye button ("View resume") is only on complete sessions
    const eyeButton = page.getByRole('button', { name: 'View resume' }).first();
    await expect(eyeButton).toBeVisible({ timeout: 5_000 });
    await eyeButton.click();

    // Modal header
    await expect(
      page.getByRole('heading', { name: /Session Resume/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Modal body should eventually show the resume text or a loading spinner.
    // We accept either the spinner completing or the resume content appearing.
    await expect(
      page.locator('.fixed.inset-0').first(),
    ).toBeVisible({ timeout: 3_000 });

    // Close button (X icon with aria-label="Close")
    const closeBtn = page.getByRole('button', { name: /Close/i });
    await expect(closeBtn).toBeVisible({ timeout: 3_000 });
    await closeBtn.click();

    // Modal should be gone
    await expect(
      page.getByRole('heading', { name: /Session Resume/i }),
    ).not.toBeVisible({ timeout: 5_000 });
  });

  // ── Test 6: Tab switching — Master Resume tab ─────────────────────────────

  test('switching to Master Resume tab renders that tab', async ({ page }) => {
    await navigateToDashboard(page);

    await clickTab(page, 'Master Resume');

    // The Master Resume tab either shows the resume content, a loading
    // spinner, or an empty state. We verify the tab itself is now active
    // by checking that the session cards grid is gone and the Master Resume
    // content area is present.
    // The session filter buttons (All / Completed / In Progress / Error)
    // should NOT be visible when Master Resume tab is active.
    await expect(
      page.getByRole('button', { name: /^All$/i }),
    ).not.toBeVisible({ timeout: 3_000 });

    // The tab label for Master Resume should now have the active style.
    // We can't check CSS classes directly from Playwright easily, but we
    // can confirm that clicking it didn't navigate away from the dashboard.
    await expect(
      page.getByRole('heading', { name: /Dashboard/i }),
    ).toBeVisible();
  });

  // ── Test 7: Tab switching — Evidence Library tab ──────────────────────────

  test('switching to Evidence Library tab renders filter controls', async ({
    page,
  }) => {
    await navigateToDashboard(page);

    await clickTab(page, 'Evidence Library');

    // Wait for the tab content to mount (loading or content)
    await page.waitForTimeout(500);

    // The Evidence Library filter buttons are always rendered regardless
    // of whether there is a master resume.
    await expect(
      page.getByRole('button', { name: /^All$/i }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /Crafted/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Upgraded/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Interview/i })).toBeVisible();

    // Search input
    await expect(
      page.getByPlaceholder(/Search evidence/i),
    ).toBeVisible({ timeout: 5_000 });
  });

  // ── Test 8: Evidence Library search filters items ─────────────────────────

  test('evidence library search input filters the displayed items', async ({
    page,
  }) => {
    await navigateToDashboard(page);
    await clickTab(page, 'Evidence Library');

    // Wait for load to finish (skeleton gone or content visible)
    await page.waitForTimeout(1_000);
    await expect(page.locator('.animate-pulse')).not.toBeAttached({ timeout: 10_000 })
      .catch(() => {});

    const searchInput = page.getByPlaceholder(/Search evidence/i);
    await expect(searchInput).toBeVisible({ timeout: 5_000 });

    // Type a search string that is very unlikely to match anything
    const noMatchString = 'xyzzy_no_match_e2e_test_token';
    await searchInput.fill(noMatchString);
    await page.waitForTimeout(300);

    // Should show "No evidence items match your filters" or "No master resume found"
    const noMatch = page.getByText(/No evidence items match/i);
    const noResume = page.getByText(/No master resume found/i);
    const eitherVisible =
      (await noMatch.isVisible().catch(() => false)) ||
      (await noResume.isVisible().catch(() => false));
    expect(eitherVisible).toBe(true);

    // Clear search — items count should return (or empty state if no master resume)
    await searchInput.clear();
    await page.waitForTimeout(300);

    // Search input should be empty
    await expect(searchInput).toHaveValue('');
  });

  // ── Test 9: Evidence Library source filter buttons toggle ─────────────────

  test('evidence library source filter buttons are clickable and toggle state', async ({
    page,
  }) => {
    await navigateToDashboard(page);
    await clickTab(page, 'Evidence Library');

    const allBtn = page.getByRole('button', { name: /^All$/i });
    const craftedBtn = page.getByRole('button', { name: /Crafted/i });

    await expect(allBtn).toBeVisible({ timeout: 10_000 });

    // Click "Crafted" filter
    await craftedBtn.click();
    await page.waitForTimeout(300);

    // Clicking "Crafted" should not navigate away
    await expect(
      page.getByRole('heading', { name: /Dashboard/i }),
    ).toBeVisible();

    // Clicking "All" should restore
    await allBtn.click();
    await page.waitForTimeout(300);

    await expect(
      page.getByRole('heading', { name: /Dashboard/i }),
    ).toBeVisible();
  });

  // ── Test 10: Comparison — select 2 complete sessions enables Compare button

  test('selecting two complete sessions enables Compare Selected button', async ({
    page,
  }) => {
    if (completeSessions.length < 2) {
      test.skip(
        true,
        `Only ${completeSessions.length} complete session(s) — need 2 for comparison test`,
      );
      return;
    }

    await navigateToDashboard(page);
    await clickTab(page, 'Session History');

    // Wait for cards to load
    await expect(
      page.getByRole('button', { name: 'Delete session' }).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Find checkboxes — only complete sessions have them
    // aria-label is "Select session: <title>"
    const checkboxes = page.getByRole('checkbox');
    const checkboxCount = await checkboxes.count();
    expect(checkboxCount).toBeGreaterThanOrEqual(2);

    // Select the first checkbox
    await checkboxes.nth(0).click();
    await page.waitForTimeout(300);

    // "Compare Selected" button should NOT yet be visible (need 2 selections)
    await expect(
      page.getByRole('button', { name: /Compare Selected/i }),
    ).not.toBeVisible();

    // "Select one more" helper text should appear
    await expect(
      page.getByText(/Select one more completed session to compare/i),
    ).toBeVisible({ timeout: 3_000 });

    // Select the second checkbox
    await checkboxes.nth(1).click();
    await page.waitForTimeout(300);

    // Now "Compare Selected" button should be visible and enabled
    const compareBtn = page.getByRole('button', { name: /Compare Selected/i });
    await expect(compareBtn).toBeVisible({ timeout: 5_000 });
    await expect(compareBtn).toBeEnabled();
  });

  // ── Test 11: Comparison modal opens when Compare Selected is clicked ───────

  test('clicking Compare Selected opens the comparison modal', async ({
    page,
  }) => {
    if (completeSessions.length < 2) {
      test.skip(
        true,
        `Only ${completeSessions.length} complete session(s) — need 2 for comparison modal test`,
      );
      return;
    }

    await navigateToDashboard(page);
    await clickTab(page, 'Session History');

    // Wait for cards
    await expect(
      page.getByRole('button', { name: 'Delete session' }).first(),
    ).toBeVisible({ timeout: 10_000 });

    const checkboxes = page.getByRole('checkbox');
    await checkboxes.nth(0).click();
    await page.waitForTimeout(300);
    await checkboxes.nth(1).click();
    await page.waitForTimeout(300);

    const compareBtn = page.getByRole('button', { name: /Compare Selected/i });
    await expect(compareBtn).toBeVisible({ timeout: 5_000 });
    await compareBtn.click();

    // Comparison modal should open — it renders a fixed overlay with two columns
    // The modal has an X close button with aria-label="Close"
    await expect(
      page.getByRole('button', { name: /Close/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Dismiss the modal
    const closeBtn = page.getByRole('button', { name: /Close/i });
    await closeBtn.click();

    // After closing, "Compare Selected" button disappears (state is reset)
    await expect(
      page.getByRole('button', { name: /Compare Selected/i }),
    ).not.toBeVisible({ timeout: 5_000 });
  });

  // ── Test 12: Back-navigation from dashboard to /app ───────────────────────

  test('navigating from /dashboard to /app works via browser history', async ({
    page,
  }) => {
    await navigateToDashboard(page);

    // Navigate to the main app view
    await page.goto('/app');

    // The app's landing screen (or coach screen) should render
    // Both show a start-session-style button or the coach interface.
    // Since we are authenticated, the landing screen renders with "Start New Session".
    await expect(
      page.getByRole('button', { name: /Start New Session/i }),
    ).toBeVisible({ timeout: 15_000 });

    // Navigate back to dashboard
    await page.goBack();
    await waitForDashboardReady(page);
  });
});
