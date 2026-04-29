/**
 * Current error recovery tests
 *
 * Covers the current Tailor Resume session route and workspace
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

      if (
        (url.includes('/api/pipeline/') && url.includes('/stream'))
        || url.includes('/api/v3-pipeline/run')
      ) {
        const encoder = new TextEncoder();
        let index = 0;
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            function pushNext() {
              if (index >= mockEvents.length) {
                controller.close();
                return;
              }
              const event = mockEvents[index++] as { type?: string };
              controller.enqueue(
                encoder.encode(`event: ${event.type ?? 'pipeline'}\ndata: ${JSON.stringify(event)}\n\n`),
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

    if ((path === '/api/pipeline/start' || path === '/api/v3-pipeline/run') && method === 'POST') {
      if (path === '/api/v3-pipeline/run' && streamStatus) {
        await route.fulfill({
          status: streamStatus,
          contentType: 'text/plain',
          body: 'stream unavailable',
        });
        return;
      }

      if (path === '/api/v3-pipeline/run' && startStatus >= 400) {
        await route.fulfill({
          status: startStatus,
          contentType: 'application/json',
          body: JSON.stringify(startBody),
        });
        return;
      }

      if (path === '/api/v3-pipeline/run') {
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: [
            `event: pipeline_error`,
            `data: ${JSON.stringify({
              type: 'pipeline_error',
              stage: 'extract',
              message: 'Mock v3 pipeline did not receive events.',
              timestamp: new Date().toISOString(),
            })}`,
            '',
            '',
          ].join('\n'),
        });
        return;
      }

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
  await expect(page.getByRole('heading', { name: /Tailor your resume/i })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /Or paste text/i }).first().click();
  await page.getByRole('button', { name: /Or paste text/i }).first().click();
  await expect(page.getByLabel(/resume text/i)).toBeVisible();
  await expect(page.getByLabel(/job description text/i)).toBeVisible();
}

async function submitResumeBuilderSession(page: Page): Promise<void> {
  await page.getByLabel(/resume text/i).fill(REAL_RESUME_TEXT);
  await page.getByLabel(/job description text/i).fill(REAL_JD_TEXT);
  await page.getByRole('button', { name: /Generate tailored resume/i }).click();
}

test.describe('Current error recovery', () => {
  test('pipeline start 429 shows a recoverable V3 error state', async ({ page }) => {
    await stubSupabaseAuth(page);
    await mockResumeBuilderStart(page, {
      startStatus: 429,
      startBody: { error: 'Too many requests. Please try again later.' },
    });
    await openResumeBuilderSession(page);
    await submitResumeBuilderSession(page);

    await expect(page.getByText(/Pipeline failed/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Too many requests\. Please try again later\./i)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Start over$/i })).toBeEnabled();
    await page.getByRole('button', { name: /^Start over$/i }).click();
    await expect(page.getByRole('button', { name: /Generate tailored resume/i })).toBeVisible();
  });

  test('stream connection failures surface a recoverable error banner', async ({ page }) => {
    await stubSupabaseAuth(page);
    await mockResumeBuilderStart(page, { streamStatus: 500 });
    await openResumeBuilderSession(page);
    await submitResumeBuilderSession(page);

    await expect(page.getByText(/Pipeline failed/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Pipeline request failed \(500\)|stream unavailable/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Start over$/i })).toBeEnabled();
  });

  test('pipeline_error SSE events surface the current in-flow error state', async ({ page }) => {
    await stubSupabaseAuth(page);
    await injectPipelineSSE(page, [
      { type: 'stage_start', stage: 'extract', message: 'Analyzing job description...', timestamp: new Date().toISOString() },
      { type: 'pipeline_error', stage: 'extract', message: 'Something went wrong processing your resume.', timestamp: new Date().toISOString() },
    ]);
    await mockResumeBuilderStart(page);
    await openResumeBuilderSession(page);
    await submitResumeBuilderSession(page);

    await expect(page.getByText(/Pipeline failed/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Something went wrong processing your resume\./i)).toBeVisible();
    await expect(page.locator('body')).toBeVisible();
  });

  test('Tailor Resume workspace still renders when sessions fail to load', async ({ page }) => {
    await stubSupabaseAuth(page);
    await mockWorkspaceApi(page, { sessionsStatus: 500 });

    await page.goto('/workspace?room=resume');
    await expect(
      page.getByRole('heading', { name: /Tailor your resume to a job you actually want/i }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /^Browse Saved Resumes$/i })).toBeVisible();
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });

  test('Master Resume tab still renders a stable empty shell when resumes fail', async ({ page }) => {
    await stubSupabaseAuth(page);
    await mockWorkspaceApi(page, { resumesStatus: 500 });

    await page.goto('/workspace?room=resume');
    await expect(
      page.getByRole('heading', { name: /Tailor your resume to a job you actually want/i }),
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /^Open Source Material$/i }).click();
    await expect(page.getByText(/No Career Proof found\./i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });
});
