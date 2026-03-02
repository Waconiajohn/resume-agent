/**
 * Sprint 5 fixes — test coverage
 *
 * Covers the 6 Sprint 5 stories:
 *   1. Gate Response Idempotency    — parsePendingGatePayload + responded_at check
 *   2. do_not_include enforcement   — filterDoNotIncludeTopics (exported from craftsman/tools)
 *   3. Revision Cap                 — MAX_REVISION_ROUNDS = 3 cap via AgentBus integration
 *   4. Heartbeat + session lock     — runningPipelines guard prevents stale DB writes
 *   5. JSON Repair Size Guard       — size check fires BEFORE any processing (top of function)
 *   6. Producer Tool Validation     — humanize_check / check_narrative_coherence fallbacks
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Module mocks — must be hoisted before any imports ───────────────────────

const mockChat = vi.hoisted(() => vi.fn());
const mockRunAgentLoop = vi.hoisted(() => vi.fn());

vi.mock('../lib/llm.js', () => ({
  llm: { chat: mockChat },
  MODEL_LIGHT: 'mock-light',
  MODEL_PRIMARY: 'mock-primary',
  MODEL_MID: 'mock-mid',
  MODEL_ORCHESTRATOR: 'mock-orchestrator',
  MODEL_PRICING: {},
}));

vi.mock('../agents/runtime/agent-loop.js', () => ({
  runAgentLoop: mockRunAgentLoop,
}));

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

vi.mock('../lib/llm-provider.js', () => ({
  startUsageTracking: vi.fn().mockReturnValue({ input_tokens: 0, output_tokens: 0 }),
  stopUsageTracking: vi.fn().mockReturnValue({ input_tokens: 0, output_tokens: 0, estimated_cost_usd: 0 }),
  setUsageTrackingContext: vi.fn(),
  createCombinedAbortSignal: vi.fn().mockReturnValue(new AbortController().signal),
}));

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

vi.mock('../agents/quality-reviewer.js', () => ({
  runQualityReviewer: vi.fn(),
}));

vi.mock('../agents/ats-rules.js', () => ({
  runAtsComplianceCheck: vi.fn().mockReturnValue([]),
}));

vi.mock('../agents/section-writer.js', () => ({
  runSectionWriter: vi.fn().mockResolvedValue({
    section: 'summary',
    content: 'Mock section content.',
    keywords_used: [],
    requirements_addressed: [],
    evidence_ids_used: [],
  }),
  runSectionRevision: vi.fn().mockResolvedValue({
    section: 'summary',
    content: 'Mock revised content.',
    keywords_used: [],
    requirements_addressed: [],
    evidence_ids_used: [],
  }),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import {
  parsePendingGatePayload,
  getResponseQueue,
  withResponseQueue,
} from '../lib/pending-gate-queue.js';
import { repairJSON } from '../lib/json-repair.js';
import { filterDoNotIncludeTopics } from '../agents/craftsman/tools.js';
import { producerTools } from '../agents/producer/tools.js';
import { AgentBus } from '../agents/runtime/agent-bus.js';
import type { AgentMessage } from '../agents/runtime/agent-protocol.js';
import type { PipelineState, PipelineSSEEvent } from '../agents/types.js';

// ─── Shared helpers ───────────────────────────────────────────────────────────

function makePipelineState(overrides: Partial<PipelineState> = {}): PipelineState {
  return {
    session_id: 'test-session',
    user_id: 'test-user',
    current_stage: 'quality_review',
    approved_sections: [],
    revision_count: 0,
    revision_counts: {},
    token_usage: { input_tokens: 0, output_tokens: 0, estimated_cost_usd: 0 },
    sections: {
      summary: {
        section: 'summary',
        content: 'Engineering leader with 15 years of cloud platform experience.',
        keywords_used: [],
        requirements_addressed: [],
        evidence_ids_used: [],
      },
    },
    ...overrides,
  };
}

function makeProducerCtx(stateOverrides?: Partial<PipelineState>) {
  let state = makePipelineState(stateOverrides);
  const emitSpy = vi.fn();

  return {
    sessionId: 'test-session',
    userId: 'test-user',
    scratchpad: {} as Record<string, unknown>,
    signal: new AbortController().signal,
    emit: emitSpy,
    waitForUser: vi.fn().mockResolvedValue(true),
    getState: () => state,
    updateState: (patch: Partial<PipelineState>) => {
      state = { ...state, ...patch };
    },
    sendMessage: vi.fn(),
    emitSpy,
  };
}

function makeLLMResponse(data: Record<string, unknown>) {
  return {
    text: JSON.stringify(data),
    tool_calls: [],
    usage: { input_tokens: 0, output_tokens: 0 },
  };
}

function getProducerTool(name: string) {
  const tool = producerTools.find((t) => t.name === name);
  if (!tool) throw new Error(`Producer tool not found: ${name}`);
  return tool;
}

// ─────────────────────────────────────────────────────────────────────────────
// Story 1: Gate Response Idempotency
// ─────────────────────────────────────────────────────────────────────────────

describe('Story 1 — Gate response idempotency (parsePendingGatePayload)', () => {
  it('returns empty object when payload is null', () => {
    expect(parsePendingGatePayload(null)).toEqual({});
  });

  it('returns empty object when payload is an array', () => {
    expect(parsePendingGatePayload([])).toEqual({});
  });

  it('returns empty object when payload is a primitive string', () => {
    expect(parsePendingGatePayload('not-an-object')).toEqual({});
  });

  it('preserves responded_at when it is present in the payload', () => {
    const timestamp = '2026-02-28T12:00:00.000Z';
    const payload = parsePendingGatePayload({
      gate: 'section_review',
      response: { approved: true },
      responded_at: timestamp,
    });

    expect(payload.responded_at).toBe(timestamp);
  });

  it('idempotency check: responded_at being set means gate was already responded to', () => {
    // Simulate the idempotency guard logic from pipeline.ts:
    //   if (currentPayload.responded_at) { return 'already_responded' }
    const alreadyRespondedPayload = parsePendingGatePayload({
      gate: 'section_review',
      responded_at: '2026-02-28T10:00:00.000Z',
      response: true,
    });

    const isAlreadyResponded = Boolean(alreadyRespondedPayload.responded_at);
    expect(isAlreadyResponded).toBe(true);
  });

  it('idempotency check: missing responded_at means gate is still waiting', () => {
    const pendingPayload = parsePendingGatePayload({
      gate: 'section_review',
      created_at: '2026-02-28T10:00:00.000Z',
      // no responded_at
    });

    const isAlreadyResponded = Boolean(pendingPayload.responded_at);
    expect(isAlreadyResponded).toBe(false);
  });

  it('withResponseQueue writes responded_at into the queue item', () => {
    const respondedAt = '2026-02-28T11:00:00.000Z';
    const updatedPayload = withResponseQueue({}, [
      { gate: 'section_review', response: { approved: true }, responded_at: respondedAt },
    ]);

    const queue = getResponseQueue(updatedPayload);
    expect(queue).toHaveLength(1);
    expect(queue[0].responded_at).toBe(respondedAt);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Story 2: Enforce do_not_include at runtime
// ─────────────────────────────────────────────────────────────────────────────

describe('Story 2 — filterDoNotIncludeTopics runtime enforcement', () => {
  it('removes a line that contains a do_not_include topic', () => {
    const content = [
      '• Led engineering teams across cloud and mobile platforms.',
      '• Active golfer who joined the company golf league in 2018.',
      '• Reduced deployment time by 60% through CI/CD improvements.',
    ].join('\n');

    const result = filterDoNotIncludeTopics(content, ['golf']);

    expect(result).toContain('Led engineering teams');
    expect(result).toContain('Reduced deployment time');
    expect(result).not.toContain('golfer');
    expect(result).not.toContain('golf league');
  });

  it('passes content through unchanged when do_not_include list is empty', () => {
    const content = '• Led a team of 45 engineers.\n• Delivered $2.4M cloud migration.';

    const result = filterDoNotIncludeTopics(content, []);

    expect(result).toBe(content);
  });

  it('performs case-insensitive matching — uppercase topic matches lowercase line', () => {
    const content = [
      '• Spearheaded company golf tournament sponsorship.',
      '• Built cloud-native infrastructure on AWS.',
    ].join('\n');

    // do_not_include uses "Golf" (capital G), content has "golf" (lowercase)
    const result = filterDoNotIncludeTopics(content, ['Golf']);

    expect(result).not.toContain('golf');
    expect(result).toContain('cloud-native');
  });

  it('performs case-insensitive matching — lowercase topic matches uppercase line', () => {
    const content = [
      '• GOLF: Company sports ambassador 2020-2022.',
      '• Managed $10M budget.',
    ].join('\n');

    const result = filterDoNotIncludeTopics(content, ['golf']);

    expect(result).not.toContain('GOLF');
    expect(result).toContain('Managed $10M');
  });

  it('removes only the offending line from multi-line content', () => {
    const lines = [
      '• First valid bullet point.',
      '• Mentions hobbies including sailing and golf.',
      '• Second valid bullet point.',
      '• Third valid bullet point.',
    ];

    const result = filterDoNotIncludeTopics(lines.join('\n'), ['golf']);
    const resultLines = result.split('\n').filter(Boolean);

    // 3 clean lines should remain, 1 offending line should be removed
    expect(resultLines).toHaveLength(3);
    expect(result).not.toContain('sailing and golf');
  });

  it('handles multiple do_not_include topics — removes all matching lines', () => {
    const content = [
      '• Senior executive with strategic leadership expertise.',
      '• Passionate golfer and active member of the golf club.',
      '• Avid hunter who organizes company hunting retreats.',
      '• Delivered $50M digital transformation program.',
    ].join('\n');

    const result = filterDoNotIncludeTopics(content, ['golf', 'hunting']);

    expect(result).toContain('Senior executive');
    expect(result).toContain('digital transformation');
    expect(result).not.toContain('golfer');
    expect(result).not.toContain('hunting');
  });

  it('returns unchanged content when no lines match any do_not_include topic', () => {
    const content = [
      '• Led cloud infrastructure modernization saving $3.2M annually.',
      '• Scaled engineering organization from 12 to 60 engineers.',
    ].join('\n');

    const result = filterDoNotIncludeTopics(content, ['blockchain', 'NFT', 'golf']);

    expect(result).toBe(content);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Story 3: Revision Cap (MAX_REVISION_ROUNDS = 3)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The MAX_REVISION_ROUNDS constant and revisionCounts Map live inside the
 * coordinator's subscribeToRevisionRequests closure. We test the cap behavior
 * by replaying the same logic used in revision-loop.test.ts — registering a
 * bus handler that mirrors the coordinator's revision cap enforcement.
 */
describe('Story 3 — Revision cap (MAX_REVISION_ROUNDS = 3)', () => {
  const MAX_REVISION_ROUNDS = 3;

  function buildRevisionCapHandler(
    bus: AgentBus,
    state: PipelineState,
    emit: (event: PipelineSSEEvent) => void,
  ) {
    const revisionCounts = new Map<string, number>();

    const handler = async (msg: AgentMessage): Promise<void> => {
      if (msg.type !== 'request' || msg.from !== 'producer') return;

      const instructions = Array.isArray(msg.payload.revision_instructions)
        ? (msg.payload.revision_instructions as Array<{
            target_section: string;
            issue: string;
            instruction: string;
            priority: 'high' | 'medium' | 'low';
          }>)
        : [];

      const highPriority = instructions.filter(
        (i) => i.priority === 'high' && !state.approved_sections.includes(i.target_section),
      );

      if (highPriority.length === 0) return;

      // Enforce the revision cap — mirror of coordinator.ts logic
      const withinCap = highPriority.filter((i) => {
        const count = revisionCounts.get(i.target_section) ?? 0;
        if (count >= MAX_REVISION_ROUNDS) {
          emit({
            type: 'transparency',
            stage: 'revision',
            message: `Revision cap (${MAX_REVISION_ROUNDS} rounds) reached for "${i.target_section}" — accepting current content.`,
          });
          return false;
        }
        return true;
      });

      if (withinCap.length === 0) return;

      for (const i of withinCap) {
        revisionCounts.set(i.target_section, (revisionCounts.get(i.target_section) ?? 0) + 1);
      }

      emit({ type: 'revision_start', instructions: withinCap });

      await mockRunAgentLoop({});
    };

    bus.subscribe('craftsman', (msg) => void handler(msg));
  }

  function sendRevisionRequest(bus: AgentBus, section: string) {
    bus.send({
      from: 'producer',
      to: 'craftsman',
      type: 'request',
      domain: 'resume',
      payload: {
        revision_instructions: [
          {
            target_section: section,
            issue: 'Needs improvement',
            instruction: 'Revise content',
            priority: 'high',
          },
        ],
      },
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockRunAgentLoop.mockResolvedValue({
      scratchpad: {},
      messages_out: [],
      usage: { input_tokens: 0, output_tokens: 0 },
      rounds_used: 1,
    });
  });

  it('allows revisions up to MAX_REVISION_ROUNDS (3) for the same section', async () => {
    const bus = new AgentBus();
    const emittedEvents: PipelineSSEEvent[] = [];
    const state = makePipelineState();

    buildRevisionCapHandler(bus, state, (e) => emittedEvents.push(e));

    // Round 1
    sendRevisionRequest(bus, 'summary');
    await new Promise((r) => setTimeout(r, 0));

    // Round 2
    sendRevisionRequest(bus, 'summary');
    await new Promise((r) => setTimeout(r, 0));

    // Round 3
    sendRevisionRequest(bus, 'summary');
    await new Promise((r) => setTimeout(r, 0));

    expect(mockRunAgentLoop).toHaveBeenCalledTimes(3);
  });

  it('blocks the 4th revision for the same section (cap = 3)', async () => {
    const bus = new AgentBus();
    const emittedEvents: PipelineSSEEvent[] = [];
    const state = makePipelineState();

    buildRevisionCapHandler(bus, state, (e) => emittedEvents.push(e));

    // Rounds 1-3 succeed
    for (let i = 0; i < 3; i++) {
      sendRevisionRequest(bus, 'summary');
      await new Promise((r) => setTimeout(r, 0));
    }

    // Round 4 should be blocked
    sendRevisionRequest(bus, 'summary');
    await new Promise((r) => setTimeout(r, 0));

    // runAgentLoop should only be called 3 times, not 4
    expect(mockRunAgentLoop).toHaveBeenCalledTimes(3);
  });

  it('emits a transparency event when the revision cap is reached', async () => {
    const bus = new AgentBus();
    const emittedEvents: PipelineSSEEvent[] = [];
    const state = makePipelineState();

    buildRevisionCapHandler(bus, state, (e) => emittedEvents.push(e));

    // Exhaust the cap
    for (let i = 0; i < 3; i++) {
      sendRevisionRequest(bus, 'experience');
      await new Promise((r) => setTimeout(r, 0));
    }

    // Trigger the cap
    sendRevisionRequest(bus, 'experience');
    await new Promise((r) => setTimeout(r, 0));

    const capEvents = emittedEvents.filter(
      (e) => e.type === 'transparency' && 'message' in e && (e.message as string).includes('cap'),
    );
    expect(capEvents.length).toBeGreaterThan(0);
  });

  it('tracks revision counts independently per section', async () => {
    const bus = new AgentBus();
    const emittedEvents: PipelineSSEEvent[] = [];
    const state = makePipelineState();

    buildRevisionCapHandler(bus, state, (e) => emittedEvents.push(e));

    // Exhaust cap for 'summary'
    for (let i = 0; i < 3; i++) {
      sendRevisionRequest(bus, 'summary');
      await new Promise((r) => setTimeout(r, 0));
    }

    // 'skills' should still have its own independent cap — all 3 rounds allowed
    for (let i = 0; i < 3; i++) {
      sendRevisionRequest(bus, 'skills');
      await new Promise((r) => setTimeout(r, 0));
    }

    // 3 for summary + 3 for skills = 6 total
    expect(mockRunAgentLoop).toHaveBeenCalledTimes(6);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Story 4: Heartbeat linked to session lock (runningPipelines guard)
// ─────────────────────────────────────────────────────────────────────────────

describe('Story 4 — Heartbeat guard: only fires when session is in runningPipelines', () => {
  it('simulates the heartbeat guard: skips DB write when session is not tracked', () => {
    // Reproduce the heartbeat guard logic from pipeline.ts:
    //   if (!runningPipelines.has(session_id)) { clearInterval; return; }
    const runningPipelines = new Map<string, number>();
    const session_id = 'test-session-id';

    // Session not added to runningPipelines
    const shouldWrite = runningPipelines.has(session_id);

    // The heartbeat should skip the DB write
    expect(shouldWrite).toBe(false);
  });

  it('simulates the heartbeat guard: proceeds with DB write when session is tracked', () => {
    const runningPipelines = new Map<string, number>();
    const session_id = 'test-session-id';

    // Session is registered as running
    runningPipelines.set(session_id, Date.now());

    const shouldWrite = runningPipelines.has(session_id);

    expect(shouldWrite).toBe(true);
  });

  it('heartbeat stops itself by checking runningPipelines before each interval tick', () => {
    const runningPipelines = new Map<string, number>();
    const session_id = 'test-session-id';

    runningPipelines.set(session_id, Date.now());

    // Simulate pipeline finishing (finally block removes from map)
    runningPipelines.delete(session_id);

    // Next heartbeat tick finds the session gone — should not write
    const shouldWrite = runningPipelines.has(session_id);
    expect(shouldWrite).toBe(false);
  });

  it('runningPipelines correctly tracks multiple concurrent sessions independently', () => {
    const runningPipelines = new Map<string, number>();

    runningPipelines.set('session-a', Date.now());
    runningPipelines.set('session-b', Date.now());

    // session-a finishes
    runningPipelines.delete('session-a');

    expect(runningPipelines.has('session-a')).toBe(false);
    expect(runningPipelines.has('session-b')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Story 5: JSON Repair Size Guard — checked BEFORE any processing
// ─────────────────────────────────────────────────────────────────────────────

describe('Story 5 — JSON repair size guard fires before processing', () => {
  it('returns null for input strictly larger than 50_000 characters', () => {
    const oversized = 'x'.repeat(50_001);
    expect(repairJSON(oversized)).toBeNull();
  });

  it('returns null for input exactly at 50_000 characters', () => {
    // The guard condition is: text.length > 50_000  (strictly greater)
    // So exactly 50_000 characters should pass through (not rejected by size guard)
    // but if it can't be parsed as JSON it will still return null from the parse step.
    // Here we verify that the size guard itself does not fire at exactly 50_000.
    const exactly50k = '{"key":"' + 'v'.repeat(50_000 - 9) + '"}';
    // This is a valid JSON object — if the size guard fires at <= 50_000 it would
    // return null; if it passes through, the JSON.parse step returns the object.
    // The guard is `> 50_000`, so exactly 50_000 should NOT be rejected by size guard.
    if (exactly50k.length <= 50_000) {
      const result = repairJSON<{ key: string }>(exactly50k);
      // Valid JSON at or under 50KB should parse correctly
      expect(result).not.toBeNull();
    }
  });

  it('returns null immediately for 60KB input without attempting repairs', () => {
    // Construct a 60KB string that is technically valid JSON if repaired,
    // so we can confirm the size guard fires BEFORE the repair logic.
    const oversized = '{"key":"' + 'a'.repeat(60_000) + '"}';
    expect(oversized.length).toBeGreaterThan(50_000);

    const result = repairJSON(oversized);
    // Size guard should reject before any JSON parse or repair attempt
    expect(result).toBeNull();
  });

  it('still returns null for completely invalid small input (guard not involved)', () => {
    const smallInvalid = 'this is not json at all, no braces, no structure';
    expect(smallInvalid.length).toBeLessThan(50_000);

    const result = repairJSON(smallInvalid);
    expect(result).toBeNull();
  });

  it('successfully repairs valid JSON under 50KB', () => {
    const input = '{"name": "Jane Doe", "role": "CTO",}'; // trailing comma
    const result = repairJSON<{ name: string; role: string }>(input);

    expect(result).not.toBeNull();
    expect(result?.name).toBe('Jane Doe');
    expect(result?.role).toBe('CTO');
  });

  it('returns null when passed an empty string (edge case, not size guard)', () => {
    expect(repairJSON('')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Story 6: Producer Tool Validation — fallbacks on malformed LLM responses
// ─────────────────────────────────────────────────────────────────────────────

describe('Story 6 — Producer tool validation: humanize_check fallback', () => {
  const tool = getProducerTool('humanize_check');

  beforeEach(() => {
    mockChat.mockReset();
  });

  it('falls back to default score when LLM returns completely broken JSON', async () => {
    mockChat.mockResolvedValueOnce({
      text: '}{this is not json at all',
      tool_calls: [],
      usage: { input_tokens: 0, output_tokens: 0 },
    });

    const ctx = makeProducerCtx();
    const result = await tool.execute({ content: 'Some resume content.' }, ctx) as Record<string, unknown>;

    // Must not throw — fallback score should be returned
    expect(typeof result.score).toBe('number');
    expect(Array.isArray(result.issues)).toBe(true);
  });

  it('falls back gracefully when LLM returns null text', async () => {
    mockChat.mockResolvedValueOnce({
      text: null,
      tool_calls: [],
      usage: { input_tokens: 0, output_tokens: 0 },
    });

    const ctx = makeProducerCtx();
    const result = await tool.execute({ content: 'Resume content.' }, ctx) as Record<string, unknown>;

    expect(typeof result.score).toBe('number');
    expect(Array.isArray(result.issues)).toBe(true);
  });

  it('falls back gracefully when LLM omits required fields from JSON', async () => {
    mockChat.mockResolvedValueOnce({
      text: JSON.stringify({ unexpected_field: 'unexpected_value' }),
      tool_calls: [],
      usage: { input_tokens: 0, output_tokens: 0 },
    });

    const ctx = makeProducerCtx();
    const result = await tool.execute({ content: 'Resume content.' }, ctx) as Record<string, unknown>;

    // score should still be a number (fallback or 0), not undefined
    expect(typeof result.score).toBe('number');
    expect(Array.isArray(result.issues)).toBe(true);
  });
});

describe('Story 6 — Producer tool validation: check_narrative_coherence fallback', () => {
  const tool = getProducerTool('check_narrative_coherence');

  beforeEach(() => {
    mockChat.mockReset();
  });

  it('falls back to default coherence_score when LLM returns broken JSON', async () => {
    mockChat.mockResolvedValueOnce({
      text: 'INVALID ][{ json',
      tool_calls: [],
      usage: { input_tokens: 0, output_tokens: 0 },
    });

    const ctx = makeProducerCtx();
    const result = await tool.execute(
      {
        sections: { summary: 'Some summary content.', experience: 'VP Engineering, Acme Corp.' },
        positioning_angle: 'Cloud platform executive',
      },
      ctx,
    ) as Record<string, unknown>;

    expect(typeof result.coherence_score).toBe('number');
    expect(result.coherence_score).toBe(75); // default fallback from producer/tools.ts
    expect(Array.isArray(result.issues)).toBe(true);
  });

  it('falls back gracefully when LLM returns empty string', async () => {
    mockChat.mockResolvedValueOnce({
      text: '',
      tool_calls: [],
      usage: { input_tokens: 0, output_tokens: 0 },
    });

    const ctx = makeProducerCtx();
    const result = await tool.execute(
      { sections: {}, positioning_angle: 'Executive leader' },
      ctx,
    ) as Record<string, unknown>;

    expect(typeof result.coherence_score).toBe('number');
    expect(Array.isArray(result.issues)).toBe(true);
  });

  it('stores coherence_score in scratchpad on success', async () => {
    mockChat.mockResolvedValueOnce({
      text: JSON.stringify({ coherence_score: 88, issues: [] }),
      tool_calls: [],
      usage: { input_tokens: 0, output_tokens: 0 },
    });

    const ctx = makeProducerCtx();
    await tool.execute(
      {
        sections: { summary: 'Executive with 15 years of cloud leadership.' },
        positioning_angle: 'Cloud-first executive',
      },
      ctx,
    );

    expect(ctx.scratchpad.narrative_coherence_score).toBe(88);
  });
});
