/**
 * Intake form tests — verify the PipelineIntakeForm validation and submission
 * work correctly without a real backend.
 *
 * These tests run under the 'chromium' project (uses storageState from auth
 * setup so the user starts authenticated). All /api/** and Supabase requests
 * are mocked — no running backend required.
 *
 * The intake form (PipelineIntakeForm) is reachable by:
 *   1. Navigate to /app  → "Start New Session" button is visible
 *   2. Click "Start New Session" → form mounts
 *
 * Form has three required fields: resume-text, job-description, company-name.
 * Submit button ("Let's Get Started") is disabled until all three are filled.
 */

import { test, expect, type Page } from '@playwright/test';
import {
  SAMPLE_RESUME_TEXT,
  SAMPLE_JD_TEXT,
  SAMPLE_COMPANY,
} from '../fixtures/test-data';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Register all route mocks before navigation. Covers:
 * - Supabase auth + REST
 * - SSE endpoint (fetch override injected before page JS runs)
 * - All /api/** REST routes
 *
 * Returns a list of captured POST /api/pipeline/start request bodies for
 * post-submission assertions.
 */
async function mockAll(page: Page): Promise<{ pipelineStartBodies: unknown[] }> {
  const pipelineStartBodies: unknown[] = [];

  // Inject a fetch override for the SSE endpoint so the coach screen doesn't
  // enter an infinite reconnect loop after the session is created.
  await page.addInitScript(() => {
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
            controller.enqueue(encoder.encode('event: connected\ndata: {}\n\n'));
            // intentionally keep open — prevents reconnect loops
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
  });

  // Supabase: auth + DB reads
  await page.route('**/supabase.co/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes('/auth/v1/user')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'test-user', email: 'jjschrup@yahoo.com' }),
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
          user: { id: 'test-user', email: 'jjschrup@yahoo.com' },
        }),
      });
      return;
    }
    if (url.includes('/auth/v1/')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }
    if ((method === 'GET') && url.includes('/rest/v1/')) {
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
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();

    // SSE — should not fire (fetch override intercepts first)
    if (/\/api\/sessions\/[^/]+\/sse$/.test(path)) {
      await route.abort();
      return;
    }

    if (path === '/api/sessions' && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ sessions: [] }),
      });
      return;
    }
    if (path === '/api/sessions' && method === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          session: { id: 'mock-session-id', status: 'active', created_at: new Date().toISOString() },
        }),
      });
      return;
    }
    if (/\/api\/sessions\/[^/]+$/.test(path) && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          session: { id: 'mock-session-id', status: 'active', created_at: new Date().toISOString() },
        }),
      });
      return;
    }
    if (path.startsWith('/api/resumes') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ resumes: [] }),
      });
      return;
    }
    if (path === '/api/pipeline/start' && method === 'POST') {
      pipelineStartBodies.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'started' }),
      });
      return;
    }
    if (path === '/api/pipeline/respond' && method === 'POST') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
      return;
    }
    if (path.startsWith('/api/pipeline/status')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ running: false, pending_gate: null }),
      });
      return;
    }
    if (/\/api\/workflow\/[^/]+$/.test(path) && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ session: null, nodes: [], latest_artifacts: [], replan: null }),
      });
      return;
    }
    // Catch-all
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  return { pipelineStartBodies };
}

/**
 * Navigate to /app, wait for the landing screen, click "Start New Session",
 * and wait for the intake form to mount.
 */
async function openIntakeForm(page: Page): Promise<void> {
  await page.goto('/app');
  const startBtn = page.getByRole('button', { name: /Start New Session/i });
  await expect(startBtn).toBeVisible({ timeout: 10_000 });
  await startBtn.click();

  // The form header "Let's Build Your Resume" confirms the form is mounted.
  await expect(
    page.getByRole('heading', { name: /Let's Build Your Resume/i }),
  ).toBeVisible({ timeout: 5_000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Intake form', () => {
  // ── Test 1: Form renders with all required fields ─────────────────────────

  test('form renders with resume, job description, and company name fields', async ({ page }) => {
    await mockAll(page);
    await openIntakeForm(page);

    await expect(page.locator('#resume-text')).toBeVisible();
    await expect(page.locator('#job-description')).toBeVisible();
    await expect(page.locator('#company-name')).toBeVisible();
  });

  // ── Test 2: Submit button disabled when all fields empty ──────────────────

  test('submit button is disabled when all fields are empty', async ({ page }) => {
    await mockAll(page);
    await openIntakeForm(page);

    const submitBtn = page.getByRole('button', { name: /Let's Get Started/i });
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toBeDisabled();
  });

  // ── Test 3: Submit disabled with only resume filled ───────────────────────

  test('submit button remains disabled when only resume text is filled', async ({ page }) => {
    await mockAll(page);
    await openIntakeForm(page);

    await page.locator('#resume-text').fill(SAMPLE_RESUME_TEXT);

    const submitBtn = page.getByRole('button', { name: /Let's Get Started/i });
    await expect(submitBtn).toBeDisabled();
  });

  // ── Test 4: Submit disabled with resume + JD but no company ──────────────

  test('submit button remains disabled when company name is missing', async ({ page }) => {
    await mockAll(page);
    await openIntakeForm(page);

    await page.locator('#resume-text').fill(SAMPLE_RESUME_TEXT);
    await page.locator('#job-description').fill(SAMPLE_JD_TEXT);

    const submitBtn = page.getByRole('button', { name: /Let's Get Started/i });
    await expect(submitBtn).toBeDisabled();
  });

  // ── Test 5: Submit enabled when all required fields are filled ────────────

  test('submit button is enabled when all required fields are filled', async ({ page }) => {
    await mockAll(page);
    await openIntakeForm(page);

    await page.locator('#resume-text').fill(SAMPLE_RESUME_TEXT);
    await page.locator('#job-description').fill(SAMPLE_JD_TEXT);
    await page.locator('#company-name').fill(SAMPLE_COMPANY);

    const submitBtn = page.getByRole('button', { name: /Let's Get Started/i });
    await expect(submitBtn).toBeEnabled();
  });

  // ── Test 6: Job description text area accepts input ───────────────────────

  test('job description textarea accepts multi-line text', async ({ page }) => {
    await mockAll(page);
    await openIntakeForm(page);

    const jdInput = page.locator('#job-description');
    await jdInput.fill(SAMPLE_JD_TEXT);

    await expect(jdInput).toHaveValue(SAMPLE_JD_TEXT);
  });

  // ── Test 7: Company name field accepts input ──────────────────────────────

  test('company name field accepts text and reflects it', async ({ page }) => {
    await mockAll(page);
    await openIntakeForm(page);

    const companyInput = page.locator('#company-name');
    await companyInput.fill(SAMPLE_COMPANY);

    await expect(companyInput).toHaveValue(SAMPLE_COMPANY);
  });

  // ── Test 8: Back button returns to landing screen ─────────────────────────

  test('back button returns to landing screen', async ({ page }) => {
    await mockAll(page);
    await openIntakeForm(page);

    // The back button has an aria-label
    const backBtn = page.getByRole('button', { name: /Back to landing screen/i });
    await expect(backBtn).toBeVisible();
    await backBtn.click();

    // Landing screen shows "Start New Session"
    await expect(
      page.getByRole('button', { name: /Start New Session/i }),
    ).toBeVisible({ timeout: 5_000 });
  });

  // ── Test 9: File upload hint link is visible ──────────────────────────────

  test('file upload button is rendered for resume upload', async ({ page }) => {
    await mockAll(page);
    await openIntakeForm(page);

    // The "Upload Resume File" button (visible when no saved resumes exist)
    // or the upload hint link should be present
    const uploadElements = [
      page.getByRole('button', { name: /Upload Resume File/i }),
      page.getByRole('button', { name: /or upload .txt, .docx, or .pdf/i }),
      page.getByLabel(/Upload a resume file/i),
    ];

    // At least one upload-related element must be present
    let found = false;
    for (const el of uploadElements) {
      const visible = await el.isVisible().catch(() => false);
      if (visible) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  // ── Test 10: Form submission triggers pipeline start ──────────────────────

  test('form submission calls pipeline start with the entered values', async ({ page }) => {
    const { pipelineStartBodies } = await mockAll(page);
    await openIntakeForm(page);

    await page.locator('#resume-text').fill(SAMPLE_RESUME_TEXT);
    await page.locator('#job-description').fill(SAMPLE_JD_TEXT);
    await page.locator('#company-name').fill(SAMPLE_COMPANY);

    await page.getByRole('button', { name: /Let's Get Started/i }).click();

    // Give time for the POST to fire
    await page.waitForTimeout(1_500);

    // At least one pipeline/start call must have been made
    expect(pipelineStartBodies.length).toBeGreaterThan(0);

    const body = pipelineStartBodies[0] as Record<string, unknown>;
    // The payload includes the company name and job description
    expect(JSON.stringify(body)).toContain(SAMPLE_COMPANY);
  });

  // ── Test 11: Form shows header copy ──────────────────────────────────────

  test('form renders expected header and subtitle copy', async ({ page }) => {
    await mockAll(page);
    await openIntakeForm(page);

    await expect(
      page.getByRole('heading', { name: /Let's Build Your Resume/i }),
    ).toBeVisible();
    await expect(
      page.getByText(/Upload your resume and paste the job posting/i),
    ).toBeVisible();
  });

  // ── Test 12: Whitespace-only resume does not enable submit ────────────────

  test('whitespace-only resume text does not enable the submit button', async ({ page }) => {
    await mockAll(page);
    await openIntakeForm(page);

    // Fill with only spaces — isValid trims before checking length
    await page.locator('#resume-text').fill('   ');
    await page.locator('#job-description').fill(SAMPLE_JD_TEXT);
    await page.locator('#company-name').fill(SAMPLE_COMPANY);

    const submitBtn = page.getByRole('button', { name: /Let's Get Started/i });
    await expect(submitBtn).toBeDisabled();
  });
});
