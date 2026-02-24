import type { Page } from '@playwright/test';
import type { SSEEvent } from '../fixtures/mock-sse';
import { buildSSEBody } from '../fixtures/mock-sse';
import { MOCK_SESSION_ID } from '../fixtures/test-data';

export interface CapturedRequest {
  url: string;
  method: string;
  body: unknown;
}

interface InterceptAPIOptions {
  workflowSummaryOverride?: Record<string, unknown>;
}

/**
 * Intercept all /api/** REST endpoints via page.route(),
 * and inject a fetch override for the SSE endpoint that returns
 * a ReadableStream that stays open (preventing reconnect loops).
 */
export async function interceptAllAPI(page: Page, sseEvents: SSEEvent[], options?: InterceptAPIOptions) {
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

    // GET /api/workflow/:sessionId — workflow summary
    if (/\/api\/workflow\/[^/]+$/.test(path) && method === 'GET') {
      const now = new Date().toISOString();
      const baseSummary = {
        session: {
          id: MOCK_SESSION_ID,
          pipeline_stage: 'section_review',
          pipeline_status: 'running',
          pending_gate: 'section_review_summary',
          updated_at: now,
          active_node: 'sections',
          last_panel_type: 'section_review',
        },
        nodes: [
          'overview',
          'benchmark',
          'gaps',
          'questions',
          'blueprint',
          'sections',
          'quality',
          'export',
        ].map((node_key, idx) => ({
          node_key,
          status: idx < 5 ? 'complete' : (node_key === 'sections' ? 'blocked' : 'locked'),
          active_version: 1,
          updated_at: now,
          meta: null,
        })),
        latest_artifacts: [],
        replan: null,
        draft_readiness: null,
        replan_status: null,
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...baseSummary,
          ...(options?.workflowSummaryOverride ?? {}),
        }),
      });
      return;
    }

    // GET /api/workflow/:sessionId/node/:nodeKey — artifact list
    if (/\/api\/workflow\/[^/]+\/node\/[^/]+$/.test(path) && method === 'GET') {
      const parts = path.split('/');
      const nodeKey = parts[parts.length - 1] ?? 'overview';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          session_id: MOCK_SESSION_ID,
          node_key: nodeKey,
          artifacts: [],
        }),
      });
      return;
    }

    // GET /api/workflow/:sessionId/node/:nodeKey/history
    if (/\/api\/workflow\/[^/]+\/node\/[^/]+\/history$/.test(path) && method === 'GET') {
      const parts = path.split('/');
      const nodeKey = parts[parts.length - 2] ?? 'overview';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          session_id: MOCK_SESSION_ID,
          node_key: nodeKey,
          history: [],
        }),
      });
      return;
    }

    // POST /api/workflow/:sessionId/restart
    if (/\/api\/workflow\/[^/]+\/restart$/.test(path) && method === 'POST') {
      const body = route.request().postDataJSON?.();
      captured.push({ url: route.request().url(), method: 'POST', body: body ?? null });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'started', restart_source: 'server_artifact' }),
      });
      return;
    }

    // POST /api/workflow/:sessionId/generate-draft-now
    if (/\/api\/workflow\/[^/]+\/generate-draft-now$/.test(path) && method === 'POST') {
      const body = route.request().postDataJSON?.();
      captured.push({ url: route.request().url(), method: 'POST', body: body ?? null });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'sent', message: 'Mock draft-now request accepted.' }),
      });
      return;
    }

    // POST /api/workflow/:sessionId/benchmark/assumptions
    if (/\/api\/workflow\/[^/]+\/benchmark\/assumptions$/.test(path) && method === 'POST') {
      const body = route.request().postDataJSON?.();
      captured.push({ url: route.request().url(), method: 'POST', body: body ?? null });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          version: 1,
          applies_to_current_run: true,
          apply_mode: 'next_safe_checkpoint',
          requires_restart: false,
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
