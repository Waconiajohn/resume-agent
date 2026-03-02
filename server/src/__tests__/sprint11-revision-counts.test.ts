/**
 * Sprint 11, Story 1 — Persist Revision Counts in PipelineState
 *
 * Verifies that revision_counts is stored on PipelineState rather than in a
 * local Map inside subscribeToRevisionRequests. The key property this tests is
 * that the cap survives across multiple handler invocations because the counter
 * lives on the shared state object rather than in a closure-local variable.
 *
 * We test this by replaying the coordinator's revision-cap logic against a
 * shared PipelineState and confirming:
 *   1. The revision_counts field on state is incremented on each revision.
 *   2. The cap (MAX_REVISION_ROUNDS = 3) is enforced via state, not a local Map.
 *   3. A new handler instance sees the counts already recorded in state.
 *   4. Sections have independent counters on the same state object.
 *   5. state.revision_counts is initialized when absent (DB-restored sessions).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentBus } from '../agents/runtime/agent-bus.js';
import type { AgentMessage } from '../agents/runtime/agent-protocol.js';
import type { PipelineState, PipelineSSEEvent } from '../agents/types.js';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockRunAgentLoop = vi.hoisted(() => vi.fn());

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

vi.mock('../lib/llm.js', () => ({
  llm: { chat: vi.fn() },
  MODEL_LIGHT: 'mock-light',
  MODEL_PRIMARY: 'mock-primary',
  MODEL_MID: 'mock-mid',
  MODEL_ORCHESTRATOR: 'mock-orchestrator',
  MODEL_PRICING: {},
}));

vi.mock('../lib/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn().mockReturnThis() },
  createSessionLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../lib/sentry.js', () => ({
  captureError: vi.fn(),
}));

// ─── Constants (mirrors coordinator.ts) ──────────────────────────────────────

const MAX_REVISION_ROUNDS = 3;

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
        content: 'Cloud platform leader with 15 years experience.',
        keywords_used: [],
        requirements_addressed: [],
        evidence_ids_used: [],
      },
    },
    ...overrides,
  };
}

/**
 * Mirrors the state-backed revision-cap handler from coordinator.ts.
 *
 * Unlike the sprint5 test, which has its own local Map, this helper
 * reads and writes state.revision_counts directly — matching the
 * post-fix implementation in coordinator.ts.
 */
function buildStateBackedRevisionHandler(
  bus: AgentBus,
  state: PipelineState,
  emit: (event: PipelineSSEEvent) => void,
): void {
  // Initialize counts on state if absent (handles DB-restored sessions)
  if (!state.revision_counts) state.revision_counts = {};

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

    // Enforce cap via state.revision_counts (not a local Map)
    const withinCap = highPriority.filter((i) => {
      const count = state.revision_counts[i.target_section] ?? 0;
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

    // Persist increments to state
    for (const i of withinCap) {
      state.revision_counts[i.target_section] = (state.revision_counts[i.target_section] ?? 0) + 1;
    }

    emit({ type: 'revision_start', instructions: withinCap });

    await mockRunAgentLoop({});
  };

  bus.subscribe('craftsman', (msg) => void handler(msg));
}

function sendRevisionRequest(bus: AgentBus, section: string): void {
  bus.send({
    from: 'producer',
    to: 'craftsman',
    type: 'request',
    domain: 'resume',
    payload: {
      revision_instructions: [
        {
          target_section: section,
          issue: 'Quality issue detected',
          instruction: 'Improve this section',
          priority: 'high',
        },
      ],
    },
  });
}

/** Flush all microtasks so async bus handlers complete. */
function flushAsync(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Story 1 — revision_counts persisted in PipelineState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunAgentLoop.mockResolvedValue({
      scratchpad: {},
      messages_out: [],
      usage: { input_tokens: 0, output_tokens: 0 },
      rounds_used: 1,
    });
  });

  it('state.revision_counts starts at {} on a fresh pipeline', () => {
    const state = makePipelineState();
    expect(state.revision_counts).toEqual({});
  });

  it('increments state.revision_counts[section] after each revision', async () => {
    const bus = new AgentBus();
    const state = makePipelineState();
    const emitted: PipelineSSEEvent[] = [];

    buildStateBackedRevisionHandler(bus, state, (e) => emitted.push(e));

    sendRevisionRequest(bus, 'summary');
    await flushAsync();

    expect(state.revision_counts['summary']).toBe(1);
  });

  it('increments state.revision_counts across multiple rounds', async () => {
    const bus = new AgentBus();
    const state = makePipelineState();
    const emitted: PipelineSSEEvent[] = [];

    buildStateBackedRevisionHandler(bus, state, (e) => emitted.push(e));

    sendRevisionRequest(bus, 'summary');
    await flushAsync();
    sendRevisionRequest(bus, 'summary');
    await flushAsync();
    sendRevisionRequest(bus, 'summary');
    await flushAsync();

    expect(state.revision_counts['summary']).toBe(3);
    expect(mockRunAgentLoop).toHaveBeenCalledTimes(3);
  });

  it('enforces the cap at MAX_REVISION_ROUNDS via state (4th request is blocked)', async () => {
    const bus = new AgentBus();
    const state = makePipelineState();
    const emitted: PipelineSSEEvent[] = [];

    buildStateBackedRevisionHandler(bus, state, (e) => emitted.push(e));

    // Exhaust cap
    for (let i = 0; i < MAX_REVISION_ROUNDS; i++) {
      sendRevisionRequest(bus, 'summary');
      await flushAsync();
    }

    // 4th should be blocked — counter should not exceed 3
    sendRevisionRequest(bus, 'summary');
    await flushAsync();

    expect(mockRunAgentLoop).toHaveBeenCalledTimes(MAX_REVISION_ROUNDS);
    expect(state.revision_counts['summary']).toBe(MAX_REVISION_ROUNDS);
  });

  it('emits a transparency event when the cap is reached via state', async () => {
    const bus = new AgentBus();
    const state = makePipelineState();
    const emitted: PipelineSSEEvent[] = [];

    buildStateBackedRevisionHandler(bus, state, (e) => emitted.push(e));

    // Exhaust cap then trigger it
    for (let i = 0; i < MAX_REVISION_ROUNDS + 1; i++) {
      sendRevisionRequest(bus, 'experience');
      await flushAsync();
    }

    const capEvents = emitted.filter(
      (e) =>
        e.type === 'transparency' &&
        'message' in e &&
        typeof e.message === 'string' &&
        e.message.includes('cap'),
    );
    expect(capEvents.length).toBeGreaterThan(0);
  });

  it('a new handler instance sees counts already on state — cap cannot be bypassed by re-creation', async () => {
    const bus = new AgentBus();
    const state = makePipelineState();
    const emitted: PipelineSSEEvent[] = [];

    // First handler instance — exhaust the cap
    buildStateBackedRevisionHandler(bus, state, (e) => emitted.push(e));
    for (let i = 0; i < MAX_REVISION_ROUNDS; i++) {
      sendRevisionRequest(bus, 'summary');
      await flushAsync();
    }
    bus.unsubscribe('craftsman');

    const callsAfterFirstHandler = mockRunAgentLoop.mock.calls.length;
    expect(callsAfterFirstHandler).toBe(MAX_REVISION_ROUNDS);

    // Second handler instance on the SAME state — cap is already at 3 in state
    buildStateBackedRevisionHandler(bus, state, (e) => emitted.push(e));
    sendRevisionRequest(bus, 'summary');
    await flushAsync();

    // No additional calls — the cap is read from state, not a fresh local Map
    expect(mockRunAgentLoop).toHaveBeenCalledTimes(MAX_REVISION_ROUNDS);
  });

  it('tracks revision counts independently per section on the same state object', async () => {
    const bus = new AgentBus();
    const state = makePipelineState();
    const emitted: PipelineSSEEvent[] = [];

    buildStateBackedRevisionHandler(bus, state, (e) => emitted.push(e));

    // Exhaust cap for 'summary'
    for (let i = 0; i < MAX_REVISION_ROUNDS; i++) {
      sendRevisionRequest(bus, 'summary');
      await flushAsync();
    }

    // 'skills' has its own independent counter — all 3 rounds allowed
    for (let i = 0; i < MAX_REVISION_ROUNDS; i++) {
      sendRevisionRequest(bus, 'skills');
      await flushAsync();
    }

    expect(state.revision_counts['summary']).toBe(MAX_REVISION_ROUNDS);
    expect(state.revision_counts['skills']).toBe(MAX_REVISION_ROUNDS);
    // 3 for summary + 3 for skills = 6 total
    expect(mockRunAgentLoop).toHaveBeenCalledTimes(6);
  });

  it('initializes revision_counts when it is absent (DB-restored session without the field)', () => {
    // Simulate a session restored from the DB before this field existed
    const legacyState = makePipelineState() as Omit<PipelineState, 'revision_counts'> & {
      revision_counts?: Record<string, number>;
    };
    delete legacyState.revision_counts;

    const bus = new AgentBus();
    const emitted: PipelineSSEEvent[] = [];

    // Should not throw; initializes revision_counts on state
    expect(() =>
      buildStateBackedRevisionHandler(bus, legacyState as PipelineState, (e) => emitted.push(e)),
    ).not.toThrow();

    expect((legacyState as PipelineState).revision_counts).toEqual({});
  });
});
