/**
 * Current error recovery tests
 *
 * Covers the current Resume Builder session route and Resume Builder workspace
 * route instead of the retired dashboard/session-launcher flows.
 */

import { expect, test, type Page } from '@playwright/test';
import { REAL_JD_TEXT, REAL_RESUME_TEXT } from '../fixtures/real-resume-data';

const MOCK_SESSION_ID = 'error-recovery-session-123';

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

    if (url.includes('/rest/v1/')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: method === 'GET' ? '[]' : JSON.stringify([]),
      });
      return;
    }

    await route.continue();
  });
}

async function injectPipelineSSE(page: Page, events: unknown[]): Promise<void> {
  await page.addInitScript((mockEvents: unknown[]) => {
    const originalFetch = window.fetch;
    // @ts-expect-error test override
    window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);

      if (url.includes('/api/pipeline/') && url.includes('/stream')) {
        const encoder = new TextEncoder();
        let index = 0;
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            function pushNext() {
              if (index >= mockEvents.length) {
                controller.close();
                return;
              }
              controller.enqueue(
                encoder.encode(`event: pipeline\ndata: ${JSON.stringify(mockEvents[index++])}\n\n`),
              );
              window.setTimeout(pushNext, 60);
            }
            window.setTimeout(pushNext, 120);
          },
        });
        return Promise.resolve(new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }));
      }

      if (url.includes('/sse')) {
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode('event: connected\ndata: {}\n\n'));
          },
        });
        return Promise.resolve(new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }));
      }

      return originalFetch.apply(window, [input, init] as Parameters<typeof fetch>);
    };
  }, events);
}

async function mockWorkspaceApi(page: Page, options?: {
  sessionsStatus?: number;
  resumesStatus?: number;
}) {
  const sessionsStatus = options?.sessionsStatus ?? 200;
  const resumesStatus = options?.resumesStatus ?? 200;

  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();

    if (path === '/api/sessions' && method === 'GET') {
      await route.fulfill({
        status: sessionsStatus,
        contentType: 'application/json',
        body: sessionsStatus >= 400
          ? JSON.stringify({ error: 'Session service unavailable' })
          : JSON.stringify({ sessions: [] }),
      });
      return;
    }

    if (path === '/api/resumes' && method === 'GET') {
      await route.fulfill({
        status: resumesStatus,
        contentType: 'application/json',
        body: resumesStatus >= 400
          ? JSON.stringify({ error: 'Resume service unavailable' })
          : JSON.stringify({ resumes: [] }),
      });
      return;
    }

    if (path === '/api/resumes/default' && method === 'GET') {
      await route.fulfill({
        status: resumesStatus,
        contentType: 'application/json',
        body: resumesStatus >= 400
          ? JSON.stringify({ error: 'Resume service unavailable' })
          : JSON.stringify({ resume: null }),
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

    if (path.startsWith('/api/pipeline/status')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ running: false, pending_gate: null }),
      });
      return;
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
}

async function mockResumeBuilderStart(page: Page, options?: {
  startStatus?: number;
  startBody?: unknown;
  streamStatus?: number;
}) {
  const startStatus = options?.startStatus ?? 200;
  const startBody = options?.startBody ?? { session_id: MOCK_SESSION_ID, status: 'started' };
  const streamStatus = options?.streamStatus;

  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();

    if (path === '/api/pipeline/start' && method === 'POST') {
      await route.fulfill({
        status: startStatus,
        contentType: 'application/json',
        body: JSON.stringify(startBody),
      });
      return;
    }

    if (/\/api\/pipeline\/[^/]+\/stream$/.test(path) && streamStatus) {
      await route.fulfill({
        status: streamStatus,
        contentType: 'text/plain',
        body: 'stream unavailable',
      });
      return;
    }

    if (path === '/api/sessions' && method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions: [] }) });
      return;
    }

    if (path.startsWith('/api/resumes') && method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ resumes: [] }) });
      return;
    }

    if (/\/api\/pipeline\/[^/]+\/draft-state$/.test(path) && method === 'PUT') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
      return;
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
}

async function openResumeBuilderSession(page: Page): Promise<void> {
  await page.goto('/resume-builder/session');
  await expect(page.getByRole('heading', { name: /Position Your Resume/i })).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#v2-resume')).toBeVisible();
  await expect(page.locator('#v2-jd')).toBeVisible();
}

async function submitResumeBuilderSession(page: Page): Promise<void> {
  await page.locator('#v2-resume').fill(REAL_RESUME_TEXT);
  await page.locator('#v2-jd').fill(REAL_JD_TEXT);
  await page.getByRole('button', { name: /Analyze and craft my resume/i }).click();
}

test.describe('Current error recovery', () => {
  test('pipeline start 429 shows an error and keeps the intake visible', async ({ page }) => {
    await stubSupabaseAuth(page);
    await mockResumeBuilderStart(page, {
      startStatus: 429,
      startBody: { error: 'Too many requests. Please try again later.' },
    });
    await openResumeBuilderSession(page);
    await submitResumeBuilderSession(page);

    await expect(page.locator('[role="alert"]')).toContainText(/Too many requests\. Please try again later\./i);
    await expect(page.locator('#v2-resume')).toBeVisible();
    await expect(page.getByRole('button', { name: /Analyze and craft my resume/i })).toBeEnabled();
  });

  test('stream connection failures surface a recoverable error banner', async ({ page }) => {
    await stubSupabaseAuth(page);
    await mockResumeBuilderStart(page, { streamStatus: 500 });
    await openResumeBuilderSession(page);
    await submitResumeBuilderSession(page);

    await expect(page.locator('[role="alert"]')).toContainText(/Stream connection failed: 500/i, { timeout: 10_000 });
    await expect(page.getByRole('button', { name: /^Back$/i })).toBeVisible();
  });

  test('pipeline_error SSE events surface the current in-flow error state', async ({ page }) => {
    await stubSupabaseAuth(page);
    await injectPipelineSSE(page, [
      { type: 'stage_start', stage: 'analysis', message: 'Analyzing job description...' },
      { type: 'pipeline_error', error: 'Something went wrong processing your resume.' },
    ]);
    await mockResumeBuilderStart(page);
    await openResumeBuilderSession(page);
    await submitResumeBuilderSession(page);

    await expect(page.locator('[role="alert"]')).toContainText(/Something went wrong processing your resume\./i, { timeout: 10_000 });
    await expect(page.locator('body')).toBeVisible();
  });

  test('Resume Builder workspace still renders when sessions fail to load', async ({ page }) => {
    await stubSupabaseAuth(page);
    await mockWorkspaceApi(page, { sessionsStatus: 500 });

    await page.goto('/workspace?room=resume');
    await expect(
      page.getByRole('heading', { name: /Choose the resume tool you need right now/i }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /^Browse Job Workspaces$/i })).toBeVisible();
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });

  test('Master Resume tab still renders a stable empty shell when resumes fail', async ({ page }) => {
    await stubSupabaseAuth(page);
    await mockWorkspaceApi(page, { resumesStatus: 500 });

    await page.goto('/workspace?room=resume');
    await expect(
      page.getByRole('heading', { name: /Choose the resume tool you need right now/i }),
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /^Open Master Resume$/i }).click();
    await expect(page.getByText(/No master resume found\./i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });
});
