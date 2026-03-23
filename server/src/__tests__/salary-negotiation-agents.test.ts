/**
 * Salary Negotiation Agent (#15) — Server tests.
 *
 * Tests agent registration, tool model tiers, knowledge rules,
 * comp/scenario type constants, and ProductConfig behavior.
 */

import { describe, it, expect, vi } from 'vitest';

// Mock external dependencies before any imports that pull them in
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

vi.mock('../lib/llm.js', () => ({
  llm: { chat: vi.fn() },
  MODEL_PRIMARY: 'mock-primary',
  MODEL_MID: 'mock-mid',
  MODEL_ORCHESTRATOR: 'mock-orchestrator',
  MODEL_LIGHT: 'mock-light',
  MODEL_PRICING: {},
}));

vi.mock('../lib/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  createSessionLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

// ─── Types & Constants ───────────────────────────────────────────────

import {
  COMP_COMPONENTS,
  COMP_LABELS,
  SCENARIO_TYPES,
  SCENARIO_LABELS,
} from '../agents/salary-negotiation/types.js';

import type {
  SalaryNegotiationState,
  SalaryNegotiationSSEEvent,
} from '../agents/salary-negotiation/types.js';

// ─── Knowledge Rules ─────────────────────────────────────────────────

import {
  RULE_0_PHILOSOPHY,
  RULE_1_ANCHORING,
  RULE_2_BATNA,
  RULE_3_TOTAL_COMP,
  RULE_4_COUNTER_OFFER,
  RULE_5_TIMING,
  RULE_6_EXECUTIVE_NORMS,
  RULE_7_SELF_REVIEW,
  SALARY_NEGOTIATION_RULES,
} from '../agents/salary-negotiation/knowledge/rules.js';

// ─── Agent Registry ──────────────────────────────────────────────────

import { agentRegistry } from '../agents/runtime/agent-registry.js';

// ─── Agent Configs (trigger registration side effects) ───────────────

import { researcherConfig } from '../agents/salary-negotiation/researcher/agent.js';
import { strategistConfig } from '../agents/salary-negotiation/strategist/agent.js';

// ─── Tools ───────────────────────────────────────────────────────────

import { researcherTools } from '../agents/salary-negotiation/researcher/tools.js';
import { strategistTools } from '../agents/salary-negotiation/strategist/tools.js';

// ─── ProductConfig ───────────────────────────────────────────────────

import { createSalaryNegotiationProductConfig } from '../agents/salary-negotiation/product.js';
import { createEmptySharedContext } from '../contracts/shared-context.js';

// ═══════════════════════════════════════════════════════════════════════
// Agent Registration
// ═══════════════════════════════════════════════════════════════════════

describe('Salary Negotiation Agent Registration', () => {
  it('researcher is registered in the agent registry', () => {
    expect(agentRegistry.has('salary-negotiation', 'researcher')).toBe(true);
  });

  it('strategist is registered in the agent registry', () => {
    expect(agentRegistry.has('salary-negotiation', 'strategist')).toBe(true);
  });

  it('salary-negotiation domain appears in listDomains', () => {
    const domains = agentRegistry.listDomains();
    expect(domains).toContain('salary-negotiation');
  });

  it('researcher has expected capabilities', () => {
    const desc = agentRegistry.describe('salary-negotiation', 'researcher');
    expect(desc).toBeDefined();
    expect(desc!.capabilities).toContain('comp_research');
    expect(desc!.capabilities).toContain('market_analysis');
    expect(desc!.capabilities).toContain('benchmark_positioning');
    expect(desc!.capabilities).toContain('leverage_assessment');
  });

  it('strategist has expected capabilities', () => {
    const desc = agentRegistry.describe('salary-negotiation', 'strategist');
    expect(desc).toBeDefined();
    expect(desc!.capabilities).toContain('negotiation_strategy');
    expect(desc!.capabilities).toContain('talking_points');
    expect(desc!.capabilities).toContain('scenario_planning');
    expect(desc!.capabilities).toContain('counter_offer_analysis');
  });

  it('researcher has correct tool count (4 + emit_transparency = 5)', () => {
    const desc = agentRegistry.describe('salary-negotiation', 'researcher');
    expect(desc).toBeDefined();
    expect(desc!.tools).toHaveLength(5);
  });

  it('researcher tools include expected names', () => {
    const desc = agentRegistry.describe('salary-negotiation', 'researcher');
    expect(desc).toBeDefined();
    expect(desc!.tools).toContain('research_compensation');
    expect(desc!.tools).toContain('analyze_market_position');
    expect(desc!.tools).toContain('identify_leverage_points');
    expect(desc!.tools).toContain('assess_total_comp');
    expect(desc!.tools).toContain('emit_transparency');
  });

  it('strategist has correct tool count (5 + emit_transparency = 6)', () => {
    const desc = agentRegistry.describe('salary-negotiation', 'strategist');
    expect(desc).toBeDefined();
    expect(desc!.tools).toHaveLength(6);
  });

  it('strategist tools include expected names', () => {
    const desc = agentRegistry.describe('salary-negotiation', 'strategist');
    expect(desc).toBeDefined();
    expect(desc!.tools).toContain('design_strategy');
    expect(desc!.tools).toContain('write_talking_points');
    expect(desc!.tools).toContain('simulate_scenario');
    expect(desc!.tools).toContain('write_counter_response');
    expect(desc!.tools).toContain('assemble_negotiation_prep');
    expect(desc!.tools).toContain('emit_transparency');
  });

  it('findByCapability discovers researcher', () => {
    const creators = agentRegistry.findByCapability('comp_research', 'salary-negotiation');
    expect(creators.length).toBeGreaterThanOrEqual(1);
    expect(creators[0].identity.name).toBe('researcher');
  });

  it('findByCapability discovers strategist', () => {
    const creators = agentRegistry.findByCapability('negotiation_strategy', 'salary-negotiation');
    expect(creators.length).toBeGreaterThanOrEqual(1);
    expect(creators[0].identity.name).toBe('strategist');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Tool Model Tiers
// ═══════════════════════════════════════════════════════════════════════

describe('Salary Negotiation Tool Model Tiers', () => {
  it('researcher tools have correct model tiers', () => {
    const tiers = Object.fromEntries(researcherTools.map((t) => [t.name, t.model_tier]));
    expect(tiers.research_compensation).toBe('mid');
    expect(tiers.analyze_market_position).toBe('mid');
    expect(tiers.identify_leverage_points).toBe('mid');
    expect(tiers.assess_total_comp).toBe('light');
  });

  it('strategist tools have correct model tiers', () => {
    const tiers = Object.fromEntries(strategistTools.map((t) => [t.name, t.model_tier]));
    expect(tiers.design_strategy).toBe('primary');
    expect(tiers.write_talking_points).toBe('primary');
    expect(tiers.simulate_scenario).toBe('primary');
    expect(tiers.write_counter_response).toBe('mid');
    expect(tiers.assemble_negotiation_prep).toBe('mid');
  });

  it('all tools have descriptions (length > 20)', () => {
    for (const tool of [...researcherTools, ...strategistTools]) {
      expect(tool.description).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(20);
    }
  });

  it('all tools have input_schema with type object', () => {
    for (const tool of [...researcherTools, ...strategistTools]) {
      expect(tool.input_schema.type).toBe('object');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Knowledge Rules
// ═══════════════════════════════════════════════════════════════════════

describe('Salary Negotiation Knowledge Rules', () => {
  const rules = [
    { name: 'RULE_0_PHILOSOPHY', value: RULE_0_PHILOSOPHY },
    { name: 'RULE_1_ANCHORING', value: RULE_1_ANCHORING },
    { name: 'RULE_2_BATNA', value: RULE_2_BATNA },
    { name: 'RULE_3_TOTAL_COMP', value: RULE_3_TOTAL_COMP },
    { name: 'RULE_4_COUNTER_OFFER', value: RULE_4_COUNTER_OFFER },
    { name: 'RULE_5_TIMING', value: RULE_5_TIMING },
    { name: 'RULE_6_EXECUTIVE_NORMS', value: RULE_6_EXECUTIVE_NORMS },
    { name: 'RULE_7_SELF_REVIEW', value: RULE_7_SELF_REVIEW },
  ];

  it('all 8 rules are non-empty strings (length > 50)', () => {
    for (const rule of rules) {
      expect(typeof rule.value).toBe('string');
      expect(rule.value.length).toBeGreaterThan(50);
    }
  });

  it('SALARY_NEGOTIATION_RULES combines all 8 rules', () => {
    expect(SALARY_NEGOTIATION_RULES).toBeTruthy();
    for (const rule of rules) {
      expect(SALARY_NEGOTIATION_RULES).toContain(rule.value);
    }
  });

  it('RULE_1_ANCHORING mentions 10-20% above target', () => {
    expect(RULE_1_ANCHORING).toContain('10-20%');
  });

  it('RULE_2_BATNA mentions "Best Alternative"', () => {
    expect(RULE_2_BATNA).toContain('Best Alternative');
  });

  it('RULE_3_TOTAL_COMP mentions base salary and equity', () => {
    expect(RULE_3_TOTAL_COMP).toContain('Base salary');
    expect(RULE_3_TOTAL_COMP).toContain('Equity');
  });

  it('RULE_4_COUNTER_OFFER mentions "first offers are never final"', () => {
    expect(RULE_4_COUNTER_OFFER).toContain('First offers are never final');
  });

  it('RULE_5_TIMING mentions "verbal offer"', () => {
    expect(RULE_5_TIMING).toContain('verbal offer');
  });

  it('RULE_6_EXECUTIVE_NORMS mentions VP+ or executive level', () => {
    expect(RULE_6_EXECUTIVE_NORMS).toContain('VP');
  });

  it('RULE_7_SELF_REVIEW mentions "Never fabricate"', () => {
    expect(RULE_7_SELF_REVIEW).toContain('Never fabricate');
  });

  it('each rule uses markdown formatting', () => {
    for (const rule of rules) {
      const hasMarkdown = rule.value.includes('#') || rule.value.includes('- ') || rule.value.includes('*');
      expect(hasMarkdown).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Type Constants
// ═══════════════════════════════════════════════════════════════════════

describe('Salary Negotiation Type Constants', () => {
  it('COMP_COMPONENTS has exactly 6 entries', () => {
    expect(COMP_COMPONENTS).toHaveLength(6);
  });

  it('all comp components have labels', () => {
    for (const comp of COMP_COMPONENTS) {
      expect(COMP_LABELS[comp]).toBeTruthy();
      expect(typeof COMP_LABELS[comp]).toBe('string');
    }
  });

  it('COMP_COMPONENTS includes base_salary, equity, signing_bonus', () => {
    expect(COMP_COMPONENTS).toContain('base_salary');
    expect(COMP_COMPONENTS).toContain('equity');
    expect(COMP_COMPONENTS).toContain('signing_bonus');
  });

  it('SCENARIO_TYPES has exactly 3 entries', () => {
    expect(SCENARIO_TYPES).toHaveLength(3);
  });

  it('all scenario types have labels', () => {
    for (const scenario of SCENARIO_TYPES) {
      expect(SCENARIO_LABELS[scenario]).toBeTruthy();
      expect(typeof SCENARIO_LABELS[scenario]).toBe('string');
    }
  });

  it('SCENARIO_TYPES are in correct order', () => {
    expect(SCENARIO_TYPES).toEqual([
      'initial_offer_response',
      'counter_offer',
      'final_negotiation',
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// ProductConfig
// ═══════════════════════════════════════════════════════════════════════

describe('Salary Negotiation ProductConfig', () => {
  const config = createSalaryNegotiationProductConfig();

  it('creates a valid product config with domain salary-negotiation', () => {
    expect(config.domain).toBe('salary-negotiation');
  });

  it('has 2 agents (researcher, strategist)', () => {
    expect(config.agents).toHaveLength(2);
    expect(config.agents[0].name).toBe('researcher');
    expect(config.agents[1].name).toBe('strategist');
  });

  it('has stage messages on researcher (research)', () => {
    expect(config.agents[0].stageMessage).toBeDefined();
    expect(config.agents[0].stageMessage!.startStage).toBe('research');
    expect(config.agents[0].stageMessage!.start).toContain('Research');
  });

  it('has stage messages on strategist (strategy)', () => {
    expect(config.agents[1].stageMessage).toBeDefined();
    expect(config.agents[1].stageMessage!.startStage).toBe('strategy');
    expect(config.agents[1].stageMessage!.start).toContain('negotiation');
  });

  it('createInitialState produces valid state with session_id, user_id, current_stage=research', () => {
    const state = config.createInitialState('sess-1', 'user-1', {
      offer_details: { company: 'Acme', role: 'VP Engineering' },
    });
    expect(state.session_id).toBe('sess-1');
    expect(state.user_id).toBe('user-1');
    expect(state.current_stage).toBe('research');
  });

  it('createInitialState initializes offer_details from input', () => {
    const state = config.createInitialState('sess-1', 'user-1', {
      offer_details: {
        company: 'TechCorp',
        role: 'VP Engineering',
        base_salary: 250000,
        total_comp: 400000,
        equity_details: '10,000 RSUs over 4 years',
      },
    });
    expect(state.offer_details.company).toBe('TechCorp');
    expect(state.offer_details.role).toBe('VP Engineering');
    expect(state.offer_details.base_salary).toBe(250000);
    expect(state.offer_details.total_comp).toBe(400000);
    expect(state.offer_details.equity_details).toBe('10,000 RSUs over 4 years');
  });

  it('createInitialState preserves shared_context when provided', () => {
    const sharedContext = createEmptySharedContext();
    sharedContext.positioningStrategy.positioningAngle = 'Negotiation leverage should stay anchored in credible executive scope';
    const state = config.createInitialState('sess-1', 'user-1', {
      offer_details: { company: 'Acme', role: 'VP Engineering' },
      shared_context: sharedContext,
    });
    expect(state.shared_context?.positioningStrategy.positioningAngle).toBe('Negotiation leverage should stay anchored in credible executive scope');
  });

  it('createInitialState initializes target_context from input', () => {
    const state = config.createInitialState('sess-1', 'user-1', {
      offer_details: { company: 'Acme', role: 'VP Ops' },
      target_role: 'VP Operations',
      target_industry: 'Enterprise SaaS',
      target_seniority: 'VP',
    });
    expect(state.target_context).toBeDefined();
    expect(state.target_context!.target_role).toBe('VP Operations');
    expect(state.target_context!.target_industry).toBe('Enterprise SaaS');
    expect(state.target_context!.target_seniority).toBe('VP');
  });

  it('buildAgentMessage for researcher includes resume text', () => {
    const state = config.createInitialState('sess-1', 'user-1', {
      offer_details: { company: 'Acme', role: 'VP Ops' },
    });
    const msg = config.buildAgentMessage('researcher', state, {
      resume_text: 'John Doe, 20 years of operations leadership...',
    });
    expect(msg).toContain('John Doe');
    expect(msg).toContain('Resume');
  });

  it('buildAgentMessage for researcher includes offer details', () => {
    const state = config.createInitialState('sess-1', 'user-1', {
      offer_details: { company: 'Acme', role: 'VP Ops', base_salary: 200000 },
    });
    const msg = config.buildAgentMessage('researcher', state, {
      resume_text: 'Resume here...',
    });
    expect(msg).toContain('Acme');
    expect(msg).toContain('VP Ops');
    expect(msg).toContain('200,000');
  });

  it('buildAgentMessage for researcher includes canonical shared context when legacy room context is absent', () => {
    const sharedContext = createEmptySharedContext();
    sharedContext.careerNarrative.careerArc = 'Career narrative built on commercial impact and calm negotiation posture';
    sharedContext.positioningStrategy.positioningAngle = 'Use supported scope and outcomes as leverage, not inflated claims';
    const state = config.createInitialState('sess-1', 'user-1', {
      offer_details: { company: 'Acme', role: 'VP Engineering' },
      shared_context: sharedContext,
    });

    const msg = config.buildAgentMessage('researcher', state, {
      resume_text: 'Resume text',
    });

    expect(msg).toContain('Career narrative built on commercial impact and calm negotiation posture');
    expect(msg).toContain('Use supported scope and outcomes as leverage, not inflated claims');
  });

  it('buildAgentMessage for researcher includes Career Profile when available', () => {
    const state = config.createInitialState('sess-1', 'user-1', {
      offer_details: { company: 'Acme', role: 'VP Ops' },
      platform_context: {
        career_profile: {
          version: 'career_profile_v2',
          source: 'career_profile',
          generated_at: '2026-03-16T00:00:00.000Z',
          targeting: {
            target_roles: ['VP Operations'],
            target_industries: ['Industrial'],
            seniority: 'VP',
            transition_type: 'turnaround',
            preferred_company_environments: [],
          },
          positioning: {
            core_strengths: ['Turnarounds'],
            proof_themes: ['Operational discipline'],
            differentiators: ['Fixer'],
            adjacent_positioning: [],
            positioning_statement: 'Turnaround operator',
            narrative_summary: 'Turnaround leader',
            leadership_scope: 'Multi-site',
            scope_of_responsibility: 'Operations',
          },
          narrative: {
            colleagues_came_for_what: '',
            known_for_what: '',
            why_not_me: '',
            story_snippet: '',
          },
          preferences: {
            must_haves: [],
            constraints: [],
            compensation_direction: '',
          },
          coaching: {
            financial_segment: '',
            emotional_state: '',
            coaching_tone: '',
            urgency_score: 0,
            recommended_starting_point: '',
          },
          evidence_positioning_statements: [],
          profile_signals: {
            clarity: 'green',
            alignment: 'green',
            differentiation: 'green',
          },
          completeness: {
            overall_score: 100,
            dashboard_state: 'strong',
            sections: [],
          },
          profile_summary: 'Turnaround operator',
        },
      },
    });
    const msg = config.buildAgentMessage('researcher', state, {
      resume_text: 'Resume here...',
    });
    expect(msg).toContain('Career Profile');
    expect(msg).toContain('Turnaround operator');
  });

  it('buildAgentMessage for researcher includes positioning strategy when available', () => {
    const state = config.createInitialState('sess-1', 'user-1', {
      offer_details: { company: 'Acme', role: 'VP Ops' },
      platform_context: {
        positioning_strategy: { theme: 'digital transformation' },
      },
    });
    const msg = config.buildAgentMessage('researcher', state, {
      resume_text: 'Resume here...',
    });
    expect(msg).toContain('Positioning Strategy');
    expect(msg).toContain('digital transformation');
  });

  it('buildAgentMessage for strategist includes end-state objectives', () => {
    const state = config.createInitialState('sess-1', 'user-1', {
      offer_details: { company: 'Acme', role: 'VP Ops' },
    });
    const msg = config.buildAgentMessage('strategist', state, {});
    expect(msg).toContain('overall strategy');
    expect(msg).toContain('initial offer response');
    expect(msg).toContain('counter-offer');
    expect(msg).toContain('final negotiation');
  });

  it('buildAgentMessage for unknown agent returns empty string', () => {
    const state = config.createInitialState('sess-1', 'user-1', {
      offer_details: { company: 'Acme', role: 'VP Ops' },
    });
    const msg = config.buildAgentMessage('unknown', state, {});
    expect(msg).toBe('');
  });

  it('validateAfterAgent throws when researcher produces no market_research', () => {
    const state = config.createInitialState('sess-1', 'user-1', {
      offer_details: { company: 'Acme', role: 'VP Ops' },
    });
    expect(() => config.validateAfterAgent!('researcher', state)).toThrow('market research');
  });

  it('validateAfterAgent passes when researcher produces market_research', () => {
    const state = config.createInitialState('sess-1', 'user-1', {
      offer_details: { company: 'Acme', role: 'VP Ops' },
    });
    state.market_research = {
      role: 'VP Ops',
      industry: 'SaaS',
      geography: 'San Francisco',
      company_size: 'enterprise',
      salary_range: { p25: 180000, p50: 220000, p75: 260000, p90: 300000 },
      total_comp_estimate: { low: 300000, mid: 400000, high: 550000 },
      market_context: 'Strong demand for operations leaders in SaaS.',
      data_confidence: 'high',
      data_source: 'ai_estimated',
    };
    expect(() => config.validateAfterAgent!('researcher', state)).not.toThrow();
  });

  it('validateAfterAgent throws when strategist produces no final_report', () => {
    const state = config.createInitialState('sess-1', 'user-1', {
      offer_details: { company: 'Acme', role: 'VP Ops' },
    });
    expect(() => config.validateAfterAgent!('strategist', state)).toThrow('final report');
  });

  it('validateAfterAgent passes when strategist produces final_report', () => {
    const state = config.createInitialState('sess-1', 'user-1', {
      offer_details: { company: 'Acme', role: 'VP Ops' },
    });
    state.final_report = '# Negotiation Preparation Report';
    expect(() => config.validateAfterAgent!('strategist', state)).not.toThrow();
  });

  it('finalizeResult emits negotiation_complete event with report and quality_score', () => {
    const state = config.createInitialState('sess-1', 'user-1', {
      offer_details: { company: 'Acme', role: 'VP Ops' },
    });
    state.final_report = '# Negotiation Report';
    state.quality_score = 88;
    state.scenarios = [];
    state.talking_points = [];
    state.market_research = {
      role: 'VP Ops',
      industry: 'SaaS',
      geography: 'San Francisco',
      company_size: 'enterprise',
      salary_range: { p25: 180000, p50: 220000, p75: 260000, p90: 300000 },
      total_comp_estimate: { low: 300000, mid: 400000, high: 550000 },
      market_context: 'Strong demand.',
      data_confidence: 'high',
      data_source: 'ai_estimated',
    };

    const events: SalaryNegotiationSSEEvent[] = [];
    const result = config.finalizeResult(state, {}, (e) => events.push(e));

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('negotiation_complete');
    const evt = events[0] as Extract<SalaryNegotiationSSEEvent, { type: 'negotiation_complete' }>;
    expect(evt.session_id).toBe('sess-1');
    expect(evt.report).toBe('# Negotiation Report');
    expect(evt.quality_score).toBe(88);

    const res = result as Record<string, unknown>;
    expect(res.report).toBe('# Negotiation Report');
    expect(res.quality_score).toBe(88);
  });

  it('onComplete for researcher transfers scratchpad to state', () => {
    const state = config.createInitialState('sess-1', 'user-1', {
      offer_details: { company: 'Acme', role: 'VP Ops' },
    });
    const scratchpad: Record<string, unknown> = {
      market_research: {
        role: 'VP Ops',
        industry: 'SaaS',
        geography: 'SF',
        company_size: 'enterprise',
        salary_range: { p25: 180000, p50: 220000, p75: 260000, p90: 300000 },
        total_comp_estimate: { low: 300000, mid: 400000, high: 550000 },
        market_context: 'Strong demand.',
        data_confidence: 'high',
      },
      leverage_points: [
        { category: 'market demand', description: 'High demand for ops leaders', strength: 'strong', talking_point: 'The market supports a higher package.' },
      ],
      total_comp_breakdown: [
        { component: 'base_salary', current_value: 200000, market_value: 220000, negotiable: true, notes: 'Below P50' },
      ],
      resume_data: {
        name: 'John',
        current_title: 'VP Operations',
        career_summary: 'Experienced leader',
        key_skills: ['Operations', 'Strategy'],
        key_achievements: ['Led $50M turnaround'],
        work_history: [],
      },
    };
    const noop = () => {};
    config.agents[0].onComplete!(scratchpad, state, noop);
    expect(state.market_research).toBeDefined();
    expect(state.market_research!.role).toBe('VP Ops');
    expect(state.leverage_points).toHaveLength(1);
    expect(state.total_comp_breakdown).toHaveLength(1);
    expect(state.resume_data?.name).toBe('John');
  });

  it('onComplete for strategist transfers final_report, quality_score, negotiation_strategy, talking_points, scenarios', () => {
    const state = config.createInitialState('sess-1', 'user-1', {
      offer_details: { company: 'Acme', role: 'VP Ops' },
    });
    const scratchpad: Record<string, unknown> = {
      final_report: '# Full Negotiation Report',
      quality_score: 92,
      negotiation_strategy: {
        approach: 'value-anchored',
        opening_position: 'Target total comp of $450K',
        walk_away_point: 'Below $350K total comp',
        batna: 'Continue current role',
      },
      talking_points: [
        { topic: 'base salary', point: 'Market P75 supports $260K', evidence: 'Radford data', tone_guidance: 'Collaborative' },
      ],
      scenarios: [
        {
          type: 'initial_offer_response',
          situation: 'They offer $200K base',
          recommended_response: 'Express enthusiasm, counter with data',
          talking_points: ['Market data supports higher'],
          risks: ['Budget constraints'],
          fallback_position: 'Negotiate equity instead',
        },
      ],
    };
    const noop = () => {};
    config.agents[1].onComplete!(scratchpad, state, noop);
    expect(state.final_report).toBe('# Full Negotiation Report');
    expect(state.quality_score).toBe(92);
    expect(state.negotiation_strategy).toBeDefined();
    expect(state.negotiation_strategy!.approach).toBe('value-anchored');
    expect(state.talking_points).toHaveLength(1);
    expect(state.scenarios).toHaveLength(1);
  });
});
