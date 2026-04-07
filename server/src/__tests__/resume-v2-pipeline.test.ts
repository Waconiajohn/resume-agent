/**
 * Resume v2 Pipeline Routes — Unit tests.
 *
 * Verifies:
 * - POST /start: body parsing via parseJsonBodyWithLimit, Zod validation, session creation
 * - POST /:sessionId/edit: session ownership check, body parsing, Zod validation, LLM call
 * - POST /:sessionId/rescore: session ownership check, body parsing, Zod validation, LLM call
 * - GET /:sessionId/stream: session ownership check, 404 on missing session
 * - GET /:sessionId/result: session ownership, status gating, result retrieval
 *
 * Critical bug regression:
 * - parseJsonBodyWithLimit returns { ok: true, data: {...} }. Routes must extract .data before
 *   passing to Zod. Passing the raw result object to Zod would fail validation — these tests
 *   confirm the extraction is correct.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const mockFrom = vi.hoisted(() => vi.fn());
const mockRunV2Pipeline = vi.hoisted(() => vi.fn());
const mockLlmChat = vi.hoisted(() => vi.fn());
const mockRepairJSON = vi.hoisted(() => vi.fn());
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
  llm: {
    chat: mockLlmChat,
  },
}));

vi.mock('../lib/json-repair.js', () => ({
  repairJSON: mockRepairJSON,
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

async function callApp(
  path: string,
  method = 'GET',
  body?: Record<string, unknown>,
) {
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

const SESSION_ID = 'b7e1c2d3-e4f5-4abc-8def-012345678901';

const VALID_RESUME = 'A'.repeat(60); // 60 chars, meets min(50)
const VALID_JD = 'B'.repeat(60);     // 60 chars, meets min(50)

const VALID_START_BODY = {
  resume_text: VALID_RESUME,
  job_description: VALID_JD,
};

const VALID_EDIT_BODY = {
  action: 'strengthen',
  selected_text: 'Led the team to success',
  section: 'experience',
  full_resume_context: 'Full resume text here',
  job_description: 'Job description text here',
};

const VALID_RESCORE_BODY = {
  resume_text: VALID_RESUME,
  job_description: VALID_JD,
};

/**
 * Build a chainable Supabase mock that resolves .single() with the given result.
 * Handles: .from().select/insert/update().eq().eq().select().single()
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

// ─── POST /start ──────────────────────────────────────────────────────────────

describe('POST /api/resume-v2/start', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: body parsing succeeds, returns .data correctly
    mockParseJsonBodyWithLimit.mockResolvedValue({ ok: true, data: VALID_START_BODY });

    // Default: session insert succeeds
    const chain = buildSingleChain({ data: { id: SESSION_ID }, error: null });
    mockFrom.mockReturnValue(chain);

    // runV2Pipeline resolves — it runs in background so this just prevents unhandled rejections
    mockRunV2Pipeline.mockResolvedValue({ final_resume: { summary: 'done' } });
  });

  it('accepts valid input and returns session_id with status started', async () => {
    const res = await callApp('/api/resume-v2/start', 'POST', VALID_START_BODY);

    expect(res.status).toBe(200);
    const body = await res.json() as { session_id: string; status: string };
    expect(body.session_id).toBe(SESSION_ID);
    expect(body.status).toBe('started');
  });

  it('extracts .data from parseJsonBodyWithLimit result before Zod validation', async () => {
    // This is the critical regression test. The mock returns the full { ok, data } object.
    // The route MUST call parsedBody.data, not pass parsedBody directly to Zod.
    // If the route passed the raw result, Zod would fail because { ok, data } has no
    // resume_text field and would produce a 400. A 200 here proves .data extraction works.
    const res = await callApp('/api/resume-v2/start', 'POST', VALID_START_BODY);

    expect(res.status).toBe(200);
    // Confirm mock was called (parseJsonBodyWithLimit was invoked)
    expect(mockParseJsonBodyWithLimit).toHaveBeenCalledOnce();
  });

  it('returns 400 when resume_text is too short', async () => {
    const shortText = 'short'; // less than 50 chars
    mockParseJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      data: { resume_text: shortText, job_description: VALID_JD },
    });

    const res = await callApp('/api/resume-v2/start', 'POST', {
      resume_text: shortText,
      job_description: VALID_JD,
    });

    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Invalid input');
  });

  it('returns 400 when job_description is missing', async () => {
    mockParseJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      data: { resume_text: VALID_RESUME },
    });

    const res = await callApp('/api/resume-v2/start', 'POST', { resume_text: VALID_RESUME });

    expect(res.status).toBe(400);
    const body = await res.json() as { error: string; details: unknown };
    expect(body.error).toBe('Invalid input');
    expect(body.details).toBeDefined();
  });

  it('returns 400 when resume_text exceeds 50000 characters', async () => {
    const longText = 'x'.repeat(50001);
    mockParseJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      data: { resume_text: longText, job_description: VALID_JD },
    });

    const res = await callApp('/api/resume-v2/start', 'POST', {
      resume_text: longText,
      job_description: VALID_JD,
    });

    expect(res.status).toBe(400);
  });

  it('accepts optional user_context field', async () => {
    mockParseJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      data: { ...VALID_START_BODY, user_context: 'Targeting director-level roles' },
    });

    const res = await callApp('/api/resume-v2/start', 'POST', {
      ...VALID_START_BODY,
      user_context: 'Targeting director-level roles',
    });

    expect(res.status).toBe(200);
  });

  it('returns 500 when session insert fails', async () => {
    const chain = buildSingleChain({ data: null, error: { message: 'DB constraint violation' } });
    mockFrom.mockReturnValue(chain);

    const res = await callApp('/api/resume-v2/start', 'POST', VALID_START_BODY);

    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Failed to create session');
  });

  it('passes the parsed body data to runV2Pipeline (background)', async () => {
    // Give the background task a chance to start
    await callApp('/api/resume-v2/start', 'POST', VALID_START_BODY);
    // Allow microtask queue to flush so the void async IIFE fires
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    expect(mockRunV2Pipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        resume_text: VALID_RESUME,
        job_description: VALID_JD,
        session_id: SESSION_ID,
        user_id: 'test-user-123',
      }),
    );
  });
});

// ─── GET /:sessionId/stream ───────────────────────────────────────────────────

describe('GET /api/resume-v2/:sessionId/stream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when session does not belong to user', async () => {
    const chain = buildSingleChain({ data: null, error: { message: 'not found' } });
    mockFrom.mockReturnValue(chain);

    const res = await callApp(`/api/resume-v2/${SESSION_ID}/stream`);

    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Session not found');
  });

  it('returns a streaming response (200) when session is valid', async () => {
    const chain = buildSingleChain({
      data: { id: SESSION_ID, user_id: 'test-user-123', pipeline_status: 'running' },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    // The SSE stream holds open — we just verify the status and content-type here.
    // We abort immediately via AbortController to avoid hanging the test.
    const app = makeApp();
    const controller = new AbortController();
    const req = new Request(`http://localhost/api/resume-v2/${SESSION_ID}/stream`, {
      method: 'GET',
      headers: { Authorization: 'Bearer test-token' },
      signal: controller.signal,
    });

    // Abort after a short delay to release the SSE hold
    setTimeout(() => controller.abort(), 20);

    let res: Response | undefined;
    try {
      res = await app.fetch(req);
    } catch {
      // AbortError is expected when we cancel the request
    }

    if (res) {
      // Content-type for SSE
      const contentType = res.headers.get('content-type') ?? '';
      expect(contentType).toContain('text/event-stream');
    }
  });
});

// ─── GET /:sessionId/result ───────────────────────────────────────────────────

describe('GET /api/resume-v2/:sessionId/result', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when session is not found', async () => {
    const chain = buildSingleChain({ data: null, error: { message: 'not found' } });
    mockFrom.mockReturnValue(chain);

    const res = await callApp(`/api/resume-v2/${SESSION_ID}/result`);

    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Session not found');
  });

  it('returns 409 when pipeline is still running', async () => {
    const chain = buildSingleChain({
      data: { id: SESSION_ID, user_id: 'test-user-123', pipeline_status: 'running', tailored_sections: null },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const res = await callApp(`/api/resume-v2/${SESSION_ID}/result`);

    expect(res.status).toBe(409);
    const body = await res.json() as { error: string; status: string };
    expect(body.error).toMatch(/snapshot not yet available/i);
    expect(body.status).toBe('running');
  });

  it('returns the stored result when pipeline is complete', async () => {
    const storedResult = { summary: 'Experienced leader', experience: [] };
    const chain = buildSingleChain({
      data: {
        id: SESSION_ID,
        user_id: 'test-user-123',
        pipeline_status: 'complete',
        tailored_sections: storedResult,
      },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const res = await callApp(`/api/resume-v2/${SESSION_ID}/result`);

    expect(res.status).toBe(200);
    const body = await res.json() as { result: typeof storedResult };
    expect(body.result).toEqual(storedResult);
  });

  it('enriches legacy v2 snapshots with coaching policy metadata before returning them', async () => {
    const storedSnapshot = {
      version: 'v2' as const,
      pipeline_data: {
        stage: 'strategy',
        jobIntelligence: null,
        candidateIntelligence: null,
        benchmarkCandidate: null,
        gapAnalysis: {
          requirements: [
            {
              requirement: 'Develop and track performance metrics',
              source: 'job_description',
              importance: 'important',
              classification: 'partial',
              evidence: ['Tracked weekly throughput metrics and improved fill rate by 14% across the network.'],
              strategy: {
                real_experience: 'Tracked weekly throughput metrics and improved fill rate by 14% across the network.',
                positioning: 'Built and tracked weekly throughput scorecards that improved fill rate by 14% across the network.',
              },
            },
          ],
          coverage_score: 0,
          strength_summary: '',
          critical_gaps: [],
          pending_strategies: [
            {
              requirement: 'Develop and track performance metrics',
              strategy: {
                real_experience: 'Tracked weekly throughput metrics and improved fill rate by 14% across the network.',
                positioning: 'Built and tracked weekly throughput scorecards that improved fill rate by 14% across the network.',
              },
            },
          ],
        },
        gapCoachingCards: [
          {
            requirement: 'Develop and track performance metrics',
            importance: 'important',
            classification: 'partial',
            ai_reasoning: 'The proof is close but still needs the metrics and cadence to be explicit.',
            proposed_strategy: 'Built and tracked weekly throughput scorecards that improved fill rate by 14% across the network.',
            evidence_found: ['Tracked weekly throughput metrics and improved fill rate by 14% across the network.'],
          },
        ],
        preScores: null,
        narrativeStrategy: null,
        resumeDraft: null,
        assembly: null,
        error: null,
        stageMessages: [],
      },
      inputs: {
        resume_text: VALID_RESUME,
        job_description: VALID_JD,
      },
    };

    const chain = buildSingleChain({
      data: {
        id: SESSION_ID,
        user_id: 'test-user-123',
        pipeline_status: 'complete',
        tailored_sections: storedSnapshot,
      },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const res = await callApp(`/api/resume-v2/${SESSION_ID}/result`);

    expect(res.status).toBe(200);
    const body = await res.json() as {
      version: string;
      pipeline_data: {
        gapAnalysis: {
          requirements: Array<{ strategy?: { coaching_policy?: { clarifyingQuestion: string } } }>;
          pending_strategies: Array<{ strategy?: { coaching_policy?: { proofActionRequiresInput: string } } }>;
        };
        gapCoachingCards: Array<{ coaching_policy?: { lookingFor: string } }>;
      };
    };

    expect(body.version).toBe('v2');
    expect(body.pipeline_data.gapAnalysis.requirements[0]?.strategy?.coaching_policy?.clarifyingQuestion).toContain('metrics or scorecards');
    expect(body.pipeline_data.gapAnalysis.pending_strategies[0]?.strategy?.coaching_policy?.proofActionRequiresInput).toContain('metrics or scorecards');
    expect(body.pipeline_data.gapCoachingCards[0]?.coaching_policy?.lookingFor).toContain('reporting cadence');
  });
});

// ─── POST /:sessionId/edit ────────────────────────────────────────────────────

describe('POST /api/resume-v2/:sessionId/edit', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: session ownership check passes
    const chain = buildSingleChain({
      data: { id: SESSION_ID, user_id: 'test-user-123' },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    // Default: body parsing returns valid edit body
    mockParseJsonBodyWithLimit.mockResolvedValue({ ok: true, data: VALID_EDIT_BODY });

    // Default: LLM returns a replacement
    mockLlmChat.mockResolvedValue({ text: '{"replacement": "Led a high-performing team to deliver results"}' });
    mockRepairJSON.mockReturnValue({ replacement: 'Led a high-performing team to deliver results' });
  });

  it('accepts valid edit request and returns replacement text', async () => {
    const res = await callApp(`/api/resume-v2/${SESSION_ID}/edit`, 'POST', VALID_EDIT_BODY);

    expect(res.status).toBe(200);
    const body = await res.json() as { replacement: string };
    expect(body.replacement).toBe('Led a high-performing team to deliver results');
  });

  it('extracts .data from parseJsonBodyWithLimit result before Zod validation', async () => {
    // Same critical regression test as /start — confirms .data extraction on the edit route
    const res = await callApp(`/api/resume-v2/${SESSION_ID}/edit`, 'POST', VALID_EDIT_BODY);

    expect(res.status).toBe(200);
    expect(mockParseJsonBodyWithLimit).toHaveBeenCalledOnce();
  });

  it('returns 404 when session does not belong to user', async () => {
    const chain = buildSingleChain({ data: null, error: { message: 'not found' } });
    mockFrom.mockReturnValue(chain);

    const res = await callApp(`/api/resume-v2/${SESSION_ID}/edit`, 'POST', VALID_EDIT_BODY);

    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Session not found');
  });

  it('returns 400 for invalid action enum value', async () => {
    mockParseJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      data: { ...VALID_EDIT_BODY, action: 'invalid_action' },
    });

    const res = await callApp(`/api/resume-v2/${SESSION_ID}/edit`, 'POST', {
      ...VALID_EDIT_BODY,
      action: 'invalid_action',
    });

    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Invalid input');
  });

  it('returns 400 when selected_text is too short (under 5 chars)', async () => {
    mockParseJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      data: { ...VALID_EDIT_BODY, selected_text: 'led' },
    });

    const res = await callApp(`/api/resume-v2/${SESSION_ID}/edit`, 'POST', {
      ...VALID_EDIT_BODY,
      selected_text: 'led',
    });

    expect(res.status).toBe(400);
  });

  it('accepts all valid action enum values', async () => {
    const actions = ['strengthen', 'add_metrics', 'shorten', 'add_keywords', 'rewrite', 'custom', 'not_my_voice'];

    for (const action of actions) {
      mockParseJsonBodyWithLimit.mockResolvedValue({
        ok: true,
        data: { ...VALID_EDIT_BODY, action },
      });

      const res = await callApp(`/api/resume-v2/${SESSION_ID}/edit`, 'POST', {
        ...VALID_EDIT_BODY,
        action,
      });

      expect(res.status).toBe(200);
    }
  });

  it('falls back to raw LLM text when repairJSON returns null', async () => {
    mockLlmChat.mockResolvedValue({ text: 'Strengthened bullet without JSON wrapper' });
    mockRepairJSON.mockReturnValue(null); // parse fails

    const res = await callApp(`/api/resume-v2/${SESSION_ID}/edit`, 'POST', VALID_EDIT_BODY);

    expect(res.status).toBe(200);
    const body = await res.json() as { replacement: string };
    // Falls back to raw text, stripped of markdown fences
    expect(body.replacement).toBe('Strengthened bullet without JSON wrapper');
  });

  it('passes the current working draft to the LLM for non-custom edit actions', async () => {
    mockParseJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      data: {
        ...VALID_EDIT_BODY,
        working_draft: 'Built and tracked plant performance metrics across safety and throughput.',
      },
    });

    const res = await callApp(`/api/resume-v2/${SESSION_ID}/edit`, 'POST', {
      ...VALID_EDIT_BODY,
      working_draft: 'Built and tracked plant performance metrics across safety and throughput.',
    });

    expect(res.status).toBe(200);

    const llmArgs = mockLlmChat.mock.calls[0]?.[0] as {
      system: string;
      messages: Array<{ role: string; content: string }>;
    };

    expect(llmArgs.system).toContain('If the user message includes CURRENT WORKING DRAFT TO REPLACE');
    expect(llmArgs.messages[0]?.content).toContain('CURRENT WORKING DRAFT TO REPLACE:');
    expect(llmArgs.messages[0]?.content).toContain('Built and tracked plant performance metrics across safety and throughput.');
  });

  it('returns 500 when LLM call throws', async () => {
    mockLlmChat.mockRejectedValue(new Error('LLM timeout'));

    const res = await callApp(`/api/resume-v2/${SESSION_ID}/edit`, 'POST', VALID_EDIT_BODY);

    expect(res.status).toBe(500);
    const body = await res.json() as { error: string; message: string };
    expect(body.error).toBe('Edit failed');
    expect(body.message).toBe('LLM timeout');
  });
});

// ─── POST /:sessionId/rescore ─────────────────────────────────────────────────

describe('POST /api/resume-v2/:sessionId/rescore', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: session ownership check passes
    const chain = buildSingleChain({
      data: { id: SESSION_ID, user_id: 'test-user-123' },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    // Default: body parsing succeeds
    mockParseJsonBodyWithLimit.mockResolvedValue({ ok: true, data: VALID_RESCORE_BODY });

    // Default: LLM returns ATS score result
    mockLlmChat.mockResolvedValue({
      text: '{"ats_score": 78, "keywords_found": ["TypeScript"], "keywords_missing": ["Agile"], "top_suggestions": ["Add Agile to skills"]}',
    });
    mockRepairJSON.mockReturnValue({
      ats_score: 78,
      keywords_found: ['TypeScript'],
      keywords_missing: ['Agile'],
      top_suggestions: ['Add Agile to skills'],
    });
  });

  it('accepts valid rescore request and returns ATS score', async () => {
    const res = await callApp(`/api/resume-v2/${SESSION_ID}/rescore`, 'POST', VALID_RESCORE_BODY);

    expect(res.status).toBe(200);
    const body = await res.json() as {
      ats_score: number;
      keywords_found: string[];
      keywords_missing: string[];
      top_suggestions: string[];
    };
    expect(body.ats_score).toBe(78);
    expect(body.keywords_found).toContain('TypeScript');
    expect(body.keywords_missing).toContain('Agile');
  });

  it('extracts .data from parseJsonBodyWithLimit before Zod validation', async () => {
    const res = await callApp(`/api/resume-v2/${SESSION_ID}/rescore`, 'POST', VALID_RESCORE_BODY);

    expect(res.status).toBe(200);
    expect(mockParseJsonBodyWithLimit).toHaveBeenCalledOnce();
  });

  it('returns 404 when session does not belong to user', async () => {
    const chain = buildSingleChain({ data: null, error: { message: 'not found' } });
    mockFrom.mockReturnValue(chain);

    const res = await callApp(`/api/resume-v2/${SESSION_ID}/rescore`, 'POST', VALID_RESCORE_BODY);

    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Session not found');
  });

  it('returns 400 when resume_text is too short for rescore', async () => {
    mockParseJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      data: { resume_text: 'short', job_description: VALID_JD },
    });

    const res = await callApp(`/api/resume-v2/${SESSION_ID}/rescore`, 'POST', {
      resume_text: 'short',
      job_description: VALID_JD,
    });

    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Invalid input');
  });

  it('returns 500 when repairJSON returns null (unparseable LLM response)', async () => {
    mockLlmChat.mockResolvedValue({ text: 'I cannot score this resume.' });
    mockRepairJSON.mockReturnValue(null);

    const res = await callApp(`/api/resume-v2/${SESSION_ID}/rescore`, 'POST', VALID_RESCORE_BODY);

    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/unparseable/i);
  });

  it('returns 500 when LLM call throws', async () => {
    mockLlmChat.mockRejectedValue(new Error('Rate limit exceeded'));

    const res = await callApp(`/api/resume-v2/${SESSION_ID}/rescore`, 'POST', VALID_RESCORE_BODY);

    expect(res.status).toBe(500);
    const body = await res.json() as { error: string; message: string };
    expect(body.error).toBe('Rescore failed');
    expect(body.message).toBe('Rate limit exceeded');
  });
});

// ─── POST /:sessionId/gap-chat ───────────────────────────────────────────────

describe('POST /api/resume-v2/:sessionId/gap-chat', () => {
  const VALID_GAP_CHAT_BODY = {
    requirement: 'Develop and track performance metrics',
    classification: 'partial',
    messages: [],
    context: {
      evidence: ['Tracked weekly throughput metrics and improved fill rate by 14% across the platform.'],
      current_strategy: 'Tracked weekly throughput metrics and improved fill rate by 14% across the platform.',
      ai_reasoning: 'The proof is close but still needs one more concrete detail.',
      job_description_excerpt: 'Develop and track performance metrics',
      candidate_experience_summary: 'Led operating cadence across a multi-site network.',
    },
  } as const;

  beforeEach(() => {
    vi.clearAllMocks();

    const chain = buildSingleChain({
      data: { id: SESSION_ID, user_id: 'test-user-123' },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    mockParseJsonBodyWithLimit.mockResolvedValue({ ok: true, data: VALID_GAP_CHAT_BODY });
  });

  it('replaces weak label-style rewrites and generic questions with a targeted follow-up', async () => {
    mockLlmChat.mockResolvedValue({
      text: '{"response":"You have related experience here.","suggested_resume_language":"Related performance metrics expertise","current_question":"Tell me about any experience you have related to developing and tracking performance metrics.","follow_up_question":"Tell me about any experience you have related to developing and tracking performance metrics.","needs_candidate_input":true,"recommended_next_action":"answer_question"}',
    });
    mockRepairJSON.mockReturnValue({
      response: 'You have related experience here.',
      suggested_resume_language: 'Related performance metrics expertise',
      current_question: 'Tell me about any experience you have related to developing and tracking performance metrics.',
      follow_up_question: 'Tell me about any experience you have related to developing and tracking performance metrics.',
      needs_candidate_input: true,
      recommended_next_action: 'answer_question',
    });

    const res = await callApp(`/api/resume-v2/${SESSION_ID}/gap-chat`, 'POST', VALID_GAP_CHAT_BODY);

    expect(res.status).toBe(200);
    const body = await res.json() as {
      response: string;
      suggested_resume_language?: string;
      current_question?: string;
      follow_up_question?: string;
      needs_candidate_input?: boolean;
      recommended_next_action?: string;
    };

    expect(body.suggested_resume_language).toBeUndefined();
    expect(body.current_question).toContain('Which metrics or scorecards did you personally track');
    expect(body.follow_up_question).toContain('what decision or improvement did they drive');
    expect(body.recommended_next_action).toBe('answer_question');
    expect(body.needs_candidate_input).toBe(true);
  });

  it('falls back to a concrete targeted question when the model response is unparseable', async () => {
    mockLlmChat.mockResolvedValue({ text: 'Not valid JSON at all' });
    mockRepairJSON.mockReturnValue(null);

    const res = await callApp(`/api/resume-v2/${SESSION_ID}/gap-chat`, 'POST', VALID_GAP_CHAT_BODY);

    expect(res.status).toBe(200);
    const body = await res.json() as {
      response: string;
      current_question?: string;
      follow_up_question?: string;
      recommended_next_action?: string;
      needs_candidate_input?: boolean;
    };

    expect(body.response).toContain('strongest proof we have');
    expect(body.current_question).toContain('Which metrics or scorecards did you personally track');
    expect(body.follow_up_question).toContain('what decision or improvement did they drive');
    expect(body.recommended_next_action).toBe('answer_question');
    expect(body.needs_candidate_input).toBe(true);
  });

  it('seeds gap chat with shared coaching policy guidance when it is available', async () => {
    mockParseJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      data: {
        ...VALID_GAP_CHAT_BODY,
        context: {
          ...VALID_GAP_CHAT_BODY.context,
          coaching_policy: {
            primaryFamily: 'communication',
            families: ['communication'],
            clarifyingQuestion: 'Who was the audience, what did you present or align on, and what decision or next step came from it?',
            proofActionRequiresInput: 'If you have this experience, add one concrete example showing who the audience was, what you communicated or aligned on, and what decision or outcome followed.',
            proofActionDirect: 'Add one concrete example showing who the audience was, what you communicated or aligned on, and what decision or outcome followed.',
            rationale: 'Executive communication only counts when the audience, message, and outcome are clear.',
            lookingFor: 'Audience seniority, what was presented, and the decision, alignment, or outcome that followed.',
          },
        },
      },
    });
    mockLlmChat.mockResolvedValue({
      text: '{"response":"Need one more detail.","current_question":"Who was the audience, what did you present or align on, and what decision or next step came from it?","follow_up_question":"Who was the audience, what did you present or align on, and what decision or next step came from it?","needs_candidate_input":true,"recommended_next_action":"answer_question"}',
    });
    mockRepairJSON.mockReturnValue({
      response: 'Need one more detail.',
      current_question: 'Who was the audience, what did you present or align on, and what decision or next step came from it?',
      follow_up_question: 'Who was the audience, what did you present or align on, and what decision or next step came from it?',
      needs_candidate_input: true,
      recommended_next_action: 'answer_question',
    });

    const res = await callApp(`/api/resume-v2/${SESSION_ID}/gap-chat`, 'POST', VALID_GAP_CHAT_BODY);

    expect(res.status).toBe(200);
    const llmArgs = mockLlmChat.mock.calls[0]?.[0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const seededAssistant = JSON.parse(llmArgs.messages[1]?.content ?? '{}') as {
      current_question?: string;
      follow_up_question?: string;
    };

    expect(seededAssistant.current_question).toBe(
      'Who was the audience, what did you present or align on, and what decision or next step came from it?',
    );
    expect(seededAssistant.follow_up_question).toBe(
      'Who was the audience, what did you present or align on, and what decision or next step came from it?',
    );
    expect(llmArgs.messages[0]?.content).toContain('What would make this believable: Audience seniority, what was presented, and the decision, alignment, or outcome that followed.');
  });
});

describe('POST /api/resume-v2/:sessionId/final-review-chat', () => {
  const VALID_FINAL_REVIEW_CHAT_BODY = {
    concern_id: 'concern-1',
    messages: [],
    context: {
      work_item_id: 'work-item-1',
      concern_type: 'missing_evidence',
      severity: 'critical',
      observation: 'Azure or GCP experience is not explicit.',
      why_it_hurts: 'This role expects direct multi-cloud credibility.',
      fix_strategy: 'Add one concrete example showing Azure or GCP delivery.',
      related_requirement: 'Experience with Azure or GCP',
      role_title: 'Cloud Architect',
      company_name: 'TargetCo',
      resume_excerpt: 'Built AWS infrastructure and reliability programs.',
    },
  } as const;

  beforeEach(() => {
    vi.clearAllMocks();

    const chain = buildSingleChain({
      data: { id: SESSION_ID, user_id: 'test-user-123' },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    mockParseJsonBodyWithLimit.mockResolvedValue({ ok: true, data: VALID_FINAL_REVIEW_CHAT_BODY });
    mockLlmChat.mockResolvedValue({
      text: '{"response":"Need one more detail.","current_question":"Where have you used Azure or GCP, what did you personally own, and what outcome came from that work?","follow_up_question":"Where have you used Azure or GCP, what did you personally own, and what outcome came from that work?","needs_candidate_input":true,"recommended_next_action":"answer_question"}',
    });
    mockRepairJSON.mockReturnValue({
      response: 'Need one more detail.',
      current_question: 'Where have you used Azure or GCP, what did you personally own, and what outcome came from that work?',
      follow_up_question: 'Where have you used Azure or GCP, what did you personally own, and what outcome came from that work?',
      needs_candidate_input: true,
      recommended_next_action: 'answer_question',
    });
  });

  it('seeds final review chat with a requirement-specific starter question when context lacks one', async () => {
    const res = await callApp(`/api/resume-v2/${SESSION_ID}/final-review-chat`, 'POST', VALID_FINAL_REVIEW_CHAT_BODY);

    expect(res.status).toBe(200);
    expect(mockLlmChat).toHaveBeenCalledOnce();

    const llmArgs = mockLlmChat.mock.calls[0]?.[0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const seededAssistant = JSON.parse(llmArgs.messages[1]?.content ?? '{}') as {
      current_question?: string;
      follow_up_question?: string;
      recommended_next_action?: string;
    };

    expect(seededAssistant.current_question).toBe(
      'Where have you used Azure or GCP, what did you personally own, and what outcome came from that work?',
    );
    expect(seededAssistant.follow_up_question).toBe(
      'Where have you used Azure or GCP, what did you personally own, and what outcome came from that work?',
    );
    expect(seededAssistant.recommended_next_action).toBe('answer_question');
    expect(llmArgs.messages[0]?.content).toContain('Work item: work-item-1');
  });

  it('uses the observation as the shared fallback subject when related_requirement is missing', async () => {
    mockParseJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      data: {
        ...VALID_FINAL_REVIEW_CHAT_BODY,
        context: {
          ...VALID_FINAL_REVIEW_CHAT_BODY.context,
          related_requirement: undefined,
          observation: 'ERP systems experience is not clearly evidenced.',
        },
      },
    });

    const res = await callApp(`/api/resume-v2/${SESSION_ID}/final-review-chat`, 'POST', {
      ...VALID_FINAL_REVIEW_CHAT_BODY,
      context: {
        ...VALID_FINAL_REVIEW_CHAT_BODY.context,
        related_requirement: undefined,
        observation: 'ERP systems experience is not clearly evidenced.',
      },
    });

    expect(res.status).toBe(200);

    const llmArgs = mockLlmChat.mock.calls[0]?.[0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const seededAssistant = JSON.parse(llmArgs.messages[1]?.content ?? '{}') as {
      current_question?: string;
      follow_up_question?: string;
    };

    expect(seededAssistant.current_question).toBe(
      'Where have you used ERP systems (SAP, Oracle, or similar), what did you personally own, and what outcome came from that work?',
    );
    expect(seededAssistant.follow_up_question).toBe(
      'Where have you used ERP systems (SAP, Oracle, or similar), what did you personally own, and what outcome came from that work?',
    );
  });
});
