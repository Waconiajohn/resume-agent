/**
 * Counter-Offer Simulation — Server tests.
 *
 * Tests agent registration, tool definitions, product config behavior,
 * and tool execution for all 4 employer tools:
 *   generate_pushback, present_to_user_pushback, evaluate_response, emit_transparency
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────

const mockChat = vi.hoisted(() => vi.fn());

vi.mock('../lib/llm.js', () => ({
  llm: { chat: mockChat },
  MODEL_MID: 'test-mid',
  MODEL_PRIMARY: 'test-primary',
  MODEL_LIGHT: 'test-light',
  MODEL_ORCHESTRATOR: 'test-orchestrator',
  MODEL_PRICING: {},
}));

vi.mock('../lib/json-repair.js', () => ({
  repairJSON: vi.fn((text: string) => {
    try { return JSON.parse(text); } catch { return null; }
  }),
}));

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: () => ({
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      select: () => ({
        eq: () => ({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    }),
  },
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

// ─── Imports ──────────────────────────────────────────────────────────

import { employerTools } from '../agents/salary-negotiation/simulation/employer/tools.js';
import { employerConfig } from '../agents/salary-negotiation/simulation/employer/agent.js';
import { createCounterOfferSimProductConfig } from '../agents/salary-negotiation/simulation/product.js';
import { agentRegistry } from '../agents/runtime/agent-registry.js';
import type {
  CounterOfferSimState,
  CounterOfferSSEEvent,
  EmployerPushback,
} from '../agents/salary-negotiation/simulation/types.js';
import {
  makeMockGenericContext,
  makeMockLLMResponse,
} from './helpers/mock-factories.js';

// ─── Shared state factory ─────────────────────────────────────────────

function makeState(overrides: Partial<CounterOfferSimState> = {}): CounterOfferSimState {
  return {
    session_id: 'sess-1',
    user_id: 'user-1',
    current_stage: 'negotiation',
    mode: 'full',
    max_rounds: 3,
    current_round: 1,
    pushbacks: [{
      round: 1,
      round_type: 'initial_response',
      employer_statement: 'This is our best offer at this time.',
      employer_tactic: 'anchoring',
      coaching_hint: 'Stay anchored to your value.',
    }],
    evaluations: [],
    offer_company: 'TechCorp',
    offer_role: 'VP Engineering',
    offer_base_salary: 200000,
    offer_total_comp: 280000,
    target_salary: 240000,
    ...overrides,
  };
}

function makeContext(state: CounterOfferSimState) {
  return makeMockGenericContext<CounterOfferSimState, CounterOfferSSEEvent>(state);
}

// ═══════════════════════════════════════════════════════════════════════
// Agent Registration
// ═══════════════════════════════════════════════════════════════════════

describe('Counter-Offer Simulation Agent Registration', () => {
  it('employer is registered in the agent registry', () => {
    expect(agentRegistry.has('counter-offer-simulation', 'employer')).toBe(true);
  });

  it('counter-offer-simulation domain appears in listDomains', () => {
    const domains = agentRegistry.listDomains();
    expect(domains).toContain('counter-offer-simulation');
  });

  it('employer has expected capabilities', () => {
    const desc = agentRegistry.describe('counter-offer-simulation', 'employer');
    expect(desc).toBeDefined();
    expect(desc!.capabilities).toContain('counter_offer_simulation');
    expect(desc!.capabilities).toContain('negotiation_coaching');
    expect(desc!.capabilities).toContain('salary_negotiation');
  });

  it('employer has exactly 4 tools', () => {
    const desc = agentRegistry.describe('counter-offer-simulation', 'employer');
    expect(desc).toBeDefined();
    expect(desc!.tools).toHaveLength(4);
  });

  it('employer tools include all 4 expected names', () => {
    const desc = agentRegistry.describe('counter-offer-simulation', 'employer');
    expect(desc).toBeDefined();
    expect(desc!.tools).toContain('generate_pushback');
    expect(desc!.tools).toContain('present_to_user_pushback');
    expect(desc!.tools).toContain('evaluate_response');
    expect(desc!.tools).toContain('emit_transparency');
  });

  it('employer model is orchestrator', () => {
    expect(employerConfig.model).toBe('orchestrator');
  });

  it('findByCapability discovers employer for counter_offer_simulation', () => {
    const agents = agentRegistry.findByCapability(
      'counter_offer_simulation',
      'counter-offer-simulation',
    );
    expect(agents.length).toBeGreaterThanOrEqual(1);
    expect(agents[0].identity.name).toBe('employer');
  });

  it('findByCapability discovers employer for negotiation_coaching', () => {
    const agents = agentRegistry.findByCapability(
      'negotiation_coaching',
      'counter-offer-simulation',
    );
    expect(agents.length).toBeGreaterThanOrEqual(1);
    expect(agents[0].identity.name).toBe('employer');
  });

  it('employer overall_timeout_ms is at least 5 minutes', () => {
    expect(employerConfig.overall_timeout_ms).toBeGreaterThanOrEqual(300_000);
  });

  it('parallel_safe_tools contains emit_transparency', () => {
    expect(employerConfig.parallel_safe_tools).toContain('emit_transparency');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Tool Definitions
// ═══════════════════════════════════════════════════════════════════════

describe('Counter-Offer Simulation Tool Definitions', () => {
  it('employerTools exports an array of 4 tools', () => {
    expect(employerTools).toHaveLength(4);
  });

  it('all tools have descriptions longer than 20 characters', () => {
    for (const tool of employerTools) {
      expect(tool.description).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(20);
    }
  });

  it('all tools have input_schema with type object', () => {
    for (const tool of employerTools) {
      expect(tool.input_schema.type).toBe('object');
    }
  });

  it('generate_pushback has model_tier mid', () => {
    const tool = employerTools.find((t) => t.name === 'generate_pushback');
    expect(tool).toBeDefined();
    expect(tool!.model_tier).toBe('mid');
  });

  it('evaluate_response has model_tier mid', () => {
    const tool = employerTools.find((t) => t.name === 'evaluate_response');
    expect(tool).toBeDefined();
    expect(tool!.model_tier).toBe('mid');
  });

  it('generate_pushback input_schema requires round_type', () => {
    const tool = employerTools.find((t) => t.name === 'generate_pushback');
    expect(tool!.input_schema.required).toContain('round_type');
  });

  it('generate_pushback round_type enum has 3 values', () => {
    const tool = employerTools.find((t) => t.name === 'generate_pushback');
    const props = tool!.input_schema.properties as Record<string, Record<string, unknown>> | undefined;
    const roundTypeProp = props?.['round_type'];
    expect(roundTypeProp?.['enum']).toEqual(['initial_response', 'counter', 'final']);
  });

  it('present_to_user_pushback input_schema requires round', () => {
    const tool = employerTools.find((t) => t.name === 'present_to_user_pushback');
    expect(tool!.input_schema.required).toContain('round');
  });

  it('evaluate_response input_schema requires round and user_response', () => {
    const tool = employerTools.find((t) => t.name === 'evaluate_response');
    expect(tool!.input_schema.required).toContain('round');
    expect(tool!.input_schema.required).toContain('user_response');
  });

  it('emit_transparency input_schema requires message', () => {
    const tool = employerTools.find((t) => t.name === 'emit_transparency');
    expect(tool!.input_schema.required).toContain('message');
  });

  it('present_to_user_pushback description mentions "gate"', () => {
    const tool = employerTools.find((t) => t.name === 'present_to_user_pushback');
    expect(tool!.description.toLowerCase()).toContain('gate');
  });

  it('generate_pushback description mentions "tactic"', () => {
    const tool = employerTools.find((t) => t.name === 'generate_pushback');
    expect(tool!.description.toLowerCase()).toContain('tactic');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Tool: generate_pushback
// ═══════════════════════════════════════════════════════════════════════

describe('generate_pushback tool', () => {
  const generatePushback = employerTools.find((t) => t.name === 'generate_pushback')!;

  beforeEach(() => {
    mockChat.mockReset();
  });

  it('happy path — returns pushback with round and statement', async () => {
    mockChat.mockResolvedValue(
      makeMockLLMResponse({
        employer_statement: 'Our budget for this role is firmly set at the offered amount.',
        employer_tactic: 'budget_constraints',
        coaching_hint: 'Counter with market data and your specific value.',
      }),
    );

    const state = makeState({ pushbacks: [], current_round: 0 });
    const ctx = makeContext(state);

    const result = await generatePushback.execute({ round_type: 'initial_response' }, ctx as never);
    const parsed = JSON.parse(result as string);

    expect(parsed.pushback).toBeDefined();
    expect(parsed.pushback.round).toBe(1);
    expect(parsed.pushback.round_type).toBe('initial_response');
    expect(parsed.pushback.employer_statement).toContain('budget');
    expect(parsed.pushback.employer_tactic).toBe('budget_constraints');
    expect(parsed.pushback.coaching_hint).toBeTruthy();
    expect(parsed.round).toBe(1);
  });

  it('persists pushback to state via updateState', async () => {
    mockChat.mockResolvedValue(
      makeMockLLMResponse({
        employer_statement: 'We appreciate your counter but this is our maximum.',
        employer_tactic: 'anchoring',
        coaching_hint: 'Do not accept their frame.',
      }),
    );

    const state = makeState({ pushbacks: [], current_round: 0 });
    const ctx = makeContext(state);

    await generatePushback.execute({ round_type: 'counter' }, ctx as never);

    // updateState is a real function in the mock context — verify via getState()
    const updated = ctx.getState();
    expect(updated.pushbacks).toHaveLength(1);
    expect(updated.pushbacks[0].round_type).toBe('counter');
    expect(updated.pushbacks[0].round).toBe(1);
    expect(updated.current_round).toBe(1);
  });

  it('accumulates pushbacks in scratchpad', async () => {
    mockChat.mockResolvedValue(
      makeMockLLMResponse({
        employer_statement: 'Final answer.',
        employer_tactic: 'time_pressure',
        coaching_hint: 'Stay calm.',
      }),
    );

    const state = makeState({ pushbacks: [], current_round: 0 });
    const ctx = makeContext(state);

    await generatePushback.execute({ round_type: 'final' }, ctx as never);

    expect(Array.isArray(ctx.scratchpad.pushbacks)).toBe(true);
    expect((ctx.scratchpad.pushbacks as EmployerPushback[]).length).toBe(1);
  });

  it('round number is prior pushbacks length + 1', async () => {
    mockChat.mockResolvedValue(
      makeMockLLMResponse({
        employer_statement: 'We can meet you halfway on the equity.',
        employer_tactic: 'equity_substitution',
        coaching_hint: 'Separate base from equity in your counter.',
      }),
    );

    // State already has 2 pushbacks — next round should be 3
    const state = makeState({
      pushbacks: [
        { round: 1, round_type: 'initial_response', employer_statement: 'Round 1', employer_tactic: 'anchoring', coaching_hint: 'Hint 1' },
        { round: 2, round_type: 'counter', employer_statement: 'Round 2', employer_tactic: 'budget_constraints', coaching_hint: 'Hint 2' },
      ],
      current_round: 2,
    });
    const ctx = makeContext(state);

    const result = await generatePushback.execute({ round_type: 'final' }, ctx as never);
    const parsed = JSON.parse(result as string);

    expect(parsed.round).toBe(3);
    expect(parsed.pushback.round).toBe(3);
  });

  it('null LLM response falls back to default employer statement', async () => {
    mockChat.mockResolvedValue({ text: 'not valid json!!!', tool_calls: [], usage: { input_tokens: 0, output_tokens: 0 } });

    const state = makeState({ pushbacks: [], current_round: 0 });
    const ctx = makeContext(state);

    const result = await generatePushback.execute({ round_type: 'initial_response' }, ctx as never);
    const parsed = JSON.parse(result as string);

    expect(parsed.pushback.employer_statement).toBeTruthy();
    expect(parsed.pushback.employer_tactic).toBe('budget_constraints');
    expect(parsed.pushback.coaching_hint).toBeTruthy();
  });

  it('invalid round_type falls back to initial_response', async () => {
    mockChat.mockResolvedValue(
      makeMockLLMResponse({
        employer_statement: 'This is our offer.',
        employer_tactic: 'anchoring',
        coaching_hint: 'Stay firm.',
      }),
    );

    const state = makeState({ pushbacks: [], current_round: 0 });
    const ctx = makeContext(state);

    const result = await generatePushback.execute(
      { round_type: 'not_a_valid_type' },
      ctx as never,
    );
    const parsed = JSON.parse(result as string);

    expect(parsed.pushback.round_type).toBe('initial_response');
  });

  it('includes context_notes in the prompt when provided', async () => {
    let capturedMessages: unknown[] = [];
    mockChat.mockImplementation(({ messages }: { messages: unknown[] }) => {
      capturedMessages = messages;
      return Promise.resolve(
        makeMockLLMResponse({
          employer_statement: 'Equity is where we have flexibility.',
          employer_tactic: 'equity_substitution',
          coaching_hint: 'Clarify vesting schedule before negotiating.',
        }),
      );
    });

    const state = makeState({ pushbacks: [], current_round: 0 });
    const ctx = makeContext(state);

    await generatePushback.execute(
      { round_type: 'counter', context_notes: 'Focus on equity vs base trade-off' },
      ctx as never,
    );

    const content = (capturedMessages[0] as { content: string }).content;
    expect(content).toContain('equity vs base trade-off');
  });

  it('includes prior pushbacks in context for continuity', async () => {
    let capturedMessages: unknown[] = [];
    mockChat.mockImplementation(({ messages }: { messages: unknown[] }) => {
      capturedMessages = messages;
      return Promise.resolve(
        makeMockLLMResponse({
          employer_statement: 'We stand by round 1.',
          employer_tactic: 'anchoring',
          coaching_hint: 'Reference your progress from round 1.',
        }),
      );
    });

    const state = makeState({
      pushbacks: [
        {
          round: 1,
          round_type: 'initial_response',
          employer_statement: 'Our budget is fixed.',
          employer_tactic: 'budget_constraints',
          coaching_hint: 'Push back with data.',
        },
      ],
      current_round: 1,
    });
    const ctx = makeContext(state);

    await generatePushback.execute({ round_type: 'counter' }, ctx as never);

    const content = (capturedMessages[0] as { content: string }).content;
    expect(content).toContain('Prior Pushback Rounds');
    expect(content).toContain('Our budget is fixed.');
  });

  it('includes last user evaluation context when evaluations exist', async () => {
    let capturedMessages: unknown[] = [];
    mockChat.mockImplementation(({ messages }: { messages: unknown[] }) => {
      capturedMessages = messages;
      return Promise.resolve(
        makeMockLLMResponse({
          employer_statement: 'We see you have experience. Our budget is still fixed.',
          employer_tactic: 'budget_constraints',
          coaching_hint: 'Build on your last response.',
        }),
      );
    });

    const state = makeState({
      evaluations: [{
        round: 1,
        user_response: 'I bring $3M in documented cost savings.',
        scores: { confidence: 80, value_anchoring: 75, specificity: 90, collaboration: 85 },
        overall_score: 82,
        what_worked: ['Good specificity'],
        what_to_improve: ['Add more market data'],
        coach_note: 'Lead with market benchmarks next.',
      }],
    });
    const ctx = makeContext(state);

    await generatePushback.execute({ round_type: 'counter' }, ctx as never);

    const content = (capturedMessages[0] as { content: string }).content;
    expect(content).toContain('Last User Response');
    expect(content).toContain('$3M in documented cost savings');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Tool: present_to_user_pushback
// ═══════════════════════════════════════════════════════════════════════

describe('present_to_user_pushback tool', () => {
  const presentToUser = employerTools.find((t) => t.name === 'present_to_user_pushback')!;

  beforeEach(() => {
    mockChat.mockReset();
  });

  it('happy path — emits pushback_presented event', async () => {
    const state = makeState();
    const ctx = makeContext(state);
    (ctx.waitForUser as ReturnType<typeof vi.fn>).mockResolvedValue('I appreciate the offer but my market value is $240K.');

    await presentToUser.execute({ round: 1 }, ctx as never);

    expect(ctx.emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'pushback_presented' }),
    );
  });

  it('emitted pushback_presented event contains the correct pushback', async () => {
    const state = makeState();
    const ctx = makeContext(state);
    (ctx.waitForUser as ReturnType<typeof vi.fn>).mockResolvedValue('My response.');

    await presentToUser.execute({ round: 1 }, ctx as never);

    const call = ctx.emitSpy.mock.calls[0][0] as { type: string; pushback: EmployerPushback };
    expect(call.pushback.round).toBe(1);
    expect(call.pushback.employer_statement).toBe('This is our best offer at this time.');
    expect(call.pushback.coaching_hint).toBe('Stay anchored to your value.');
  });

  it('gates on waitForUser with counter_offer_response token', async () => {
    const state = makeState();
    const ctx = makeContext(state);
    (ctx.waitForUser as ReturnType<typeof vi.fn>).mockResolvedValue('My counter.');

    await presentToUser.execute({ round: 1 }, ctx as never);

    expect(ctx.waitForUser).toHaveBeenCalledWith('counter_offer_response');
  });

  it('stores user response in scratchpad keyed by round', async () => {
    const state = makeState();
    const ctx = makeContext(state);
    (ctx.waitForUser as ReturnType<typeof vi.fn>).mockResolvedValue('I want $240K base.');

    await presentToUser.execute({ round: 1 }, ctx as never);

    expect(ctx.scratchpad['response_round_1']).toBe('I want $240K base.');
  });

  it('returns user_response in the result JSON', async () => {
    const state = makeState();
    const ctx = makeContext(state);
    (ctx.waitForUser as ReturnType<typeof vi.fn>).mockResolvedValue('Market data supports $245K.');

    const result = await presentToUser.execute({ round: 1 }, ctx as never);
    const parsed = JSON.parse(result as string);

    expect(parsed.user_response).toBe('Market data supports $245K.');
    expect(parsed.round).toBe(1);
  });

  it('returns error when pushback not found for the requested round', async () => {
    const state = makeState({ pushbacks: [] });
    const ctx = makeContext(state);

    const result = await presentToUser.execute({ round: 5 }, ctx as never);
    const parsed = JSON.parse(result as string);

    expect(parsed.error).toContain('No pushback found for round 5');
  });

  it('falls back to current_round when round input is not a number', async () => {
    const state = makeState({ current_round: 1 });
    const ctx = makeContext(state);
    (ctx.waitForUser as ReturnType<typeof vi.fn>).mockResolvedValue('Response.');

    const result = await presentToUser.execute({ round: 'not-a-number' as unknown as number }, ctx as never);
    const parsed = JSON.parse(result as string);

    // Should use current_round=1, which has a pushback
    expect(parsed.round).toBe(1);
    expect(parsed.error).toBeUndefined();
  });

  it('handles null user response gracefully (stores empty string)', async () => {
    const state = makeState();
    const ctx = makeContext(state);
    (ctx.waitForUser as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await presentToUser.execute({ round: 1 }, ctx as never);
    const parsed = JSON.parse(result as string);

    expect(parsed.user_response).toBe('');
    expect(ctx.scratchpad['response_round_1']).toBe('');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Tool: evaluate_response
// ═══════════════════════════════════════════════════════════════════════

describe('evaluateResponseTool', () => {
  const evaluateResponse = employerTools.find((t) => t.name === 'evaluate_response')!;

  beforeEach(() => {
    mockChat.mockReset();
  });

  it('returns structured evaluation with tactic effectiveness scores', async () => {
    mockChat.mockResolvedValue({
      text: JSON.stringify({
        scores: { confidence: 85, value_anchoring: 78, specificity: 72, collaboration: 90 },
        overall_score: 82,
        what_worked: ['Strong value anchoring', 'Professional tone'],
        what_to_improve: ['Add specific market data'],
        coach_note: 'Lead with your unique value proposition next round.',
      }),
    });

    const state = makeState();
    const ctx = makeContext(state);
    const result = await evaluateResponse.execute(
      { round: 1, user_response: 'I appreciate the offer. Based on market data and my track record...' },
      ctx as never,
    );

    const parsed = JSON.parse(result as string);
    expect(parsed.evaluation).toBeDefined();
    expect(parsed.evaluation.scores.confidence).toBe(85);
    expect(parsed.evaluation.overall_score).toBe(82);
    expect(parsed.evaluation.what_worked).toHaveLength(2);
    expect(parsed.evaluation.coach_note).toContain('value proposition');
    expect(ctx.emitSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'response_evaluated' }));
  });

  it('handles missing optional state fields gracefully', async () => {
    mockChat.mockResolvedValue({
      text: JSON.stringify({
        scores: { confidence: 60 },
        overall_score: 55,
        coach_note: 'Be more specific.',
      }),
    });

    const state = makeState({
      offer_base_salary: undefined,
      offer_total_comp: undefined,
      target_salary: undefined,
    });
    const ctx = makeContext(state);
    const result = await evaluateResponse.execute(
      { round: 1, user_response: 'I think the offer should be higher.' },
      ctx as never,
    );

    const parsed = JSON.parse(result as string);
    expect(parsed.evaluation.scores.value_anchoring).toBe(50); // default
    expect(parsed.evaluation.scores.specificity).toBe(50); // default
  });

  it('returns error for invalid round', async () => {
    const state = makeState({ pushbacks: [] });
    const ctx = makeContext(state);
    const result = await evaluateResponse.execute(
      { round: 5, user_response: 'test' },
      ctx as never,
    );

    const parsed = JSON.parse(result as string);
    expect(parsed.error).toContain('No pushback found');
  });

  it('persists evaluation to state via updateState', async () => {
    mockChat.mockResolvedValue(
      makeMockLLMResponse({
        scores: { confidence: 75, value_anchoring: 70, specificity: 80, collaboration: 85 },
        overall_score: 77,
        what_worked: ['Good specificity'],
        what_to_improve: ['More market data'],
        coach_note: 'Reference your $3M cost savings next round.',
      }),
    );

    const state = makeState();
    const ctx = makeContext(state);

    await evaluateResponse.execute(
      { round: 1, user_response: 'My market value is $240K based on Levels.fyi data.' },
      ctx as never,
    );

    // updateState is a real function in the mock context — verify via getState()
    const updated = ctx.getState();
    expect(updated.evaluations).toHaveLength(1);
    expect(updated.evaluations[0].round).toBe(1);
    expect(updated.evaluations[0].overall_score).toBe(77);
  });

  it('accumulates evaluations in scratchpad', async () => {
    mockChat.mockResolvedValue(
      makeMockLLMResponse({
        scores: { confidence: 80, value_anchoring: 75, specificity: 70, collaboration: 85 },
        overall_score: 78,
        what_worked: ['Clear positioning'],
        what_to_improve: ['Add evidence'],
        coach_note: 'Good start. Add specific numbers.',
      }),
    );

    const state = makeState();
    const ctx = makeContext(state);

    await evaluateResponse.execute(
      { round: 1, user_response: 'I have led teams of 50+ engineers.' },
      ctx as never,
    );

    expect(Array.isArray(ctx.scratchpad.evaluations)).toBe(true);
    expect((ctx.scratchpad.evaluations as unknown[]).length).toBe(1);
  });

  it('emits response_evaluated SSE event with evaluation payload', async () => {
    mockChat.mockResolvedValue(
      makeMockLLMResponse({
        scores: { confidence: 88, value_anchoring: 82, specificity: 76, collaboration: 91 },
        overall_score: 85,
        what_worked: ['Confident tone', 'Specific data points'],
        what_to_improve: [],
        coach_note: 'Excellent round.',
      }),
    );

    const state = makeState();
    const ctx = makeContext(state);

    await evaluateResponse.execute(
      { round: 1, user_response: 'Based on my market research and $3M in cost reductions...' },
      ctx as never,
    );

    expect(ctx.emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'response_evaluated',
        evaluation: expect.objectContaining({
          round: 1,
          overall_score: 85,
        }),
      }),
    );
  });

  it('null LLM response uses fallback overall_score computed from defaulted sub-scores', async () => {
    mockChat.mockResolvedValue({
      text: 'not valid json at all!!!',
      tool_calls: [],
      usage: { input_tokens: 0, output_tokens: 0 },
    });

    const state = makeState();
    const ctx = makeContext(state);

    const result = await evaluateResponse.execute(
      { round: 1, user_response: 'I need more than this offer.' },
      ctx as never,
    );

    const parsed = JSON.parse(result as string);
    // All 4 sub-scores default to 50 → weighted avg = 50
    expect(parsed.evaluation.scores.confidence).toBe(50);
    expect(parsed.evaluation.scores.value_anchoring).toBe(50);
    expect(parsed.evaluation.overall_score).toBe(50);
  });

  it('reads user_response from scratchpad when not provided in input', async () => {
    mockChat.mockResolvedValue(
      makeMockLLMResponse({
        scores: { confidence: 70, value_anchoring: 65, specificity: 60, collaboration: 75 },
        overall_score: 68,
        what_worked: ['Polite tone'],
        what_to_improve: ['Be more specific'],
        coach_note: 'Use data next time.',
      }),
    );

    const state = makeState();
    const ctx = makeContext(state);
    ctx.scratchpad['response_round_1'] = 'From scratchpad: I want a higher base.';

    const result = await evaluateResponse.execute(
      { round: 1, user_response: '' },
      ctx as never,
    );

    const parsed = JSON.parse(result as string);
    // Tool should use scratchpad value when input is empty
    expect(parsed.evaluation.user_response).toBeDefined();
  });

  it('result message includes round number and score', async () => {
    mockChat.mockResolvedValue(
      makeMockLLMResponse({
        scores: { confidence: 72, value_anchoring: 68, specificity: 65, collaboration: 80 },
        overall_score: 71,
        what_worked: [],
        what_to_improve: [],
        coach_note: 'Keep going.',
      }),
    );

    const state = makeState();
    const ctx = makeContext(state);

    const result = await evaluateResponse.execute(
      { round: 1, user_response: 'I want $240K.' },
      ctx as never,
    );

    const parsed = JSON.parse(result as string);
    expect(parsed.message).toContain('Round 1');
    expect(parsed.message).toContain('71/100');
  });

  it('includes prior round scores in context when evaluations exist', async () => {
    let capturedMessages: unknown[] = [];
    mockChat.mockImplementation(({ messages }: { messages: unknown[] }) => {
      capturedMessages = messages;
      return Promise.resolve(
        makeMockLLMResponse({
          scores: { confidence: 80, value_anchoring: 75, specificity: 70, collaboration: 85 },
          overall_score: 78,
          what_worked: ['Progress from round 1'],
          what_to_improve: [],
          coach_note: 'Good improvement.',
        }),
      );
    });

    const state = makeState({
      pushbacks: [
        {
          round: 1,
          round_type: 'initial_response',
          employer_statement: 'Our budget is fixed.',
          employer_tactic: 'budget_constraints',
          coaching_hint: 'Push back.',
        },
        {
          round: 2,
          round_type: 'counter',
          employer_statement: 'Still limited.',
          employer_tactic: 'anchoring',
          coaching_hint: 'Stay firm.',
        },
      ],
      evaluations: [{
        round: 1,
        user_response: 'My market rate is $240K.',
        scores: { confidence: 70, value_anchoring: 65, specificity: 60, collaboration: 75 },
        overall_score: 68,
        what_worked: [],
        what_to_improve: ['More specificity'],
        coach_note: 'Add data.',
      }],
      current_round: 2,
    });
    const ctx = makeContext(state);

    await evaluateResponse.execute(
      { round: 2, user_response: 'Based on Levels.fyi, the market rate for this role is $245K.' },
      ctx as never,
    );

    const content = (capturedMessages[0] as { content: string }).content;
    expect(content).toContain('Prior Round Scores');
    expect(content).toContain('overall=68/100');
  });

  it('what_worked defaults to empty array when LLM omits it', async () => {
    mockChat.mockResolvedValue(
      makeMockLLMResponse({
        scores: { confidence: 55, value_anchoring: 50, specificity: 45, collaboration: 60 },
        overall_score: 52,
        coach_note: 'Start stronger.',
        // No what_worked or what_to_improve fields
      }),
    );

    const state = makeState();
    const ctx = makeContext(state);

    const result = await evaluateResponse.execute(
      { round: 1, user_response: 'Can you do better?' },
      ctx as never,
    );

    const parsed = JSON.parse(result as string);
    expect(Array.isArray(parsed.evaluation.what_worked)).toBe(true);
    expect(Array.isArray(parsed.evaluation.what_to_improve)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Tool: emit_transparency
// ═══════════════════════════════════════════════════════════════════════

describe('emit_transparency tool', () => {
  const emitTransparency = employerTools.find((t) => t.name === 'emit_transparency')!;

  beforeEach(() => {
    mockChat.mockReset();
  });

  it('happy path — emits transparency event with message', async () => {
    const state = makeState();
    const ctx = makeContext(state);

    await emitTransparency.execute({ message: 'Preparing round 1 — initial offer response' }, ctx as never);

    expect(ctx.emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'transparency',
        message: 'Preparing round 1 — initial offer response',
      }),
    );
  });

  it('uses provided stage in emitted event', async () => {
    const state = makeState();
    const ctx = makeContext(state);

    await emitTransparency.execute(
      { message: 'Evaluating your response', stage: 'evaluation' },
      ctx as never,
    );

    expect(ctx.emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'transparency', stage: 'evaluation' }),
    );
  });

  it('falls back to current_stage when stage input is omitted', async () => {
    const state = makeState({ current_stage: 'negotiation' });
    const ctx = makeContext(state);

    await emitTransparency.execute({ message: 'Generating pushback...' }, ctx as never);

    expect(ctx.emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'transparency', stage: 'negotiation' }),
    );
  });

  it('returns emitted: true on success', async () => {
    const state = makeState();
    const ctx = makeContext(state);

    const result = await emitTransparency.execute(
      { message: 'Simulation complete.' },
      ctx as never,
    );

    const res = result as { emitted: boolean; message: string };
    expect(res.emitted).toBe(true);
    expect(res.message).toBe('Simulation complete.');
  });

  it('returns success: false for empty message', async () => {
    const state = makeState();
    const ctx = makeContext(state);

    const result = await emitTransparency.execute({ message: '' }, ctx as never);

    const res = result as { success: boolean; reason: string };
    expect(res.success).toBe(false);
    expect(res.reason).toContain('empty');
  });

  it('returns success: false for whitespace-only message', async () => {
    const state = makeState();
    const ctx = makeContext(state);

    const result = await emitTransparency.execute({ message: '   ' }, ctx as never);

    const res = result as { success: boolean };
    expect(res.success).toBe(false);
  });

  it('does not emit event for empty message', async () => {
    const state = makeState();
    const ctx = makeContext(state);

    await emitTransparency.execute({ message: '' }, ctx as never);

    expect(ctx.emitSpy).not.toHaveBeenCalled();
  });

  it('emits only once per call', async () => {
    const state = makeState();
    const ctx = makeContext(state);

    await emitTransparency.execute({ message: 'Round 2 starting', stage: 'round_2' }, ctx as never);

    expect(ctx.emitSpy).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// ProductConfig
// ═══════════════════════════════════════════════════════════════════════

describe('Counter-Offer Simulation ProductConfig', () => {
  const config = createCounterOfferSimProductConfig();

  it('creates a valid product config with domain counter-offer-simulation', () => {
    expect(config.domain).toBe('counter-offer-simulation');
  });

  it('has 1 agent (employer) — single-agent pipeline', () => {
    expect(config.agents).toHaveLength(1);
    expect(config.agents[0].name).toBe('employer');
  });

  it('employer agent has stageMessage with startStage negotiation', () => {
    expect(config.agents[0].stageMessage).toBeDefined();
    expect(config.agents[0].stageMessage!.startStage).toBe('negotiation');
  });

  it('createInitialState — full mode sets max_rounds to 3', () => {
    const state = config.createInitialState('sess-1', 'user-1', { mode: 'full' });
    expect(state.mode).toBe('full');
    expect(state.max_rounds).toBe(3);
  });

  it('createInitialState — single_round mode sets max_rounds to 1', () => {
    const state = config.createInitialState('sess-1', 'user-1', { mode: 'single_round' });
    expect(state.mode).toBe('single_round');
    expect(state.max_rounds).toBe(1);
  });

  it('createInitialState — unknown mode falls back to full', () => {
    const state = config.createInitialState('sess-1', 'user-1', { mode: 'unknown' });
    expect(state.mode).toBe('full');
    expect(state.max_rounds).toBe(3);
  });

  it('createInitialState populates session_id and user_id', () => {
    const state = config.createInitialState('sess-42', 'user-99', {});
    expect(state.session_id).toBe('sess-42');
    expect(state.user_id).toBe('user-99');
  });

  it('createInitialState defaults current_round to 0', () => {
    const state = config.createInitialState('s', 'u', {});
    expect(state.current_round).toBe(0);
  });

  it('createInitialState defaults pushbacks and evaluations to empty arrays', () => {
    const state = config.createInitialState('s', 'u', {});
    expect(state.pushbacks).toEqual([]);
    expect(state.evaluations).toEqual([]);
  });

  it('createInitialState accepts offer_company and offer_role from input', () => {
    const state = config.createInitialState('s', 'u', {
      offer_company: 'Stripe',
      offer_role: 'Staff Engineer',
    });
    expect(state.offer_company).toBe('Stripe');
    expect(state.offer_role).toBe('Staff Engineer');
  });

  it('createInitialState defaults offer_company to "the company" when not provided', () => {
    const state = config.createInitialState('s', 'u', {});
    expect(state.offer_company).toBe('the company');
  });

  it('createInitialState coerces numeric offer fields', () => {
    const state = config.createInitialState('s', 'u', {
      offer_base_salary: '200000',
      offer_total_comp: '280000',
      target_salary: '240000',
    });
    expect(state.offer_base_salary).toBe(200000);
    expect(state.offer_total_comp).toBe(280000);
    expect(state.target_salary).toBe(240000);
  });

  it('createInitialState leaves salary fields undefined when not provided', () => {
    const state = config.createInitialState('s', 'u', {});
    expect(state.offer_base_salary).toBeUndefined();
    expect(state.offer_total_comp).toBeUndefined();
    expect(state.target_salary).toBeUndefined();
  });

  it('buildAgentMessage for employer in full mode contains 3-round instructions', () => {
    const state = config.createInitialState('s', 'u', { mode: 'full', offer_company: 'Acme', offer_role: 'CTO' });
    const msg = config.buildAgentMessage('employer', state, {});
    expect(msg).toContain('3-round');
    expect(msg).toContain('round_type=initial_response');
    expect(msg).toContain('round_type=counter');
    expect(msg).toContain('round_type=final');
  });

  it('buildAgentMessage for employer in single_round mode contains single-round instructions', () => {
    const state = config.createInitialState('s', 'u', { mode: 'single_round', offer_company: 'Stripe', offer_role: 'EM' });
    const msg = config.buildAgentMessage('employer', state, { round_type: 'counter' });
    expect(msg).toContain('single-round');
    expect(msg).toContain('round_type: counter');
  });

  it('buildAgentMessage includes offer details', () => {
    const state = config.createInitialState('s', 'u', {
      offer_company: 'TechCorp',
      offer_role: 'VP Engineering',
      offer_base_salary: 200000,
      offer_total_comp: 280000,
      target_salary: 240000,
    });
    const msg = config.buildAgentMessage('employer', state, {});
    expect(msg).toContain('TechCorp');
    expect(msg).toContain('VP Engineering');
    expect(msg).toContain('200,000');
    expect(msg).toContain('240,000');
  });

  it('buildAgentMessage for unknown agent returns empty string', () => {
    const state = config.createInitialState('s', 'u', {});
    const msg = config.buildAgentMessage('unknown', state, {});
    expect(msg).toBe('');
  });

  it('buildAgentMessage includes resume_text when provided', () => {
    const state = config.createInitialState('s', 'u', {
      resume_text: 'Jane Smith — 15 years of engineering leadership...',
    });
    const msg = config.buildAgentMessage('employer', state, {});
    expect(msg).toContain('Jane Smith');
    expect(msg).toContain('Candidate Resume');
  });

  it('buildAgentMessage includes why_me_story from platform_context', () => {
    const state = config.createInitialState('s', 'u', {
      platform_context: {
        why_me_story: 'I led the largest cloud migration in the company\'s history.',
      },
    });
    const msg = config.buildAgentMessage('employer', state, {});
    expect(msg).toContain('Why-Me Story');
    expect(msg).toContain('largest cloud migration');
  });

  it('persistResult is undefined — ephemeral simulation', () => {
    expect(config.persistResult).toBeUndefined();
  });

  it('finalizeResult emits simulation_complete event', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    state.evaluations = [
      {
        round: 1,
        user_response: 'My market rate is $240K.',
        scores: { confidence: 80, value_anchoring: 75, specificity: 70, collaboration: 85 },
        overall_score: 78,
        what_worked: ['Confident tone'],
        what_to_improve: ['More specificity'],
        coach_note: 'Use market data.',
      },
    ];

    const events: CounterOfferSSEEvent[] = [];
    config.finalizeResult(state, {}, (e) => events.push(e));

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('simulation_complete');
    const evt = events[0] as Extract<CounterOfferSSEEvent, { type: 'simulation_complete' }>;
    expect(evt.session_id).toBe('sess-1');
    expect(evt.summary).toBeDefined();
    expect(evt.summary!.overall_score).toBe(78);
    expect(evt.summary!.total_rounds).toBe(1);
  });

  it('finalizeResult selects correct best_round', () => {
    const state = config.createInitialState('s', 'u', {});
    state.evaluations = [
      {
        round: 1,
        user_response: 'Response 1.',
        scores: { confidence: 60, value_anchoring: 55, specificity: 50, collaboration: 65 },
        overall_score: 58,
        what_worked: [],
        what_to_improve: ['Everything'],
        coach_note: 'Start stronger.',
      },
      {
        round: 2,
        user_response: 'Response 2.',
        scores: { confidence: 85, value_anchoring: 80, specificity: 78, collaboration: 90 },
        overall_score: 83,
        what_worked: ['Much improved'],
        what_to_improve: [],
        coach_note: 'Outstanding progress.',
      },
    ];

    const events: CounterOfferSSEEvent[] = [];
    config.finalizeResult(state, {}, (e) => events.push(e));

    const evt = events[0] as Extract<CounterOfferSSEEvent, { type: 'simulation_complete' }>;
    expect(evt.summary!.best_round).toBe(2);
  });

  it('finalizeResult overall_score is rounded average of round scores', () => {
    const state = config.createInitialState('s', 'u', {});
    state.evaluations = [
      {
        round: 1,
        user_response: 'R1',
        scores: { confidence: 70, value_anchoring: 70, specificity: 70, collaboration: 70 },
        overall_score: 70,
        what_worked: [],
        what_to_improve: [],
        coach_note: '',
      },
      {
        round: 2,
        user_response: 'R2',
        scores: { confidence: 80, value_anchoring: 80, specificity: 80, collaboration: 80 },
        overall_score: 80,
        what_worked: [],
        what_to_improve: [],
        coach_note: '',
      },
    ];

    const events: CounterOfferSSEEvent[] = [];
    config.finalizeResult(state, {}, (e) => events.push(e));

    const evt = events[0] as Extract<CounterOfferSSEEvent, { type: 'simulation_complete' }>;
    expect(evt.summary!.overall_score).toBe(75);
  });

  it('finalizeResult with no evaluations produces zero score and safe defaults', () => {
    const state = config.createInitialState('s', 'u', {});
    // No evaluations — empty run

    const events: CounterOfferSSEEvent[] = [];
    config.finalizeResult(state, {}, (e) => events.push(e));

    const evt = events[0] as Extract<CounterOfferSSEEvent, { type: 'simulation_complete' }>;
    expect(evt.summary!.overall_score).toBe(0);
    expect(evt.summary!.total_rounds).toBe(0);
    expect(evt.summary!.recommendation).toBeTruthy();
  });

  it('finalizeResult recommendation is "Outstanding" for score >= 85', () => {
    const state = config.createInitialState('s', 'u', {});
    state.evaluations = [{
      round: 1,
      user_response: 'Excellent response.',
      scores: { confidence: 90, value_anchoring: 88, specificity: 85, collaboration: 92 },
      overall_score: 89,
      what_worked: ['Everything'],
      what_to_improve: [],
      coach_note: 'Perfect.',
    }];

    const events: CounterOfferSSEEvent[] = [];
    config.finalizeResult(state, {}, (e) => events.push(e));

    const evt = events[0] as Extract<CounterOfferSSEEvent, { type: 'simulation_complete' }>;
    expect(evt.summary!.recommendation).toContain('Outstanding');
  });

  it('emitError emits pipeline_error event', () => {
    const events: CounterOfferSSEEvent[] = [];
    config.emitError!('negotiation', 'Something went wrong', (e) => events.push(e));

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('pipeline_error');
    const evt = events[0] as Extract<CounterOfferSSEEvent, { type: 'pipeline_error' }>;
    expect(evt.stage).toBe('negotiation');
    expect(evt.error).toBe('Something went wrong');
  });

  it('onComplete transfers pushbacks from scratchpad to state when state is empty', () => {
    const state = config.createInitialState('s', 'u', {});
    const scratchpad: Record<string, unknown> = {
      pushbacks: [
        {
          round: 1,
          round_type: 'initial_response',
          employer_statement: 'Our budget is fixed.',
          employer_tactic: 'budget_constraints',
          coaching_hint: 'Counter with data.',
        },
      ],
    };

    const noop = () => {};
    config.agents[0].onComplete!(scratchpad, state, noop);

    expect(state.pushbacks).toHaveLength(1);
    expect(state.pushbacks[0].employer_statement).toBe('Our budget is fixed.');
  });

  it('onComplete does not overwrite state pushbacks that already exist', () => {
    const state = config.createInitialState('s', 'u', {});
    state.pushbacks = [
      {
        round: 1,
        round_type: 'initial_response',
        employer_statement: 'Already in state.',
        employer_tactic: 'anchoring',
        coaching_hint: 'Keep going.',
      },
    ];

    const scratchpad: Record<string, unknown> = {
      pushbacks: [
        {
          round: 1,
          round_type: 'initial_response',
          employer_statement: 'From scratchpad.',
          employer_tactic: 'budget_constraints',
          coaching_hint: 'Different hint.',
        },
      ],
    };

    const noop = () => {};
    config.agents[0].onComplete!(scratchpad, state, noop);

    // State already had a pushback — should not be overwritten
    expect(state.pushbacks[0].employer_statement).toBe('Already in state.');
  });

  it('onComplete transfers evaluations from scratchpad when state is empty', () => {
    const state = config.createInitialState('s', 'u', {});
    const scratchpad: Record<string, unknown> = {
      evaluations: [
        {
          round: 1,
          user_response: 'My response.',
          scores: { confidence: 75, value_anchoring: 70, specificity: 65, collaboration: 80 },
          overall_score: 73,
          what_worked: ['Good tone'],
          what_to_improve: ['More data'],
          coach_note: 'Solid start.',
        },
      ],
    };

    const noop = () => {};
    config.agents[0].onComplete!(scratchpad, state, noop);

    expect(state.evaluations).toHaveLength(1);
    expect(state.evaluations[0].overall_score).toBe(73);
  });
});
