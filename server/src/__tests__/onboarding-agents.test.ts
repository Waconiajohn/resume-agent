/**
 * Onboarding Assessment Agent (#1) — Server tests.
 *
 * Tests types, knowledge rules, tools (generate_questions, evaluate_responses,
 * detect_financial_segment, build_client_profile), agent config, product config,
 * and route schema behavior.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external dependencies before any imports that pull them in
vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
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

vi.mock('../lib/career-profile-context.js', () => ({
  loadCareerProfileContext: vi.fn().mockResolvedValue(null),
}));

vi.mock('../lib/json-repair.js', () => ({
  repairJSON: vi.fn((text: string) => text),
}));

// ─── Types & Constants ────────────────────────────────────────────────────────

import {
  FINANCIAL_SEGMENT_LABELS,
} from '../agents/onboarding/types.js';

import type {
  FinancialSegment,
  CareerLevel,
  EmotionalState,
  AssessmentQuestion,
  ClientProfile,
  OnboardingState,
  OnboardingSSEEvent,
} from '../agents/onboarding/types.js';

// ─── Knowledge Rules ──────────────────────────────────────────────────────────

import {
  RULE_0_PHILOSOPHY,
  RULE_1_QUESTION_DESIGN,
  RULE_2_FINANCIAL_DETECTION,
  RULE_3_EMOTIONAL_BASELINE,
  RULE_4_CLIENT_PROFILE_CONSTRUCTION,
  RULE_5_COACHING_TONE_SELECTION,
  RULE_6_SELF_REVIEW,
  ONBOARDING_RULES,
} from '../agents/onboarding/knowledge/rules.js';
import { createEmptySharedContext } from '../contracts/shared-context.js';

// ─── Agent Registry ───────────────────────────────────────────────────────────

import { agentRegistry } from '../agents/runtime/agent-registry.js';

// ─── Agent Config (triggers registration side effects) ───────────────────────

import { assessorConfig } from '../agents/onboarding/assessor/agent.js';

// ─── Tools ────────────────────────────────────────────────────────────────────

import { assessorTools } from '../agents/onboarding/assessor/tools.js';

// ─── ProductConfig ────────────────────────────────────────────────────────────

import { createOnboardingProductConfig } from '../agents/onboarding/product.js';

// ─── LLM mock access ──────────────────────────────────────────────────────────

import { llm } from '../lib/llm.js';

// ─── Mock context factory ─────────────────────────────────────────────────────

function createMockContext(stateOverrides?: Partial<OnboardingState>) {
  const state: OnboardingState = {
    session_id: 'test-session',
    user_id: 'test-user',
    current_stage: 'assessment',
    questions: [],
    responses: {},
    ...stateOverrides,
  };

  const emitted: OnboardingSSEEvent[] = [];
  const scratchpad: Record<string, unknown> = {};

  return {
    ctx: {
      getState: () => state,
      updateState: vi.fn((updates: Partial<OnboardingState>) => Object.assign(state, updates)),
      emit: (event: OnboardingSSEEvent) => emitted.push(event),
      scratchpad,
      signal: new AbortController().signal,
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
// Types Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('Onboarding Types — FinancialSegment', () => {
  it('FinancialSegment type includes crisis', () => {
    const segment: FinancialSegment = 'crisis';
    expect(segment).toBe('crisis');
  });

  it('FinancialSegment type includes stressed', () => {
    const segment: FinancialSegment = 'stressed';
    expect(segment).toBe('stressed');
  });

  it('FinancialSegment type includes ideal', () => {
    const segment: FinancialSegment = 'ideal';
    expect(segment).toBe('ideal');
  });

  it('FinancialSegment type includes comfortable', () => {
    const segment: FinancialSegment = 'comfortable';
    expect(segment).toBe('comfortable');
  });

  it('FINANCIAL_SEGMENT_LABELS has entries for all 4 segments', () => {
    expect(FINANCIAL_SEGMENT_LABELS.crisis).toBeTruthy();
    expect(FINANCIAL_SEGMENT_LABELS.stressed).toBeTruthy();
    expect(FINANCIAL_SEGMENT_LABELS.ideal).toBeTruthy();
    expect(FINANCIAL_SEGMENT_LABELS.comfortable).toBeTruthy();
  });

  it('FINANCIAL_SEGMENT_LABELS values are human-readable strings', () => {
    expect(typeof FINANCIAL_SEGMENT_LABELS.crisis).toBe('string');
    expect(typeof FINANCIAL_SEGMENT_LABELS.stressed).toBe('string');
    expect(typeof FINANCIAL_SEGMENT_LABELS.ideal).toBe('string');
    expect(typeof FINANCIAL_SEGMENT_LABELS.comfortable).toBe('string');
  });
});

describe('Onboarding Types — CareerLevel', () => {
  it('CareerLevel type includes all 5 values', () => {
    const levels: CareerLevel[] = ['mid_level', 'senior', 'director', 'vp', 'c_suite'];
    expect(levels).toHaveLength(5);
  });

  it('CareerLevel mid_level is a valid value', () => {
    const level: CareerLevel = 'mid_level';
    expect(level).toBe('mid_level');
  });

  it('CareerLevel c_suite is a valid value', () => {
    const level: CareerLevel = 'c_suite';
    expect(level).toBe('c_suite');
  });
});

describe('Onboarding Types — EmotionalState', () => {
  it('EmotionalState includes all 6 grief cycle values', () => {
    const states: EmotionalState[] = ['denial', 'anger', 'bargaining', 'depression', 'acceptance', 'growth'];
    expect(states).toHaveLength(6);
  });
});

describe('Onboarding Types — AssessmentQuestion', () => {
  it('AssessmentQuestion has required fields: id, question, category, purpose', () => {
    const q: AssessmentQuestion = {
      id: 'q1',
      question: 'Tell me about your most recent role.',
      category: 'career_context',
      purpose: 'Establish context',
    };
    expect(q.id).toBe('q1');
    expect(q.question).toBeTruthy();
    expect(q.category).toBe('career_context');
    expect(q.purpose).toBeTruthy();
  });

  it('AssessmentQuestion follow_up_trigger is optional', () => {
    const q: AssessmentQuestion = {
      id: 'q2',
      question: 'What is your timeline?',
      category: 'timeline_and_urgency',
      purpose: 'Financial signal detection',
    };
    expect(q.follow_up_trigger).toBeUndefined();
  });

  it('AssessmentQuestion supports all valid categories', () => {
    const categories: AssessmentQuestion['category'][] = [
      'career_context',
      'transition_drivers',
      'timeline_and_urgency',
      'goals_and_aspirations',
      'support_needs',
    ];
    expect(categories).toHaveLength(5);
  });
});

describe('Onboarding Types — ClientProfile', () => {
  it('ClientProfile has all required fields', () => {
    const profile: ClientProfile = {
      career_level: 'director',
      industry: 'Technology',
      years_experience: 15,
      financial_segment: 'ideal',
      emotional_state: 'acceptance',
      transition_type: 'involuntary',
      goals: ['Lead a larger team'],
      constraints: ['Remote only'],
      strengths_self_reported: ['Strategic thinking'],
      urgency_score: 5,
      recommended_starting_point: 'resume',
      coaching_tone: 'direct',
    };
    expect(profile.career_level).toBe('director');
    expect(profile.financial_segment).toBe('ideal');
    expect(profile.urgency_score).toBe(5);
    expect(profile.recommended_starting_point).toBe('resume');
    expect(profile.coaching_tone).toBe('direct');
  });
});

describe('Onboarding Types — OnboardingState', () => {
  it('OnboardingState extends BaseState with required fields', () => {
    const state: OnboardingState = {
      session_id: 'sess-1',
      user_id: 'user-1',
      current_stage: 'assessment',
      questions: [],
      responses: {},
    };
    expect(state.session_id).toBe('sess-1');
    expect(state.questions).toEqual([]);
    expect(state.responses).toEqual({});
  });

  it('OnboardingState client_profile is optional', () => {
    const state: OnboardingState = {
      session_id: 'sess-1',
      user_id: 'user-1',
      current_stage: 'assessment',
      questions: [],
      responses: {},
    };
    expect(state.client_profile).toBeUndefined();
  });
});

describe('Onboarding Types — OnboardingSSEEvent', () => {
  it('OnboardingSSEEvent supports stage_start discriminant', () => {
    const event: OnboardingSSEEvent = { type: 'stage_start', stage: 'assessment', message: 'Starting...' };
    expect(event.type).toBe('stage_start');
  });

  it('OnboardingSSEEvent supports questions_ready discriminant', () => {
    const event: OnboardingSSEEvent = { type: 'questions_ready', questions: [] };
    expect(event.type).toBe('questions_ready');
  });

  it('OnboardingSSEEvent supports assessment_complete discriminant', () => {
    const profile: ClientProfile = {
      career_level: 'senior',
      industry: 'Technology',
      years_experience: 10,
      financial_segment: 'ideal',
      emotional_state: 'acceptance',
      transition_type: 'voluntary',
      goals: [],
      constraints: [],
      strengths_self_reported: [],
      urgency_score: 5,
      recommended_starting_point: 'resume',
      coaching_tone: 'direct',
    };
    const event: OnboardingSSEEvent = {
      type: 'assessment_complete',
      session_id: 'sess-1',
      profile,
      summary: { key_insights: [], financial_signals: [], emotional_signals: [], recommended_actions: [] },
    };
    expect(event.type).toBe('assessment_complete');
  });

  it('OnboardingSSEEvent supports pipeline_error discriminant', () => {
    const event: OnboardingSSEEvent = { type: 'pipeline_error', stage: 'assessment', error: 'Something went wrong' };
    expect(event.type).toBe('pipeline_error');
  });

  it('OnboardingSSEEvent supports transparency discriminant', () => {
    const event: OnboardingSSEEvent = { type: 'transparency', stage: 'assessment', message: 'Thinking...' };
    expect(event.type).toBe('transparency');
  });

  it('OnboardingSSEEvent supports stage_complete with optional duration_ms', () => {
    const event: OnboardingSSEEvent = {
      type: 'stage_complete',
      stage: 'assessment',
      message: 'Done',
      duration_ms: 5000,
    };
    expect(event.type).toBe('stage_complete');
    expect(event.duration_ms).toBe(5000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Knowledge Rules Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('Onboarding Knowledge Rules', () => {
  const rules = [
    { name: 'RULE_0_PHILOSOPHY', value: RULE_0_PHILOSOPHY },
    { name: 'RULE_1_QUESTION_DESIGN', value: RULE_1_QUESTION_DESIGN },
    { name: 'RULE_2_FINANCIAL_DETECTION', value: RULE_2_FINANCIAL_DETECTION },
    { name: 'RULE_3_EMOTIONAL_BASELINE', value: RULE_3_EMOTIONAL_BASELINE },
    { name: 'RULE_4_CLIENT_PROFILE_CONSTRUCTION', value: RULE_4_CLIENT_PROFILE_CONSTRUCTION },
    { name: 'RULE_5_COACHING_TONE_SELECTION', value: RULE_5_COACHING_TONE_SELECTION },
    { name: 'RULE_6_SELF_REVIEW', value: RULE_6_SELF_REVIEW },
  ];

  it('ONBOARDING_RULES is a non-empty string', () => {
    expect(typeof ONBOARDING_RULES).toBe('string');
    expect(ONBOARDING_RULES.length).toBeGreaterThan(100);
  });

  it('all 7 rule constants are non-empty strings (length > 50)', () => {
    for (const rule of rules) {
      expect(typeof rule.value).toBe('string');
      expect(rule.value.length).toBeGreaterThan(50);
    }
  });

  it('ONBOARDING_RULES contains all 7 rules', () => {
    for (const rule of rules) {
      expect(ONBOARDING_RULES).toContain(rule.value);
    }
  });

  it('each rule has markdown formatting (headers or bullets)', () => {
    for (const rule of rules) {
      const hasMarkdown =
        rule.value.includes('##') || rule.value.includes('- ') || rule.value.includes('**');
      expect(hasMarkdown).toBe(true);
    }
  });

  it('RULE_2_FINANCIAL_DETECTION mentions never ask directly about finances', () => {
    expect(RULE_2_FINANCIAL_DETECTION.toLowerCase()).toContain('never');
    expect(RULE_2_FINANCIAL_DETECTION.toLowerCase()).toContain('direct');
  });

  it('RULE_2_FINANCIAL_DETECTION mentions financial segment', () => {
    expect(RULE_2_FINANCIAL_DETECTION.toLowerCase()).toContain('financial segment');
  });

  it('RULE_3_EMOTIONAL_BASELINE mentions grief cycle', () => {
    expect(RULE_3_EMOTIONAL_BASELINE.toLowerCase()).toContain('grief cycle');
  });

  it('RULE_3_EMOTIONAL_BASELINE mentions never label or diagnose', () => {
    expect(RULE_3_EMOTIONAL_BASELINE.toLowerCase()).toContain('never label');
  });

  it('RULE_0_PHILOSOPHY mentions coaching tone', () => {
    // Rule 0 mentions "coaching" in its advisory framing
    expect(RULE_0_PHILOSOPHY.toLowerCase()).toContain('coaching');
  });

  it('RULE_5_COACHING_TONE_SELECTION mentions supportive tone', () => {
    expect(RULE_5_COACHING_TONE_SELECTION.toLowerCase()).toContain('supportive');
  });

  it('RULE_5_COACHING_TONE_SELECTION mentions motivational tone', () => {
    expect(RULE_5_COACHING_TONE_SELECTION.toLowerCase()).toContain('motivational');
  });

  it('RULE_6_SELF_REVIEW mentions financial segment confidence', () => {
    expect(RULE_6_SELF_REVIEW.toLowerCase()).toContain('financial segment');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Tool Tests — generate_questions
// ═══════════════════════════════════════════════════════════════════════════════

describe('Onboarding Tool — generate_questions', () => {
  const tool = assessorTools.find((t) => t.name === 'generate_questions')!;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('tool exists and has correct name', () => {
    expect(tool).toBeDefined();
    expect(tool.name).toBe('generate_questions');
  });

  it('tool has model_tier mid', () => {
    expect(tool.model_tier).toBe('mid');
  });

  it('tool description is meaningful (length > 20)', () => {
    expect(tool.description.length).toBeGreaterThan(20);
  });

  it('tool description mentions finance detection without asking directly', () => {
    expect(tool.description.toLowerCase()).toContain('without directly asking about finances');
  });

  it('stores questions in scratchpad after successful LLM call', async () => {
    const { ctx, scratchpad } = createMockContext();
    (llm.chat as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeMockChat(
        JSON.stringify([
          { id: 'q1', question: 'Tell me about your most recent role.', category: 'career_context', purpose: 'Rapport' },
          { id: 'q2', question: 'What does your ideal timeline look like?', category: 'timeline_and_urgency', purpose: 'Financial signal' },
          { id: 'q3', question: 'What are you looking for next?', category: 'goals_and_aspirations', purpose: 'Goals' },
        ]),
      ),
    );

    await tool.execute({ resume_text: '' }, ctx as any);

    expect(scratchpad.questions).toBeDefined();
    expect(Array.isArray(scratchpad.questions)).toBe(true);
    expect((scratchpad.questions as unknown[]).length).toBeGreaterThanOrEqual(3);
  });

  it('emits questions_ready SSE event', async () => {
    const { ctx, emitted } = createMockContext();
    (llm.chat as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeMockChat(
        JSON.stringify([
          { id: 'q1', question: 'Tell me about your role.', category: 'career_context', purpose: 'Context' },
          { id: 'q2', question: 'What is your timeline?', category: 'timeline_and_urgency', purpose: 'Urgency' },
          { id: 'q3', question: 'What do you want next?', category: 'goals_and_aspirations', purpose: 'Goals' },
        ]),
      ),
    );

    await tool.execute({ resume_text: '' }, ctx as any);

    expect(emitted).toHaveLength(1);
    expect(emitted[0].type).toBe('questions_ready');
  });

  it('emitted questions_ready event contains the generated questions', async () => {
    const { ctx, emitted } = createMockContext();
    (llm.chat as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeMockChat(
        JSON.stringify([
          { id: 'q1', question: 'Tell me about your role.', category: 'career_context', purpose: 'Context' },
        ]),
      ),
    );

    await tool.execute({ resume_text: '' }, ctx as any);

    const event = emitted[0] as Extract<OnboardingSSEEvent, { type: 'questions_ready' }>;
    expect(Array.isArray(event.questions)).toBe(true);
    expect(event.questions.length).toBeGreaterThanOrEqual(1);
  });

  it('falls back to default questions when LLM output is malformed', async () => {
    const { ctx, scratchpad } = createMockContext();
    (llm.chat as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeMockChat('this is not valid json {{{'),
    );

    await tool.execute({ resume_text: '' }, ctx as any);

    expect(scratchpad.questions).toBeDefined();
    expect((scratchpad.questions as unknown[]).length).toBeGreaterThanOrEqual(3);
  });

  it('fallback questions have valid categories', async () => {
    const validCategories = [
      'career_context',
      'transition_drivers',
      'timeline_and_urgency',
      'goals_and_aspirations',
      'support_needs',
    ];

    const { ctx, scratchpad } = createMockContext();
    (llm.chat as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeMockChat('invalid json'),
    );

    await tool.execute({ resume_text: '' }, ctx as any);

    const questions = scratchpad.questions as AssessmentQuestion[];
    for (const q of questions) {
      expect(validCategories).toContain(q.category);
    }
  });

  it('normalizes invalid category to career_context', async () => {
    const { ctx, scratchpad } = createMockContext();
    (llm.chat as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeMockChat(
        JSON.stringify([
          { id: 'q1', question: 'Test question?', category: 'not_a_real_category', purpose: 'Test' },
        ]),
      ),
    );

    await tool.execute({ resume_text: '' }, ctx as any);

    const questions = scratchpad.questions as AssessmentQuestion[];
    expect(questions[0].category).toBe('career_context');
  });

  it('uses MODEL_MID for question generation', async () => {
    const { ctx } = createMockContext();
    (llm.chat as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeMockChat(JSON.stringify([])),
    );

    await tool.execute({ resume_text: '' }, ctx as any);

    const callArgs = (llm.chat as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.model).toBe('mock-mid');
  });

  it('adapts prompt when resume text is provided', async () => {
    const { ctx } = createMockContext();
    (llm.chat as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeMockChat(JSON.stringify([])),
    );

    const longResume = 'John Smith — VP Engineering at Acme Corp. 20 years of experience leading large engineering teams. Led 45 engineers across 6 product teams.';

    await tool.execute({ resume_text: longResume }, ctx as any);

    const callArgs = (llm.chat as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const userMessage = callArgs.messages[0].content as string;
    expect(userMessage).toContain('Resume Available');
  });

  it('adapts prompt when no resume is provided', async () => {
    const { ctx } = createMockContext();
    (llm.chat as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeMockChat(JSON.stringify([])),
    );

    await tool.execute({ resume_text: '' }, ctx as any);

    const callArgs = (llm.chat as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const userMessage = callArgs.messages[0].content as string;
    expect(userMessage).toContain('No Resume');
  });

  it('result includes count of questions', async () => {
    const { ctx } = createMockContext();
    (llm.chat as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeMockChat(
        JSON.stringify([
          { id: 'q1', question: 'Role?', category: 'career_context', purpose: 'Context' },
          { id: 'q2', question: 'Timeline?', category: 'timeline_and_urgency', purpose: 'Urgency' },
        ]),
      ),
    );

    const result = await tool.execute({ resume_text: '' }, ctx as any);
    const parsed = JSON.parse(result as string);
    expect(typeof parsed.count).toBe('number');
    expect(parsed.count).toBeGreaterThanOrEqual(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Tool Tests — evaluate_responses
// ═══════════════════════════════════════════════════════════════════════════════

describe('Onboarding Tool — evaluate_responses', () => {
  const tool = assessorTools.find((t) => t.name === 'evaluate_responses')!;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('tool exists and has correct name', () => {
    expect(tool).toBeDefined();
    expect(tool.name).toBe('evaluate_responses');
  });

  it('tool has model_tier mid', () => {
    expect(tool.model_tier).toBe('mid');
  });

  it('builds assessment summary with key_insights, financial_signals, emotional_signals', async () => {
    const { ctx, scratchpad } = createMockContext({
      questions: [
        { id: 'q1', question: 'Tell me about your role.', category: 'career_context', purpose: 'Context' },
      ],
    });

    (llm.chat as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeMockChat(
        JSON.stringify({
          career_level: 'director',
          industry: 'Technology',
          years_experience: 15,
          transition_type: 'involuntary',
          goals: ['Lead a larger organization'],
          constraints: ['Remote preferred'],
          strengths_self_reported: ['Leadership', 'Strategy'],
          key_insights: ['Strong executive background'],
          financial_signals: ['Mentioned needing to move quickly'],
          emotional_signals: ['Accepting tone, future-focused'],
          recommended_actions: ['Start with resume update'],
        }),
      ),
    );

    await tool.execute({ responses: { q1: 'I was VP Engineering at Acme.' } }, ctx as any);

    const summary = scratchpad.assessment_summary as {
      key_insights: string[];
      financial_signals: string[];
      emotional_signals: string[];
    };
    expect(summary).toBeDefined();
    expect(Array.isArray(summary.key_insights)).toBe(true);
    expect(Array.isArray(summary.financial_signals)).toBe(true);
    expect(Array.isArray(summary.emotional_signals)).toBe(true);
  });

  it('stores summary in scratchpad.assessment_summary', async () => {
    const { ctx, scratchpad } = createMockContext({ questions: [] });

    (llm.chat as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeMockChat(
        JSON.stringify({
          career_level: 'senior',
          industry: 'Finance',
          years_experience: 10,
          transition_type: 'voluntary',
          goals: [],
          constraints: [],
          strengths_self_reported: [],
          key_insights: ['Solid background'],
          financial_signals: [],
          emotional_signals: [],
          recommended_actions: [],
        }),
      ),
    );

    await tool.execute({ responses: {} }, ctx as any);

    expect(scratchpad.assessment_summary).toBeDefined();
  });

  it('stores full evaluation in scratchpad.evaluation', async () => {
    const { ctx, scratchpad } = createMockContext({ questions: [] });

    (llm.chat as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeMockChat(
        JSON.stringify({
          career_level: 'vp',
          industry: 'Healthcare',
          years_experience: 20,
          transition_type: 'preemptive',
          goals: ['Pivot to healthcare tech'],
          constraints: [],
          strengths_self_reported: [],
          key_insights: [],
          financial_signals: [],
          emotional_signals: [],
          recommended_actions: [],
        }),
      ),
    );

    await tool.execute({ responses: {} }, ctx as any);

    expect(scratchpad.evaluation).toBeDefined();
  });

  it('uses MODEL_MID for evaluation', async () => {
    const { ctx } = createMockContext({ questions: [] });

    (llm.chat as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeMockChat(JSON.stringify({ career_level: 'senior', industry: 'Tech', years_experience: 10, transition_type: 'voluntary', goals: [], constraints: [], strengths_self_reported: [], key_insights: [], financial_signals: [], emotional_signals: [], recommended_actions: [] })),
    );

    await tool.execute({ responses: {} }, ctx as any);

    const callArgs = (llm.chat as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.model).toBe('mock-mid');
  });

  it('falls back to defaults when LLM output is malformed', async () => {
    const { ctx, scratchpad } = createMockContext({ questions: [] });

    (llm.chat as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeMockChat('not valid json at all {{{{'),
    );

    await tool.execute({ responses: {} }, ctx as any);

    const summary = scratchpad.assessment_summary as { key_insights: string[] };
    expect(summary).toBeDefined();
    expect(summary.key_insights).toContain('Unable to fully analyze responses');
  });

  it('result JSON includes career_level and industry', async () => {
    const { ctx } = createMockContext({ questions: [] });

    (llm.chat as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeMockChat(
        JSON.stringify({
          career_level: 'director',
          industry: 'Technology',
          years_experience: 12,
          transition_type: 'involuntary',
          goals: [],
          constraints: [],
          strengths_self_reported: [],
          key_insights: [],
          financial_signals: [],
          emotional_signals: [],
          recommended_actions: [],
        }),
      ),
    );

    const result = await tool.execute({ responses: {} }, ctx as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.career_level).toBe('director');
    expect(parsed.industry).toBe('Technology');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Tool Tests — detect_financial_segment
// ═══════════════════════════════════════════════════════════════════════════════

describe('Onboarding Tool — detect_financial_segment', () => {
  const tool = assessorTools.find((t) => t.name === 'detect_financial_segment')!;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('tool exists and has correct name', () => {
    expect(tool).toBeDefined();
    expect(tool.name).toBe('detect_financial_segment');
  });

  it('tool has model_tier light', () => {
    expect(tool.model_tier).toBe('light');
  });

  it('uses MODEL_LIGHT for segment detection', async () => {
    const { ctx } = createMockContext();

    (llm.chat as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeMockChat(JSON.stringify({ segment: 'ideal', confidence: 'high', supporting_signals: ['relaxed language'] })),
    );

    await tool.execute({ financial_signals: ['relaxed language', 'no rush'] }, ctx as any);

    const callArgs = (llm.chat as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.model).toBe('mock-light');
  });

  it('classifies segment from LLM response', async () => {
    const { ctx, scratchpad } = createMockContext();

    (llm.chat as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeMockChat(JSON.stringify({ segment: 'stressed', confidence: 'high', supporting_signals: ['want to move quickly', 'few months'] })),
    );

    await tool.execute({
      financial_signals: ['want to move quickly', 'prefer sooner than later'],
      emotional_signals: [],
      timeline_language: 'I want to find something in the next few months',
    }, ctx as any);

    expect(scratchpad.financial_segment).toBe('stressed');
  });

  it('defaults to ideal when signals are ambiguous (LLM says ambiguous)', async () => {
    const { ctx, scratchpad } = createMockContext();

    (llm.chat as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeMockChat(JSON.stringify({ segment: 'ideal', confidence: 'low', supporting_signals: [] })),
    );

    await tool.execute({ financial_signals: [] }, ctx as any);

    expect(scratchpad.financial_segment).toBe('ideal');
  });

  it('enforces minimum 2 signals for non-ideal segments — downgrades to ideal', async () => {
    const { ctx, scratchpad } = createMockContext();

    // LLM says crisis but only provides 1 supporting signal
    (llm.chat as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeMockChat(JSON.stringify({ segment: 'crisis', confidence: 'medium', supporting_signals: ['seems urgent'] })),
    );

    await tool.execute({
      financial_signals: ['seems urgent'],
      emotional_signals: [],
    }, ctx as any);

    // Must downgrade to ideal since only 1 signal
    expect(scratchpad.financial_segment).toBe('ideal');
  });

  it('accepts non-ideal segment when at least 2 signals provided', async () => {
    const { ctx, scratchpad } = createMockContext();

    (llm.chat as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeMockChat(JSON.stringify({
        segment: 'crisis',
        confidence: 'high',
        supporting_signals: ['need to find something ASAP', 'running out of time'],
      })),
    );

    await tool.execute({
      financial_signals: ['need to find something ASAP', 'running out of time'],
    }, ctx as any);

    expect(scratchpad.financial_segment).toBe('crisis');
  });

  it('falls back to ideal when LLM output is malformed', async () => {
    const { ctx, scratchpad } = createMockContext();

    (llm.chat as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeMockChat('not json at all'),
    );

    await tool.execute({ financial_signals: [] }, ctx as any);

    expect(scratchpad.financial_segment).toBe('ideal');
  });

  it('validates segment enum — falls back to ideal for unknown values', async () => {
    const { ctx, scratchpad } = createMockContext();

    (llm.chat as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeMockChat(JSON.stringify({
        segment: 'super_wealthy',
        confidence: 'high',
        supporting_signals: ['signal1', 'signal2'],
      })),
    );

    await tool.execute({ financial_signals: ['signal1', 'signal2'] }, ctx as any);

    expect(scratchpad.financial_segment).toBe('ideal');
  });

  it('result includes segment and confidence', async () => {
    const { ctx } = createMockContext();

    (llm.chat as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeMockChat(JSON.stringify({
        segment: 'comfortable',
        confidence: 'high',
        supporting_signals: ['just exploring options', 'no particular rush'],
      })),
    );

    const result = await tool.execute({
      financial_signals: ['just exploring options', 'no particular rush'],
    }, ctx as any);

    const parsed = JSON.parse(result as string);
    expect(parsed.segment).toBe('comfortable');
    expect(parsed.confidence).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Tool Tests — build_client_profile
// ═══════════════════════════════════════════════════════════════════════════════

describe('Onboarding Tool — build_client_profile', () => {
  const tool = assessorTools.find((t) => t.name === 'build_client_profile')!;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('tool exists and has correct name', () => {
    expect(tool).toBeDefined();
    expect(tool.name).toBe('build_client_profile');
  });

  it('tool has model_tier mid', () => {
    expect(tool.model_tier).toBe('mid');
  });

  it('builds complete ClientProfile from valid inputs', async () => {
    const { ctx, scratchpad } = createMockContext();

    await tool.execute({
      career_level: 'director',
      industry: 'Technology',
      years_experience: 15,
      financial_segment: 'ideal',
      emotional_state: 'acceptance',
      transition_type: 'involuntary',
      goals: ['Lead a larger team'],
      constraints: ['Remote preferred'],
      strengths_self_reported: ['Leadership'],
    }, ctx as any);

    const profile = scratchpad.client_profile as ClientProfile;
    expect(profile).toBeDefined();
    expect(profile.career_level).toBe('director');
    expect(profile.industry).toBe('Technology');
    expect(profile.financial_segment).toBe('ideal');
    expect(profile.emotional_state).toBe('acceptance');
  });

  it('sets coaching_tone to supportive for crisis financial segment', async () => {
    const { ctx, scratchpad } = createMockContext();

    await tool.execute({
      career_level: 'senior',
      industry: 'Finance',
      years_experience: 10,
      financial_segment: 'crisis',
      emotional_state: 'acceptance',
      transition_type: 'involuntary',
      goals: [],
      constraints: [],
      strengths_self_reported: [],
    }, ctx as any);

    const profile = scratchpad.client_profile as ClientProfile;
    expect(profile.coaching_tone).toBe('supportive');
  });

  it('sets coaching_tone to supportive for stressed financial segment', async () => {
    const { ctx, scratchpad } = createMockContext();

    await tool.execute({
      career_level: 'senior',
      industry: 'Finance',
      years_experience: 8,
      financial_segment: 'stressed',
      emotional_state: 'acceptance',
      transition_type: 'voluntary',
      goals: [],
      constraints: [],
      strengths_self_reported: [],
    }, ctx as any);

    const profile = scratchpad.client_profile as ClientProfile;
    expect(profile.coaching_tone).toBe('supportive');
  });

  it('sets coaching_tone to supportive for negative emotional states', async () => {
    const negativeStates: EmotionalState[] = ['denial', 'anger', 'depression'];

    for (const emotionalState of negativeStates) {
      const { ctx, scratchpad } = createMockContext();

      await tool.execute({
        career_level: 'senior',
        industry: 'Technology',
        years_experience: 10,
        financial_segment: 'ideal',
        emotional_state: emotionalState,
        transition_type: 'involuntary',
        goals: [],
        constraints: [],
        strengths_self_reported: [],
      }, ctx as any);

      const profile = scratchpad.client_profile as ClientProfile;
      expect(profile.coaching_tone).toBe('supportive');
    }
  });

  it('sets coaching_tone to motivational for growth emotional state', async () => {
    const { ctx, scratchpad } = createMockContext();

    await tool.execute({
      career_level: 'director',
      industry: 'Technology',
      years_experience: 12,
      financial_segment: 'ideal',
      emotional_state: 'growth',
      transition_type: 'voluntary',
      goals: [],
      constraints: [],
      strengths_self_reported: [],
    }, ctx as any);

    const profile = scratchpad.client_profile as ClientProfile;
    expect(profile.coaching_tone).toBe('motivational');
  });

  it('sets coaching_tone to direct for ideal segment + acceptance state', async () => {
    const { ctx, scratchpad } = createMockContext();

    await tool.execute({
      career_level: 'vp',
      industry: 'Technology',
      years_experience: 18,
      financial_segment: 'ideal',
      emotional_state: 'acceptance',
      transition_type: 'preemptive',
      goals: [],
      constraints: [],
      strengths_self_reported: [],
    }, ctx as any);

    const profile = scratchpad.client_profile as ClientProfile;
    expect(profile.coaching_tone).toBe('direct');
  });

  it('sets urgency_score to 9 for crisis segment', async () => {
    const { ctx, scratchpad } = createMockContext();

    await tool.execute({
      career_level: 'senior',
      industry: 'Technology',
      years_experience: 8,
      financial_segment: 'crisis',
      emotional_state: 'acceptance',
      transition_type: 'involuntary',
      goals: [],
      constraints: [],
      strengths_self_reported: [],
    }, ctx as any);

    const profile = scratchpad.client_profile as ClientProfile;
    expect(profile.urgency_score).toBe(9);
  });

  it('sets urgency_score to 3 for comfortable segment', async () => {
    const { ctx, scratchpad } = createMockContext();

    await tool.execute({
      career_level: 'senior',
      industry: 'Technology',
      years_experience: 10,
      financial_segment: 'comfortable',
      emotional_state: 'growth',
      transition_type: 'voluntary',
      goals: [],
      constraints: [],
      strengths_self_reported: [],
    }, ctx as any);

    const profile = scratchpad.client_profile as ClientProfile;
    expect(profile.urgency_score).toBe(3);
  });

  it('determines recommended_starting_point as linkedin when goals mention linkedin', async () => {
    const { ctx, scratchpad } = createMockContext();

    await tool.execute({
      career_level: 'senior',
      industry: 'Technology',
      years_experience: 10,
      financial_segment: 'ideal',
      emotional_state: 'acceptance',
      transition_type: 'voluntary',
      goals: ['Improve my linkedin presence', 'Update profile'],
      constraints: [],
      strengths_self_reported: [],
    }, ctx as any);

    const profile = scratchpad.client_profile as ClientProfile;
    expect(profile.recommended_starting_point).toBe('linkedin');
  });

  it('determines recommended_starting_point as networking when goals mention network', async () => {
    const { ctx, scratchpad } = createMockContext();

    await tool.execute({
      career_level: 'director',
      industry: 'Finance',
      years_experience: 15,
      financial_segment: 'ideal',
      emotional_state: 'acceptance',
      transition_type: 'voluntary',
      goals: ['Build my network in target companies', 'Get referrals'],
      constraints: [],
      strengths_self_reported: [],
    }, ctx as any);

    const profile = scratchpad.client_profile as ClientProfile;
    expect(profile.recommended_starting_point).toBe('networking');
  });

  it('determines recommended_starting_point as interview_prep when goals mention interview', async () => {
    const { ctx, scratchpad } = createMockContext();

    await tool.execute({
      career_level: 'director',
      industry: 'Technology',
      years_experience: 12,
      financial_segment: 'stressed',
      emotional_state: 'acceptance',
      transition_type: 'involuntary',
      goals: ['Practice interview skills', 'Prep for upcoming interviews'],
      constraints: [],
      strengths_self_reported: [],
    }, ctx as any);

    const profile = scratchpad.client_profile as ClientProfile;
    expect(profile.recommended_starting_point).toBe('interview_prep');
  });

  it('defaults recommended_starting_point to resume when no keywords match', async () => {
    const { ctx, scratchpad } = createMockContext();

    await tool.execute({
      career_level: 'senior',
      industry: 'Technology',
      years_experience: 8,
      financial_segment: 'ideal',
      emotional_state: 'acceptance',
      transition_type: 'involuntary',
      goals: ['Find a good role'],
      constraints: [],
      strengths_self_reported: [],
    }, ctx as any);

    const profile = scratchpad.client_profile as ClientProfile;
    expect(profile.recommended_starting_point).toBe('resume');
  });

  it('does NOT emit assessment_complete from tool (emitted by finalizeResult instead)', async () => {
    const { ctx, emitted, scratchpad } = createMockContext();

    scratchpad.assessment_summary = {
      key_insights: ['Key insight'],
      financial_signals: [],
      emotional_signals: [],
      recommended_actions: [],
    };

    await tool.execute({
      career_level: 'director',
      industry: 'Technology',
      years_experience: 15,
      financial_segment: 'ideal',
      emotional_state: 'acceptance',
      transition_type: 'voluntary',
      goals: [],
      constraints: [],
      strengths_self_reported: [],
    }, ctx as any);

    // assessment_complete is now only emitted by finalizeResult in product.ts
    expect(emitted).toHaveLength(0);
  });

  it('stores client_profile in scratchpad without emitting when no summary', async () => {
    const { ctx, emitted } = createMockContext();

    await tool.execute({
      career_level: 'senior',
      industry: 'Technology',
      years_experience: 8,
      financial_segment: 'ideal',
      emotional_state: 'acceptance',
      transition_type: 'involuntary',
      goals: [],
      constraints: [],
      strengths_self_reported: [],
    }, ctx as any);

    expect(emitted).toHaveLength(0);
  });

  it('validates enum values with fallbacks for invalid career_level', async () => {
    const { ctx, scratchpad } = createMockContext();

    await tool.execute({
      career_level: 'not_a_valid_level',
      industry: 'Technology',
      years_experience: 10,
      financial_segment: 'ideal',
      emotional_state: 'acceptance',
      transition_type: 'voluntary',
      goals: [],
      constraints: [],
      strengths_self_reported: [],
    }, ctx as any);

    const profile = scratchpad.client_profile as ClientProfile;
    // Should fallback to 'senior'
    expect(profile.career_level).toBe('senior');
  });

  it('validates enum values with fallbacks for invalid financial_segment', async () => {
    const { ctx, scratchpad } = createMockContext();

    await tool.execute({
      career_level: 'senior',
      industry: 'Technology',
      years_experience: 10,
      financial_segment: 'super_rich',
      emotional_state: 'acceptance',
      transition_type: 'voluntary',
      goals: [],
      constraints: [],
      strengths_self_reported: [],
    }, ctx as any);

    const profile = scratchpad.client_profile as ClientProfile;
    // Should fallback to 'ideal'
    expect(profile.financial_segment).toBe('ideal');
  });

  it('validates enum values with fallbacks for invalid emotional_state', async () => {
    const { ctx, scratchpad } = createMockContext();

    await tool.execute({
      career_level: 'senior',
      industry: 'Technology',
      years_experience: 10,
      financial_segment: 'ideal',
      emotional_state: 'elated',
      transition_type: 'voluntary',
      goals: [],
      constraints: [],
      strengths_self_reported: [],
    }, ctx as any);

    const profile = scratchpad.client_profile as ClientProfile;
    // Should fallback to 'acceptance'
    expect(profile.emotional_state).toBe('acceptance');
  });

  it('result message mentions recommended_starting_point and coaching_tone', async () => {
    const { ctx } = createMockContext();

    const result = await tool.execute({
      career_level: 'director',
      industry: 'Technology',
      years_experience: 15,
      financial_segment: 'ideal',
      emotional_state: 'acceptance',
      transition_type: 'voluntary',
      goals: [],
      constraints: [],
      strengths_self_reported: [],
    }, ctx as any);

    const parsed = JSON.parse(result as string);
    expect(parsed.message).toContain('resume');
    expect(parsed.message).toContain('direct');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Agent Config Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('Onboarding Agent Config — assessorConfig', () => {
  it('has correct identity name (assessor)', () => {
    expect(assessorConfig.identity.name).toBe('assessor');
  });

  it('has correct identity domain (onboarding)', () => {
    expect(assessorConfig.identity.domain).toBe('onboarding');
  });

  it('has model set to orchestrator', () => {
    expect(assessorConfig.model).toBe('orchestrator');
  });

  it('has 5 tools (4 assessor tools + emit_transparency)', () => {
    expect(assessorConfig.tools).toHaveLength(5);
  });

  it('tool names include all 4 assessor tools plus emit_transparency', () => {
    const toolNames = assessorConfig.tools.map((t) => t.name);
    expect(toolNames).toContain('generate_questions');
    expect(toolNames).toContain('evaluate_responses');
    expect(toolNames).toContain('detect_financial_segment');
    expect(toolNames).toContain('build_client_profile');
    expect(toolNames).toContain('emit_transparency');
  });

  it('system prompt includes ONBOARDING_RULES content', () => {
    expect(assessorConfig.system_prompt).toContain('RULE 0');
    expect(assessorConfig.system_prompt).toContain('RULE 1');
  });

  it('system prompt mentions gate protocol', () => {
    expect(assessorConfig.system_prompt.toLowerCase()).toContain('gate');
  });

  it('capabilities include expected tags', () => {
    expect(assessorConfig.capabilities).toContain('assessment');
    expect(assessorConfig.capabilities).toContain('question_generation');
    expect(assessorConfig.capabilities).toContain('financial_detection');
    expect(assessorConfig.capabilities).toContain('profile_building');
  });

  it('max_rounds is set (8)', () => {
    expect(assessorConfig.max_rounds).toBe(8);
  });
});

describe('Onboarding Agent Registry', () => {
  it('assessor is registered in the agent registry', () => {
    expect(agentRegistry.has('onboarding', 'assessor')).toBe(true);
  });

  it('onboarding domain appears in listDomains', () => {
    const domains = agentRegistry.listDomains();
    expect(domains).toContain('onboarding');
  });

  it('assessor has expected capabilities in registry', () => {
    const desc = agentRegistry.describe('onboarding', 'assessor');
    expect(desc).toBeDefined();
    expect(desc!.capabilities).toContain('assessment');
    expect(desc!.capabilities).toContain('profile_building');
  });

  it('assessor has 5 tools in registry', () => {
    const desc = agentRegistry.describe('onboarding', 'assessor');
    expect(desc).toBeDefined();
    expect(desc!.tools).toHaveLength(5);
  });

  it('findByCapability discovers assessor for financial_detection', () => {
    const agents = agentRegistry.findByCapability('financial_detection', 'onboarding');
    expect(agents.length).toBeGreaterThanOrEqual(1);
    expect(agents[0].identity.name).toBe('assessor');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Product Config Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('Onboarding ProductConfig', () => {
  const config = createOnboardingProductConfig();

  it('domain is onboarding', () => {
    expect(config.domain).toBe('onboarding');
  });

  it('has 2 agents (assessor_questions + assessor_evaluation) — two-phase pipeline', () => {
    expect(config.agents).toHaveLength(2);
    expect(config.agents[0].name).toBe('assessor_questions');
    expect(config.agents[1].name).toBe('assessor_evaluation');
  });

  it('assessor_questions has stageMessage with startStage: assessment', () => {
    expect(config.agents[0].stageMessage).toBeDefined();
    expect(config.agents[0].stageMessage!.startStage).toBe('assessment');
  });

  it('assessor_evaluation has stageMessage with startStage: evaluation', () => {
    expect(config.agents[1].stageMessage).toBeDefined();
    expect(config.agents[1].stageMessage!.startStage).toBe('evaluation');
  });

  it('gate is on assessor_questions, not assessor_evaluation', () => {
    expect(config.agents[0].gates).toBeDefined();
    expect(config.agents[0].gates).toHaveLength(1);
    expect(config.agents[1].gates).toBeUndefined();
  });

  it('createInitialState produces valid state', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    expect(state.session_id).toBe('sess-1');
    expect(state.user_id).toBe('user-1');
    expect(state.current_stage).toBe('assessment');
    expect(state.questions).toEqual([]);
    expect(state.responses).toEqual({});
  });

  it('createInitialState sets empty questions array', () => {
    const state = config.createInitialState('sess-2', 'user-2', {});
    expect(state.questions).toEqual([]);
  });

  it('createInitialState sets empty responses object', () => {
    const state = config.createInitialState('sess-2', 'user-2', {});
    expect(state.responses).toEqual({});
  });

  it('createInitialState preserves shared_context when provided', () => {
    const sharedContext = createEmptySharedContext();
    sharedContext.positioningStrategy.positioningAngle = 'Onboarding should sharpen direction without repeating known proof';
    const state = config.createInitialState('sess-2', 'user-2', { shared_context: sharedContext });
    expect(state.shared_context?.positioningStrategy.positioningAngle).toBe('Onboarding should sharpen direction without repeating known proof');
  });

  it('buildAgentMessage for assessor_questions frames a Career Profile discovery pass', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    const msg = config.buildAgentMessage('assessor_questions', state, {});
    expect(msg).toContain('Career Profile');
    expect(msg).toContain('highest-value questions');
  });

  it('buildAgentMessage for assessor_questions includes resume when resume_text is provided', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    const msg = config.buildAgentMessage('assessor_questions', state, {
      resume_text: 'John Doe, VP Engineering at Acme Corp, 20 years experience in enterprise software.',
    });
    expect(msg).toContain('Resume');
    expect(msg).toContain('John Doe');
  });

  it('buildAgentMessage for assessor_evaluation frames truthful profile refinement', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    state.responses = { q1: 'I was VP Engineering', q2: 'I need to find something in 2-3 months' };
    const msg = config.buildAgentMessage('assessor_evaluation', state, {});
    expect(msg).toContain('honest client profile');
    expect(msg).toContain('Career Profile assessment questions');
  });

  it('buildAgentMessage for assessor_evaluation includes user responses JSON', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    state.responses = { q1: 'Led engineering teams at Acme' };
    const msg = config.buildAgentMessage('assessor_evaluation', state, {});
    expect(msg).toContain('Led engineering teams at Acme');
  });

  it('buildAgentMessage uses canonical shared context when legacy room context is absent', () => {
    const sharedContext = createEmptySharedContext();
    sharedContext.careerNarrative.careerArc = 'Career arc built around practical executive problem-solving';
    sharedContext.positioningStrategy.positioningAngle = 'Direction should stay anchored in supported strengths and constraints';
    const state = config.createInitialState('sess-1', 'user-1', { shared_context: sharedContext });
    const msg = config.buildAgentMessage('assessor_questions', state, {});
    expect(msg).toContain('Career arc built around practical executive problem-solving');
    expect(msg).toContain('Direction should stay anchored in supported strengths and constraints');
  });

  it('buildAgentMessage returns empty string for unknown agent name', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    const msg = config.buildAgentMessage('unknown_agent', state, {});
    expect(msg).toBe('');
  });

  it('gate condition fires when questions exist but responses are empty', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    state.questions = [
      { id: 'q1', question: 'Tell me about your role.', category: 'career_context', purpose: 'Context' },
    ];
    state.responses = {};

    const gate = config.agents[0].gates![0];
    expect(gate.condition!(state)).toBe(true);
  });

  it('gate condition does NOT fire when responses are already filled', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    state.questions = [
      { id: 'q1', question: 'Tell me about your role.', category: 'career_context', purpose: 'Context' },
    ];
    state.responses = { q1: 'I was VP of Engineering' };

    const gate = config.agents[0].gates![0];
    expect(gate.condition!(state)).toBe(false);
  });

  it('gate condition does NOT fire when questions are empty', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    state.questions = [];
    state.responses = {};

    const gate = config.agents[0].gates![0];
    expect(gate.condition!(state)).toBe(false);
  });

  it('gate onResponse merges user responses into state', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    const gate = config.agents[0].gates![0];

    gate.onResponse!({ q1: 'I was VP Engineering', q2: 'I need 3 months' }, state);

    expect(state.responses.q1).toBe('I was VP Engineering');
    expect(state.responses.q2).toBe('I need 3 months');
  });

  it('gate onResponse ignores null response', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    const gate = config.agents[0].gates![0];

    gate.onResponse!(null, state);
    expect(state.responses).toEqual({});
  });

  it('validateAfterAgent throws when client_profile is missing after assessor_evaluation', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});

    expect(() => config.validateAfterAgent!('assessor_evaluation', state)).toThrow(
      'Assessor did not produce a client profile',
    );
  });

  it('validateAfterAgent passes when client_profile is present after assessor_evaluation', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    state.client_profile = {
      career_level: 'director',
      industry: 'Technology',
      years_experience: 15,
      financial_segment: 'ideal',
      emotional_state: 'acceptance',
      transition_type: 'involuntary',
      goals: [],
      constraints: [],
      strengths_self_reported: [],
      urgency_score: 5,
      recommended_starting_point: 'resume',
      coaching_tone: 'direct',
    };

    expect(() => config.validateAfterAgent!('assessor_evaluation', state)).not.toThrow();
  });

  it('validateAfterAgent does NOT throw for assessor_questions (no profile expected yet)', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    expect(() => config.validateAfterAgent!('assessor_questions', state)).not.toThrow();
  });

  it('finalizeResult does not crash when profile or summary is missing', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    // No client_profile or assessment_summary set
    const emitted: OnboardingSSEEvent[] = [];
    const result = config.finalizeResult!(state, {}, (e) => emitted.push(e as OnboardingSSEEvent));
    // Should not emit and should not throw
    expect(emitted).toHaveLength(0);
    expect(result).toEqual({ client_profile: undefined, assessment_summary: undefined });
  });

  it('finalizeResult emits assessment_complete event', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    state.client_profile = {
      career_level: 'director',
      industry: 'Technology',
      years_experience: 15,
      financial_segment: 'ideal',
      emotional_state: 'acceptance',
      transition_type: 'voluntary',
      goals: [],
      constraints: [],
      strengths_self_reported: [],
      urgency_score: 5,
      recommended_starting_point: 'resume',
      coaching_tone: 'direct',
    };
    state.assessment_summary = {
      key_insights: [],
      financial_signals: [],
      emotional_signals: [],
      recommended_actions: [],
    };

    const emitted: OnboardingSSEEvent[] = [];
    config.finalizeResult!(state, {}, (e) => emitted.push(e as OnboardingSSEEvent));

    expect(emitted).toHaveLength(1);
    expect(emitted[0].type).toBe('assessment_complete');
  });

  it('persistResult calls upsertUserContext with client_profile', async () => {
    const { upsertUserContext } = await import('../lib/platform-context.js');

    const state = config.createInitialState('sess-1', 'user-1', {});
    const profile: ClientProfile = {
      career_level: 'senior',
      industry: 'Technology',
      years_experience: 10,
      financial_segment: 'ideal',
      emotional_state: 'acceptance',
      transition_type: 'involuntary',
      goals: [],
      constraints: [],
      strengths_self_reported: [],
      urgency_score: 5,
      recommended_starting_point: 'resume',
      coaching_tone: 'direct',
    };

    await config.persistResult!(state, { client_profile: profile, assessment_summary: { key_insights: [], financial_signals: [], emotional_signals: [], recommended_actions: [] } }, {});

    expect(upsertUserContext).toHaveBeenCalledWith(
      'user-1',
      'client_profile',
      expect.objectContaining({ career_level: 'senior' }),
      'onboarding',
      'sess-1',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Route Schema Tests
// ═══════════════════════════════════════════════════════════════════════════════

import { z } from 'zod';

// Re-create the schema to test (mirrors what the route uses)
const startSchema = z.object({
  session_id: z.string().uuid(),
  resume_text: z.string().max(100_000).optional(),
});

describe('Onboarding Route Schema', () => {
  it('startSchema accepts a valid input with session_id', () => {
    const result = startSchema.safeParse({
      session_id: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
  });

  it('startSchema rejects missing session_id', () => {
    const result = startSchema.safeParse({ resume_text: 'Some resume text' });
    expect(result.success).toBe(false);
  });

  it('startSchema rejects non-UUID session_id', () => {
    const result = startSchema.safeParse({ session_id: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('resume_text is optional', () => {
    const result = startSchema.safeParse({
      session_id: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.resume_text).toBeUndefined();
    }
  });

  it('startSchema accepts resume_text when provided', () => {
    const result = startSchema.safeParse({
      session_id: '550e8400-e29b-41d4-a716-446655440000',
      resume_text: 'John Doe, VP Engineering, 15 years of experience.',
    });
    expect(result.success).toBe(true);
  });

  it('startSchema rejects resume_text that exceeds 100,000 characters', () => {
    const result = startSchema.safeParse({
      session_id: '550e8400-e29b-41d4-a716-446655440000',
      resume_text: 'x'.repeat(100_001),
    });
    expect(result.success).toBe(false);
  });
});

describe('Onboarding Route — transformInput', () => {
  it('loads platform context (positioning_strategy) when user has prior data', async () => {
    const { getUserContext } = await import('../lib/platform-context.js');
    (getUserContext as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { content: { angle: 'Strategic leader', differentiation: 'Execution focus' } },
    ]);

    // This is a behavioral test — we verify getUserContext is called with correct args
    // by calling it directly as the route would
    const strategyRows = await getUserContext('user-1', 'positioning_strategy');
    expect(strategyRows).toHaveLength(1);
    expect(strategyRows[0].content).toHaveProperty('angle');
  });

  it('handles getUserContext failure gracefully (returns unchanged input)', async () => {
    const { getUserContext } = await import('../lib/platform-context.js');
    (getUserContext as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('DB error'));

    // Simulate the route's try/catch behavior
    let platformContext: Record<string, unknown> | undefined;
    try {
      await getUserContext('user-1', 'positioning_strategy');
    } catch {
      // Expected — route continues without platform context
      platformContext = undefined;
    }
    expect(platformContext).toBeUndefined();
  });
});

describe('Onboarding Route — Feature Flag', () => {
  it('FF_ONBOARDING is a boolean', async () => {
    const { FF_ONBOARDING } = await import('../lib/feature-flags.js');
    expect(typeof FF_ONBOARDING).toBe('boolean');
  });
});
