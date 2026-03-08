/**
 * Shared mock factory functions for server tests.
 *
 * These factories eliminate duplicated mock setup across the 95+ test files.
 * All factories are fully typed — no `any` used.
 *
 * Usage example:
 *
 *   import { makeMockAgentContext, makeMockPipelineState, makeMockLLMResponse } from '../helpers/index.js';
 *
 *   const ctx = makeMockAgentContext({ current_stage: 'section_writing' });
 *   ctx.emit({ type: 'transparency', message: 'hello', stage: 'section_writing' });
 *   expect(ctx.emitSpy).toHaveBeenCalledOnce();
 */

import { vi } from 'vitest';
import type { PipelineState, PipelineSSEEvent, ResumeAgentContext } from '../../agents/types.js';
import type {
  AgentContext,
  BaseState,
  BaseEvent,
} from '../../agents/runtime/agent-protocol.js';

// ─── PipelineState factory ────────────────────────────────────────────────────

/**
 * Creates a minimal valid PipelineState for use in tests.
 *
 * Only the required fields are populated with sensible defaults.
 * Pass `overrides` to set any field relevant to the test under scrutiny.
 *
 * Example:
 *   const state = makeMockPipelineState({ current_stage: 'quality_review', approved_sections: ['summary'] });
 */
export function makeMockPipelineState(overrides?: Partial<PipelineState>): PipelineState {
  return {
    session_id: 'test-session',
    user_id: 'test-user',
    current_stage: 'intake',
    approved_sections: [],
    revision_count: 0,
    revision_counts: {},
    token_usage: { input_tokens: 0, output_tokens: 0, estimated_cost_usd: 0 },
    ...overrides,
  };
}

// ─── Emit spy factory ─────────────────────────────────────────────────────────

/**
 * Creates a vi.fn() emit callback compatible with ResumeAgentContext.emit.
 *
 * The returned spy accepts PipelineSSEEvent values. Use `.toHaveBeenCalledWith()`
 * with `expect.objectContaining()` to assert on specific event shapes.
 *
 * Example:
 *   const emit = makeMockEmit();
 *   emit({ type: 'transparency', message: 'hi', stage: 'intake' });
 *   expect(emit).toHaveBeenCalledOnce();
 */
export function makeMockEmit(): (event: PipelineSSEEvent) => void {
  return vi.fn() as (event: PipelineSSEEvent) => void;
}

// ─── ResumeAgentContext factory ───────────────────────────────────────────────

/**
 * The extended context type returned by makeMockAgentContext.
 *
 * Exposes `emitSpy` for assertion convenience so callers don't need to cast
 * `ctx.emit` to a vi.fn(). All other AgentContext methods are vi.fn() mocks.
 */
export type MockResumeAgentContext = ResumeAgentContext & {
  /** The underlying vi.fn() behind ctx.emit — use for assertions. */
  emitSpy: ReturnType<typeof vi.fn>;
  /**
   * Exposes the mutable state reference so tests can inspect mutations
   * that happened via updateState() without calling getState().
   */
  _state: PipelineState;
};

/**
 * Creates a fully wired mock AgentContext<PipelineState, PipelineSSEEvent>.
 *
 * - `emit` is a vi.fn() — accessible via `ctx.emitSpy` for assertions
 * - `waitForUser` resolves to `true` by default (covers the "user approves" path)
 * - `getState()` returns the current in-memory state (mutations via updateState are reflected)
 * - `updateState()` merges the patch into the in-memory state (not persisted)
 * - `sendMessage` and `scratchpad` are empty / no-op by default
 *
 * Pass `stateOverrides` to control the initial pipeline state.
 * Pass `waitForUserResult` to control the value resolved by waitForUser.
 *
 * Example:
 *   const ctx = makeMockAgentContext({ current_stage: 'section_writing' });
 *   ctx.waitForUser = vi.fn().mockResolvedValue({ approved: true });
 *
 *   await myTool.execute({ section: 'summary', content: 'Draft...' }, ctx);
 *
 *   expect(ctx.emitSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'section_approved' }));
 *   expect(ctx.getState().approved_sections).toContain('summary');
 */
export function makeMockAgentContext(
  stateOverrides?: Partial<PipelineState>,
  waitForUserResult: unknown = true,
): MockResumeAgentContext {
  let state = makeMockPipelineState(stateOverrides);
  const emitSpy = vi.fn();

  const ctx: MockResumeAgentContext = {
    sessionId: 'test-session',
    userId: 'test-user',
    scratchpad: {},
    signal: new AbortController().signal,
    emit: emitSpy as (event: PipelineSSEEvent) => void,
    waitForUser: vi.fn().mockResolvedValue(waitForUserResult),
    getState: () => state,
    updateState: (patch: Partial<PipelineState>) => {
      state = { ...state, ...patch };
      ctx._state = state;
    },
    sendMessage: vi.fn(),
    emitSpy,
    _state: state,
  };

  return ctx;
}

// ─── Generic AgentContext factory (non-resume agents) ────────────────────────

/**
 * Extended type for mock generic agent contexts.
 */
export type MockAgentContext<TState extends BaseState, TEvent extends BaseEvent> =
  AgentContext<TState, TEvent> & {
    emitSpy: ReturnType<typeof vi.fn>;
    _state: TState;
  };

/**
 * Creates a mock AgentContext for agents that use a custom state type
 * (i.e., non-resume agents such as Onboarding, Retirement Bridge, etc.).
 *
 * `TState` and `TEvent` are inferred from the `initialState` argument.
 * For precise typing, pass them explicitly:
 *
 *   const ctx = makeMockGenericContext<OnboardingState, OnboardingSSEEvent>(
 *     { session_id: 'test', user_id: 'u1', current_stage: 'assessment', questions: [], responses: {} },
 *   );
 */
export function makeMockGenericContext<
  TState extends BaseState,
  TEvent extends BaseEvent,
>(
  initialState: TState,
  waitForUserResult: unknown = true,
): MockAgentContext<TState, TEvent> {
  let state = { ...initialState };
  const emitSpy = vi.fn();

  const ctx: MockAgentContext<TState, TEvent> = {
    sessionId: 'test-session',
    userId: 'test-user',
    scratchpad: {},
    signal: new AbortController().signal,
    emit: emitSpy as (event: TEvent) => void,
    waitForUser: vi.fn().mockResolvedValue(waitForUserResult),
    getState: () => state,
    updateState: (patch: Partial<TState>) => {
      state = { ...state, ...patch };
      ctx._state = state;
    },
    sendMessage: vi.fn(),
    emitSpy,
    _state: state,
  };

  return ctx;
}

// ─── LLM response factory ─────────────────────────────────────────────────────

/**
 * Creates a mock LLM chat response that wraps JSON data in the standard
 * shape returned by `llm.chat()`.
 *
 * Most agent tools call llm.chat() and parse `response.text` as JSON.
 * This factory handles the wrapping so tests only need to specify the data.
 *
 * Example:
 *   mockChat.mockResolvedValueOnce(makeMockLLMResponse({ score: 8, passed: true, issues: [] }));
 */
export function makeMockLLMResponse(data: Record<string, unknown>): {
  text: string;
  tool_calls: never[];
  usage: { input_tokens: number; output_tokens: number };
} {
  return {
    text: JSON.stringify(data),
    tool_calls: [],
    usage: { input_tokens: 0, output_tokens: 0 },
  };
}

/**
 * Creates an LLM response with raw text (not JSON-wrapped).
 * Use when the tool reads `response.text` directly rather than parsing JSON.
 */
export function makeMockLLMRawResponse(text: string): {
  text: string;
  tool_calls: never[];
  usage: { input_tokens: number; output_tokens: number };
} {
  return {
    text,
    tool_calls: [],
    usage: { input_tokens: 0, output_tokens: 0 },
  };
}

// ─── Pipeline fixture factories ───────────────────────────────────────────────

/**
 * Creates a minimal IntakeOutput fixture.
 *
 * Represents a senior engineering executive — the canonical test persona used
 * throughout the strategist / craftsman / producer tool tests.
 */
export function makeMockIntakeOutput() {
  return {
    contact: {
      name: 'Jane Doe',
      email: 'jane@example.com',
      phone: '555-1234',
      location: 'New York',
    },
    summary: 'Senior engineering executive with 15 years of cloud platform experience.',
    experience: [
      {
        company: 'Acme Corp',
        title: 'VP Engineering',
        start_date: 'Jan 2018',
        end_date: 'Present',
        bullets: ['Led 45-person org'],
      },
    ],
    skills: ['Cloud Architecture', 'P&L Ownership', 'Team Leadership'],
    education: [{ degree: 'BS', institution: 'MIT' }],
    certifications: ['AWS Solutions Architect'],
    career_span_years: 15,
    raw_text: 'Jane Doe VP Engineering...',
  };
}

/**
 * Creates a minimal ResearchOutput fixture including JD analysis,
 * company research, and benchmark candidate profile.
 */
export function makeMockResearchOutput() {
  return {
    jd_analysis: {
      role_title: 'CTO',
      company: 'TechCorp',
      seniority_level: 'executive' as const,
      must_haves: ['engineering leadership', 'cloud architecture'],
      nice_to_haves: ['kubernetes'],
      implicit_requirements: ['executive presence'],
      language_keywords: ['cloud-native', 'P&L'],
    },
    company_research: {
      company_name: 'TechCorp',
      industry: 'technology',
      size: '500-1000',
      culture_signals: ['innovation', 'fast-paced'],
    },
    benchmark_candidate: {
      ideal_profile: 'Seasoned engineering leader with P&L experience',
      language_keywords: ['cloud-native', 'P&L', 'platform'],
      section_expectations: { summary: '3-4 sentences', skills: '4-6 categories' },
    },
  };
}

/**
 * Creates a minimal GapAnalystOutput fixture.
 * Two requirements: one strong, one partial — no critical gaps.
 */
export function makeMockGapAnalystOutput() {
  return {
    requirements: [
      {
        requirement: 'engineering leadership',
        classification: 'strong' as const,
        evidence: ['Led 45-person org'],
      },
      {
        requirement: 'cloud architecture',
        classification: 'partial' as const,
        evidence: ['Cloud platform work'],
      },
    ],
    coverage_score: 82,
    critical_gaps: [],
    addressable_gaps: ['cloud architecture depth'],
    strength_summary: 'Strong leadership background with partial cloud coverage',
  };
}

/**
 * Creates a minimal ArchitectOutput (blueprint) fixture.
 */
export function makeMockArchitectOutput() {
  return {
    blueprint_version: '2.0',
    target_role: 'CTO at TechCorp',
    positioning_angle: 'Platform-first engineering executive',
    section_plan: {
      order: ['header', 'summary', 'experience', 'skills'],
      rationale: 'Executive order',
    },
    summary_blueprint: {
      positioning_angle: 'Cloud-first engineering executive',
      must_include: ['cloud architecture'],
      gap_reframe: {},
      tone_guidance: 'Executive, direct',
      keywords_to_embed: ['cloud-native'],
      authentic_phrases_to_echo: [],
      length: '3-4 sentences',
    },
    evidence_allocation: {
      selected_accomplishments: [],
      experience_section: {},
      unallocated_requirements: [],
    },
    skills_blueprint: {
      format: 'categorized' as const,
      categories: [],
      keywords_still_missing: [],
      age_protection_removals: [],
    },
    experience_blueprint: { roles: [] },
    age_protection: { flags: [], clean: true },
    keyword_map: {
      'cloud-native': {
        target_density: 2,
        placements: ['summary'],
        current_count: 0,
        action: 'add' as const,
      },
    },
    global_rules: {
      voice: 'Executive, direct',
      bullet_format: 'Action → scope → result',
      length_target: '2 pages',
      ats_rules: 'No tables',
    },
  };
}

/**
 * Creates a minimal SectionWriterOutput fixture for a given section.
 */
export function makeMockSectionWriterOutput(section = 'summary') {
  return {
    section,
    content: 'Engineering executive with 15 years building cloud-native platforms. Led $2.4M cost reduction through cloud migration.',
    keywords_used: ['cloud-native', 'P&L'],
    requirements_addressed: ['engineering leadership'],
    evidence_ids_used: ['ev_001'],
  };
}

/**
 * Creates a minimal global_rules object used by craftsman section tools.
 */
export function makeMockGlobalRules() {
  return {
    voice: 'Executive, direct, metrics-forward.',
    bullet_format: 'Action verb → scope → method → measurable result',
    length_target: '2 pages maximum',
    ats_rules: 'No tables, no columns, standard section headers only',
  };
}

// ─── Supabase chain mock factory ──────────────────────────────────────────────

/**
 * Shape returned by makeMockSupabaseChain.
 *
 * All query builder methods return `this` so chaining works.
 * Terminal methods (.single, .maybeSingle) resolve to `resolveValue`.
 * The chain is also directly awaitable via .then for list queries.
 */
export type MockSupabaseChain = {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  lte: ReturnType<typeof vi.fn>;
  contains: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise<unknown>;
};

/**
 * Creates a chainable Supabase query builder mock.
 *
 * All chainable methods (select, insert, eq, etc.) return `this`.
 * Terminal methods (.single, .maybeSingle) resolve to `resolveValue`.
 * The chain is also directly awaitable for queries without a terminal method.
 *
 * Use this with `mockFrom.mockReturnValue(makeMockSupabaseChain(...))`.
 *
 * Example:
 *   const mockFrom = vi.hoisted(() => vi.fn());
 *   vi.mock('../lib/supabase.js', () => ({ supabaseAdmin: { from: mockFrom } }));
 *
 *   mockFrom.mockReturnValue(makeMockSupabaseChain({ data: myRow, error: null }));
 *   const result = await myLibFunction('user-123');
 *   expect(mockFrom).toHaveBeenCalledWith('my_table');
 */
export function makeMockSupabaseChain(resolveValue: { data: unknown; error: unknown }): MockSupabaseChain {
  const chain: MockSupabaseChain = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    lte: vi.fn(),
    contains: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    single: vi.fn().mockResolvedValue(resolveValue),
    maybeSingle: vi.fn().mockResolvedValue(resolveValue),
    then: (resolve, reject) => Promise.resolve(resolveValue).then(resolve, reject),
  };

  // All chainable methods return the chain itself
  const chainableMethods: Array<keyof MockSupabaseChain> = [
    'select', 'insert', 'update', 'upsert', 'delete',
    'eq', 'in', 'lte', 'contains', 'order', 'limit',
  ];
  for (const method of chainableMethods) {
    (chain[method] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
  }

  return chain;
}

/**
 * Creates a mock supabaseAdmin object with spied `from` and `rpc` functions.
 *
 * Returns both the mock admin object and the individual spies so tests can
 * configure per-test return values with `.mockReturnValue()`.
 *
 * Prefer wiring this via vi.mock() with vi.hoisted() for proper hoisting.
 * This factory is for inline use in tests that don't need top-level hoisting.
 *
 * Example:
 *   const { mockFrom } = makeMockSupabase();
 *   mockFrom.mockReturnValue(makeMockSupabaseChain({ data: [], error: null }));
 */
export function makeMockSupabase() {
  const mockFrom = vi.fn();
  const mockRpc = vi.fn();

  const supabaseAdmin = {
    from: mockFrom,
    rpc: mockRpc,
  };

  return { supabaseAdmin, mockFrom, mockRpc };
}
