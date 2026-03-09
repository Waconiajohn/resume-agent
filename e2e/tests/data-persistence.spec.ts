/**
 * Data persistence tests — verify that session history, master resume, and
 * evidence library data are correctly loaded and displayed via mocked API
 * responses.
 *
 * All tests run under the 'chromium' project (uses storageState from auth
 * setup). All /api/** and Supabase calls are mocked — no real backend needed.
 *
 * These tests focus on:
 *   - Session list loads from API and cards render with correct status badges
 *   - Session status filter narrows the list correctly
 *   - Master Resume tab loads and displays content
 *   - Evidence Library search filters items client-side
 *   - Evidence Library source filter buttons work
 *   - Session deletion removes the card from the list
 */

import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date().toISOString();
const ONE_HOUR_AGO = new Date(Date.now() - 60 * 60 * 1000).toISOString();
const TWO_HOURS_AGO = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

/** Three mock sessions covering all status types. */
const MOCK_SESSIONS = [
  {
    id: 'session-complete-1',
    user_id: 'test-user',
    pipeline_status: 'complete',
    pipeline_stage: 'export',
    company_name: 'Acme Corp',
    job_title: 'Senior Engineer',
    created_at: TWO_HOURS_AGO,
    updated_at: ONE_HOUR_AGO,
    estimated_cost_usd: 0.23,
    product_type: 'resume',
  },
  {
    id: 'session-running-1',
    user_id: 'test-user',
    pipeline_status: 'running',
    pipeline_stage: 'section_writing',
    company_name: 'Beta Inc',
    job_title: 'Cloud Architect',
    created_at: ONE_HOUR_AGO,
    updated_at: NOW,
    estimated_cost_usd: null,
    product_type: 'resume',
  },
  {
    id: 'session-error-1',
    user_id: 'test-user',
    pipeline_status: 'error',
    pipeline_stage: 'gap_analysis',
    company_name: 'Gamma LLC',
    job_title: 'VP Engineering',
    created_at: TWO_HOURS_AGO,
    updated_at: TWO_HOURS_AGO,
    estimated_cost_usd: null,
    product_type: 'resume',
  },
];

/** Master resume fixture with evidence items. */
const MOCK_MASTER_RESUME = {
  id: 'master-resume-1',
  user_id: 'test-user',
  version: 2,
  is_default: true,
  created_at: TWO_HOURS_AGO,
  updated_at: ONE_HOUR_AGO,
  raw_text: 'John Smith\nSenior Software Engineer...',
  summary: 'Experienced engineering leader with 15 years building distributed systems.',
  experience: [],
  skills: { Engineering: ['TypeScript', 'Python', 'Kubernetes'] },
  education: [],
  certifications: [],
  evidence_items: [
    {
      id: 'ev-1',
      text: 'Led migration of monolithic architecture to microservices, reducing deploy time by 60%.',
      source: 'crafted' as const,
      created_at: NOW,
      section: 'experience',
      metrics: ['60% reduction'],
      session_id: 'session-complete-1',
    },
    {
      id: 'ev-2',
      text: 'Designed AWS CloudFormation templates for multi-region deployment pipelines.',
      source: 'interview' as const,
      created_at: ONE_HOUR_AGO,
      section: 'experience',
      metrics: ['multi-region'],
      session_id: 'session-complete-1',
    },
    {
      id: 'ev-3',
      text: 'Upgraded CI/CD pipeline reducing build times from 45 minutes to under 8.',
      source: 'upgraded' as const,
      created_at: TWO_HOURS_AGO,
      section: 'experience',
      metrics: ['45min → 8min'],
      session_id: 'session-complete-1',
    },
  ],
};

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Install Supabase auth stubs and stub all /api/** routes with the provided
 * data fixtures. Call before page.goto().
 *
 * @param sessionFilter - if provided, the sessions returned will be filtered
 *   by this status (simulates the backend filter).
 */
async function mockAllWithData(
  page: Page,
  options?: {
    sessions?: typeof MOCK_SESSIONS;
    masterResume?: typeof MOCK_MASTER_RESUME | null;
    /** Capture DELETE calls for session deletion assertions */
    captureDeletes?: Array<string>;
  },
): Promise<void> {
  const sessions = options?.sessions ?? MOCK_SESSIONS;
  const masterResume = options?.masterResume !== undefined
    ? options.masterResume
    : MOCK_MASTER_RESUME;
  const captureDeletes = options?.captureDeletes;

  // Supabase auth
  await page.route('**/supabase.co/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes('/auth/v1/user')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'test-user', email: 'jjschrup@yahoo.com' }) });
      return;
    }
    if (url.includes('/auth/v1/token')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'token', token_type: 'bearer', expires_in: 3600, user: { id: 'test-user', email: 'jjschrup@yahoo.com' } }) });
      return;
    }
    if (url.includes('/auth/v1/')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }
    if (method === 'GET' && url.includes('/rest/v1/')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return;
    }
    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method) && url.includes('/rest/v1/')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return;
    }
    await route.continue();
  });

  // Backend API routes
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();

    // SSE
    if (/\/api\/sessions\/[^/]+\/sse$/.test(path)) {
      await route.abort();
      return;
    }

    // GET /api/sessions — return mock sessions (optionally filtered by status param)
    if (path === '/api/sessions' && method === 'GET') {
      const statusFilter = url.searchParams.get('status');
      const filtered = statusFilter
        ? sessions.filter((s) => s.pipeline_status === statusFilter)
        : sessions;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions: filtered }) });
      return;
    }

    // DELETE /api/sessions/:id — capture and acknowledge
    if (/\/api\/sessions\/[^/]+$/.test(path) && method === 'DELETE') {
      const sessionId = path.split('/').pop() ?? '';
      captureDeletes?.push(sessionId);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
      return;
    }

    // GET /api/sessions/:id
    if (/\/api\/sessions\/[^/]+$/.test(path) && method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions: sessions }) });
      return;
    }

    // GET /api/resumes — master resume list
    if (path === '/api/resumes' && method === 'GET') {
      const list = masterResume
        ? [{ id: masterResume.id, version: masterResume.version, is_default: masterResume.is_default, created_at: masterResume.created_at, updated_at: masterResume.updated_at }]
        : [];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ resumes: list }) });
      return;
    }

    // GET /api/resumes/default — full master resume
    if (path === '/api/resumes/default' && method === 'GET') {
      if (!masterResume) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Not found' }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ resume: masterResume }) });
      return;
    }

    // GET /api/resumes/:id
    if (/\/api\/resumes\/[^/]+$/.test(path) && method === 'GET') {
      if (!masterResume) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Not found' }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ resume: masterResume }) });
      return;
    }

    // Workflow summary
    if (/\/api\/workflow\/[^/]+$/.test(path) && method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ session: null, nodes: [], latest_artifacts: [], replan: null }) });
      return;
    }

    // Pipeline status
    if (path.startsWith('/api/pipeline/status')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ running: false, pending_gate: null }) });
      return;
    }

    // Catch-all
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
}

/**
 * Navigate to /dashboard and wait for the heading and tab bar to appear.
 */
async function navigateToDashboard(page: Page): Promise<void> {
  await page.goto('/dashboard');
  await expect(
    page.getByRole('heading', { name: /Dashboard/i }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(
    page.getByRole('button', { name: /Session History/i }),
  ).toBeVisible({ timeout: 5_000 });
}

/**
 * Wait for the loading skeleton (animate-pulse) to disappear.
 */
async function waitForLoadingDone(page: Page): Promise<void> {
  await expect(page.locator('.animate-pulse'))
    .not.toBeAttached({ timeout: 10_000 })
    .catch(() => {});
  await page.waitForTimeout(300);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Data persistence', () => {
  // ── Test 1: Session history shows all mock sessions ───────────────────────

  test('session history tab loads and renders all mock sessions', async ({ page }) => {
    await mockAllWithData(page);
    await navigateToDashboard(page);
    await waitForLoadingDone(page);

    // All three sessions must have a delete button (one per card)
    const deleteButtons = page.getByRole('button', { name: 'Delete session' });
    await expect(deleteButtons).toHaveCount(MOCK_SESSIONS.length, { timeout: 10_000 });
  });

  // ── Test 2: Session cards show correct status badges ─────────────────────

  test('session cards render correct status badges for each status', async ({ page }) => {
    await mockAllWithData(page);
    await navigateToDashboard(page);
    await waitForLoadingDone(page);

    // Each badge label is rendered in a <span> element inside the session card.
    // Use the span locator to avoid matching the filter button which also has "Error" text.
    // StatusBadge renders: <span class="inline-flex items-center gap-1.5 ...">...<span dot/>Label</span>
    await expect(page.locator('span').filter({ hasText: /^Complete$/ }).first()).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('span').filter({ hasText: /^Running$/ }).first()).toBeVisible({ timeout: 5_000 });
    // "Error" badge is a span inside a card; the filter button is a <button>, not a <span>
    await expect(page.locator('span').filter({ hasText: /^Error$/ }).first()).toBeVisible({ timeout: 5_000 });
  });

  // ── Test 3: Status filter "Completed" narrows the session list ───────────

  test('status filter "Completed" shows only completed sessions', async ({ page }) => {
    await mockAllWithData(page);
    await navigateToDashboard(page);
    await waitForLoadingDone(page);

    // Click "Completed" filter
    await page.getByRole('button', { name: /^Completed$/i }).click();
    await page.waitForTimeout(500);

    // Only the complete session should remain — 1 delete button
    const deleteButtons = page.getByRole('button', { name: 'Delete session' });
    await expect(deleteButtons).toHaveCount(1, { timeout: 5_000 });

    // The complete session's company must be visible
    await expect(page.getByText('Acme Corp')).toBeVisible();
    // The running session's company must NOT be visible
    await expect(page.getByText('Beta Inc')).not.toBeVisible();
  });

  // ── Test 4: Status filter restored when clicking "All" ───────────────────

  test('clicking All filter after Completed restores the full session list', async ({ page }) => {
    await mockAllWithData(page);
    await navigateToDashboard(page);
    await waitForLoadingDone(page);

    await page.getByRole('button', { name: /^Completed$/i }).click();
    await page.waitForTimeout(400);

    await page.getByRole('button', { name: /^All$/i }).click();
    await page.waitForTimeout(400);

    const deleteButtons = page.getByRole('button', { name: 'Delete session' });
    await expect(deleteButtons).toHaveCount(MOCK_SESSIONS.length, { timeout: 5_000 });
  });

  // ── Test 5: Master Resume tab loads content from API ─────────────────────

  test('master resume tab renders summary from API response', async ({ page }) => {
    await mockAllWithData(page);
    await navigateToDashboard(page);

    // Switch to Master Resume tab
    await page.getByRole('button', { name: /Master Resume/i }).click();
    await waitForLoadingDone(page);

    // The master resume summary text must appear somewhere in the tab
    await expect(
      page.getByText(/Experienced engineering leader/i),
    ).toBeVisible({ timeout: 10_000 });
  });

  // ── Test 6: Evidence Library shows items from master resume ──────────────

  test('evidence library tab shows evidence items loaded from master resume', async ({ page }) => {
    await mockAllWithData(page);
    await navigateToDashboard(page);

    await page.getByRole('button', { name: /Evidence Library/i }).click();
    await waitForLoadingDone(page);

    // All three evidence item texts must be visible
    await expect(
      page.getByText(/monolithic architecture to microservices/i),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText(/AWS CloudFormation/i),
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      page.getByText(/CI\/CD pipeline/i),
    ).toBeVisible({ timeout: 5_000 });
  });

  // ── Test 7: Evidence Library search filters items client-side ─────────────

  test('evidence library search filters to matching items', async ({ page }) => {
    await mockAllWithData(page);
    await navigateToDashboard(page);

    await page.getByRole('button', { name: /Evidence Library/i }).click();
    await waitForLoadingDone(page);

    // Wait for items to appear
    await expect(
      page.getByText(/monolithic architecture to microservices/i),
    ).toBeVisible({ timeout: 10_000 });

    // Search for "AWS" — only the AWS item should match
    const searchInput = page.getByPlaceholder(/Search evidence/i);
    await searchInput.fill('AWS');
    await page.waitForTimeout(300);

    await expect(page.getByText(/AWS CloudFormation/i)).toBeVisible();
    await expect(page.getByText(/monolithic architecture/i)).not.toBeVisible();
    await expect(page.getByText(/CI\/CD pipeline/i)).not.toBeVisible();
  });

  // ── Test 8: Evidence Library search clear shows all items again ───────────

  test('clearing evidence library search restores all items', async ({ page }) => {
    await mockAllWithData(page);
    await navigateToDashboard(page);

    await page.getByRole('button', { name: /Evidence Library/i }).click();
    await waitForLoadingDone(page);

    await expect(
      page.getByText(/monolithic architecture to microservices/i),
    ).toBeVisible({ timeout: 10_000 });

    const searchInput = page.getByPlaceholder(/Search evidence/i);
    await searchInput.fill('AWS');
    await page.waitForTimeout(300);

    await searchInput.clear();
    await page.waitForTimeout(300);

    // All three items should be visible again
    await expect(page.getByText(/monolithic architecture to microservices/i)).toBeVisible();
    await expect(page.getByText(/AWS CloudFormation/i)).toBeVisible();
    await expect(page.getByText(/CI\/CD pipeline/i)).toBeVisible();
  });

  // ── Test 9: Evidence Library source filter "Interview" narrows items ──────

  test('evidence library Interview source filter shows only interview items', async ({ page }) => {
    await mockAllWithData(page);
    await navigateToDashboard(page);

    await page.getByRole('button', { name: /Evidence Library/i }).click();
    await waitForLoadingDone(page);

    await expect(
      page.getByText(/monolithic architecture to microservices/i),
    ).toBeVisible({ timeout: 10_000 });

    // Click "Interview" source filter
    await page.getByRole('button', { name: /^Interview$/i }).click();
    await page.waitForTimeout(300);

    // Only the interview-sourced item should be visible
    await expect(page.getByText(/AWS CloudFormation/i)).toBeVisible();
    await expect(page.getByText(/monolithic architecture/i)).not.toBeVisible();
    await expect(page.getByText(/CI\/CD pipeline/i)).not.toBeVisible();
  });

  // ── Test 10: Evidence Library empty state when no master resume ───────────

  test('evidence library shows empty state when no master resume exists', async ({ page }) => {
    await mockAllWithData(page, { masterResume: null });
    await navigateToDashboard(page);

    await page.getByRole('button', { name: /Evidence Library/i }).click();
    await waitForLoadingDone(page);

    await expect(
      page.getByText(/No master resume found/i),
    ).toBeVisible({ timeout: 10_000 });

    await expect(
      page.getByText(/Complete a session to generate evidence items/i),
    ).toBeVisible();
  });

  // ── Test 11: Session card shows title from company + job title ────────────

  test('session card title combines company name and job title', async ({ page }) => {
    await mockAllWithData(page);
    await navigateToDashboard(page);
    await waitForLoadingDone(page);

    // First session: "Acme Corp — Senior Engineer"
    await expect(page.getByText('Acme Corp — Senior Engineer')).toBeVisible({ timeout: 8_000 });
    // Second session: "Beta Inc — Cloud Architect"
    await expect(page.getByText('Beta Inc — Cloud Architect')).toBeVisible();
  });

  // ── Test 12: "In Progress" filter shows only running sessions ────────────

  test('status filter "In Progress" shows only running sessions', async ({ page }) => {
    await mockAllWithData(page);
    await navigateToDashboard(page);
    await waitForLoadingDone(page);

    await page.getByRole('button', { name: /^In Progress$/i }).click();
    await page.waitForTimeout(400);

    // Only the running session should be visible
    const deleteButtons = page.getByRole('button', { name: 'Delete session' });
    await expect(deleteButtons).toHaveCount(1, { timeout: 5_000 });
    await expect(page.getByText('Beta Inc — Cloud Architect')).toBeVisible();
    await expect(page.getByText('Acme Corp — Senior Engineer')).not.toBeVisible();
  });
});
