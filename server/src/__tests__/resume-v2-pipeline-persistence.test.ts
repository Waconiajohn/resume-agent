/**
 * Resume v2 Pipeline — Session Persistence Tests
 *
 * Covers the P1 session persistence feature: pipeline results are stored as a
 * versioned snapshot in `tailored_sections` (JSONB) so the V2 UI can fully
 * hydrate from history without re-running the pipeline.
 *
 * Stories covered:
 *   1. V2 format detection on GET — `tailored_sections.version === 'v2'` returns
 *      `{ version, pipeline_data, inputs }` (not the legacy `{ result }` shape)
 *   2. Legacy fallback on GET — stored data without `version: 'v2'` falls back to
 *      `{ result: <stored> }` to remain backward-compatible with old sessions
 *   3. Null/empty tailored_sections — pipeline complete but nothing stored yet
 *      returns the legacy fallback shape with `result: null`
 *   4. Pipeline snapshot structure — the object written to the DB during a
 *      successful pipeline run has the expected version marker, pipeline_data
 *      fields, and inputs shape
 *
 * These tests exercise the GET /:sessionId/result route and the background
 * pipeline persistence logic in POST /start.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const mockFrom = vi.hoisted(() => vi.fn());
const mockRunV2Pipeline = vi.hoisted(() => vi.fn());
const mockParseJsonBodyWithLimit = vi.hoisted(() => vi.fn());

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: mockFrom,
    auth: { getUser: vi.fn() },
  },
}));

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: vi.fn(async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set('user', { id: 'test-user-123', email: 'test@example.com' });
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

vi.mock('../routes/sessions.js', () => ({
  sseConnections: new Map(),
  addSSEConnection: vi.fn(),
  removeSSEConnection: vi.fn(),
}));

vi.mock('../lib/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  },
}));

vi.mock('../lib/http-body-guard.js', () => ({
  parseJsonBodyWithLimit: mockParseJsonBodyWithLimit,
  parsePositiveInt: vi.fn((_env: unknown, def: number) => def),
}));

vi.mock('../agents/resume-v2/orchestrator.js', () => ({
  runV2Pipeline: mockRunV2Pipeline,
}));

vi.mock('../lib/llm.js', () => ({
  llm: { chat: vi.fn() },
}));

vi.mock('../lib/json-repair.js', () => ({
  repairJSON: vi.fn(),
}));

vi.mock('../lib/model-constants.js', () => ({
  MODEL_MID: 'model-mid',
  MODEL_LIGHT: 'model-light',
  MODEL_PRIMARY: 'model-primary',
  MODEL_ORCHESTRATOR: 'model-orchestrator',
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { Hono } from 'hono';
import { resumeV2Pipeline } from '../routes/resume-v2-pipeline.js';

// ─── Test app ─────────────────────────────────────────────────────────────────

function makeApp() {
  const app = new Hono();
  app.route('/api/resume-v2', resumeV2Pipeline);
  return app;
}

async function callApp(path: string, method = 'GET', body?: Record<string, unknown>) {
  const app = makeApp();
  const req = new Request(`http://localhost${path}`, {
    method,
    headers: {
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return app.fetch(req);
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SESSION_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const VALID_RESUME = 'R'.repeat(60);
const VALID_JD = 'J'.repeat(60);

/**
 * Build a chainable Supabase mock that resolves .single() with the given result.
 * Supports the full chain shape used by the route:
 *   .from().select/insert/update().eq().eq()...single()
 */
function buildSingleChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const methods = ['select', 'insert', 'update', 'eq', 'single'];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  (chain['single'] as ReturnType<typeof vi.fn>).mockResolvedValue(result);
  return chain;
}

/**
 * Build an update chain that resolves the terminal promise (no .single()).
 * Used when the route calls .update(...).eq('id', sessionId) and awaits the result.
 */
function buildUpdateChain(result: { error: unknown }) {
  const chain: Record<string, unknown> = {};
  const methods = ['update', 'eq'];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  // The route awaits the chain directly after .eq(), so attach a thenable.
  (chain as Record<string, unknown>).then = (
    onfulfilled?: ((value: unknown) => unknown) | null,
    onrejected?: ((reason: unknown) => unknown) | null,
  ) => Promise.resolve(result).then(onfulfilled ?? undefined, onrejected ?? undefined);
  return chain;
}

/** The full v2 pipeline snapshot as the POST /start route builds it. */
const FULL_V2_SNAPSHOT = {
  version: 'v2' as const,
  pipeline_data: {
    jobIntelligence: { role_title: 'VP Engineering', key_requirements: [] },
    candidateIntelligence: { summary: 'Experienced engineering leader' },
    benchmarkCandidate: { archetype: 'Strategic executive' },
    gapAnalysis: { critical_gaps: [], coaching_angles: [] },
    preScores: { ats_score: 72, fit_score: 80 },
    narrativeStrategy: { positioning_angle: 'Transformational leader' },
    resumeDraft: { summary: 'Results-driven VP...', experience: [] },
    assembly: { final_resume: { summary: 'Results-driven VP...' } },
  },
  inputs: {
    resume_text: VALID_RESUME,
    job_description: VALID_JD,
  },
};

// ─── 1. V2 format detection on GET /:sessionId/result ─────────────────────────

describe('GET /api/resume-v2/:sessionId/result — v2 format detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns { version, pipeline_data, inputs } when tailored_sections.version === "v2"', async () => {
    const chain = buildSingleChain({
      data: {
        id: SESSION_ID,
        user_id: 'test-user-123',
        pipeline_status: 'complete',
        tailored_sections: FULL_V2_SNAPSHOT,
      },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const res = await callApp(`/api/resume-v2/${SESSION_ID}/result`);

    expect(res.status).toBe(200);
    const body = await res.json() as {
      version: string;
      pipeline_data: typeof FULL_V2_SNAPSHOT['pipeline_data'];
      inputs: typeof FULL_V2_SNAPSHOT['inputs'];
    };
    expect(body.version).toBe('v2');
    expect(body.pipeline_data).toEqual(FULL_V2_SNAPSHOT.pipeline_data);
    expect(body.inputs).toEqual(FULL_V2_SNAPSHOT.inputs);
  });

  it('does NOT include a top-level "result" key in the v2 response shape', async () => {
    const chain = buildSingleChain({
      data: {
        id: SESSION_ID,
        user_id: 'test-user-123',
        pipeline_status: 'complete',
        tailored_sections: FULL_V2_SNAPSHOT,
      },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const res = await callApp(`/api/resume-v2/${SESSION_ID}/result`);
    const body = await res.json() as Record<string, unknown>;

    expect(body).not.toHaveProperty('result');
  });

  it('preserves all eight pipeline_data fields from the stored snapshot', async () => {
    const chain = buildSingleChain({
      data: {
        id: SESSION_ID,
        user_id: 'test-user-123',
        pipeline_status: 'complete',
        tailored_sections: FULL_V2_SNAPSHOT,
      },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const res = await callApp(`/api/resume-v2/${SESSION_ID}/result`);
    const body = await res.json() as { pipeline_data: Record<string, unknown> };

    const expectedFields = [
      'jobIntelligence',
      'candidateIntelligence',
      'benchmarkCandidate',
      'gapAnalysis',
      'preScores',
      'narrativeStrategy',
      'resumeDraft',
      'assembly',
    ];
    for (const field of expectedFields) {
      expect(body.pipeline_data).toHaveProperty(field);
    }
  });

  it('preserves inputs.resume_text and inputs.job_description from the stored snapshot', async () => {
    const chain = buildSingleChain({
      data: {
        id: SESSION_ID,
        user_id: 'test-user-123',
        pipeline_status: 'complete',
        tailored_sections: FULL_V2_SNAPSHOT,
      },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const res = await callApp(`/api/resume-v2/${SESSION_ID}/result`);
    const body = await res.json() as { inputs: { resume_text: string; job_description: string } };

    expect(body.inputs.resume_text).toBe(VALID_RESUME);
    expect(body.inputs.job_description).toBe(VALID_JD);
  });

  it('handles v2 snapshot where some pipeline_data fields are null (partial pipeline)', async () => {
    const partialSnapshot = {
      version: 'v2' as const,
      pipeline_data: {
        jobIntelligence: { role_title: 'Director' },
        candidateIntelligence: null,
        benchmarkCandidate: null,
        gapAnalysis: null,
        preScores: null,
        narrativeStrategy: null,
        resumeDraft: null,
        assembly: null,
      },
      inputs: { resume_text: VALID_RESUME, job_description: VALID_JD },
    };

    const chain = buildSingleChain({
      data: {
        id: SESSION_ID,
        user_id: 'test-user-123',
        pipeline_status: 'complete',
        tailored_sections: partialSnapshot,
      },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const res = await callApp(`/api/resume-v2/${SESSION_ID}/result`);

    expect(res.status).toBe(200);
    const body = await res.json() as { version: string; pipeline_data: Record<string, unknown> };
    expect(body.version).toBe('v2');
    expect(body.pipeline_data.candidateIntelligence).toBeNull();
    expect(body.pipeline_data.assembly).toBeNull();
  });
});

// ─── 2. Legacy fallback on GET /:sessionId/result ─────────────────────────────

describe('GET /api/resume-v2/:sessionId/result — legacy fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns { result: <stored> } when tailored_sections has no version field', async () => {
    const legacyData = { summary: 'Legacy resume content', experience: [] };
    const chain = buildSingleChain({
      data: {
        id: SESSION_ID,
        user_id: 'test-user-123',
        pipeline_status: 'complete',
        tailored_sections: legacyData,
      },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const res = await callApp(`/api/resume-v2/${SESSION_ID}/result`);

    expect(res.status).toBe(200);
    const body = await res.json() as { result: typeof legacyData };
    expect(body.result).toEqual(legacyData);
  });

  it('does NOT include version or pipeline_data keys in the legacy response shape', async () => {
    const legacyData = { summary: 'Some old resume' };
    const chain = buildSingleChain({
      data: {
        id: SESSION_ID,
        user_id: 'test-user-123',
        pipeline_status: 'complete',
        tailored_sections: legacyData,
      },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const res = await callApp(`/api/resume-v2/${SESSION_ID}/result`);
    const body = await res.json() as Record<string, unknown>;

    expect(body).not.toHaveProperty('version');
    expect(body).not.toHaveProperty('pipeline_data');
    expect(body).not.toHaveProperty('inputs');
  });

  it('falls back to legacy path when tailored_sections.version is a non-v2 string', async () => {
    // A hypothetical future "v3" stored by a different system should not confuse
    // this endpoint into returning the v2 shape.
    const unknownVersionData = { version: 'v1', legacy_field: 'some data' };
    const chain = buildSingleChain({
      data: {
        id: SESSION_ID,
        user_id: 'test-user-123',
        pipeline_status: 'complete',
        tailored_sections: unknownVersionData,
      },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const res = await callApp(`/api/resume-v2/${SESSION_ID}/result`);
    const body = await res.json() as Record<string, unknown>;

    // version: 'v1' does not trigger the v2 branch — legacy fallback applies
    expect(body).toHaveProperty('result');
    expect(body).not.toHaveProperty('pipeline_data');
  });

  it('returns the full stored object verbatim under result for legacy sessions', async () => {
    const complexLegacy = {
      summary: 'Exec leader',
      experience: [{ title: 'VP', company: 'Acme', bullets: ['Led 50-person team'] }],
      skills: { technical: ['TypeScript', 'Python'] },
    };
    const chain = buildSingleChain({
      data: {
        id: SESSION_ID,
        user_id: 'test-user-123',
        pipeline_status: 'complete',
        tailored_sections: complexLegacy,
      },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const res = await callApp(`/api/resume-v2/${SESSION_ID}/result`);
    const body = await res.json() as { result: typeof complexLegacy };

    expect(body.result.summary).toBe('Exec leader');
    expect(body.result.experience).toHaveLength(1);
    expect(body.result.experience[0].bullets).toContain('Led 50-person team');
  });
});

// ─── 3. Null / empty tailored_sections on GET /:sessionId/result ──────────────

describe('GET /api/resume-v2/:sessionId/result — null/empty tailored_sections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns { result: null } when tailored_sections is null', async () => {
    const chain = buildSingleChain({
      data: {
        id: SESSION_ID,
        user_id: 'test-user-123',
        pipeline_status: 'complete',
        tailored_sections: null,
      },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const res = await callApp(`/api/resume-v2/${SESSION_ID}/result`);

    expect(res.status).toBe(200);
    const body = await res.json() as { result: null };
    expect(body.result).toBeNull();
  });

  it('does NOT return version: "v2" when tailored_sections is null', async () => {
    const chain = buildSingleChain({
      data: {
        id: SESSION_ID,
        user_id: 'test-user-123',
        pipeline_status: 'complete',
        tailored_sections: null,
      },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const res = await callApp(`/api/resume-v2/${SESSION_ID}/result`);
    const body = await res.json() as Record<string, unknown>;

    expect(body).not.toHaveProperty('version');
    expect(body).not.toHaveProperty('pipeline_data');
  });

  it('still requires pipeline_status === "complete" before checking tailored_sections', async () => {
    // Even with a stored snapshot, an incomplete pipeline must return 409.
    const chain = buildSingleChain({
      data: {
        id: SESSION_ID,
        user_id: 'test-user-123',
        pipeline_status: 'running',
        tailored_sections: FULL_V2_SNAPSHOT,
      },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const res = await callApp(`/api/resume-v2/${SESSION_ID}/result`);

    expect(res.status).toBe(409);
    const body = await res.json() as { error: string; status: string };
    expect(body.status).toBe('running');
  });

  it('returns 409 with status "error" when pipeline failed', async () => {
    const chain = buildSingleChain({
      data: {
        id: SESSION_ID,
        user_id: 'test-user-123',
        pipeline_status: 'error',
        tailored_sections: null,
      },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const res = await callApp(`/api/resume-v2/${SESSION_ID}/result`);

    expect(res.status).toBe(409);
    const body = await res.json() as { status: string };
    expect(body.status).toBe('error');
  });
});

// ─── 4. Pipeline snapshot structure (POST /start background persistence) ──────

describe('POST /api/resume-v2/start — pipeline snapshot structure', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Body parsing succeeds with valid inputs
    mockParseJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      data: { resume_text: VALID_RESUME, job_description: VALID_JD },
    });
  });

  it('persists a snapshot with version === "v2" after a successful pipeline run', async () => {
    // Session insert returns a session id
    const insertChain = buildSingleChain({ data: { id: SESSION_ID }, error: null });
    // Capture the update call made after pipeline completion
    const updateChain = buildUpdateChain({ error: null });

    // First call to mockFrom is the INSERT (session creation).
    // Second call is the UPDATE (snapshot persistence).
    mockFrom
      .mockReturnValueOnce(insertChain)
      .mockReturnValueOnce(updateChain);

    mockRunV2Pipeline.mockResolvedValue({
      job_intelligence: { role_title: 'VP Engineering' },
      candidate_intelligence: { summary: 'Leader' },
      benchmark_candidate: null,
      gap_analysis: null,
      pre_scores: null,
      narrative_strategy: null,
      resume_draft: null,
      final_resume: { summary: 'Final result' },
    });

    await callApp('/api/resume-v2/start', 'POST', {
      resume_text: VALID_RESUME,
      job_description: VALID_JD,
    });

    // Allow the background IIFE to complete
    await new Promise<void>((resolve) => setTimeout(resolve, 20));

    // Confirm the update was called
    expect(mockFrom).toHaveBeenCalledTimes(2);
    expect(mockFrom).toHaveBeenNthCalledWith(2, 'coach_sessions');

    const updateCall = updateChain['update'] as ReturnType<typeof vi.fn>;
    expect(updateCall).toHaveBeenCalledOnce();

    const [updateArg] = updateCall.mock.calls[0] as [Record<string, unknown>];
    expect(updateArg.pipeline_status).toBe('complete');
    expect(updateArg.pipeline_stage).toBe('complete');

    const snapshot = updateArg.tailored_sections as Record<string, unknown>;
    expect(snapshot.version).toBe('v2');
  });

  it('snapshot contains all eight pipeline_data keys mapped from runV2Pipeline result', async () => {
    const insertChain = buildSingleChain({ data: { id: SESSION_ID }, error: null });
    const updateChain = buildUpdateChain({ error: null });

    mockFrom
      .mockReturnValueOnce(insertChain)
      .mockReturnValueOnce(updateChain);

    mockRunV2Pipeline.mockResolvedValue({
      job_intelligence: { role_title: 'Director' },
      candidate_intelligence: { background: 'Tech leader' },
      benchmark_candidate: { archetype: 'Operator' },
      gap_analysis: { gaps: [] },
      pre_scores: { ats_score: 68 },
      narrative_strategy: { angle: 'Growth leader' },
      resume_draft: { summary: 'Draft here' },
      final_resume: { summary: 'Final here' },
    });

    await callApp('/api/resume-v2/start', 'POST', {
      resume_text: VALID_RESUME,
      job_description: VALID_JD,
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 20));

    const updateCall = updateChain['update'] as ReturnType<typeof vi.fn>;
    const [updateArg] = updateCall.mock.calls[0] as [Record<string, unknown>];
    const snapshot = updateArg.tailored_sections as {
      version: string;
      pipeline_data: Record<string, unknown>;
      inputs: Record<string, unknown>;
    };

    expect(snapshot.version).toBe('v2');

    // All eight camelCase keys must be present
    const expectedKeys = [
      'jobIntelligence',
      'candidateIntelligence',
      'benchmarkCandidate',
      'gapAnalysis',
      'preScores',
      'narrativeStrategy',
      'resumeDraft',
      'assembly',
    ];
    for (const key of expectedKeys) {
      expect(snapshot.pipeline_data).toHaveProperty(key);
    }

    // Verify the camelCase key mapping is correct
    expect(snapshot.pipeline_data['jobIntelligence']).toEqual({ role_title: 'Director' });
    expect(snapshot.pipeline_data['assembly']).toEqual({ summary: 'Final here' });
  });

  it('snapshot inputs contain resume_text and job_description from the original request', async () => {
    const insertChain = buildSingleChain({ data: { id: SESSION_ID }, error: null });
    const updateChain = buildUpdateChain({ error: null });

    mockFrom
      .mockReturnValueOnce(insertChain)
      .mockReturnValueOnce(updateChain);

    mockRunV2Pipeline.mockResolvedValue({ final_resume: { summary: 'done' } });

    mockParseJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      data: { resume_text: VALID_RESUME, job_description: VALID_JD },
    });

    await callApp('/api/resume-v2/start', 'POST', {
      resume_text: VALID_RESUME,
      job_description: VALID_JD,
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 20));

    const updateCall = updateChain['update'] as ReturnType<typeof vi.fn>;
    const [updateArg] = updateCall.mock.calls[0] as [Record<string, unknown>];
    const snapshot = updateArg.tailored_sections as {
      inputs: { resume_text: string; job_description: string };
    };

    expect(snapshot.inputs.resume_text).toBe(VALID_RESUME);
    expect(snapshot.inputs.job_description).toBe(VALID_JD);
  });

  it('uses null for pipeline_data fields that are missing from runV2Pipeline result', async () => {
    // runV2Pipeline may not produce every field (e.g., partial run / early error).
    // The snapshot must use null (not undefined) for missing keys.
    const insertChain = buildSingleChain({ data: { id: SESSION_ID }, error: null });
    const updateChain = buildUpdateChain({ error: null });

    mockFrom
      .mockReturnValueOnce(insertChain)
      .mockReturnValueOnce(updateChain);

    // Only final_resume is present; all other output fields are absent
    mockRunV2Pipeline.mockResolvedValue({ final_resume: { summary: 'done' } });

    await callApp('/api/resume-v2/start', 'POST', {
      resume_text: VALID_RESUME,
      job_description: VALID_JD,
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 20));

    const updateCall = updateChain['update'] as ReturnType<typeof vi.fn>;
    const [updateArg] = updateCall.mock.calls[0] as [Record<string, unknown>];
    const snapshot = updateArg.tailored_sections as {
      pipeline_data: Record<string, unknown>;
    };

    // Fields not produced by runV2Pipeline must be null, not undefined
    expect(snapshot.pipeline_data['jobIntelligence']).toBeNull();
    expect(snapshot.pipeline_data['candidateIntelligence']).toBeNull();
    expect(snapshot.pipeline_data['gapAnalysis']).toBeNull();
    expect(snapshot.pipeline_data['preScores']).toBeNull();
    // assembly maps from final_resume which IS present
    expect(snapshot.pipeline_data['assembly']).toEqual({ summary: 'done' });
  });

  it('sets pipeline_status to "error" and does NOT write a snapshot when pipeline throws', async () => {
    const insertChain = buildSingleChain({ data: { id: SESSION_ID }, error: null });
    const errorUpdateChain = buildUpdateChain({ error: null });

    mockFrom
      .mockReturnValueOnce(insertChain)
      .mockReturnValueOnce(errorUpdateChain);

    mockRunV2Pipeline.mockRejectedValue(new Error('LLM provider timeout'));

    await callApp('/api/resume-v2/start', 'POST', {
      resume_text: VALID_RESUME,
      job_description: VALID_JD,
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 20));

    const updateCall = errorUpdateChain['update'] as ReturnType<typeof vi.fn>;
    expect(updateCall).toHaveBeenCalledOnce();

    const [updateArg] = updateCall.mock.calls[0] as [Record<string, unknown>];
    expect(updateArg.pipeline_status).toBe('error');
    expect(updateArg.error_message).toBe('LLM provider timeout');
    // No tailored_sections written on error path
    expect(updateArg).not.toHaveProperty('tailored_sections');
  });
});
