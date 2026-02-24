import type { Page } from '@playwright/test';
import type { SSEEvent } from '../fixtures/mock-sse';
import { buildSSEBody } from '../fixtures/mock-sse';
import { MOCK_SESSION_ID } from '../fixtures/test-data';

export interface CapturedRequest {
  url: string;
  method: string;
  body: unknown;
}

/**
 * Intercept all /api/** REST endpoints via page.route(),
 * and inject a fetch override for the SSE endpoint that returns
 * a ReadableStream that stays open (preventing reconnect loops).
 */
export async function interceptAllAPI(page: Page, sseEvents: SSEEvent[]) {
  const captured: CapturedRequest[] = [];
  const sseBody = buildSSEBody(sseEvents);

  // --- SSE: inject fetch override via page.evaluate BEFORE navigation ---
  // This creates a persistent ReadableStream that delivers events but never closes,
  // keeping `connected = true` in useAgent.ts.
  await page.addInitScript((body: string) => {
    const originalFetch = window.fetch;
    // @ts-expect-error Overriding fetch for test
    window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.includes('/sse')) {
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode(body));
            // Do NOT close — keeps the SSE connection alive
          },
        });
        return Promise.resolve(
          new Response(stream, {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          }),
        );
      }
      return originalFetch.apply(window, [input, init] as Parameters<typeof fetch>);
    };
  }, sseBody);

  // --- REST API routes via Playwright page.route ---
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const path = url.pathname;

    // Skip SSE — handled by the fetch override above
    if (/\/api\/sessions\/[^/]+\/sse$/.test(path)) {
      // This shouldn't fire (fetch override catches it first),
      // but if it does, abort to prevent confusion
      await route.abort();
      return;
    }

    // GET /api/sessions — list sessions
    if (path === '/api/sessions' && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ sessions: [] }),
      });
      return;
    }

    // POST /api/sessions — create session
    if (path === '/api/sessions' && method === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          session: {
            id: MOCK_SESSION_ID,
            status: 'active',
            created_at: new Date().toISOString(),
          },
        }),
      });
      return;
    }

    // GET /api/sessions/:id — load session
    if (/\/api\/sessions\/[^/]+$/.test(path) && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          session: {
            id: MOCK_SESSION_ID,
            status: 'active',
            created_at: new Date().toISOString(),
          },
        }),
      });
      return;
    }

    // GET /api/resumes — list resumes
    if (path.startsWith('/api/resumes') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ resumes: [] }),
      });
      return;
    }

    // POST /api/pipeline/start
    if (path === '/api/pipeline/start' && method === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'started' }),
      });
      return;
    }

    // POST /api/pipeline/respond — capture for assertions
    if (path === '/api/pipeline/respond' && method === 'POST') {
      const body = route.request().postDataJSON();
      captured.push({ url: route.request().url(), method: 'POST', body });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
      return;
    }

    // GET /api/pipeline/status — fallback poll
    if (path.startsWith('/api/pipeline/status')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ running: true, pending_gate: null }),
      });
      return;
    }

    // Unhandled API route — let through
    await route.continue();
  });

  return { captured };
}
