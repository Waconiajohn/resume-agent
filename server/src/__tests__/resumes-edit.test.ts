/**
 * Tests for the Sprint 8 resumes endpoints:
 *   PUT /resumes/:id         — partial update with version increment + history
 *   GET /resumes/:id/history — version history retrieval
 *
 * Strategy: Mount the resumes Hono router in a lightweight test app, mock
 * supabaseAdmin and auth middleware, then call the routes via fetch.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

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

vi.mock('../middleware/feature-guard.js', () => ({
  requireFeature: vi.fn(() => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  }),
}));

vi.mock('../lib/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn().mockReturnThis() },
  createSessionLogger: vi.fn().mockReturnValue({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { Hono } from 'hono';
import { resumes } from '../routes/resumes.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeApp() {
  const app = new Hono();
  app.route('/api/resumes', resumes);
  return app;
}

const VALID_RESUME_ID = 'a1b2c3d4-e5f6-1234-8abc-def012345678';

async function callApp(
  app: ReturnType<typeof makeApp>,
  path: string,
  method = 'GET',
  body?: Record<string, unknown>,
) {
  const req = new Request(`http://localhost${path}`, {
    method,
    headers: {
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return app.fetch(req);
}

function makeExistingResume(overrides: Record<string, unknown> = {}) {
  return {
    id: VALID_RESUME_ID,
    user_id: 'test-user-id',
    raw_text: 'Experienced engineer',
    summary: 'Experienced engineer with 10 years',
    experience: [
      {
        company: 'Acme Corp',
        title: 'VP Engineering',
        start_date: 'Jan 2020',
        end_date: 'Present',
        location: 'SF, CA',
        bullets: [{ text: 'Led 45-person team', source: 'crafted' }],
      },
    ],
    skills: { 'Leadership': ['Team building', 'Strategy'] },
    education: [{ degree: 'BS', field: 'CS', institution: 'MIT', year: '2005' }],
    certifications: [],
    contact_info: { name: 'Jane Doe', email: 'jane@example.com' },
    version: 3,
    is_default: true,
    evidence_items: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-10T00:00:00Z',
    ...overrides,
  };
}

/**
 * Creates the multi-call mock pattern needed for PUT /resumes/:id:
 *   call 1: .from('master_resumes').select('*').eq(...).eq(...).single() — load existing
 *   call 2: .from('master_resumes').update(...).eq(...).eq(...).select('*').single() — apply update
 *   call 3: .from('master_resume_history').insert(...) — history row (fire-and-forget)
 */
function makePutMock(opts: {
  existingResume?: Record<string, unknown> | null;
  existingError?: { message: string } | null;
  updatedResume?: Record<string, unknown> | null;
  updateError?: { message: string } | null;
}) {
  const {
    existingResume = makeExistingResume(),
    existingError = null,
    updatedResume = { ...makeExistingResume(), version: 4 },
    updateError = null,
  } = opts;

  let callCount = 0;

  mockFrom.mockImplementation(() => {
    callCount += 1;
    const current = callCount;

    if (current === 1) {
      // Load existing resume
      const single = vi.fn().mockResolvedValue({ data: existingResume, error: existingError });
      const eq = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single }), single });
      const select = vi.fn().mockReturnValue({ eq });
      return { select };
    }

    if (current === 2) {
      // Update resume
      const single = vi.fn().mockResolvedValue({ data: updatedResume, error: updateError });
      const selectChain = vi.fn().mockReturnValue({ single });
      const eqChain2 = vi.fn().mockReturnValue({ select: selectChain });
      const eqChain1 = vi.fn().mockReturnValue({ eq: eqChain2 });
      const update = vi.fn().mockReturnValue({ eq: eqChain1 });
      return { update };
    }

    // History insert — fire-and-forget, resolve immediately
    const historyThen = vi.fn().mockResolvedValue({ error: null });
    const historyInsert = vi.fn().mockReturnValue({ then: historyThen });
    return { insert: historyInsert };
  });
}

// ─── Tests: PUT /api/resumes/:id ─────────────────────────────────────────────

describe('PUT /api/resumes/:id — partial update', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates resume with summary-only change', async () => {
    makePutMock({
      updatedResume: { ...makeExistingResume(), summary: 'Updated summary', version: 4 },
    });

    const app = makeApp();
    const res = await callApp(app, `/api/resumes/${VALID_RESUME_ID}`, 'PUT', {
      summary: 'Updated summary',
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { resume: Record<string, unknown> };
    expect(body.resume).toBeDefined();
  });

  it('increments version number by 1', async () => {
    const existing = makeExistingResume({ version: 5 });
    const updated = { ...existing, version: 6 };
    makePutMock({ existingResume: existing, updatedResume: updated });

    const app = makeApp();
    const res = await callApp(app, `/api/resumes/${VALID_RESUME_ID}`, 'PUT', {
      summary: 'New summary',
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { resume: Record<string, unknown> };
    expect(body.resume.version).toBe(6);
  });

  it('inserts a history row on successful update', async () => {
    makePutMock({});

    const app = makeApp();
    await callApp(app, `/api/resumes/${VALID_RESUME_ID}`, 'PUT', {
      summary: 'Updated summary',
    });

    // call 3 should be the history insert
    expect(mockFrom.mock.calls.length).toBeGreaterThanOrEqual(3);
    const thirdCallTable = mockFrom.mock.calls[2]?.[0];
    expect(thirdCallTable).toBe('master_resume_history');
  });

  it('returns 404 for non-existent resume', async () => {
    makePutMock({ existingResume: null, existingError: { message: 'not found' } });

    const app = makeApp();
    const res = await callApp(app, `/api/resumes/${VALID_RESUME_ID}`, 'PUT', {
      summary: 'Updated',
    });

    expect(res.status).toBe(404);
  });

  it('returns 400 for empty changes object', async () => {
    // Route loads existing resume first, THEN checks if changedFields is empty
    makePutMock({});

    const app = makeApp();
    const res = await callApp(app, `/api/resumes/${VALID_RESUME_ID}`, 'PUT', {});

    // Zod validation passes (empty object) but the route returns 400 for no changed fields
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/no changes/i);
  });

  it('returns 400 for invalid UUID', async () => {
    const app = makeApp();
    const res = await callApp(app, '/api/resumes/not-a-uuid', 'PUT', {
      summary: 'test',
    });

    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/invalid/i);
  });

  it('returns 400 for invalid request body (Zod validation)', async () => {
    // summary exceeds 5000 chars
    const app = makeApp();
    const res = await callApp(app, `/api/resumes/${VALID_RESUME_ID}`, 'PUT', {
      summary: 'x'.repeat(6000),
    });

    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBeDefined();
  });

  it('rebuilds raw_text when summary changes', async () => {
    let capturedUpdatePayload: Record<string, unknown> | null = null;

    // Capture what's passed to update()
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) {
        const single = vi.fn().mockResolvedValue({ data: makeExistingResume(), error: null });
        const eq = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single }), single });
        return { select: vi.fn().mockReturnValue({ eq }) };
      }
      if (callCount === 2) {
        const single = vi.fn().mockResolvedValue({ data: { ...makeExistingResume(), version: 4 }, error: null });
        const selectChain = vi.fn().mockReturnValue({ single });
        const eqChain2 = vi.fn().mockReturnValue({ select: selectChain });
        const eqChain1 = vi.fn().mockReturnValue({ eq: eqChain2 });
        const update = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
          capturedUpdatePayload = payload;
          return { eq: eqChain1 };
        });
        return { update };
      }
      return { insert: vi.fn().mockReturnValue({ then: vi.fn().mockResolvedValue({ error: null }) }) };
    });

    const app = makeApp();
    await callApp(app, `/api/resumes/${VALID_RESUME_ID}`, 'PUT', {
      summary: 'New professional summary',
    });

    expect(capturedUpdatePayload).not.toBeNull();
    const payload = capturedUpdatePayload as Record<string, unknown>;
    expect(payload.raw_text).toBeDefined();
    expect(typeof payload.raw_text).toBe('string');
    expect(payload.raw_text as string).toContain('New professional summary');
  });

  it('does NOT rebuild raw_text when only contact_info changes', async () => {
    let capturedUpdatePayload: Record<string, unknown> | null = null;

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) {
        const single = vi.fn().mockResolvedValue({ data: makeExistingResume(), error: null });
        const eq = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single }), single });
        return { select: vi.fn().mockReturnValue({ eq }) };
      }
      if (callCount === 2) {
        const single = vi.fn().mockResolvedValue({ data: { ...makeExistingResume(), version: 4 }, error: null });
        const selectChain = vi.fn().mockReturnValue({ single });
        const eqChain2 = vi.fn().mockReturnValue({ select: selectChain });
        const eqChain1 = vi.fn().mockReturnValue({ eq: eqChain2 });
        const update = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
          capturedUpdatePayload = payload;
          return { eq: eqChain1 };
        });
        return { update };
      }
      return { insert: vi.fn().mockReturnValue({ then: vi.fn().mockResolvedValue({ error: null }) }) };
    });

    const app = makeApp();
    await callApp(app, `/api/resumes/${VALID_RESUME_ID}`, 'PUT', {
      contact_info: { name: 'New Name' },
    });

    // raw_text should NOT be rebuilt for contact_info changes
    expect((capturedUpdatePayload as Record<string, unknown> | null)?.raw_text).toBeUndefined();
  });

  it('returns 500 when update fails', async () => {
    makePutMock({ updateError: { message: 'DB write failed' }, updatedResume: null });

    const app = makeApp();
    const res = await callApp(app, `/api/resumes/${VALID_RESUME_ID}`, 'PUT', {
      summary: 'Something',
    });

    expect(res.status).toBe(500);
  });

  it('updates skills successfully', async () => {
    makePutMock({
      updatedResume: {
        ...makeExistingResume(),
        skills: { 'Engineering': ['TypeScript', 'Python'], 'Management': ['OKRs'] },
        version: 4,
      },
    });

    const app = makeApp();
    const res = await callApp(app, `/api/resumes/${VALID_RESUME_ID}`, 'PUT', {
      skills: { 'Engineering': ['TypeScript', 'Python'], 'Management': ['OKRs'] },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { resume: Record<string, unknown> };
    expect(body.resume).toBeDefined();
  });

  it('updates experience and rebuilds raw_text with bullets', async () => {
    let capturedPayload: Record<string, unknown> | null = null;

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) {
        const single = vi.fn().mockResolvedValue({ data: makeExistingResume(), error: null });
        const eq = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single }), single });
        return { select: vi.fn().mockReturnValue({ eq }) };
      }
      if (callCount === 2) {
        const single = vi.fn().mockResolvedValue({ data: { ...makeExistingResume(), version: 4 }, error: null });
        const selectChain = vi.fn().mockReturnValue({ single });
        const eqChain2 = vi.fn().mockReturnValue({ select: selectChain });
        const eqChain1 = vi.fn().mockReturnValue({ eq: eqChain2 });
        const update = vi.fn().mockImplementation((p: Record<string, unknown>) => {
          capturedPayload = p;
          return { eq: eqChain1 };
        });
        return { update };
      }
      return { insert: vi.fn().mockReturnValue({ then: vi.fn().mockResolvedValue({ error: null }) }) };
    });

    const app = makeApp();
    await callApp(app, `/api/resumes/${VALID_RESUME_ID}`, 'PUT', {
      experience: [
        {
          company: 'New Corp',
          title: 'CTO',
          start_date: 'Jan 2022',
          end_date: 'Present',
          location: 'NYC',
          bullets: [{ text: 'Built the platform from scratch', source: 'crafted' }],
        },
      ],
    });

    expect((capturedPayload as Record<string, unknown> | null)?.raw_text).toContain('New Corp');
    expect((capturedPayload as Record<string, unknown> | null)?.raw_text).toContain('Built the platform from scratch');
  });
});

// ─── Tests: GET /api/resumes/:id/history ─────────────────────────────────────

describe('GET /api/resumes/:id/history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeHistoryMock(opts: {
    resumeData?: { id: string } | null;
    resumeError?: { message: string } | null;
    historyData?: unknown[] | null;
    historyError?: { message: string } | null;
  }) {
    const {
      resumeData = { id: VALID_RESUME_ID },
      resumeError = null,
      historyData = [],
      historyError = null,
    } = opts;

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) {
        // Ownership check
        const single = vi.fn().mockResolvedValue({ data: resumeData, error: resumeError });
        const eq2 = vi.fn().mockReturnValue({ single });
        const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
        return { select: vi.fn().mockReturnValue({ eq: eq1 }) };
      }
      // History fetch — resolves from limit()
      const limit = vi.fn().mockResolvedValue({ data: historyData, error: historyError });
      const order = vi.fn().mockReturnValue({ limit });
      const eq = vi.fn().mockReturnValue({ order });
      return { select: vi.fn().mockReturnValue({ eq }) };
    });
  }

  it('returns history entries ordered by created_at desc', async () => {
    const historyRows = [
      {
        id: 'h1',
        master_resume_id: VALID_RESUME_ID,
        changes_summary: 'Updated summary (v3 → v4)',
        changes_detail: { fields: ['summary'] },
        created_at: '2026-01-10T12:00:00Z',
      },
      {
        id: 'h2',
        master_resume_id: VALID_RESUME_ID,
        changes_summary: 'Updated experience (v2 → v3)',
        changes_detail: { fields: ['experience'] },
        created_at: '2026-01-05T08:00:00Z',
      },
    ];

    makeHistoryMock({ historyData: historyRows });

    const app = makeApp();
    const res = await callApp(app, `/api/resumes/${VALID_RESUME_ID}/history`);
    expect(res.status).toBe(200);
    const body = await res.json() as { history: unknown[] };
    expect(body.history).toHaveLength(2);
    const first = body.history[0] as Record<string, unknown>;
    expect(first.changes_summary).toBe('Updated summary (v3 → v4)');
  });

  it('returns empty array when no history exists', async () => {
    makeHistoryMock({ historyData: [] });

    const app = makeApp();
    const res = await callApp(app, `/api/resumes/${VALID_RESUME_ID}/history`);
    expect(res.status).toBe(200);
    const body = await res.json() as { history: unknown[] };
    expect(body.history).toHaveLength(0);
  });

  it('returns 404 for non-existent resume', async () => {
    makeHistoryMock({ resumeData: null, resumeError: { message: 'not found' } });

    const app = makeApp();
    const res = await callApp(app, `/api/resumes/${VALID_RESUME_ID}/history`);
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/not found/i);
  });

  it('returns 400 for invalid UUID format', async () => {
    const app = makeApp();
    const res = await callApp(app, '/api/resumes/not-a-uuid/history');
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/invalid/i);
  });

  it('validates ownership — returns 404 if resume belongs to another user', async () => {
    // Supabase query returns null when ownership check fails (eq('user_id') filters it out)
    makeHistoryMock({ resumeData: null, resumeError: { message: 'no rows' } });

    const app = makeApp();
    const res = await callApp(app, `/api/resumes/${VALID_RESUME_ID}/history`);
    expect(res.status).toBe(404);
  });

  it('returns 500 when history DB query fails', async () => {
    makeHistoryMock({
      resumeData: { id: VALID_RESUME_ID },
      historyData: null,
      historyError: { message: 'DB error' },
    });

    const app = makeApp();
    const res = await callApp(app, `/api/resumes/${VALID_RESUME_ID}/history`);
    expect(res.status).toBe(500);
  });

  it('returns history entries with expected fields', async () => {
    const historyRows = [
      {
        id: 'h1',
        master_resume_id: VALID_RESUME_ID,
        changes_summary: 'Updated skills (v1 → v2)',
        changes_detail: { fields: ['skills'], previous_version: 1 },
        created_at: '2026-01-15T10:00:00Z',
      },
    ];

    makeHistoryMock({ historyData: historyRows });

    const app = makeApp();
    const res = await callApp(app, `/api/resumes/${VALID_RESUME_ID}/history`);
    const body = await res.json() as { history: unknown[] };
    const entry = body.history[0] as Record<string, unknown>;
    expect(entry).toHaveProperty('id');
    expect(entry).toHaveProperty('master_resume_id');
    expect(entry).toHaveProperty('changes_summary');
    expect(entry).toHaveProperty('changes_detail');
    expect(entry).toHaveProperty('created_at');
  });
});
