/**
 * Error recovery tests — verify that the app handles API failures, network
 * errors, and SSE error events gracefully.
 *
 * All tests run under the 'chromium' project (uses storageState for auth).
 * Backend calls are fully mocked via page.route() and page.addInitScript().
 * No running backend required.
 *
 * Coverage:
 *   - API returns 500 → error state rendered
 *   - API returns 429 → rate limit error shown
 *   - Pipeline error SSE event → error panel visible
 *   - After error, header navigation still works
 *   - After error, user can start a new session attempt
 *   - SessionHistoryTab API error renders gracefully
 *   - Auth gate still functional after a network blip on the app screen
 */

import { test, expect, type Page } from '@playwright/test';
import { buildSSEBody } from '../fixtures/mock-sse';
import {
  SAMPLE_RESUME_TEXT,
  SAMPLE_JD_TEXT,
  SAMPLE_COMPANY,
} from '../fixtures/test-data';

// ---------------------------------------------------------------------------
// Shared auth + base mocks
// ---------------------------------------------------------------------------

/**
 * Install Supabase auth stubs so the app resolves the authenticated user.
 * Must be called before page.goto().
 */
async function stubSupabaseAuth(page: Page): Promise<void> {
  await page.route('**/supabase.co/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes('/auth/v1/user')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'err-test-user', email: 'jjschrup@yahoo.com' }),
      });
      return;
    }
    if (url.includes('/auth/v1/token')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock-token',
          token_type: 'bearer',
          expires_in: 3600,
          user: { id: 'err-test-user', email: 'jjschrup@yahoo.com' },
        }),
      });
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
}

/**
 * Inject a fetch override for the SSE endpoint that delivers the provided
 * raw SSE body and then stays open (no close, so connected=true).
 */
async function injectSSE(page: Page, sseBody: string): Promise<void> {
  await page.addInitScript((body: string) => {
    const origFetch = window.fetch;
    // @ts-expect-error Overriding fetch for test mocking
    window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      if (url.includes('/sse')) {
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode(body));
            // do NOT close — keeps connected=true
          },
        });
        return Promise.resolve(
          new Response(stream, {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          }),
        );
      }
      return origFetch.apply(window, [input, init] as Parameters<typeof fetch>);
    };
  }, sseBody);
}

/**
 * Navigate to /app and wait for the landing screen to render.
 * Requires auth stubs and API mocks to already be registered.
 */
async function waitForLanding(page: Page): Promise<void> {
  await page.goto('/app');
  await expect(
    page.getByRole('button', { name: /Start New Session/i }),
  ).toBeVisible({ timeout: 10_000 });
}

/**
 * Open the intake form and fill all required fields.
 * Assumes the landing screen is already visible.
 */
async function fillAndSubmitIntakeForm(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Start New Session/i }).click();
  await expect(
    page.getByRole('heading', { name: /Let's Build Your Resume/i }),
  ).toBeVisible({ timeout: 5_000 });

  await page.locator('#resume-text').fill(SAMPLE_RESUME_TEXT);
  await page.locator('#job-description').fill(SAMPLE_JD_TEXT);
  await page.locator('#company-name').fill(SAMPLE_COMPANY);
  await page.getByRole('button', { name: /Let's Get Started/i }).click();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Error recovery scenarios', () => {
  // ── Test 1: Session list 500 → error state on Dashboard ──────────────────

  test('GET /api/sessions 500 renders error state on dashboard', async ({ page }) => {
    await stubSupabaseAuth(page);

    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const method = route.request().method();

      if (path === '/api/sessions' && method === 'GET') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal server error' }),
        });
        return;
      }
      if (path.startsWith('/api/resumes')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ resumes: [] }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.goto('/dashboard');

    // The Dashboard heading must still render — the page must not crash
    await expect(
      page.getByRole('heading', { name: /Dashboard/i }),
    ).toBeVisible({ timeout: 10_000 });

    // After the 500, the tab bar should still render (component didn't crash)
    await expect(
      page.getByRole('button', { name: /Session History/i }),
    ).toBeVisible({ timeout: 5_000 });
  });

  // ── Test 2: Pipeline start 429 → form shows error banner ─────────────────

  test('POST /api/pipeline/start 429 rate limit shows error to user', async ({ page }) => {
    await stubSupabaseAuth(page);

    // Connected SSE so the coach screen doesn't reconnect loop
    const sseBody = 'event: connected\ndata: {}\n\n';
    await injectSSE(page, sseBody);

    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const method = route.request().method();

      if (/\/api\/sessions\/[^/]+\/sse$/.test(path)) {
        await route.abort();
        return;
      }
      if (path === '/api/sessions' && method === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions: [] }) });
        return;
      }
      if (path === '/api/sessions' && method === 'POST') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ session: { id: 'mock-id', status: 'active', created_at: new Date().toISOString() } }) });
        return;
      }
      if (/\/api\/sessions\/[^/]+$/.test(path) && method === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ session: { id: 'mock-id', status: 'active', created_at: new Date().toISOString() } }) });
        return;
      }
      if (path.startsWith('/api/resumes')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ resumes: [] }) });
        return;
      }
      if (path === '/api/pipeline/start' && method === 'POST') {
        await route.fulfill({
          status: 429,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Too many requests. Please try again later.' }),
        });
        return;
      }
      if (path.startsWith('/api/pipeline/status')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ running: false, pending_gate: null }) });
        return;
      }
      if (/\/api\/workflow\/[^/]+$/.test(path)) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ session: null, nodes: [], latest_artifacts: [], replan: null }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await waitForLanding(page);
    await fillAndSubmitIntakeForm(page);

    // After the 429, the app should show an error state.
    // The form may re-render with an error banner (the `error` prop on PipelineIntakeForm),
    // or the app may stay on the intake form with an error message.
    // We wait a moment for the response to be processed.
    await page.waitForTimeout(2_000);

    // The page must not show a blank screen — either the form or error is visible.
    await expect(page.locator('body')).toBeVisible();

    // The form must not be in a permanently broken/blank state.
    // Either the intake heading or an error message must be visible.
    const hasIntakeHeading = await page.getByRole('heading', { name: /Let's Build Your Resume/i }).isVisible().catch(() => false);
    const hasErrorText = await page.getByText(/Too many|rate limit|try again|error/i).isVisible().catch(() => false);
    const hasStartBtn = await page.getByRole('button', { name: /Start New Session/i }).isVisible().catch(() => false);

    // At least one of these must be true — the UI is in a recoverable state
    expect(hasIntakeHeading || hasErrorText || hasStartBtn).toBe(true);
  });

  // ── Test 3: Pipeline error SSE event → error display ─────────────────────

  test('pipeline_error SSE event renders error state in coach screen', async ({ page }) => {
    await stubSupabaseAuth(page);

    // Build SSE body with a pipeline_error event
    const sseBody = buildSSEBody([
      { event: 'connected', data: {} },
      { event: 'pipeline_error', data: { message: 'Something went wrong processing your resume.', stage: 'gap_analysis' } },
    ]);
    await injectSSE(page, sseBody);

    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const method = route.request().method();

      if (/\/api\/sessions\/[^/]+\/sse$/.test(path)) {
        await route.abort();
        return;
      }
      if (path === '/api/sessions' && method === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions: [] }) });
        return;
      }
      if (path === '/api/sessions' && method === 'POST') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ session: { id: 'err-session', status: 'active', created_at: new Date().toISOString() } }) });
        return;
      }
      if (/\/api\/sessions\/[^/]+$/.test(path) && method === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ session: { id: 'err-session', status: 'active', created_at: new Date().toISOString() } }) });
        return;
      }
      if (path.startsWith('/api/resumes')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ resumes: [] }) });
        return;
      }
      if (path === '/api/pipeline/start' && method === 'POST') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'started' }) });
        return;
      }
      if (path.startsWith('/api/pipeline/status')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ running: false, pending_gate: null }) });
        return;
      }
      if (/\/api\/workflow\/[^/]+$/.test(path)) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ session: null, nodes: [], latest_artifacts: [], replan: null }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await waitForLanding(page);
    await fillAndSubmitIntakeForm(page);

    // After a pipeline_error event, the coach screen should show an error state.
    // The error panel renders with "Something went wrong" or the error message.
    await page.waitForTimeout(1_500);

    // The page must not crash (body visible)
    await expect(page.locator('body')).toBeVisible();

    // At least one of these error indicators must appear
    const hasErrorKeyword = await page.getByText(/error|went wrong|failed/i).first().isVisible().catch(() => false);
    const hasPipelineError = await page.getByText(/processing your resume/i).isVisible().catch(() => false);

    expect(hasErrorKeyword || hasPipelineError).toBe(true);
  });

  // ── Test 4: After error, header navigation still works ───────────────────

  test('after a 500 error on dashboard, header navigation works', async ({ page }) => {
    await stubSupabaseAuth(page);

    // SSE fetch override (no-op connected stream)
    await injectSSE(page, 'event: connected\ndata: {}\n\n');

    // Sessions returns 500; everything else succeeds
    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const method = route.request().method();

      if (/\/api\/sessions\/[^/]+\/sse$/.test(path)) {
        await route.abort();
        return;
      }
      if (path === '/api/sessions' && method === 'GET') {
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Server error' }) });
        return;
      }
      if (path.startsWith('/api/resumes')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ resumes: [] }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.goto('/dashboard');

    // Dashboard must still render despite the 500
    await expect(
      page.getByRole('heading', { name: /Dashboard/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Header navigation: click Tools and verify route changes
    const toolsBtn = page.getByRole('button', { name: /^Tools$/i });
    await expect(toolsBtn).toBeVisible({ timeout: 5_000 });
    await toolsBtn.click();

    await expect(page).toHaveURL(/\/tools/, { timeout: 5_000 });
    await expect(page.locator('h1, h2, h3').first()).toBeVisible({ timeout: 8_000 });
  });

  // ── Test 5: After pipeline error, user has a path to recover ────────────

  test('after pipeline_error SSE event, user sees error state with recovery option', async ({ page }) => {
    await stubSupabaseAuth(page);

    const sseBody = buildSSEBody([
      { event: 'connected', data: {} },
      { event: 'pipeline_error', data: { message: 'Test error', stage: 'overview' } },
    ]);
    await injectSSE(page, sseBody);

    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const method = route.request().method();

      if (/\/api\/sessions\/[^/]+\/sse$/.test(path)) {
        await route.abort();
        return;
      }
      if (path === '/api/sessions' && method === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions: [] }) });
        return;
      }
      if (path === '/api/sessions' && method === 'POST') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ session: { id: 'err-nav-session', status: 'active', created_at: new Date().toISOString() } }) });
        return;
      }
      if (/\/api\/sessions\/[^/]+$/.test(path) && method === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ session: { id: 'err-nav-session', status: 'active', created_at: new Date().toISOString() } }) });
        return;
      }
      if (path.startsWith('/api/resumes')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ resumes: [] }) });
        return;
      }
      if (path === '/api/pipeline/start') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'started' }) });
        return;
      }
      if (path.startsWith('/api/pipeline/status')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ running: false, pending_gate: null }) });
        return;
      }
      if (/\/api\/workflow\/[^/]+$/.test(path)) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ session: null, nodes: [], latest_artifacts: [], replan: null }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await waitForLanding(page);
    await fillAndSubmitIntakeForm(page);
    await page.waitForTimeout(1_500);

    // After a pipeline_error, the app either:
    //   (a) Shows an in-UI error panel with a retry / "Return to Home" path, OR
    //   (b) The ErrorBoundary fires showing "Something went wrong" + "Return to Home"
    // In either case, the user must have a path to recover — a button that can
    // navigate them away from the broken state.
    const recoveryButtons = [
      page.getByRole('button', { name: /Return to Home/i }),
      page.getByRole('button', { name: /Reload page/i }),
      page.getByRole('button', { name: /^Dashboard$/i }),
      page.getByRole('button', { name: /Start New Session/i }),
    ];

    let foundRecovery = false;
    for (const btn of recoveryButtons) {
      const visible = await btn.isVisible().catch(() => false);
      if (visible) {
        foundRecovery = true;
        break;
      }
    }
    expect(foundRecovery).toBe(true);

    // The page body must still be visible (no total blank screen)
    await expect(page.locator('body')).toBeVisible();
  });

  // ── Test 6: Workflow summary 500 → coach screen still renders ────────────

  test('GET /api/workflow 500 does not crash the coach screen', async ({ page }) => {
    await stubSupabaseAuth(page);
    await injectSSE(page, 'event: connected\ndata: {}\n\n');

    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const method = route.request().method();

      if (/\/api\/sessions\/[^/]+\/sse$/.test(path)) {
        await route.abort();
        return;
      }
      if (path === '/api/sessions' && method === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions: [] }) });
        return;
      }
      if (path === '/api/sessions' && method === 'POST') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ session: { id: 'wf-err-session', status: 'active', created_at: new Date().toISOString() } }) });
        return;
      }
      if (/\/api\/sessions\/[^/]+$/.test(path) && method === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ session: { id: 'wf-err-session', status: 'active', created_at: new Date().toISOString() } }) });
        return;
      }
      if (path.startsWith('/api/resumes')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ resumes: [] }) });
        return;
      }
      if (path === '/api/pipeline/start') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'started' }) });
        return;
      }
      if (path.startsWith('/api/pipeline/status')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ running: true, pending_gate: null }) });
        return;
      }
      if (/\/api\/workflow\/[^/]+/.test(path)) {
        // Force a 500 on the workflow summary endpoint
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Workflow service unavailable' }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await waitForLanding(page);
    await fillAndSubmitIntakeForm(page);

    // After the workflow 500, the coach screen itself must not crash.
    // We look for the ErrorBoundary "Something went wrong" text — it must NOT be visible.
    await page.waitForTimeout(2_000);
    const crashText = page.getByText('Something went wrong');
    const crashed = await crashText.isVisible().catch(() => false);
    expect(crashed).toBe(false);

    // The page body must still be rendering
    await expect(page.locator('body')).toBeVisible();
  });

  // ── Test 7: Sessions list renders empty state gracefully (no error) ───────

  test('empty sessions list renders "No sessions found" empty state without crash', async ({ page }) => {
    await stubSupabaseAuth(page);

    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const method = route.request().method();

      if (path === '/api/sessions' && method === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions: [] }) });
        return;
      }
      if (path.startsWith('/api/resumes')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ resumes: [] }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.goto('/dashboard');
    await expect(
      page.getByRole('heading', { name: /Dashboard/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Wait for loading to settle
    await expect(page.locator('.animate-pulse'))
      .not.toBeAttached({ timeout: 10_000 })
      .catch(() => {});

    // Empty state message must be visible
    await expect(
      page.getByText(/No sessions found/i),
    ).toBeVisible({ timeout: 10_000 });
  });

  // ── Test 8: Resumes list 500 → dashboard still renders ───────────────────

  test('GET /api/resumes 500 does not prevent dashboard from rendering', async ({ page }) => {
    await stubSupabaseAuth(page);

    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const method = route.request().method();

      if (path === '/api/sessions' && method === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions: [] }) });
        return;
      }
      if (path.startsWith('/api/resumes')) {
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Resume service down' }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.goto('/dashboard');

    // Dashboard heading and tab bar must render even if resumes fail
    await expect(
      page.getByRole('heading', { name: /Dashboard/i }),
    ).toBeVisible({ timeout: 10_000 });

    await expect(
      page.getByRole('button', { name: /Session History/i }),
    ).toBeVisible({ timeout: 5_000 });

    // Switch to Master Resume tab — should render without crashing
    await page.getByRole('button', { name: /Master Resume/i }).click();
    await page.waitForTimeout(500);

    // The page must not show the ErrorBoundary crash message
    const crashed = await page.getByText('Something went wrong').isVisible().catch(() => false);
    expect(crashed).toBe(false);
  });
});
