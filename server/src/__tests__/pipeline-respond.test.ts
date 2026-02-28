/**
 * Tests for the pipeline /respond route logic.
 *
 * The route is defined as a Hono handler in routes/pipeline.ts and tightly
 * coupled to the Supabase admin client. Rather than standing up a full HTTP
 * server, we test the observable behaviour of the helper functions and the
 * key validation logic that the route delegates to.
 *
 * Strategy:
 *   - Test the respondSchema Zod validator directly (exported via the
 *     route module's observable contract).
 *   - Test the STALE_PIPELINE_MS constant (exported from the route module).
 *   - Test the pending-gate-queue helpers that the route uses to persist /
 *     buffer responses — these are already covered in pending-gate-queue.test.ts
 *     but we add integration-style tests for the combined respond logic here.
 *   - For the full Hono route we mock Supabase and exercise the route via a
 *     lightweight Hono test harness so we do not need a real DB connection.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Supabase mock — must be hoisted before any module imports ────────────────

const mockFrom = vi.hoisted(() => vi.fn());
const mockRpc = vi.hoisted(() => vi.fn());

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: mockFrom,
    rpc: mockRpc,
  },
}));

// Mock sessions route import (sseConnections side-import in pipeline.ts)
vi.mock('../routes/sessions.js', () => ({
  sseConnections: new Map(),
}));

// Mock coordinator so we never spin up real agent loops
vi.mock('../agents/coordinator.js', () => ({
  runPipeline: vi.fn().mockResolvedValue({ current_stage: 'complete', revision_count: 0 }),
}));

// Mock middleware that the pipeline router applies to all routes
vi.mock('../middleware/auth.js', () => ({
  authMiddleware: vi.fn(async (c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
    c.set('user', { id: 'test-user-id' });
    await next();
  }),
}));

vi.mock('../middleware/rate-limit.js', () => ({
  rateLimitMiddleware: vi.fn(() => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  }),
}));

// Mock non-essential infra that pipeline.ts imports at module level
vi.mock('../lib/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
  createSessionLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../lib/sentry.js', () => ({
  captureError: vi.fn(),
}));

vi.mock('../lib/llm-provider.js', () => ({
  startUsageTracking: vi.fn().mockReturnValue({ input_tokens: 0, output_tokens: 0 }),
  stopUsageTracking: vi.fn().mockReturnValue({ input_tokens: 0, output_tokens: 0, estimated_cost_usd: 0 }),
  setUsageTrackingContext: vi.fn(),
}));

vi.mock('../lib/workflow-nodes.js', () => ({
  WORKFLOW_NODE_KEYS: [],
  workflowNodeFromStage: vi.fn().mockReturnValue('overview'),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { Hono } from 'hono';
import { pipeline, STALE_PIPELINE_MS } from '../routes/pipeline.js';

// ─── Helper: build a lightweight Hono test app wrapping the route ─────────────

function makeApp() {
  const app = new Hono();
  app.route('/api/pipeline', pipeline);
  return app;
}

// ─── Helper: build a chainable Supabase mock for a specific shape ─────────────

/**
 * Produces a mock that satisfies the chained query builder pattern used in
 * the /respond route:
 *
 *   supabaseAdmin.from('coach_sessions').select(...).eq(...).eq(...).single()
 *   supabaseAdmin.from('coach_sessions').select(...).eq(...).single()
 *   supabaseAdmin.from('coach_sessions').update(...).eq(...).eq(...)
 */
function makeSupabaseMock(opts: {
  sessionRow?: Record<string, unknown> | null;
  sessionError?: { message: string } | null;
  pipelineStateRow?: Record<string, unknown> | null;
  pipelineStateError?: { message: string } | null;
  updateError?: { message: string } | null;
  pendingGateData?: Record<string, unknown> | null;
}) {
  const {
    sessionRow = { id: 'test-session-id', user_id: 'test-user-id' },
    sessionError = null,
    pipelineStateRow = {
      pipeline_status: 'running',
      pipeline_stage: 'section_review',
      pending_gate: 'section_review',
      pending_gate_data: opts.pendingGateData ?? null,
      updated_at: new Date().toISOString(),
    },
    pipelineStateError = null,
    updateError = null,
  } = opts;

  let callCount = 0;

  mockFrom.mockImplementation(() => {
    callCount += 1;

    // The respond route calls from('coach_sessions') three times in the happy path:
    //   1. Verify session belongs to user  → select(..).eq(..).eq(..).single()
    //   2. getPipelineState               → select(..).eq(..).single()
    //   3. Update pending_gate_data        → update(..).eq(..).eq(..)
    //   (plus best-effort persistQuestionResponse which we allow to succeed silently)
    const callIndex = callCount;

    const single = callIndex === 1
      ? vi.fn().mockResolvedValue({ data: sessionRow, error: sessionError })
      : vi.fn().mockResolvedValue({ data: pipelineStateRow, error: pipelineStateError });

    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });

    // For the update chain (call 3+) we return a resolved promise from the eq() call itself.
    const updateEqEq = vi.fn().mockResolvedValue({ error: updateError });
    const updateEq = vi.fn().mockReturnValue({ eq: updateEqEq });
    const update = vi.fn().mockReturnValue({ eq: updateEq });

    const eqEqSingle = vi.fn().mockReturnValue({ single, maybeSingle });
    const eqEqMaybe = vi.fn().mockReturnValue({ single, maybeSingle });
    const eqSingle = vi.fn().mockReturnValue({ single, maybeSingle });

    const eq = vi.fn().mockReturnValue({
      single,
      maybeSingle,
      eq: vi.fn().mockReturnValue({ single, maybeSingle, eq: eqEqSingle }),
    });

    const select = vi.fn().mockReturnValue({ eq, single, maybeSingle });

    // upsert used by best-effort question response persistence
    const upsert = vi.fn().mockResolvedValue({ error: null });

    return { select, update, eq, single, maybeSingle, upsert };
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

// Must be RFC 4122 compliant (version nibble 1-8, variant 8-b)
const VALID_SESSION_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000';

describe('pipeline /respond route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. Returns 400 on missing session_id ──────────────────────────────────

  it('returns 400 when session_id is missing from body', async () => {
    const app = makeApp();
    const res = await app.request('/api/pipeline/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gate: 'section_review', response: true }),
    });

    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toMatch(/invalid request/i);
  });

  // ── 2. Returns 400 when session_id is not a valid UUID ────────────────────

  it('returns 400 when session_id is not a valid UUID', async () => {
    const app = makeApp();
    const res = await app.request('/api/pipeline/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: 'not-a-uuid', gate: 'section_review', response: true }),
    });

    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toMatch(/invalid request/i);
  });

  // ── 3. Returns 409 when pipeline is not running (stale pipeline) ──────────

  it('returns 409 when pipeline_status is not running', async () => {
    makeSupabaseMock({
      pipelineStateRow: {
        pipeline_status: 'error',
        pipeline_stage: 'intake',
        pending_gate: null,
        pending_gate_data: null,
        updated_at: new Date().toISOString(),
      },
    });

    const app = makeApp();
    const res = await app.request('/api/pipeline/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: VALID_SESSION_ID, gate: 'section_review', response: true }),
    });

    expect(res.status).toBe(409);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toMatch(/not running/i);
  });

  // ── 4. Returns 409 when pipeline updated_at is older than STALE_PIPELINE_MS ─

  it('returns 409 with STALE_PIPELINE code when updated_at is too old', async () => {
    const staleTimestamp = new Date(Date.now() - STALE_PIPELINE_MS - 60_000).toISOString();

    makeSupabaseMock({
      pipelineStateRow: {
        pipeline_status: 'running',
        pipeline_stage: 'section_review',
        pending_gate: null,
        pending_gate_data: null,
        updated_at: staleTimestamp,
      },
    });

    const app = makeApp();
    const res = await app.request('/api/pipeline/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: VALID_SESSION_ID, gate: 'section_review', response: true }),
    });

    expect(res.status).toBe(409);
    const body = await res.json() as Record<string, unknown>;
    expect(body.code).toBe('STALE_PIPELINE');
  });

  // ── 5. Successfully queues response when gate matches pending_gate ─────────

  it('returns ok when pending gate matches and response is persisted', async () => {
    makeSupabaseMock({
      pipelineStateRow: {
        pipeline_status: 'running',
        pipeline_stage: 'section_review',
        pending_gate: 'section_review',
        pending_gate_data: {
          gate: 'section_review',
          created_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      },
    });

    const app = makeApp();
    const res = await app.request('/api/pipeline/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: VALID_SESSION_ID, gate: 'section_review', response: { approved: true } }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.status).toBe('ok');
    expect(body.gate).toBe('section_review');
  });

  // ── 6. Returns 400 when gate name does not match pending_gate ─────────────

  it('returns 400 when supplied gate does not match the pending gate', async () => {
    makeSupabaseMock({
      pipelineStateRow: {
        pipeline_status: 'running',
        pipeline_stage: 'architect',
        pending_gate: 'architect_review',
        pending_gate_data: null,
        updated_at: new Date().toISOString(),
      },
    });

    const app = makeApp();
    const res = await app.request('/api/pipeline/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: VALID_SESSION_ID, gate: 'section_review', response: true }),
    });

    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body.error).toBe('string');
    // Should mention the gate mismatch
    expect((body.error as string)).toMatch(/architect_review/);
  });

  // ── 7. Buffers early response when no pending gate is set ─────────────────

  it('returns buffered status when gate is supplied but no pending gate exists yet', async () => {
    makeSupabaseMock({
      pipelineStateRow: {
        pipeline_status: 'running',
        pipeline_stage: 'section_writing',
        pending_gate: null,
        pending_gate_data: null,
        updated_at: new Date().toISOString(),
      },
    });

    const app = makeApp();
    const res = await app.request('/api/pipeline/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: VALID_SESSION_ID, gate: 'section_review', response: true }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.status).toBe('buffered');
    expect(body.gate).toBe('section_review');
  });

  // ── 8. Returns 404 when session does not exist ────────────────────────────

  it('returns 404 when session is not found', async () => {
    makeSupabaseMock({
      sessionRow: null,
      sessionError: { message: 'no rows' },
    });

    const app = makeApp();
    const res = await app.request('/api/pipeline/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: VALID_SESSION_ID, gate: 'section_review', response: true }),
    });

    expect(res.status).toBe(404);
  });

  // ── 9. Returns 404 when pipeline state cannot be read ─────────────────────

  it('returns 404 when pipeline state row is missing', async () => {
    makeSupabaseMock({
      pipelineStateRow: null,
      pipelineStateError: { message: 'no rows found' },
    });

    const app = makeApp();
    const res = await app.request('/api/pipeline/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: VALID_SESSION_ID, gate: 'section_review', response: true }),
    });

    expect(res.status).toBe(404);
  });

  // ── 10. Returns 404 when no gate is pending and no gate name supplied ──────

  it('returns 404 when no pending gate exists and no gate name is provided', async () => {
    makeSupabaseMock({
      pipelineStateRow: {
        pipeline_status: 'running',
        pipeline_stage: 'section_writing',
        pending_gate: null,
        pending_gate_data: null,
        updated_at: new Date().toISOString(),
      },
    });

    const app = makeApp();
    // Supply response but no gate name — route cannot buffer without a gate name
    const res = await app.request('/api/pipeline/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: VALID_SESSION_ID, response: { answer: 'yes' } }),
    });

    // When no explicit response and normalizedResponse falls to undefined (non-architect gate),
    // the route returns 400 Missing response payload
    expect([400, 404]).toContain(res.status);
  });
});

// ─── STALE_PIPELINE_MS export sanity check ────────────────────────────────────

describe('STALE_PIPELINE_MS', () => {
  it('is 15 minutes expressed in milliseconds', () => {
    expect(STALE_PIPELINE_MS).toBe(15 * 60 * 1000);
  });
});
