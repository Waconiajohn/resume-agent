/**
 * Retirement Bridge Agent (#Phase 6) — Server tests.
 *
 * Tests types, knowledge rules, tools (generate_assessment_questions,
 * evaluate_readiness, build_readiness_summary), agent config, and product config.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external dependencies before any imports that pull them in
vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    }),
  },
}));

vi.mock('../lib/llm.js', () => ({
  llm: { chat: vi.fn() },
  MODEL_PRIMARY: 'mock-primary',
  MODEL_MID: 'mock-mid',
  MODEL_ORCHESTRATOR: 'mock-orchestrator',
  MODEL_LIGHT: 'mock-light',
  MODEL_PRICING: {},
}));

vi.mock('../lib/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  createSessionLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('../lib/platform-context.js', () => ({
  getUserContext: vi.fn().mockResolvedValue([]),
  upsertUserContext: vi.fn().mockResolvedValue(null),
}));

vi.mock('../lib/json-repair.js', () => ({
  repairJSON: vi.fn((text: string) => text),
}));

vi.mock('../lib/emotional-baseline.js', () => ({
  getToneGuidanceFromInput: vi.fn().mockReturnValue(null),
  getDistressFromInput: vi.fn().mockReturnValue(null),
}));

vi.mock('../agents/runtime/agent-registry.js', () => ({
  registerAgent: vi.fn(),
  agentRegistry: { get: vi.fn(), list: vi.fn().mockReturnValue([]) },
}));

vi.mock('../agents/runtime/shared-tools.js', () => ({
  createEmitTransparency: vi.fn().mockReturnValue({
    name: 'emit_transparency',
    description: 'Emit a transparency message',
    model_tier: 'light',
    input_schema: { type: 'object', properties: {}, required: [] },
    execute: vi.fn().mockResolvedValue('ok'),
  }),
}));

// ─── Type imports ─────────────────────────────────────────────────────────────

import type {
  ReadinessDimension,
  ReadinessSignal,
  RetirementQuestion,
  DimensionAssessment,
  RetirementReadinessSummary,
  RetirementBridgeState,
  RetirementBridgeSSEEvent,
} from '../agents/retirement-bridge/types.js';

import {
  DIMENSION_LABELS,
  SIGNAL_DESCRIPTIONS,
} from '../agents/retirement-bridge/types.js';

// ─── Knowledge rules ──────────────────────────────────────────────────────────

import {
  RULE_0_FIDUCIARY_GUARDRAILS,
  RULE_1_ASSESSMENT_DIMENSIONS,
  RULE_2_QUESTION_DESIGN,
  RULE_3_SIGNAL_CLASSIFICATION,
  RULE_4_OUTPUT_FORMATTING,
  RETIREMENT_BRIDGE_RULES,
} from '../agents/retirement-bridge/knowledge/rules.js';

// ─── Agent config ─────────────────────────────────────────────────────────────

import { assessorConfig } from '../agents/retirement-bridge/assessor/agent.js';

// ─── Tools ────────────────────────────────────────────────────────────────────

import { assessorTools } from '../agents/retirement-bridge/assessor/tools.js';

// ─── Product config ───────────────────────────────────────────────────────────

import { createRetirementBridgeProductConfig } from '../agents/retirement-bridge/product.js';

// ─── LLM mock access ──────────────────────────────────────────────────────────

import { llm } from '../lib/llm.js';

// ─── Mock context factory ─────────────────────────────────────────────────────

function createMockContext(stateOverrides: Partial<RetirementBridgeState> = {}) {
  const state: RetirementBridgeState = {
    session_id: 'test-session',
    user_id: 'test-user',
    current_stage: 'assessment',
    questions: [],
    responses: {},
    dimension_assessments: [],
    ...stateOverrides,
  };

  const emitted: RetirementBridgeSSEEvent[] = [];
  const scratchpad: Record<string, unknown> = {};

  return {
    ctx: {
      getState: () => state,
      updateState: vi.fn((fn: (s: RetirementBridgeState) => void) => fn(state)),
      emit: (event: RetirementBridgeSSEEvent) => emitted.push(event),
      scratchpad,
      signal: new AbortController().signal,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        child: vi.fn().mockReturnThis(),
      },
    },
    state,
    emitted,
    scratchpad,
  };
}

function makeMockChat(text: string) {
  return {
    text,
    tool_calls: [],
    usage: { input_tokens: 100, output_tokens: 200 },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Type Validation Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('RetirementBridge Types — ReadinessDimension', () => {
  it('all 7 ReadinessDimension values are unique', () => {
    const dimensions: ReadinessDimension[] = [
      'income_replacement',
      'healthcare_bridge',
      'debt_profile',
      'retirement_savings_impact',
      'insurance_gaps',
      'tax_implications',
      'lifestyle_adjustment',
    ];
    const unique = new Set(dimensions);
    expect(unique.size).toBe(7);
  });

  it('income_replacement is a valid ReadinessDimension', () => {
    const dim: ReadinessDimension = 'income_replacement';
    expect(dim).toBe('income_replacement');
  });

  it('healthcare_bridge is a valid ReadinessDimension', () => {
    const dim: ReadinessDimension = 'healthcare_bridge';
    expect(dim).toBe('healthcare_bridge');
  });

  it('lifestyle_adjustment is a valid ReadinessDimension', () => {
    const dim: ReadinessDimension = 'lifestyle_adjustment';
    expect(dim).toBe('lifestyle_adjustment');
  });

  it('tax_implications is a valid ReadinessDimension', () => {
    const dim: ReadinessDimension = 'tax_implications';
    expect(dim).toBe('tax_implications');
  });
});

describe('RetirementBridge Types — ReadinessSignal', () => {
  it('all 3 ReadinessSignal values are valid', () => {
    const signals: ReadinessSignal[] = ['green', 'yellow', 'red'];
    expect(signals).toHaveLength(3);
  });

  it('green is a valid ReadinessSignal', () => {
    const signal: ReadinessSignal = 'green';
    expect(signal).toBe('green');
  });

  it('yellow is a valid ReadinessSignal', () => {
    const signal: ReadinessSignal = 'yellow';
    expect(signal).toBe('yellow');
  });

  it('red is a valid ReadinessSignal', () => {
    const signal: ReadinessSignal = 'red';
    expect(signal).toBe('red');
  });
});

describe('RetirementBridge Types — DIMENSION_LABELS', () => {
  it('has entries for all 7 dimensions', () => {
    const dims: ReadinessDimension[] = [
      'income_replacement',
      'healthcare_bridge',
      'debt_profile',
      'retirement_savings_impact',
      'insurance_gaps',
      'tax_implications',
      'lifestyle_adjustment',
    ];
    for (const d of dims) {
      expect(DIMENSION_LABELS[d]).toBeTruthy();
    }
  });

  it('income_replacement label is a non-empty string', () => {
    expect(typeof DIMENSION_LABELS.income_replacement).toBe('string');
    expect(DIMENSION_LABELS.income_replacement.length).toBeGreaterThan(0);
  });

  it('all labels are human-readable strings', () => {
    for (const label of Object.values(DIMENSION_LABELS)) {
      expect(typeof label).toBe('string');
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

describe('RetirementBridge Types — SIGNAL_DESCRIPTIONS', () => {
  it('has entries for all 3 signals', () => {
    expect(SIGNAL_DESCRIPTIONS.green).toBeTruthy();
    expect(SIGNAL_DESCRIPTIONS.yellow).toBeTruthy();
    expect(SIGNAL_DESCRIPTIONS.red).toBeTruthy();
  });

  it('all descriptions are non-empty strings', () => {
    for (const desc of Object.values(SIGNAL_DESCRIPTIONS)) {
      expect(typeof desc).toBe('string');
      expect(desc.length).toBeGreaterThan(0);
    }
  });
});

describe('RetirementBridge Types — RetirementBridgeState initialization', () => {
  it('initializes with required fields', () => {
    const state: RetirementBridgeState = {
      session_id: 'sess-1',
      user_id: 'user-1',
      current_stage: 'assessment',
      questions: [],
      responses: {},
      dimension_assessments: [],
    };
    expect(state.session_id).toBe('sess-1');
    expect(state.user_id).toBe('user-1');
    expect(state.current_stage).toBe('assessment');
    expect(state.questions).toHaveLength(0);
    expect(state.responses).toEqual({});
    expect(state.dimension_assessments).toHaveLength(0);
  });

  it('readiness_summary is optional', () => {
    const state: RetirementBridgeState = {
      session_id: 'sess-1',
      user_id: 'user-1',
      current_stage: 'assessment',
      questions: [],
      responses: {},
      dimension_assessments: [],
    };
    expect(state.readiness_summary).toBeUndefined();
  });

  it('platform_context is optional', () => {
    const state: RetirementBridgeState = {
      session_id: 'sess-1',
      user_id: 'user-1',
      current_stage: 'assessment',
      questions: [],
      responses: {},
      dimension_assessments: [],
    };
    expect(state.platform_context).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Knowledge Rules Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('RetirementBridge Knowledge Rules', () => {
  it('RETIREMENT_BRIDGE_RULES contains all 5 rule sections', () => {
    expect(RETIREMENT_BRIDGE_RULES).toContain('RULE 0');
    expect(RETIREMENT_BRIDGE_RULES).toContain('RULE 1');
    expect(RETIREMENT_BRIDGE_RULES).toContain('RULE 2');
    expect(RETIREMENT_BRIDGE_RULES).toContain('RULE 3');
    expect(RETIREMENT_BRIDGE_RULES).toContain('RULE 4');
  });

  it('RULE_0_FIDUCIARY_GUARDRAILS contains "not financial advice" disclaimer', () => {
    expect(RULE_0_FIDUCIARY_GUARDRAILS.toLowerCase()).toContain('not financial advice');
  });

  it('RULE_0_FIDUCIARY_GUARDRAILS contains the verbatim disclaimer text', () => {
    expect(RULE_0_FIDUCIARY_GUARDRAILS).toContain(
      'This assessment identifies areas you may want to explore with a qualified fiduciary financial planner.',
    );
  });

  it('RULE_1_ASSESSMENT_DIMENSIONS covers all 7 dimension display names', () => {
    expect(RULE_1_ASSESSMENT_DIMENSIONS).toContain('Income Replacement');
    expect(RULE_1_ASSESSMENT_DIMENSIONS).toContain('Healthcare Bridge');
    expect(RULE_1_ASSESSMENT_DIMENSIONS).toContain('Debt Profile');
    expect(RULE_1_ASSESSMENT_DIMENSIONS).toContain('Retirement Savings Impact');
    expect(RULE_1_ASSESSMENT_DIMENSIONS).toContain('Insurance Gaps');
    expect(RULE_1_ASSESSMENT_DIMENSIONS).toContain('Tax Implications');
    expect(RULE_1_ASSESSMENT_DIMENSIONS).toContain('Lifestyle Adjustment');
  });

  it('RULE_2_QUESTION_DESIGN mentions 5-7 question limit', () => {
    expect(RULE_2_QUESTION_DESIGN).toContain('5-7');
  });

  it('RULE_3_SIGNAL_CLASSIFICATION requires 2 signals for red', () => {
    expect(RULE_3_SIGNAL_CLASSIFICATION).toContain('At least 2 independent supporting signals');
  });

  it('RULE_4_OUTPUT_FORMATTING mentions Fiduciary disclaimer', () => {
    expect(RULE_4_OUTPUT_FORMATTING).toContain('Fiduciary disclaimer');
  });

  it('each rule is a non-empty string', () => {
    for (const rule of [
      RULE_0_FIDUCIARY_GUARDRAILS,
      RULE_1_ASSESSMENT_DIMENSIONS,
      RULE_2_QUESTION_DESIGN,
      RULE_3_SIGNAL_CLASSIFICATION,
      RULE_4_OUTPUT_FORMATTING,
    ]) {
      expect(typeof rule).toBe('string');
      expect(rule.length).toBeGreaterThan(100);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Agent Config Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('Retirement Bridge assessorConfig', () => {
  it('has correct identity name', () => {
    expect(assessorConfig.identity.name).toBe('retirement_assessor');
  });

  it('has correct identity domain', () => {
    expect(assessorConfig.identity.domain).toBe('retirement_bridge');
  });

  it('has all 3 business tools plus emit_transparency', () => {
    const toolNames = assessorConfig.tools.map((t) => t.name);
    expect(toolNames).toContain('generate_assessment_questions');
    expect(toolNames).toContain('evaluate_readiness');
    expect(toolNames).toContain('build_readiness_summary');
    expect(toolNames).toContain('emit_transparency');
    expect(toolNames).toHaveLength(4);
  });

  it('system_prompt contains fiduciary guardrails', () => {
    expect(assessorConfig.system_prompt.toLowerCase()).toContain('not a financial advisor');
  });

  it('model tier is orchestrator', () => {
    expect(assessorConfig.model).toBe('orchestrator');
  });

  it('has capabilities array with retirement-related entries', () => {
    expect(assessorConfig.capabilities).toContain('retirement_assessment');
    expect(assessorConfig.capabilities).toContain('readiness_evaluation');
  });

  it('max_rounds is 8', () => {
    expect(assessorConfig.max_rounds).toBe(8);
  });

  it('system_prompt includes fiduciary disclaimer verbatim', () => {
    expect(assessorConfig.system_prompt).toContain('FIDUCIARY GUARDRAILS');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Tool Model Tier Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('Retirement Bridge Tool Model Tiers', () => {
  it('generate_assessment_questions uses mid tier', () => {
    const tool = assessorTools.find((t) => t.name === 'generate_assessment_questions');
    expect(tool?.model_tier).toBe('mid');
  });

  it('evaluate_readiness uses mid tier', () => {
    const tool = assessorTools.find((t) => t.name === 'evaluate_readiness');
    expect(tool?.model_tier).toBe('mid');
  });

  it('build_readiness_summary uses mid tier', () => {
    const tool = assessorTools.find((t) => t.name === 'build_readiness_summary');
    expect(tool?.model_tier).toBe('mid');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Product Config Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('createRetirementBridgeProductConfig', () => {
  it('returns a valid ProductConfig object', () => {
    const config = createRetirementBridgeProductConfig();
    expect(config).toBeDefined();
    expect(typeof config).toBe('object');
  });

  it('domain is retirement_bridge', () => {
    const config = createRetirementBridgeProductConfig();
    expect(config.domain).toBe('retirement_bridge');
  });

  it('has 2 agent entries', () => {
    const config = createRetirementBridgeProductConfig();
    expect(config.agents).toHaveLength(2);
  });

  it('first agent is assessor_questions', () => {
    const config = createRetirementBridgeProductConfig();
    expect(config.agents[0].name).toBe('assessor_questions');
  });

  it('second agent is assessor_evaluation', () => {
    const config = createRetirementBridgeProductConfig();
    expect(config.agents[1].name).toBe('assessor_evaluation');
  });

  it('first agent has a gate named retirement_assessment', () => {
    const config = createRetirementBridgeProductConfig();
    const gates = config.agents[0].gates ?? [];
    expect(gates.some((g) => g.name === 'retirement_assessment')).toBe(true);
  });

  it('createInitialState returns correct shape', () => {
    const config = createRetirementBridgeProductConfig();
    const state = config.createInitialState('sess-1', 'user-1', {});
    expect(state.session_id).toBe('sess-1');
    expect(state.user_id).toBe('user-1');
    expect(state.current_stage).toBe('assessment');
    expect(state.questions).toEqual([]);
    expect(state.responses).toEqual({});
    expect(state.dimension_assessments).toEqual([]);
  });

  it('gate condition passes when questions exist and no responses yet', () => {
    const config = createRetirementBridgeProductConfig();
    const gate = config.agents[0].gates?.[0];
    const state = config.createInitialState('sess-1', 'user-1', {});
    state.questions = [
      {
        id: 'rq1',
        question: 'Test question',
        dimension: 'income_replacement',
        purpose: 'test',
      },
    ];
    expect(gate!.condition!(state)).toBe(true);
  });

  it('gate condition fails when responses already present', () => {
    const config = createRetirementBridgeProductConfig();
    const gate = config.agents[0].gates![0];
    const state = config.createInitialState('sess-1', 'user-1', {});
    state.questions = [{ id: 'rq1', question: 'Q', dimension: 'income_replacement', purpose: 'p' }];
    state.responses = { rq1: 'My answer' };
    expect(gate.condition!(state)).toBe(false);
  });

  it('gate onResponse populates state.responses from user input', () => {
    const config = createRetirementBridgeProductConfig();
    const gate = config.agents[0].gates![0];
    const state = config.createInitialState('sess-1', 'user-1', {});
    gate.onResponse!({ rq1: 'I have a solid runway', rq2: 'COBRA is sorted' }, state);
    expect(state.responses['rq1']).toBe('I have a solid runway');
    expect(state.responses['rq2']).toBe('COBRA is sorted');
  });

  it('buildAgentMessage includes readable client profile context when available', () => {
    const config = createRetirementBridgeProductConfig();
    const state = config.createInitialState('sess-1', 'user-1', {});
    state.platform_context = {
      client_profile: {
        career_level: 'vp',
        industry: 'Industrial',
        years_experience: 18,
        financial_segment: 'ideal',
        transition_type: 'voluntary',
        goals: ['Board role'],
        constraints: ['Chicago'],
        strengths_self_reported: ['Turnarounds'],
        urgency_score: 4,
        recommended_starting_point: 'resume',
        coaching_tone: 'direct',
      },
    };
    const msg = config.buildAgentMessage('assessor_questions', state, {});
    expect(msg).toContain('Client Profile');
    expect(msg).toContain('Career level: vp');
    expect(msg).toContain('Board role');
    expect(msg).toContain('Turnarounds');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// generate_assessment_questions Tool Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('generate_assessment_questions tool', () => {
  const tool = assessorTools.find((t) => t.name === 'generate_assessment_questions')!;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns questions when LLM returns valid JSON', async () => {
    const questions = [
      {
        id: 'rq1',
        question: 'How are you thinking about your financial runway?',
        dimension: 'income_replacement',
        purpose: 'Assess income continuity awareness',
      },
      {
        id: 'rq2',
        question: 'What is your healthcare situation?',
        dimension: 'healthcare_bridge',
        purpose: 'Surface COBRA awareness',
      },
    ];
    vi.mocked(llm.chat).mockResolvedValueOnce(makeMockChat(JSON.stringify(questions)));

    const { ctx } = createMockContext();
    const result = await tool.execute({}, ctx as never);
    const parsed = JSON.parse(result as string);
    expect(parsed.questions).toHaveLength(2);
    expect(parsed.questions[0].id).toBe('rq1');
  });

  it('falls back to static questions when LLM returns garbage', async () => {
    vi.mocked(llm.chat).mockResolvedValueOnce(makeMockChat('NOT VALID JSON AT ALL!!!'));

    const { ctx } = createMockContext();
    const result = await tool.execute({}, ctx as never);
    const parsed = JSON.parse(result as string);
    expect(parsed.questions.length).toBeGreaterThanOrEqual(5);
    expect(parsed.questions[0].dimension).toBe('income_replacement');
  });

  it('emits questions_ready SSE event', async () => {
    const questions = [
      {
        id: 'rq1',
        question: 'Tell me about your transition.',
        dimension: 'income_replacement',
        purpose: 'Context',
      },
    ];
    vi.mocked(llm.chat).mockResolvedValueOnce(makeMockChat(JSON.stringify(questions)));

    const { ctx, emitted } = createMockContext();
    await tool.execute({}, ctx as never);
    expect(emitted.some((e) => e.type === 'questions_ready')).toBe(true);
  });

  it('questions cover valid dimensions from the allowed set', async () => {
    const validDimensions = [
      'income_replacement',
      'healthcare_bridge',
      'debt_profile',
      'retirement_savings_impact',
      'insurance_gaps',
      'tax_implications',
      'lifestyle_adjustment',
    ];
    vi.mocked(llm.chat).mockResolvedValueOnce(
      makeMockChat(
        JSON.stringify([
          { id: 'rq1', question: 'Q1', dimension: 'income_replacement', purpose: 'p1' },
          { id: 'rq2', question: 'Q2', dimension: 'unknown_dimension', purpose: 'p2' },
        ]),
      ),
    );

    const { ctx } = createMockContext();
    const result = await tool.execute({}, ctx as never);
    const parsed = JSON.parse(result as string);
    for (const q of parsed.questions) {
      expect(validDimensions).toContain(q.dimension);
    }
  });

  it('stores questions in scratchpad', async () => {
    const questions = [
      { id: 'rq1', question: 'Q', dimension: 'income_replacement', purpose: 'p' },
    ];
    vi.mocked(llm.chat).mockResolvedValueOnce(makeMockChat(JSON.stringify(questions)));

    const { ctx, scratchpad } = createMockContext();
    await tool.execute({}, ctx as never);
    expect(Array.isArray(scratchpad.questions)).toBe(true);
  });

  it('uses client profile in prompt when provided', async () => {
    vi.mocked(llm.chat).mockResolvedValueOnce(
      makeMockChat(
        JSON.stringify([{ id: 'rq1', question: 'Q', dimension: 'income_replacement', purpose: 'p' }]),
      ),
    );

    const { ctx } = createMockContext();
    await tool.execute({ client_profile: { career_level: 'vp' } }, ctx as never);
    const callArg = vi.mocked(llm.chat).mock.calls[0][0];
    expect(JSON.stringify(callArg.messages)).toContain('career_level');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// evaluate_readiness Tool Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('evaluate_readiness tool', () => {
  const tool = assessorTools.find((t) => t.name === 'evaluate_readiness')!;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 7 dimension assessments covering all dimensions', async () => {
    const allDimensions = [
      'income_replacement',
      'healthcare_bridge',
      'debt_profile',
      'retirement_savings_impact',
      'insurance_gaps',
      'tax_implications',
      'lifestyle_adjustment',
    ];
    const mockAssessments = allDimensions.map((dim) => ({
      dimension: dim,
      signal: 'yellow',
      observations: ['Some observation'],
      planner_questions: ['Question for planner'],
    }));
    vi.mocked(llm.chat).mockResolvedValueOnce(makeMockChat(JSON.stringify(mockAssessments)));

    const { ctx } = createMockContext({
      questions: [
        { id: 'rq1', question: 'Q?', dimension: 'income_replacement', purpose: 'p' },
      ],
    });
    const result = await tool.execute({ responses: { rq1: 'My answer' } }, ctx as never);
    const parsed = JSON.parse(result as string);
    expect(parsed.dimension_assessments).toHaveLength(7);
    for (const dim of allDimensions) {
      expect(parsed.dimension_assessments.some((d: DimensionAssessment) => d.dimension === dim)).toBe(true);
    }
  });

  it('defaults to yellow signal for unrecognized signal values', async () => {
    const mockAssessments = [
      {
        dimension: 'income_replacement',
        signal: 'invalid_signal',
        observations: ['Observation'],
        planner_questions: ['Question'],
      },
    ];
    vi.mocked(llm.chat).mockResolvedValueOnce(makeMockChat(JSON.stringify(mockAssessments)));

    const { ctx } = createMockContext({ questions: [] });
    const result = await tool.execute({ responses: {} }, ctx as never);
    const parsed = JSON.parse(result as string);
    const incomeReplace = parsed.dimension_assessments.find(
      (d: DimensionAssessment) => d.dimension === 'income_replacement',
    );
    expect(incomeReplace.signal).toBe('yellow');
  });

  it('falls back gracefully when LLM returns invalid JSON', async () => {
    vi.mocked(llm.chat).mockResolvedValueOnce(makeMockChat('DEFINITELY NOT JSON'));

    const { ctx } = createMockContext({ questions: [] });
    const result = await tool.execute({ responses: {} }, ctx as never);
    const parsed = JSON.parse(result as string);
    expect(parsed.dimension_assessments).toHaveLength(7);
    for (const d of parsed.dimension_assessments) {
      expect(d.signal).toBe('yellow');
    }
  });

  it('stores dimension_assessments in scratchpad', async () => {
    const mockAssessments = [
      {
        dimension: 'income_replacement',
        signal: 'green',
        observations: ['Good runway'],
        planner_questions: ['Ask about options'],
      },
    ];
    vi.mocked(llm.chat).mockResolvedValueOnce(makeMockChat(JSON.stringify(mockAssessments)));

    const { ctx, scratchpad } = createMockContext({ questions: [] });
    await tool.execute({ responses: {} }, ctx as never);
    expect(Array.isArray(scratchpad.dimension_assessments)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// build_readiness_summary Tool Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('build_readiness_summary tool', () => {
  const tool = assessorTools.find((t) => t.name === 'build_readiness_summary')!;

  const allGreenAssessments: DimensionAssessment[] = [
    'income_replacement',
    'healthcare_bridge',
    'debt_profile',
    'retirement_savings_impact',
    'insurance_gaps',
    'tax_implications',
    'lifestyle_adjustment',
  ].map((dim) => ({
    dimension: dim as ReadinessDimension,
    signal: 'green',
    observations: ['Looks good'],
    questions_to_ask_planner: ['Ask planner'],
  }));

  const mixedAssessments: DimensionAssessment[] = allGreenAssessments.map((a, i) => ({
    ...a,
    signal: (i === 0 ? 'red' : i === 1 ? 'yellow' : 'green') as ReadinessSignal,
  }));

  const allYellowAssessments: DimensionAssessment[] = allGreenAssessments.map((a) => ({
    ...a,
    signal: 'yellow' as ReadinessSignal,
  }));

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('overall signal is red when any dimension is red', async () => {
    vi.mocked(llm.chat).mockResolvedValueOnce(
      makeMockChat(
        JSON.stringify({
          key_observations: ['Key obs'],
          recommended_planner_topics: ['Topic 1'],
          shareable_summary: 'Summary text',
        }),
      ),
    );

    const { ctx } = createMockContext();
    const result = await tool.execute({ dimension_assessments: mixedAssessments }, ctx as never);
    const parsed = JSON.parse(result as string);
    expect(parsed.summary.overall_readiness).toBe('red');
  });

  it('overall signal is yellow when any yellow and no red', async () => {
    vi.mocked(llm.chat).mockResolvedValueOnce(
      makeMockChat(
        JSON.stringify({
          key_observations: ['Key obs'],
          recommended_planner_topics: ['Topic 1'],
          shareable_summary: 'Summary text',
        }),
      ),
    );

    const { ctx } = createMockContext();
    const result = await tool.execute({ dimension_assessments: allYellowAssessments }, ctx as never);
    const parsed = JSON.parse(result as string);
    expect(parsed.summary.overall_readiness).toBe('yellow');
  });

  it('overall signal is green only when all dimensions are green', async () => {
    vi.mocked(llm.chat).mockResolvedValueOnce(
      makeMockChat(
        JSON.stringify({
          key_observations: ['All looking good'],
          recommended_planner_topics: ['Review annually'],
          shareable_summary: 'Everything green summary',
        }),
      ),
    );

    const { ctx } = createMockContext();
    const result = await tool.execute({ dimension_assessments: allGreenAssessments }, ctx as never);
    const parsed = JSON.parse(result as string);
    expect(parsed.summary.overall_readiness).toBe('green');
  });

  it('emits assessment_complete SSE event', async () => {
    vi.mocked(llm.chat).mockResolvedValueOnce(
      makeMockChat(
        JSON.stringify({
          key_observations: ['Obs'],
          recommended_planner_topics: ['Topic'],
          shareable_summary: 'Summary',
        }),
      ),
    );

    const { ctx, emitted } = createMockContext();
    await tool.execute({ dimension_assessments: allGreenAssessments }, ctx as never);
    expect(emitted.some((e) => e.type === 'assessment_complete')).toBe(true);
  });

  it('falls back to static summary when LLM fails', async () => {
    vi.mocked(llm.chat).mockResolvedValueOnce(makeMockChat('GARBAGE JSON'));

    const { ctx } = createMockContext();
    const result = await tool.execute({ dimension_assessments: allGreenAssessments }, ctx as never);
    const parsed = JSON.parse(result as string);
    expect(parsed.summary.key_observations).toBeDefined();
    expect(parsed.summary.recommended_planner_topics).toBeDefined();
    expect(typeof parsed.summary.shareable_summary).toBe('string');
  });

  it('uses scratchpad dimension_assessments when no input array is provided', async () => {
    vi.mocked(llm.chat).mockResolvedValueOnce(
      makeMockChat(
        JSON.stringify({
          key_observations: ['From scratchpad'],
          recommended_planner_topics: ['Topic'],
          shareable_summary: 'Summary from scratchpad path',
        }),
      ),
    );

    const { ctx, scratchpad } = createMockContext();
    scratchpad.dimension_assessments = allYellowAssessments;

    // Pass undefined so the tool falls through to the scratchpad path
    const result = await tool.execute({ dimension_assessments: undefined }, ctx as never);
    const parsed = JSON.parse(result as string);
    // With all yellow from scratchpad, overall should be yellow
    expect(parsed.summary.overall_readiness).toBe('yellow');
  });
});
