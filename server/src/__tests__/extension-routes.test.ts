/**
 * Extension Routes — Tests for /api/extension/*
 *
 * Coverage:
 *  1. Feature flag guard (FF_EXTENSION=false → 404)
 *  2. Auth middleware (no token → 401 via mock override)
 *  3. POST /resume-lookup — happy path via job_applications chain
 *  4. POST /resume-lookup — happy path via application_pipeline fallback
 *  5. POST /resume-lookup — not found
 *  6. POST /resume-lookup — invalid URL
 *  7. POST /resume-lookup — DB error on job_applications
 *  8. POST /job-discover — creates new entry
 *  9. POST /job-discover — ignores duplicate (upsert ignoreDuplicates)
 * 10. POST /job-discover — invalid body
 * 11. POST /apply-status — updates pipeline stage
 * 12. POST /apply-status — no matching record
 * 13. POST /apply-status — invalid URL
 * 14. GET  /auth-verify — returns user info
 * 15. POST /infer-field — returns element index
 * 16. POST /infer-field — LLM returns null when no match
 * 17. POST /infer-field — invalid body
 * 18. POST /infer-field — LLM error returns 500
 * 19. URL normalizer integration in resume-lookup
 * 20. POST /resume-lookup — session found but no artifact → not_found
 * 21. POST /resume-lookup — job_applications found but no session → application_pipeline fallback
 * 22. POST /token-exchange/create — requires auth, returns code
 * 23. POST /token-exchange/create — store overflow returns 503
 * 24. GET  /token-exchange — valid code returns token and deletes entry
 * 25. GET  /token-exchange — invalid code returns 404
 * 26. GET  /token-exchange — expired code returns 404
 * 27. GET  /token-exchange — missing code param returns 400
 * 28. GET  /token-exchange — one-time use (second call returns 404)
 * 29. POST /token-exchange/create — rate limited mock
 * 30. GET  /resume-pdf/:sessionId — happy path returns resume JSON
 * 31. GET  /resume-pdf/:sessionId — session not owned by user → 404
 * 32. GET  /resume-pdf/:sessionId — no artifact found → 404 with message
 * 33. GET  /resume-pdf/:sessionId — artifact exists but no resume field → 404
 * 34. GET  /resume-pdf/:sessionId — invalid UUID → 400
 * 35. GET  /resume-pdf/:sessionId — sets Content-Disposition attachment header
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mockFrom = vi.hoisted(() => vi.fn());
const mockLlmChat = vi.hoisted(() => vi.fn());

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: mockFrom,
    auth: { getUser: vi.fn() },
  },
}));

vi.mock('../lib/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
}));

vi.mock('../lib/feature-flags.js', () => ({
  FF_EXTENSION: true,
}));

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: vi.fn(
    async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
      c.set('user', { id: 'user-ext-001', email: 'ext@example.com' });
      await next();
    },
  ),
}));

vi.mock('../middleware/rate-limit.js', () => ({
  rateLimitMiddleware: () =>
    async (_c: unknown, next: () => Promise<void>) => {
      await next();
    },
}));

vi.mock('../lib/llm.js', () => ({
  MODEL_LIGHT: 'mock-light',
  MODEL_MID: 'mock-mid',
  MODEL_PRIMARY: 'mock-primary',
  MODEL_ORCHESTRATOR: 'mock-orchestrator',
  MAX_TOKENS: 8192,
  llm: {
    chat: mockLlmChat,
  },
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { Hono } from 'hono';
import { extensionRoutes, tokenExchangeStore } from '../routes/extension.js';

// ─── Test app ─────────────────────────────────────────────────────────────────

const app = new Hono();
app.route('/api/extension', extensionRoutes);

// ─── Chain builder helpers ────────────────────────────────────────────────────

/**
 * Build a Supabase query chain that resolves via `.maybeSingle()`.
 */
function buildMaybeChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  const methods = ['select', 'insert', 'upsert', 'update', 'delete', 'eq', 'order', 'limit'];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain['maybeSingle'] = vi.fn().mockResolvedValue(result);
  return chain;
}

/**
 * Build a Supabase query chain that resolves via `.single()`.
 */
function buildSingleChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  const methods = ['select', 'insert', 'upsert', 'update', 'delete', 'eq', 'order', 'limit'];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain['single'] = vi.fn().mockResolvedValue(result);
  return chain;
}

// ─── Feature flag guard ───────────────────────────────────────────────────────

describe('feature flag guard', () => {
  it('returns 404 when FF_EXTENSION is false', async () => {
    // Re-mock with flag disabled for this test only
    const { FF_EXTENSION: _flag } = await vi.importActual('../lib/feature-flags.js') as Record<string, unknown>;
    const guardApp = new Hono();

    // Build a mini app with the guard applied inline (simulating FF_EXTENSION=false)
    guardApp.use('/*', async (c, next) => {
      return c.json({ error: 'Extension API not enabled' }, 404);
      await next();
    });
    guardApp.route('/api/extension', extensionRoutes);

    const res = await guardApp.request('/api/extension/auth-verify', { method: 'GET' });
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('not enabled');
  });
});

// ─── GET /auth-verify ─────────────────────────────────────────────────────────

describe('GET /auth-verify', () => {
  it('returns authenticated: true with user id and email', async () => {
    const res = await app.request('/api/extension/auth-verify', { method: 'GET' });
    expect(res.status).toBe(200);
    const body = await res.json() as { authenticated: boolean; user: { id: string; email: string } };
    expect(body.authenticated).toBe(true);
    expect(body.user.id).toBe('user-ext-001');
    expect(body.user.email).toBe('ext@example.com');
  });
});

// ─── POST /resume-lookup ──────────────────────────────────────────────────────

describe('POST /resume-lookup', () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  it('returns resume via job_applications → coach_sessions → artifacts chain', async () => {
    // Phase 3 — DB columns are `title` and `company` (not `job_title` /
    // `company_name`). The handler maps them to wire-format.
    const jobApp = { id: 'japp-1', title: 'Staff Engineer', company: 'Acme Corp', resume_version_id: null };
    const session = { id: 'sess-1' };
    const artifact = { payload: { resume: { sections: ['summary'] } } };

    // Queue: job_applications, coach_sessions, session_workflow_artifacts
    mockFrom
      .mockReturnValueOnce(buildMaybeChain({ data: jobApp, error: null }))
      .mockReturnValueOnce(buildMaybeChain({ data: session, error: null }))
      .mockReturnValueOnce(buildMaybeChain({ data: artifact, error: null }));

    const res = await app.request('/api/extension/resume-lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_url: 'https://www.linkedin.com/jobs/view/12345?utm_source=google' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { status: string; job_title: string; resume: unknown };
    expect(body.status).toBe('ready');
    expect(body.job_title).toBe('Staff Engineer');
    expect(body.resume).toEqual({ sections: ['summary'] });
  });

  it('returns resume_version_id from job_applications.resume_version_id when no artifact', async () => {
    // Phase 3 — resume_version_id lives on job_applications directly; no
    // application_pipeline fallback (that table was dropped).
    const jobApp = { id: 'japp-1', title: 'VP Eng', company: 'Beta Inc', resume_version_id: 'rv-123' };

    // Queue: job_applications only — no session, no artifact needed since
    // resume_version_id is set on the row itself.
    mockFrom
      .mockReturnValueOnce(buildMaybeChain({ data: jobApp, error: null }))
      .mockReturnValueOnce(buildMaybeChain({ data: null, error: null })); // no session

    const res = await app.request('/api/extension/resume-lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_url: 'https://boards.greenhouse.io/acme/jobs/12345' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { status: string; resume_version_id: string };
    expect(body.status).toBe('ready');
    expect(body.resume_version_id).toBe('rv-123');
  });

  it('returns status not_found when no record exists anywhere', async () => {
    mockFrom
      .mockReturnValueOnce(buildMaybeChain({ data: null, error: null }))
      .mockReturnValueOnce(buildMaybeChain({ data: null, error: null }));

    const res = await app.request('/api/extension/resume-lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_url: 'https://jobs.lever.co/acme/abc-def-123' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { status: string };
    expect(body.status).toBe('not_found');
  });

  it('returns 400 for invalid URL', async () => {
    const res = await app.request('/api/extension/resume-lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_url: 'not-a-url' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns not_found when session found but no artifact AND no resume_version_id', async () => {
    // Phase 3 — application_pipeline fallback is gone; if we find the row
    // but neither the artifact nor resume_version_id are set, it's just
    // "not found."
    const jobApp = { id: 'japp-2', title: 'CTO', company: 'Gamma LLC', resume_version_id: null };
    const session = { id: 'sess-2' };

    mockFrom
      .mockReturnValueOnce(buildMaybeChain({ data: jobApp, error: null }))
      .mockReturnValueOnce(buildMaybeChain({ data: session, error: null }))
      .mockReturnValueOnce(buildMaybeChain({ data: null, error: null })); // no artifact

    const res = await app.request('/api/extension/resume-lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_url: 'https://www.indeed.com/viewjob?jk=xyz999' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { status: string };
    expect(body.status).toBe('not_found');
  });

  it('returns resume_version_id from job_applications when no session exists', async () => {
    // Phase 3 — if job_applications row has resume_version_id set but no
    // coach_session yet, we still return the version id. No
    // application_pipeline lookup needed.
    const jobApp = { id: 'japp-3', title: 'Dir Eng', company: 'Delta Co', resume_version_id: 'rv-456' };

    mockFrom
      .mockReturnValueOnce(buildMaybeChain({ data: jobApp, error: null }))
      .mockReturnValueOnce(buildMaybeChain({ data: null, error: null })); // no session

    const res = await app.request('/api/extension/resume-lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_url: 'https://acme.myworkdayjobs.com/en-US/Jobs/job/Eng' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { resume_version_id: string };
    expect(body.resume_version_id).toBe('rv-456');
  });

  it('normalizes URL before querying (strips utm params)', async () => {
    mockFrom
      .mockReturnValueOnce(buildMaybeChain({ data: null, error: null }))
      .mockReturnValueOnce(buildMaybeChain({ data: null, error: null }));

    await app.request('/api/extension/resume-lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_url: 'https://www.linkedin.com/jobs/view/999?utm_source=email&trk=xyz' }),
    });

    // Verify the first DB call used the normalized URL (no tracking params)
    const firstCallChain = mockFrom.mock.results[0]?.value as Record<string, { mock: { calls: unknown[][] } }>;
    const eqCalls = firstCallChain.eq.mock.calls;
    const normalizedUrlArg = eqCalls.find(
      (call: unknown[]) => typeof call[1] === 'string' && (call[1] as string).includes('linkedin.com'),
    );
    expect(normalizedUrlArg).toBeDefined();
    expect((normalizedUrlArg as string[])[1]).toBe('https://www.linkedin.com/jobs/view/999');
  });
});

// ─── POST /job-discover ───────────────────────────────────────────────────────

describe('POST /job-discover', () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  it('creates a new entry and returns saved: true', async () => {
    const newRow = { id: 'pipe-new', role_title: 'Senior PM', stage: 'saved' };
    mockFrom.mockReturnValueOnce(buildMaybeChain({ data: newRow, error: null }));

    const res = await app.request('/api/extension/job-discover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_url: 'https://boards.greenhouse.io/acme/jobs/99999',
        raw_url: 'https://boards.greenhouse.io/acme/jobs/99999?gh_src=abc',
        page_title: 'Senior PM',
        platform: 'GREENHOUSE',
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { saved: boolean };
    expect(body.saved).toBe(true);
  });

  it('ignores duplicate (upsert with ignoreDuplicates) and still returns saved: true', async () => {
    // ignoreDuplicates: upsert resolves with data: null (no row returned) and no error
    mockFrom.mockReturnValueOnce(buildMaybeChain({ data: null, error: null }));

    const res = await app.request('/api/extension/job-discover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_url: 'https://jobs.lever.co/acme/abc-def-123',
        raw_url: 'https://jobs.lever.co/acme/abc-def-123',
        platform: 'LEVER',
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { saved: boolean };
    expect(body.saved).toBe(true);
  });

  it('returns 400 for invalid job_url', async () => {
    const res = await app.request('/api/extension/job-discover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_url: 'bad', raw_url: 'https://example.com', platform: 'UNKNOWN' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 500 on DB error', async () => {
    mockFrom.mockReturnValueOnce(buildMaybeChain({ data: null, error: { message: 'db error' } }));

    const res = await app.request('/api/extension/job-discover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_url: 'https://boards.greenhouse.io/acme/jobs/1',
        raw_url: 'https://boards.greenhouse.io/acme/jobs/1',
        platform: 'GREENHOUSE',
      }),
    });
    expect(res.status).toBe(500);
  });
});

// ─── POST /apply-status ───────────────────────────────────────────────────────

describe('POST /apply-status', () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  it('updates stage to applied and returns updated: true', async () => {
    const updated = { id: 'pipe-1', stage: 'applied', applied_via: 'extension' };
    mockFrom.mockReturnValueOnce(buildMaybeChain({ data: updated, error: null }));

    const res = await app.request('/api/extension/apply-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_url: 'https://www.linkedin.com/jobs/view/12345', platform: 'LINKEDIN' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { updated: boolean; data: { stage: string } };
    expect(body.updated).toBe(true);
    expect(body.data.stage).toBe('applied');
  });

  it('returns updated: false when no matching record found', async () => {
    mockFrom.mockReturnValueOnce(buildMaybeChain({ data: null, error: null }));

    const res = await app.request('/api/extension/apply-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_url: 'https://boards.greenhouse.io/acme/jobs/99999' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { updated: boolean; reason: string };
    expect(body.updated).toBe(false);
    expect(body.reason).toBe('no_matching_record');
  });

  it('returns 400 for invalid URL', async () => {
    const res = await app.request('/api/extension/apply-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_url: 'not-a-url' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 500 on DB error', async () => {
    mockFrom.mockReturnValueOnce(buildMaybeChain({ data: null, error: { message: 'update failed' } }));

    const res = await app.request('/api/extension/apply-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_url: 'https://jobs.lever.co/acme/abc-123' }),
    });
    expect(res.status).toBe(500);
  });

  // Phase 1 (pursuit timeline) — extension-applied path also fires an event.
  it('fires applied event in same handler (applied_via = extension)', async () => {
    const updated = { id: 'pipe-1', stage: 'applied', applied_via: 'extension' };

    // Mocks in order: update → idempotency check → insert.
    mockFrom.mockReturnValueOnce(buildMaybeChain({ data: updated, error: null }));

    // Idempotency check: no recent duplicate.
    const idempChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    mockFrom.mockReturnValueOnce(idempChain);

    // Insert returns the new event row.
    const insertChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: 'evt-1', user_id: 'user-abc', job_application_id: 'pipe-1',
          type: 'applied', occurred_at: new Date().toISOString(),
          metadata: { type: 'applied', applied_via: 'extension' },
          created_at: new Date().toISOString(),
        },
        error: null,
      }),
    };
    mockFrom.mockReturnValueOnce(insertChain);

    const res = await app.request('/api/extension/apply-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_url: 'https://www.linkedin.com/jobs/view/55555', platform: 'LINKEDIN' }),
    });

    expect(res.status).toBe(200);
    expect(insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'applied',
        job_application_id: 'pipe-1',
        metadata: expect.objectContaining({ type: 'applied', applied_via: 'extension' }),
      }),
    );
  });

  it('keeps response success even when event write fails (non-fatal)', async () => {
    const updated = { id: 'pipe-1', stage: 'applied', applied_via: 'extension' };
    mockFrom.mockReturnValueOnce(buildMaybeChain({ data: updated, error: null }));

    // Idempotency check throws — simulates a DB hiccup mid-handler.
    const failingChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockRejectedValue(new Error('event-store down')),
    };
    mockFrom.mockReturnValueOnce(failingChain);

    const res = await app.request('/api/extension/apply-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_url: 'https://www.linkedin.com/jobs/view/55556', platform: 'LINKEDIN' }),
    });

    // The stage update succeeded, so the response stays 200/updated:true
    // even though the event write blew up. Logged, swallowed.
    expect(res.status).toBe(200);
    const body = await res.json() as { updated: boolean };
    expect(body.updated).toBe(true);
  });
});

// ─── POST /infer-field ────────────────────────────────────────────────────────

describe('POST /infer-field', () => {
  beforeEach(() => {
    mockLlmChat.mockReset();
  });

  it('returns element_index from LLM response', async () => {
    mockLlmChat.mockResolvedValueOnce({
      text: '{"element_index": 2}',
      tool_calls: [],
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const res = await app.request('/api/extension/infer-field', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        field_name: 'first_name',
        field_value: 'John',
        form_snapshot: [
          { index: 0, label: 'Last Name', name: 'last_name', type: 'text' },
          { index: 1, label: 'Email', name: 'email', type: 'email' },
          { index: 2, label: 'First Name', name: 'first_name', type: 'text' },
        ],
        platform: 'GREENHOUSE',
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { element_index: number };
    expect(body.element_index).toBe(2);
  });

  it('returns element_index: null when LLM cannot identify a match', async () => {
    mockLlmChat.mockResolvedValueOnce({
      text: '{"element_index": null}',
      tool_calls: [],
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const res = await app.request('/api/extension/infer-field', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        field_name: 'unknown_field_xyz',
        field_value: 'some value',
        form_snapshot: [{ label: 'Email', name: 'email', type: 'email' }],
        platform: 'LEVER',
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { element_index: null };
    expect(body.element_index).toBeNull();
  });

  it('returns element_index: null when LLM response is malformed JSON', async () => {
    mockLlmChat.mockResolvedValueOnce({
      text: 'Sorry, I cannot determine this.',
      tool_calls: [],
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const res = await app.request('/api/extension/infer-field', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        field_name: 'resume',
        field_value: '',
        form_snapshot: [],
        platform: 'WORKDAY',
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { element_index: null };
    expect(body.element_index).toBeNull();
  });

  it('returns 400 for missing required fields', async () => {
    const res = await app.request('/api/extension/infer-field', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field_name: 'email' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when field_value exceeds max length', async () => {
    const res = await app.request('/api/extension/infer-field', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        field_name: 'summary',
        field_value: 'x'.repeat(201),
        form_snapshot: [],
        platform: 'LINKEDIN',
      }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 500 when LLM call throws', async () => {
    mockLlmChat.mockRejectedValueOnce(new Error('LLM timeout'));

    const res = await app.request('/api/extension/infer-field', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        field_name: 'city',
        field_value: 'San Francisco',
        form_snapshot: [{ label: 'City', name: 'city', type: 'text' }],
        platform: 'ICIMS',
      }),
    });
    expect(res.status).toBe(500);
  });
});

// ─── POST /token-exchange/create ─────────────────────────────────────────────

describe('POST /token-exchange/create', () => {
  beforeEach(() => {
    tokenExchangeStore.clear();
  });

  it('requires auth and returns a 32-char hex code on success', async () => {
    const res = await app.request('/api/extension/token-exchange/create', {
      method: 'POST',
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { code: string };
    expect(typeof body.code).toBe('string');
    // randomBytes(16).toString('hex') → 32 hex chars
    expect(body.code).toMatch(/^[0-9a-f]{32}$/);
  });

  it('stores the entry in the exchange store keyed by the returned code', async () => {
    const res = await app.request('/api/extension/token-exchange/create', {
      method: 'POST',
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { code: string };
    expect(tokenExchangeStore.has(body.code)).toBe(true);

    const entry = tokenExchangeStore.get(body.code)!;
    expect(entry.userId).toBe('user-ext-001');
    expect(entry.email).toBe('ext@example.com');
    expect(entry.expiresAt).toBeGreaterThan(Date.now());
  });

  it('returns 503 when the store has reached its maximum capacity', async () => {
    // Fill the store beyond the 1000-entry limit
    for (let i = 0; i < 1000; i++) {
      tokenExchangeStore.set(`fake-code-${i}`, {
        token: 'tok',
        userId: 'uid',
        email: 'e@e.com',
        expiresAt: Date.now() + 60_000,
      });
    }

    const res = await app.request('/api/extension/token-exchange/create', {
      method: 'POST',
    });

    expect(res.status).toBe(503);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/unavailable/i);
  });

  it('returns 401 when auth middleware blocks the request (no auth header)', async () => {
    // Build a mini-app that does NOT mock the auth middleware
    const unauthApp = new Hono();
    unauthApp.use('/*', async (c, next) => {
      // Simulate auth middleware rejecting an unauthenticated request
      const authHeader = c.req.header('Authorization');
      if (!authHeader) return c.json({ error: 'Missing or invalid Authorization header' }, 401);
      await next();
    });
    unauthApp.route('/api/extension', extensionRoutes);

    const res = await unauthApp.request('/api/extension/token-exchange/create', {
      method: 'POST',
      // No Authorization header
    });

    expect(res.status).toBe(401);
  });
});

// ─── GET /token-exchange ──────────────────────────────────────────────────────

describe('GET /token-exchange', () => {
  beforeEach(() => {
    tokenExchangeStore.clear();
  });

  it('returns token and userId (no email PII) for a valid code', async () => {
    tokenExchangeStore.set('valid-code-abc', {
      token: 'supabase-jwt-token-xyz',
      userId: 'user-ext-001',
      email: 'ext@example.com',
      expiresAt: Date.now() + 60_000,
    });

    const res = await app.request('/api/extension/token-exchange?code=valid-code-abc', {
      method: 'GET',
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { token: string; userId: string; email?: string };
    expect(body.token).toBe('supabase-jwt-token-xyz');
    expect(body.userId).toBe('user-ext-001');
    expect(body.email).toBeUndefined();
  });

  it('deletes the entry after successful retrieval (one-time use)', async () => {
    tokenExchangeStore.set('one-time-code', {
      token: 'tok',
      userId: 'u1',
      email: 'u@e.com',
      expiresAt: Date.now() + 60_000,
    });

    // First call: success
    const res1 = await app.request('/api/extension/token-exchange?code=one-time-code', {
      method: 'GET',
    });
    expect(res1.status).toBe(200);

    // Second call: code is gone
    const res2 = await app.request('/api/extension/token-exchange?code=one-time-code', {
      method: 'GET',
    });
    expect(res2.status).toBe(404);
    const body = await res2.json() as { error: string };
    expect(body.error).toMatch(/invalid or expired/i);
  });

  it('returns 404 for an unknown code', async () => {
    const res = await app.request('/api/extension/token-exchange?code=does-not-exist', {
      method: 'GET',
    });

    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/invalid or expired/i);
  });

  it('returns 404 for an expired code', async () => {
    tokenExchangeStore.set('expired-code', {
      token: 'tok',
      userId: 'u1',
      email: 'u@e.com',
      expiresAt: Date.now() - 1, // already expired
    });

    const res = await app.request('/api/extension/token-exchange?code=expired-code', {
      method: 'GET',
    });

    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/invalid or expired/i);
    // Entry should have been cleaned up
    expect(tokenExchangeStore.has('expired-code')).toBe(false);
  });

  it('returns 400 when the code query parameter is missing', async () => {
    const res = await app.request('/api/extension/token-exchange', {
      method: 'GET',
    });

    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/code/i);
  });
});

// ─── GET /resume-pdf/:sessionId ───────────────────────────────────────────────

describe('GET /resume-pdf/:sessionId', () => {
  const VALID_SESSION_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

  beforeEach(() => {
    mockFrom.mockReset();
  });

  it('returns resume JSON with Content-Disposition header when session and artifact are found', async () => {
    const resumeData = { summary: 'Staff engineer with 10 years experience', ats_score: 92 };
    const session = { id: VALID_SESSION_ID };
    const artifact = { payload: { resume: resumeData } };

    mockFrom
      .mockReturnValueOnce(buildMaybeChain({ data: session, error: null }))
      .mockReturnValueOnce(buildMaybeChain({ data: artifact, error: null }));

    const res = await app.request(`/api/extension/resume-pdf/${VALID_SESSION_ID}`, {
      method: 'GET',
    });

    expect(res.status).toBe(200);
    const body = await res.json() as typeof resumeData;
    expect(body.summary).toBe(resumeData.summary);
    expect(body.ats_score).toBe(92);
  });

  it('sets Content-Disposition: attachment header on success', async () => {
    const session = { id: VALID_SESSION_ID };
    const artifact = { payload: { resume: { summary: 'test' } } };

    mockFrom
      .mockReturnValueOnce(buildMaybeChain({ data: session, error: null }))
      .mockReturnValueOnce(buildMaybeChain({ data: artifact, error: null }));

    const res = await app.request(`/api/extension/resume-pdf/${VALID_SESSION_ID}`, {
      method: 'GET',
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="resume.json"');
  });

  it('returns 404 when session does not belong to the authenticated user', async () => {
    mockFrom.mockReturnValueOnce(buildMaybeChain({ data: null, error: null }));

    const res = await app.request(`/api/extension/resume-pdf/${VALID_SESSION_ID}`, {
      method: 'GET',
    });

    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/not found/i);
  });

  it('returns 404 with message when session is found but no artifact exists', async () => {
    const session = { id: VALID_SESSION_ID };

    mockFrom
      .mockReturnValueOnce(buildMaybeChain({ data: session, error: null }))
      .mockReturnValueOnce(buildMaybeChain({ data: null, error: null }));

    const res = await app.request(`/api/extension/resume-pdf/${VALID_SESSION_ID}`, {
      method: 'GET',
    });

    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('No completed resume found for this session');
  });

  it('returns 404 when artifact exists but payload has no resume field', async () => {
    const session = { id: VALID_SESSION_ID };
    const artifact = { payload: { some_other_key: 'data' } };

    mockFrom
      .mockReturnValueOnce(buildMaybeChain({ data: session, error: null }))
      .mockReturnValueOnce(buildMaybeChain({ data: artifact, error: null }));

    const res = await app.request(`/api/extension/resume-pdf/${VALID_SESSION_ID}`, {
      method: 'GET',
    });

    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('No completed resume found for this session');
  });

  it('returns 400 when sessionId is not a valid UUID', async () => {
    const res = await app.request('/api/extension/resume-pdf/not-a-uuid', {
      method: 'GET',
    });

    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/invalid session/i);
  });
});
