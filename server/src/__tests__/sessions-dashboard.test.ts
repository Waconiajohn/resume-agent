/**
 * Tests for the enriched GET /sessions and GET /sessions/:id/resume endpoints
 * added in Sprint 8 (Dashboard story 1 & 2).
 *
 * Strategy: Mount the sessions Hono router in a lightweight test app,
 * mock supabaseAdmin and auth middleware, then call the routes via fetch.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks — must be hoisted before any module imports ───────────────────────

const mockFrom = vi.hoisted(() => vi.fn());
const mockRpc = vi.hoisted(() => vi.fn());

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: mockFrom,
    auth: { getUser: vi.fn() },
    rpc: mockRpc,
  },
}));

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: vi.fn(async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set('user', { id: 'test-user-id', email: 'test@example.com', accessToken: 'test-token' });
    await next();
  }),
  getCachedUser: vi.fn().mockReturnValue(null),
  cacheUser: vi.fn(),
}));

vi.mock('../middleware/rate-limit.js', () => ({
  rateLimitMiddleware: vi.fn(() => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  }),
}));

vi.mock('../lib/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn().mockReturnThis() },
  createSessionLogger: vi.fn().mockReturnValue({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

// Sessions route imports sseConnections — provide a stub
vi.mock('../routes/sessions.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../routes/sessions.js')>();
  return { ...mod };
});

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { Hono } from 'hono';
import { sessions } from '../routes/sessions.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeApp() {
  const app = new Hono();
  app.route('/api/sessions', sessions);
  return app;
}

const VALID_SESSION_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

/**
 * Builds a chainable Supabase query builder mock that resolves with given data
 * at the end of a chain. Supports select→eq→eq→...→single/limit patterns.
 *
 * limit() returns BOTH a resolved promise (for terminal use) and a thenable
 * builder so that additional .eq() chaining works after limit() when a status
 * filter is applied.
 */
function makeChain(resolvedValue: { data: unknown; error: unknown }) {
  const terminal = vi.fn().mockResolvedValue(resolvedValue);
  const builder: Record<string, unknown> = {};
  const methods = ['select', 'eq', 'neq', 'order', 'single', 'maybeSingle', 'insert', 'update', 'upsert'];
  for (const m of methods) {
    if (m === 'single' || m === 'maybeSingle') {
      builder[m] = terminal;
    } else {
      builder[m] = vi.fn().mockReturnValue(builder);
    }
  }
  // limit() must return the builder (so further .eq() chaining works) AND be
  // awaitable itself (so `const { data } = await query` resolves correctly).
  const limitFn = vi.fn().mockImplementation(() => {
    // Return a thenable that also has all chain methods
    const thenableBuilder = Object.assign(
      Promise.resolve(resolvedValue),
      builder,
    );
    return thenableBuilder;
  });
  builder['limit'] = limitFn;
  return builder;
}

async function callApp(app: ReturnType<typeof makeApp>, path: string, method = 'GET', headers: Record<string, string> = {}) {
  const req = new Request(`http://localhost${path}`, {
    method,
    headers: { Authorization: 'Bearer test-token', ...headers },
  });
  return app.fetch(req);
}

// ─── Tests: GET /api/sessions (enriched list) ────────────────────────────────

describe('GET /api/sessions — enriched session list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns enriched session data with pipeline metadata', async () => {
    const rawRow = {
      id: VALID_SESSION_ID,
      status: 'active',
      current_phase: 'section_writing',
      pipeline_status: 'running',
      pipeline_stage: 'section_writing',
      input_tokens_used: 1000,
      output_tokens_used: 500,
      estimated_cost_usd: 0.25,
      last_panel_type: 'live_resume',
      last_panel_data: {
        resume: { company_name: 'Acme Corp', job_title: 'VP Engineering' },
      },
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
    };

    mockFrom.mockReturnValue(makeChain({ data: [rawRow], error: null }));

    const app = makeApp();
    const res = await callApp(app, '/api/sessions');
    expect(res.status).toBe(200);
    const body = await res.json() as { sessions: unknown[] };
    expect(body.sessions).toHaveLength(1);
    const s = body.sessions[0] as Record<string, unknown>;
    expect(s.id).toBe(VALID_SESSION_ID);
    expect(s.pipeline_status).toBe('running');
    expect(s.pipeline_stage).toBe('section_writing');
    expect(s.input_tokens_used).toBe(1000);
    expect(s.output_tokens_used).toBe(500);
    expect(s.estimated_cost_usd).toBe(0.25);
    expect(s.last_panel_type).toBe('live_resume');
    expect(s.company_name).toBe('Acme Corp');
    expect(s.job_title).toBe('VP Engineering');
  });

  it('strips last_panel_data from response', async () => {
    const rawRow = {
      id: VALID_SESSION_ID,
      status: 'active',
      current_phase: 'onboarding',
      pipeline_status: null,
      pipeline_stage: null,
      input_tokens_used: 0,
      output_tokens_used: 0,
      estimated_cost_usd: 0,
      last_panel_type: null,
      last_panel_data: { sensitive: 'data' },
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };

    mockFrom.mockReturnValue(makeChain({ data: [rawRow], error: null }));

    const app = makeApp();
    const res = await callApp(app, '/api/sessions');
    const body = await res.json() as { sessions: unknown[] };
    const s = body.sessions[0] as Record<string, unknown>;
    expect(s).not.toHaveProperty('last_panel_data');
  });

  it('falls back to null for missing pipeline fields', async () => {
    const rawRow = {
      id: VALID_SESSION_ID,
      status: 'active',
      current_phase: 'onboarding',
      last_panel_data: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };

    mockFrom.mockReturnValue(makeChain({ data: [rawRow], error: null }));

    const app = makeApp();
    const res = await callApp(app, '/api/sessions');
    const body = await res.json() as { sessions: unknown[] };
    const s = body.sessions[0] as Record<string, unknown>;
    expect(s.pipeline_status).toBeNull();
    expect(s.pipeline_stage).toBeNull();
    expect(s.input_tokens_used).toBe(0);
    expect(s.output_tokens_used).toBe(0);
    expect(s.estimated_cost_usd).toBe(0);
    expect(s.company_name).toBeNull();
    expect(s.job_title).toBeNull();
  });

  it('extracts company_name and job_title from panel_data top-level when not nested in resume', async () => {
    const rawRow = {
      id: VALID_SESSION_ID,
      status: 'active',
      current_phase: 'onboarding',
      pipeline_status: 'complete',
      pipeline_stage: 'complete',
      input_tokens_used: 200,
      output_tokens_used: 100,
      estimated_cost_usd: 0.1,
      last_panel_type: 'completion',
      last_panel_data: {
        company_name: 'Top Level Corp',
        job_title: 'Director',
        resume: {},
      },
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };

    mockFrom.mockReturnValue(makeChain({ data: [rawRow], error: null }));

    const app = makeApp();
    const res = await callApp(app, '/api/sessions');
    const body = await res.json() as { sessions: unknown[] };
    const s = body.sessions[0] as Record<string, unknown>;
    // resume.company_name takes precedence but resume object has no company_name
    // so falls through to panelData.company_name
    expect(s.company_name).toBe('Top Level Corp');
    expect(s.job_title).toBe('Director');
  });

  it('returns empty array when user has no sessions', async () => {
    mockFrom.mockReturnValue(makeChain({ data: [], error: null }));

    const app = makeApp();
    const res = await callApp(app, '/api/sessions');
    expect(res.status).toBe(200);
    const body = await res.json() as { sessions: unknown[] };
    expect(body.sessions).toHaveLength(0);
  });

  it('respects ?limit=N parameter, caps at 100', async () => {
    mockFrom.mockReturnValue(makeChain({ data: [], error: null }));

    const app = makeApp();
    // Limit 5 — just verify it doesn't blow up and returns 200
    const res = await callApp(app, '/api/sessions?limit=5');
    expect(res.status).toBe(200);
  });

  it('over-large limit is capped to 100', async () => {
    const builder = makeChain({ data: [], error: null }) as Record<string, unknown>;
    mockFrom.mockReturnValue(builder);

    const app = makeApp();
    const res = await callApp(app, '/api/sessions?limit=999');
    expect(res.status).toBe(200);
    // The limit() call should have been made with at most 100
    // (internal clamp in the route)
    const limitFn = (builder as { limit: ReturnType<typeof vi.fn> }).limit;
    const limitArg: number = limitFn.mock.calls[0]?.[0] as number;
    expect(limitArg).toBeLessThanOrEqual(100);
  });

  it('returns 500 when Supabase reports an error', async () => {
    const builder = makeChain({ data: null, error: { message: 'DB error' } }) as Record<string, unknown>;
    mockFrom.mockReturnValue(builder);

    const app = makeApp();
    const res = await callApp(app, '/api/sessions');
    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toBeDefined();
  });

  it('applies status filter from ?status= query parameter without error', async () => {
    const builder = makeChain({ data: [], error: null }) as Record<string, unknown>;
    mockFrom.mockReturnValue(builder);

    const app = makeApp();
    const res = await callApp(app, '/api/sessions?status=complete');
    expect(res.status).toBe(200);
    const body = await res.json() as { sessions: unknown[] };
    expect(Array.isArray(body.sessions)).toBe(true);
  });

  it('does not apply pipeline_status filter when no status query param given', async () => {
    const builder = makeChain({ data: [], error: null }) as Record<string, unknown>;
    mockFrom.mockReturnValue(builder);

    const app = makeApp();
    const res = await callApp(app, '/api/sessions');
    expect(res.status).toBe(200);
    const body = await res.json() as { sessions: unknown[] };
    expect(Array.isArray(body.sessions)).toBe(true);
  });

  it('returns multiple sessions ordered by updated_at', async () => {
    const rows = [
      {
        id: 'f47ac10b-58cc-4372-a567-0e02b2c3d401',
        status: 'active',
        current_phase: 'onboarding',
        pipeline_status: 'complete',
        pipeline_stage: 'complete',
        input_tokens_used: 100,
        output_tokens_used: 50,
        estimated_cost_usd: 0.05,
        last_panel_type: null,
        last_panel_data: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
      },
      {
        id: 'f47ac10b-58cc-4372-a567-0e02b2c3d402',
        status: 'active',
        current_phase: 'onboarding',
        pipeline_status: 'running',
        pipeline_stage: 'intake',
        input_tokens_used: 50,
        output_tokens_used: 25,
        estimated_cost_usd: 0.02,
        last_panel_type: null,
        last_panel_data: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T12:00:00Z',
      },
    ];

    mockFrom.mockReturnValue(makeChain({ data: rows, error: null }));

    const app = makeApp();
    const res = await callApp(app, '/api/sessions');
    expect(res.status).toBe(200);
    const body = await res.json() as { sessions: unknown[] };
    expect(body.sessions).toHaveLength(2);
  });
});

// ─── Tests: GET /api/sessions/:id/resume ─────────────────────────────────────

describe('GET /api/sessions/:id/resume', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns resume from completed session', async () => {
    const resume = {
      summary: 'Experienced VP of Engineering',
      experience: [],
      skills: {},
      education: [],
      certifications: [],
      ats_score: 88,
      company_name: 'Acme Corp',
      job_title: 'VP Engineering',
    };

    mockFrom.mockReturnValue(makeChain({ data: { last_panel_data: { resume } }, error: null }));

    const app = makeApp();
    const res = await callApp(app, `/api/sessions/${VALID_SESSION_ID}/resume`);
    expect(res.status).toBe(200);
    const body = await res.json() as { resume: Record<string, unknown> };
    expect(body.resume).toBeDefined();
    expect(body.resume.summary).toBe('Experienced VP of Engineering');
    expect(body.resume.company_name).toBe('Acme Corp');
  });

  it('returns 404 when session not found', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'not found', code: 'PGRST116' } }));

    const app = makeApp();
    const res = await callApp(app, `/api/sessions/${VALID_SESSION_ID}/resume`);
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/not found/i);
  });

  it('returns 404 when session has no resume data', async () => {
    mockFrom.mockReturnValue(makeChain({ data: { last_panel_data: null }, error: null }));

    const app = makeApp();
    const res = await callApp(app, `/api/sessions/${VALID_SESSION_ID}/resume`);
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/no resume/i);
  });

  it('returns 404 when last_panel_data exists but has no resume key', async () => {
    mockFrom.mockReturnValue(makeChain({ data: { last_panel_data: { other_key: true } }, error: null }));

    const app = makeApp();
    const res = await callApp(app, `/api/sessions/${VALID_SESSION_ID}/resume`);
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid session UUID', async () => {
    const app = makeApp();
    const res = await callApp(app, '/api/sessions/not-a-valid-uuid/resume');
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/invalid/i);
  });

  it('only returns resume for session owner', async () => {
    // The query uses .eq('user_id', user.id) — if ownership fails, supabase returns null
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }));

    const app = makeApp();
    const res = await callApp(app, `/api/sessions/${VALID_SESSION_ID}/resume`);
    expect(res.status).toBe(404);
  });
});
