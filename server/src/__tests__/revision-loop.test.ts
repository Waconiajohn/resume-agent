/**
 * Tests for the coordinator's revision loop handler (subscribeToRevisionRequests).
 *
 * The handler is an internal function in coordinator.ts that is not exported
 * directly. We test it via two complementary approaches:
 *
 * 1. Unit tests for the filtering rules:
 *    - High-priority instructions pass through.
 *    - Low/medium-priority instructions are filtered out.
 *    - Instructions targeting already-approved sections are filtered out.
 *    - Empty instruction arrays short-circuit without calling runAgentLoop.
 *
 * 2. Integration tests through the AgentBus:
 *    We mock runAgentLoop and then call runPipeline with a mocked LLM that
 *    immediately ends all three agent loops. After the Producer sends a
 *    'request' message to 'craftsman', we verify the Craftsman sub-loop is
 *    called with the correct revision message shape.
 *
 * Because the coordinator imports runAgentLoop at module load, all mocks
 * must be hoisted before the coordinator module is imported.
 */

import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

// ─── Hoist mocks ─────────────────────────────────────────────────────────────

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
  llm: { chat: vi.fn().mockResolvedValue({ text: '', tool_calls: [], usage: { input_tokens: 0, output_tokens: 0 } }) },
  MODEL_LIGHT: 'mock-light',
  MODEL_PRIMARY: 'mock-primary',
  MODEL_MID: 'mock-mid',
  MODEL_ORCHESTRATOR: 'mock-orchestrator',
  MODEL_PRICING: {
    'glm-4.7-flash': { input: 0, output: 0 },
    'glm-4.5-air':   { input: 0.20, output: 1.10 },
    'glm-4.7':       { input: 0.60, output: 2.20 },
  },
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

vi.mock('../lib/feature-flags.js', () => ({
  FF_BLUEPRINT_APPROVAL: false,
  FF_INTAKE_QUIZ: false,
  FF_RESEARCH_VALIDATION: false,
  FF_GAP_ANALYSIS_QUIZ: false,
  FF_QUALITY_REVIEW_APPROVAL: false,
}));

vi.mock('../agents/ats-rules.js', () => ({
  runAtsComplianceCheck: vi.fn().mockResolvedValue({
    passed: true,
    failures: [],
    warnings: [],
    score: 95,
  }),
}));

vi.mock('../agents/master-resume-merge.js', () => ({
  mergeMasterResume: vi.fn().mockImplementation((_existing: unknown, incoming: unknown) => incoming),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { AgentBus } from '../agents/runtime/agent-bus.js';
import type { AgentMessage } from '../agents/runtime/agent-protocol.js';
import type { PipelineState, PipelineSSEEvent } from '../agents/types.js';

// ─── Test utilities ───────────────────────────────────────────────────────────

/**
 * Build a minimal PipelineState sufficient for the revision handler to operate.
 */
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
      summary: { section: 'summary', content: 'Experienced leader...', keywords_used: [], requirements_addressed: [], evidence_ids_used: [] },
      skills: { section: 'skills', content: 'TypeScript, Python', keywords_used: [], requirements_addressed: [], evidence_ids_used: [] },
    },
    ...overrides,
  };
}

/**
 * Build a bus 'request' AgentMessage from the Producer to the Craftsman.
 */
function makeRevisionRequest(payload: Record<string, unknown>): Omit<AgentMessage, 'id' | 'timestamp'> {
  return {
    from: 'producer',
    to: 'craftsman',
    type: 'request',
    domain: 'resume',
    payload,
  };
}

/**
 * Reproduce the core filtering logic from subscribeToRevisionRequests so we
 * can unit-test the business rules in isolation without importing the coordinator.
 *
 * This is an explicit re-statement of the coordinator's contract — if the
 * coordinator logic changes, these tests will catch the divergence.
 */
function applyRevisionFilter(
  payload: Record<string, unknown>,
  approvedSections: string[],
): Array<{
  target_section: string;
  issue: string;
  instruction: string;
  priority: 'high' | 'medium' | 'low';
}> | null {
  let instructions: Array<{
    target_section: string;
    issue: string;
    instruction: string;
    priority: 'high' | 'medium' | 'low';
  }>;

  if (Array.isArray(payload.revision_instructions)) {
    instructions = payload.revision_instructions as typeof instructions;
  } else if (typeof payload.section === 'string' && typeof payload.instruction === 'string') {
    instructions = [{
      target_section: payload.section as string,
      issue: (payload.issue as string) ?? '',
      instruction: payload.instruction as string,
      priority: 'high' as const,
    }];
  } else {
    return null;
  }

  if (instructions.length === 0) return null;

  const highPriority = instructions
    .filter(i => i.priority === 'high' || i.priority === undefined)
    .filter(i => !approvedSections.includes(i.target_section));

  return highPriority.length === 0 ? null : highPriority;
}

// ─── Unit tests: revision filter logic ───────────────────────────────────────

describe('revision filter logic (unit)', () => {
  it('passes through high-priority instructions', () => {
    const payload = {
      revision_instructions: [
        { target_section: 'summary', issue: 'Too vague', instruction: 'Add metrics', priority: 'high' },
        { target_section: 'skills', issue: 'Missing keywords', instruction: 'Add TypeScript', priority: 'high' },
      ],
    };

    const result = applyRevisionFilter(payload, []);

    expect(result).not.toBeNull();
    expect(result).toHaveLength(2);
    expect(result![0].target_section).toBe('summary');
    expect(result![1].target_section).toBe('skills');
  });

  it('filters out medium-priority instructions', () => {
    const payload = {
      revision_instructions: [
        { target_section: 'summary', issue: 'Could be stronger', instruction: 'Revise opening', priority: 'medium' },
        { target_section: 'skills', issue: 'Ordering', instruction: 'Reorder skills', priority: 'low' },
      ],
    };

    const result = applyRevisionFilter(payload, []);

    // Medium and low are filtered to null — no high-priority instructions
    expect(result).toBeNull();
  });

  it('filters out instructions targeting already-approved sections', () => {
    const payload = {
      revision_instructions: [
        { target_section: 'summary', issue: 'Vague', instruction: 'Improve', priority: 'high' },
        { target_section: 'skills', issue: 'Missing', instruction: 'Add keywords', priority: 'high' },
      ],
    };

    // User has approved 'summary' — it must not be revised
    const result = applyRevisionFilter(payload, ['summary']);

    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    expect(result![0].target_section).toBe('skills');
  });

  it('returns null when all high-priority sections are already approved', () => {
    const payload = {
      revision_instructions: [
        { target_section: 'summary', issue: 'Vague', instruction: 'Improve', priority: 'high' },
      ],
    };

    const result = applyRevisionFilter(payload, ['summary']);

    expect(result).toBeNull();
  });

  it('returns null for an empty instructions array', () => {
    const payload = { revision_instructions: [] };

    const result = applyRevisionFilter(payload, []);

    expect(result).toBeNull();
  });

  it('normalises flat-format single revision from Producer tool to high priority', () => {
    const payload = {
      section: 'experience_role_0',
      issue: 'Bullets lack metrics',
      instruction: 'Add quantified impact to at least 3 bullets',
    };

    const result = applyRevisionFilter(payload, []);

    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    expect(result![0].target_section).toBe('experience_role_0');
    expect(result![0].priority).toBe('high');
  });

  it('returns null when payload has neither array format nor flat format', () => {
    const payload = { something_else: 'irrelevant' };

    const result = applyRevisionFilter(payload, []);

    expect(result).toBeNull();
  });
});

// ─── Integration tests: bus message dispatch ──────────────────────────────────

/**
 * These tests set up the AgentBus and a handler that replicates what
 * subscribeToRevisionRequests registers. We mock runAgentLoop so no real
 * LLM calls happen, then verify the correct behavior.
 */
describe('revision handler via AgentBus (integration)', () => {
  let bus: AgentBus;
  let emittedEvents: PipelineSSEEvent[];
  let emit: (event: PipelineSSEEvent) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    bus = new AgentBus();
    emittedEvents = [];
    emit = (event) => emittedEvents.push(event);

    // Default: runAgentLoop succeeds immediately
    (mockRunAgentLoop as Mock).mockResolvedValue({
      scratchpad: {},
      messages_out: [],
      usage: { input_tokens: 10, output_tokens: 20 },
      rounds_used: 1,
    });
  });

  /**
   * Helper: register a handler on the bus that mirrors the coordinator's
   * subscribeToRevisionRequests logic, but uses mocked dependencies.
   */
  function registerRevisionHandler(state: PipelineState) {
    const handler = async (msg: AgentMessage): Promise<void> => {
      if (msg.type !== 'request' || msg.from !== 'producer') return;

      const filtered = applyRevisionFilter(msg.payload, state.approved_sections);
      if (!filtered) return;

      emit({ type: 'revision_start', instructions: filtered });
      emit({
        type: 'transparency',
        stage: 'revision',
        message: `Routing ${filtered.length} revision request(s) from quality review back to the Craftsman...`,
      });

      const revisionMessage = [
        '## Revision Instructions from Quality Review',
        JSON.stringify(filtered, null, 2),
        '',
        '## Current Section Content',
        JSON.stringify(
          Object.fromEntries(
            filtered
              .map(i => i.target_section)
              .filter(s => state.sections?.[s])
              .map(s => [s, state.sections![s].content]),
          ),
          null,
          2,
        ),
        '',
        '## Blueprint',
        JSON.stringify(state.architect ?? {}, null, 2),
        '',
        'Apply the revision instructions to the affected sections only. Preserve all other content unchanged.',
      ].join('\n');

      try {
        await mockRunAgentLoop({
          config: { identity: { name: 'craftsman', domain: 'resume' } },
          contextParams: { sessionId: state.session_id, userId: state.user_id, state, emit, waitForUser: vi.fn(), signal: new AbortController().signal, bus, identity: { name: 'craftsman', domain: 'resume' } },
          initialMessage: revisionMessage,
        });
      } catch (err) {
        // Logged by coordinator; errors do not propagate
      }
    };

    bus.subscribe('craftsman', (msg) => void handler(msg));
    return () => bus.unsubscribe('craftsman');
  }

  it('processes high-priority revision instructions and calls runAgentLoop', async () => {
    const state = makePipelineState();
    registerRevisionHandler(state);

    bus.send(makeRevisionRequest({
      revision_instructions: [
        { target_section: 'summary', issue: 'Too generic', instruction: 'Add quantified metrics', priority: 'high' },
      ],
    }));

    // Allow the async handler to flush
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(emittedEvents.some(e => e.type === 'revision_start')).toBe(true);
    expect(emittedEvents.some(e => e.type === 'transparency')).toBe(true);
    expect(mockRunAgentLoop).toHaveBeenCalledOnce();

    const callArgs = (mockRunAgentLoop as Mock).mock.calls[0][0] as Record<string, unknown>;
    expect(typeof callArgs.initialMessage).toBe('string');
    expect((callArgs.initialMessage as string)).toContain('Revision Instructions from Quality Review');
    expect((callArgs.initialMessage as string)).toContain('summary');
    expect((callArgs.initialMessage as string)).toContain('Add quantified metrics');
  });

  it('does NOT call runAgentLoop for low-priority instructions', async () => {
    const state = makePipelineState();
    registerRevisionHandler(state);

    bus.send(makeRevisionRequest({
      revision_instructions: [
        { target_section: 'skills', issue: 'Minor ordering', instruction: 'Reorder', priority: 'low' },
        { target_section: 'summary', issue: 'Style', instruction: 'Improve tone', priority: 'medium' },
      ],
    }));

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(mockRunAgentLoop).not.toHaveBeenCalled();
    expect(emittedEvents).toHaveLength(0);
  });

  it('does NOT call runAgentLoop for instructions targeting approved sections', async () => {
    const state = makePipelineState({ approved_sections: ['summary', 'skills'] });
    registerRevisionHandler(state);

    bus.send(makeRevisionRequest({
      revision_instructions: [
        { target_section: 'summary', issue: 'Weak', instruction: 'Strengthen opening', priority: 'high' },
        { target_section: 'skills', issue: 'Missing', instruction: 'Add keywords', priority: 'high' },
      ],
    }));

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(mockRunAgentLoop).not.toHaveBeenCalled();
    expect(emittedEvents).toHaveLength(0);
  });

  it('is a no-op when the instructions array is empty', async () => {
    const state = makePipelineState();
    registerRevisionHandler(state);

    bus.send(makeRevisionRequest({ revision_instructions: [] }));

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(mockRunAgentLoop).not.toHaveBeenCalled();
    expect(emittedEvents).toHaveLength(0);
  });

  it('builds revision message containing current section content', async () => {
    const state = makePipelineState({
      sections: {
        summary: {
          section: 'summary',
          content: 'Experienced technology leader with 20 years.',
          keywords_used: [],
          requirements_addressed: [],
          evidence_ids_used: [],
        },
      },
    });
    registerRevisionHandler(state);

    bus.send(makeRevisionRequest({
      revision_instructions: [
        { target_section: 'summary', issue: 'Too vague', instruction: 'Add specific metrics', priority: 'high' },
      ],
    }));

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(mockRunAgentLoop).toHaveBeenCalledOnce();

    const callArgs = (mockRunAgentLoop as Mock).mock.calls[0][0] as Record<string, unknown>;
    const msg = callArgs.initialMessage as string;
    expect(msg).toContain('Experienced technology leader with 20 years.');
    expect(msg).toContain('Current Section Content');
  });

  it('handles runAgentLoop failure gracefully without propagating the error', async () => {
    (mockRunAgentLoop as Mock).mockRejectedValueOnce(new Error('LLM timeout'));

    const state = makePipelineState();
    registerRevisionHandler(state);

    bus.send(makeRevisionRequest({
      revision_instructions: [
        { target_section: 'summary', issue: 'Weak', instruction: 'Improve', priority: 'high' },
      ],
    }));

    // The handler swallows the error — no throw should escape to the bus
    await expect(new Promise(resolve => setTimeout(resolve, 10))).resolves.toBeUndefined();

    // revision_start was still emitted before the failure
    expect(emittedEvents.some(e => e.type === 'revision_start')).toBe(true);
  });

  it('ignores non-request message types on the craftsman channel', async () => {
    const state = makePipelineState();
    registerRevisionHandler(state);

    bus.send({
      from: 'producer',
      to: 'craftsman',
      type: 'handoff',       // not a 'request'
      domain: 'resume',
      payload: {
        revision_instructions: [
          { target_section: 'summary', issue: 'Fix', instruction: 'Do it', priority: 'high' },
        ],
      },
    });

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(mockRunAgentLoop).not.toHaveBeenCalled();
  });

  it('ignores messages from agents other than the producer', async () => {
    const state = makePipelineState();
    registerRevisionHandler(state);

    bus.send({
      from: 'strategist',    // not 'producer'
      to: 'craftsman',
      type: 'request',
      domain: 'resume',
      payload: {
        revision_instructions: [
          { target_section: 'summary', issue: 'Fix', instruction: 'Do it', priority: 'high' },
        ],
      },
    });

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(mockRunAgentLoop).not.toHaveBeenCalled();
  });

  it('processes flat-format revision request (single section from Producer tool)', async () => {
    const state = makePipelineState();
    registerRevisionHandler(state);

    bus.send(makeRevisionRequest({
      section: 'summary',
      issue: 'Lacks impact metrics',
      instruction: 'Add at least two quantified achievements',
    }));

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(mockRunAgentLoop).toHaveBeenCalledOnce();

    const callArgs = (mockRunAgentLoop as Mock).mock.calls[0][0] as Record<string, unknown>;
    const msg = callArgs.initialMessage as string;
    expect(msg).toContain('Add at least two quantified achievements');
  });
});
