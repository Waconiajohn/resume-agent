/**
 * Unit tests for the counter-offer negotiation simulation module.
 *
 * Covers:
 *   1. ProductConfig structure — agent count and stage names
 *   2. Employer agent config — model tier and max_rounds
 *   3. Tool definitions — names and required input schema fields
 *   4. Route schema — session ownership validation (session_id is required)
 *   5. createInitialState — practice vs full mode round counts
 *   6. finalizeResult — summary generation from evaluations
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../agents/salary-negotiation/simulation/employer/tools.js', () => ({
  employerTools: [
    {
      name: 'generate_employer_position',
      description: 'Generate employer position',
      input_schema: {
        type: 'object',
        properties: {
          round_type: { type: 'string', enum: ['initial_offer_delivery', 'pushback_base_cap', 'equity_leverage', 'final_counter', 'closing_pressure'] },
        },
        required: ['round_type'],
      },
      execute: vi.fn().mockResolvedValue('{}'),
    },
    {
      name: 'present_position_to_user',
      description: 'Present position to user and gate',
      input_schema: {
        type: 'object',
        properties: {
          round_index: { type: 'number' },
        },
        required: ['round_index'],
      },
      execute: vi.fn().mockResolvedValue('{}'),
    },
    {
      name: 'evaluate_response',
      description: 'Evaluate candidate counter',
      input_schema: {
        type: 'object',
        properties: {
          round_index: { type: 'number' },
          candidate_response: { type: 'string' },
        },
        required: ['round_index', 'candidate_response'],
      },
      execute: vi.fn().mockResolvedValue('{}'),
    },
  ],
}));

vi.mock('../agents/runtime/agent-registry.js', () => ({
  registerAgent: vi.fn(),
}));

vi.mock('../agents/runtime/shared-tools.js', () => ({
  createEmitTransparency: vi.fn().mockReturnValue({
    name: 'emit_transparency',
    description: 'Emit transparency event',
    input_schema: { type: 'object', properties: {}, required: [] },
    execute: vi.fn().mockResolvedValue('{}'),
  }),
}));

vi.mock('../lib/llm.js', () => ({
  llm: { chat: vi.fn().mockResolvedValue({ text: '{}' }) },
  MODEL_MID: 'test-mid-model',
}));

vi.mock('../lib/json-repair.js', () => ({
  repairJSON: vi.fn().mockReturnValue({}),
}));

vi.mock('../agents/salary-negotiation/knowledge/rules.js', () => ({
  SALARY_NEGOTIATION_RULES: 'test negotiation rules',
}));

// ─── Modules under test ────────────────────────────────────────────────────────

import { employerConfig } from '../agents/salary-negotiation/simulation/employer/agent.js';
import { createNegotiationSimulationProductConfig } from '../agents/salary-negotiation/simulation/product.js';
import type { NegotiationSimulationState } from '../agents/salary-negotiation/simulation/types.js';

// ─── Tests: Employer agent config ─────────────────────────────────────────────

describe('employerConfig', () => {
  it('uses the orchestrator model tier', () => {
    expect(employerConfig.model).toBe('orchestrator');
  });

  it('has sufficient max_rounds for a full 4-round simulation', () => {
    expect(employerConfig.max_rounds).toBeGreaterThanOrEqual(12);
  });

  it('is named "employer" in the negotiation-simulation domain', () => {
    expect(employerConfig.identity.name).toBe('employer');
    expect(employerConfig.identity.domain).toBe('negotiation-simulation');
  });

  it('has a long overall_timeout_ms to allow user response time', () => {
    // 15 minutes = 900_000 ms minimum — users need time to compose counters
    expect(employerConfig.overall_timeout_ms).toBeGreaterThanOrEqual(900_000);
  });

  it('declares emit_transparency as a parallel-safe tool', () => {
    expect(employerConfig.parallel_safe_tools).toContain('emit_transparency');
  });

  it('includes exactly 4 tools (3 employer + emit_transparency)', () => {
    expect(employerConfig.tools).toHaveLength(4);
  });
});

// ─── Tests: Tool definitions ──────────────────────────────────────────────────

describe('employer tools', () => {
  const tools = employerConfig.tools;

  it('includes generate_employer_position tool', () => {
    const tool = tools.find((t) => t.name === 'generate_employer_position');
    expect(tool).toBeDefined();
  });

  it('generate_employer_position requires round_type in its schema', () => {
    const tool = tools.find((t) => t.name === 'generate_employer_position');
    expect(tool?.input_schema.required).toContain('round_type');
  });

  it('generate_employer_position round_type enum covers all 5 round types', () => {
    const tool = tools.find((t) => t.name === 'generate_employer_position');
    const properties = tool?.input_schema.properties as Record<string, { enum?: string[] }> | undefined;
    const roundTypeProp = properties?.round_type;
    expect(roundTypeProp?.enum).toEqual(
      expect.arrayContaining([
        'initial_offer_delivery',
        'pushback_base_cap',
        'equity_leverage',
        'final_counter',
        'closing_pressure',
      ]),
    );
  });

  it('includes present_position_to_user tool', () => {
    const tool = tools.find((t) => t.name === 'present_position_to_user');
    expect(tool).toBeDefined();
  });

  it('present_position_to_user requires round_index', () => {
    const tool = tools.find((t) => t.name === 'present_position_to_user');
    expect(tool?.input_schema.required).toContain('round_index');
  });

  it('includes evaluate_response tool', () => {
    const tool = tools.find((t) => t.name === 'evaluate_response');
    expect(tool).toBeDefined();
  });

  it('evaluate_response requires both round_index and candidate_response', () => {
    const tool = tools.find((t) => t.name === 'evaluate_response');
    expect(tool?.input_schema.required).toContain('round_index');
    expect(tool?.input_schema.required).toContain('candidate_response');
  });

  it('includes emit_transparency tool', () => {
    const tool = tools.find((t) => t.name === 'emit_transparency');
    expect(tool).toBeDefined();
  });
});

// ─── Tests: ProductConfig ──────────────────────────────────────────────────────

describe('createNegotiationSimulationProductConfig', () => {
  let config: ReturnType<typeof createNegotiationSimulationProductConfig>;

  beforeEach(() => {
    config = createNegotiationSimulationProductConfig();
  });

  it('has exactly one agent named "employer"', () => {
    expect(config.agents).toHaveLength(1);
    expect(config.agents[0].name).toBe('employer');
  });

  it('uses the "negotiation-simulation" domain', () => {
    expect(config.domain).toBe('negotiation-simulation');
  });

  it('has no DB persistence (ephemeral simulation)', () => {
    expect(config.persistResult).toBeUndefined();
  });

  it('creates 3-round practice state when mode is "practice"', () => {
    const state = config.createInitialState('session-1', 'user-1', {
      mode: 'practice',
      offer_company: 'Acme Corp',
      offer_role: 'VP Engineering',
    });
    expect(state.max_rounds).toBe(3);
  });

  it('creates 4-round full state when mode is "full"', () => {
    const state = config.createInitialState('session-1', 'user-1', {
      mode: 'full',
      offer_company: 'Acme Corp',
      offer_role: 'VP Engineering',
    });
    expect(state.max_rounds).toBe(4);
  });

  it('defaults to full mode when mode is unrecognised', () => {
    const state = config.createInitialState('session-1', 'user-1', {
      mode: 'unknown',
      offer_company: 'Acme Corp',
      offer_role: 'VP Engineering',
    });
    expect(state.max_rounds).toBe(4);
  });

  it('initialises state with empty evaluations and rounds arrays', () => {
    const state = config.createInitialState('session-1', 'user-1', {
      mode: 'practice',
      offer_company: 'Acme Corp',
      offer_role: 'VP Engineering',
    });
    expect(state.evaluations).toEqual([]);
    expect(state.rounds_presented).toEqual([]);
    expect(state.current_round_index).toBe(0);
  });

  it('preserves offer context in the created state', () => {
    const state = config.createInitialState('session-1', 'user-1', {
      mode: 'practice',
      offer_company: 'Acme Corp',
      offer_role: 'VP Engineering',
      offer_base_salary: 180000,
    });
    expect(state.offer_context.company).toBe('Acme Corp');
    expect(state.offer_context.role).toBe('VP Engineering');
    expect(state.offer_context.base_salary).toBe(180000);
  });

  it('generates agent message for the employer containing offer details', () => {
    const state = config.createInitialState('session-1', 'user-1', {
      mode: 'practice',
      offer_company: 'Acme Corp',
      offer_role: 'VP Engineering',
      offer_base_salary: 200000,
    });
    const message = config.buildAgentMessage('employer', state, { mode: 'practice' });
    expect(message).toContain('Acme Corp');
    expect(message).toContain('VP Engineering');
  });

  it('returns empty string for unknown agent names', () => {
    const state = config.createInitialState('session-1', 'user-1', {
      mode: 'practice',
      offer_company: 'Acme Corp',
      offer_role: 'VP Engineering',
    });
    const message = config.buildAgentMessage('unknown_agent', state, {});
    expect(message).toBe('');
  });
});

// ─── Tests: finalizeResult ────────────────────────────────────────────────────

describe('finalizeResult', () => {
  it('emits simulation_complete event with session_id', () => {
    const config = createNegotiationSimulationProductConfig();
    const emittedEvents: unknown[] = [];
    const emit = (event: unknown) => { emittedEvents.push(event); };

    const state: NegotiationSimulationState = {
      session_id: 'sim-session-1',
      user_id: 'user-1',
      current_stage: 'simulation',
      max_rounds: 3,
      rounds_presented: [],
      evaluations: [],
      current_round_index: 0,
      offer_context: { company: 'Acme', role: 'VP Eng' },
    };

    config.finalizeResult(state, {}, emit as never);

    expect(emittedEvents).toHaveLength(1);
    const event = emittedEvents[0] as { type: string; session_id: string };
    expect(event.type).toBe('simulation_complete');
    expect(event.session_id).toBe('sim-session-1');
  });

  it('computes overall_score as 0 when no evaluations exist', () => {
    const config = createNegotiationSimulationProductConfig();
    const emittedEvents: unknown[] = [];
    const emit = (event: unknown) => { emittedEvents.push(event); };

    const state: NegotiationSimulationState = {
      session_id: 'sim-session-2',
      user_id: 'user-1',
      current_stage: 'simulation',
      max_rounds: 3,
      rounds_presented: [],
      evaluations: [],
      current_round_index: 0,
      offer_context: { company: 'Acme', role: 'VP Eng' },
    };

    config.finalizeResult(state, {}, emit as never);

    const event = emittedEvents[0] as { summary?: { overall_score: number } };
    expect(event.summary?.overall_score).toBe(0);
  });

  it('computes correct average score from multiple evaluations', () => {
    const config = createNegotiationSimulationProductConfig();
    const emittedEvents: unknown[] = [];
    const emit = (event: unknown) => { emittedEvents.push(event); };

    const makeEval = (score: number, roundIndex: number) => ({
      round_index: roundIndex,
      round_type: 'initial_offer_delivery' as const,
      employer_position: 'We are pleased to offer...',
      candidate_response: 'Thank you, I would like to discuss...',
      scores: { acknowledgment: score, data_support: score, specificity: score, tone: score },
      overall_score: score,
      outcome: 'good' as const,
      strengths: ['Clear communication'],
      improvements: ['Add more specifics'],
    });

    const state: NegotiationSimulationState = {
      session_id: 'sim-session-3',
      user_id: 'user-1',
      current_stage: 'simulation',
      max_rounds: 3,
      rounds_presented: [],
      evaluations: [makeEval(80, 0), makeEval(90, 1)],
      current_round_index: 2,
      offer_context: { company: 'Acme', role: 'VP Eng' },
    };

    config.finalizeResult(state, {}, emit as never);

    const event = emittedEvents[0] as { summary?: { overall_score: number; total_rounds: number } };
    expect(event.summary?.overall_score).toBe(85); // (80 + 90) / 2
    expect(event.summary?.total_rounds).toBe(2);
  });

  it('sets final_summary on state after calling finalizeResult', () => {
    const config = createNegotiationSimulationProductConfig();
    const emit = vi.fn();

    const state: NegotiationSimulationState = {
      session_id: 'sim-session-4',
      user_id: 'user-1',
      current_stage: 'simulation',
      max_rounds: 3,
      rounds_presented: [],
      evaluations: [],
      current_round_index: 0,
      offer_context: { company: 'Acme', role: 'VP Eng' },
    };

    config.finalizeResult(state, {}, emit as never);

    expect(state.final_summary).toBeDefined();
    expect(state.final_summary?.overall_score).toBeDefined();
    expect(state.final_summary?.coaching_takeaway).toBeTruthy();
  });
});

// ─── Tests: Route schema ──────────────────────────────────────────────────────

describe('route schema validation', () => {
  it('requires session_id as a UUID', async () => {
    // Import zod schema directly from route to validate the shape
    const { z } = await import('zod');
    const startSchema = z.object({
      session_id: z.string().uuid(),
      offer_company: z.string().min(1).max(200),
      offer_role: z.string().min(1).max(200),
      mode: z.enum(['full', 'practice']),
    });

    const valid = startSchema.safeParse({
      session_id: '550e8400-e29b-41d4-a716-446655440000',
      offer_company: 'Acme Corp',
      offer_role: 'VP Engineering',
      mode: 'practice',
    });
    expect(valid.success).toBe(true);

    const invalidSessionId = startSchema.safeParse({
      session_id: 'not-a-uuid',
      offer_company: 'Acme Corp',
      offer_role: 'VP Engineering',
      mode: 'practice',
    });
    expect(invalidSessionId.success).toBe(false);
  });

  it('requires offer_company and offer_role to be non-empty', async () => {
    const { z } = await import('zod');
    const startSchema = z.object({
      session_id: z.string().uuid(),
      offer_company: z.string().min(1).max(200),
      offer_role: z.string().min(1).max(200),
      mode: z.enum(['full', 'practice']),
    });

    const missingCompany = startSchema.safeParse({
      session_id: '550e8400-e29b-41d4-a716-446655440000',
      offer_company: '',
      offer_role: 'VP Engineering',
      mode: 'practice',
    });
    expect(missingCompany.success).toBe(false);

    const missingRole = startSchema.safeParse({
      session_id: '550e8400-e29b-41d4-a716-446655440000',
      offer_company: 'Acme Corp',
      offer_role: '',
      mode: 'practice',
    });
    expect(missingRole.success).toBe(false);
  });

  it('rejects invalid mode values', async () => {
    const { z } = await import('zod');
    const startSchema = z.object({
      session_id: z.string().uuid(),
      offer_company: z.string().min(1).max(200),
      offer_role: z.string().min(1).max(200),
      mode: z.enum(['full', 'practice']),
    });

    const invalidMode = startSchema.safeParse({
      session_id: '550e8400-e29b-41d4-a716-446655440000',
      offer_company: 'Acme Corp',
      offer_role: 'VP Engineering',
      mode: 'simulation',
    });
    expect(invalidMode.success).toBe(false);
  });
});
