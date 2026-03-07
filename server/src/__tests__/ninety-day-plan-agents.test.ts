/**
 * 90-Day Plan Agent (#20) — Server tests.
 *
 * Tests agent registration, tool model tiers, knowledge rules,
 * type constants, and ProductConfig behavior.
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

import type {
  NinetyDayPlanState,
  NinetyDayPlanSSEEvent,
  PhaseNumber,
  ActivityCategory,
  StakeholderRelationship,
  StakeholderPriority,
  ImpactLevel,
  EffortLevel,
  ImportanceLevel,
  RiskLikelihood,
} from '../agents/ninety-day-plan/types.js';

// ─── Knowledge Rules ─────────────────────────────────────────────────

import {
  RULE_0_PHILOSOPHY,
  RULE_1_PHASE_STRUCTURE,
  RULE_2_STAKEHOLDER_MANAGEMENT,
  RULE_3_QUICK_WINS,
  RULE_4_MEASURABILITY,
  RULE_5_REALISTIC_PACING,
  RULE_6_EXECUTIVE_CONTEXT,
  RULE_7_SELF_REVIEW,
  NINETY_DAY_PLAN_RULES,
} from '../agents/ninety-day-plan/knowledge/rules.js';

// ─── Agent Registry ──────────────────────────────────────────────────

import { agentRegistry } from '../agents/runtime/agent-registry.js';

// ─── Agent Configs (trigger registration side effects) ───────────────

import { researcherConfig } from '../agents/ninety-day-plan/researcher/agent.js';
import { plannerConfig } from '../agents/ninety-day-plan/planner/agent.js';

// ─── Tools ───────────────────────────────────────────────────────────

import { researcherTools } from '../agents/ninety-day-plan/researcher/tools.js';
import { plannerTools } from '../agents/ninety-day-plan/planner/tools.js';

// ─── ProductConfig ───────────────────────────────────────────────────

import { createNinetyDayPlanProductConfig } from '../agents/ninety-day-plan/product.js';

// ═══════════════════════════════════════════════════════════════════════
// Agent Registration
// ═══════════════════════════════════════════════════════════════════════

describe('90-Day Plan Agent Registration', () => {
  it('researcher is registered in the agent registry', () => {
    expect(agentRegistry.has('ninety-day-plan', 'researcher')).toBe(true);
  });

  it('planner is registered in the agent registry', () => {
    expect(agentRegistry.has('ninety-day-plan', 'planner')).toBe(true);
  });

  it('ninety-day-plan domain appears in listDomains', () => {
    const domains = agentRegistry.listDomains();
    expect(domains).toContain('ninety-day-plan');
  });

  it('researcher has expected capabilities', () => {
    const desc = agentRegistry.describe('ninety-day-plan', 'researcher');
    expect(desc).toBeDefined();
    expect(desc!.capabilities).toContain('role_analysis');
    expect(desc!.capabilities).toContain('stakeholder_mapping');
    expect(desc!.capabilities).toContain('quick_win_identification');
    expect(desc!.capabilities).toContain('learning_assessment');
  });

  it('planner has expected capabilities', () => {
    const desc = agentRegistry.describe('ninety-day-plan', 'planner');
    expect(desc).toBeDefined();
    expect(desc!.capabilities).toContain('plan_writing');
    expect(desc!.capabilities).toContain('milestone_design');
    expect(desc!.capabilities).toContain('risk_assessment');
    expect(desc!.capabilities).toContain('strategic_planning');
  });

  it('researcher has correct tool count (4 + emit_transparency = 5)', () => {
    const desc = agentRegistry.describe('ninety-day-plan', 'researcher');
    expect(desc).toBeDefined();
    expect(desc!.tools).toHaveLength(5);
  });

  it('researcher tools include expected names', () => {
    const desc = agentRegistry.describe('ninety-day-plan', 'researcher');
    expect(desc).toBeDefined();
    expect(desc!.tools).toContain('analyze_role_context');
    expect(desc!.tools).toContain('map_stakeholders');
    expect(desc!.tools).toContain('identify_quick_wins');
    expect(desc!.tools).toContain('assess_learning_priorities');
    expect(desc!.tools).toContain('emit_transparency');
  });

  it('planner has correct tool count (4 + emit_transparency = 5)', () => {
    const desc = agentRegistry.describe('ninety-day-plan', 'planner');
    expect(desc).toBeDefined();
    expect(desc!.tools).toHaveLength(5);
  });

  it('planner tools include expected names', () => {
    const desc = agentRegistry.describe('ninety-day-plan', 'planner');
    expect(desc).toBeDefined();
    expect(desc!.tools).toContain('write_30_day_plan');
    expect(desc!.tools).toContain('write_60_day_plan');
    expect(desc!.tools).toContain('write_90_day_plan');
    expect(desc!.tools).toContain('assemble_strategic_plan');
    expect(desc!.tools).toContain('emit_transparency');
  });

  it('findByCapability discovers researcher', () => {
    const creators = agentRegistry.findByCapability('role_analysis', 'ninety-day-plan');
    expect(creators.length).toBeGreaterThanOrEqual(1);
    expect(creators[0].identity.name).toBe('researcher');
  });

  it('findByCapability discovers planner', () => {
    const creators = agentRegistry.findByCapability('plan_writing', 'ninety-day-plan');
    expect(creators.length).toBeGreaterThanOrEqual(1);
    expect(creators[0].identity.name).toBe('planner');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Tool Model Tiers
// ═══════════════════════════════════════════════════════════════════════

describe('90-Day Plan Tool Model Tiers', () => {
  it('researcher tools have correct model tiers', () => {
    const tiers = Object.fromEntries(researcherTools.map((t) => [t.name, t.model_tier]));
    expect(tiers.analyze_role_context).toBe('mid');
    expect(tiers.map_stakeholders).toBe('mid');
    expect(tiers.identify_quick_wins).toBe('mid');
    expect(tiers.assess_learning_priorities).toBe('light');
  });

  it('planner tools have correct model tiers', () => {
    const tiers = Object.fromEntries(plannerTools.map((t) => [t.name, t.model_tier]));
    expect(tiers.write_30_day_plan).toBe('primary');
    expect(tiers.write_60_day_plan).toBe('primary');
    expect(tiers.write_90_day_plan).toBe('primary');
    expect(tiers.assemble_strategic_plan).toBe('mid');
  });

  it('all tools have descriptions (length > 20)', () => {
    for (const tool of [...researcherTools, ...plannerTools]) {
      expect(tool.description).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(20);
    }
  });

  it('all tools have input_schema with type object', () => {
    for (const tool of [...researcherTools, ...plannerTools]) {
      expect(tool.input_schema.type).toBe('object');
    }
  });

  it('write_30_day_plan description mentions Listen or Learn', () => {
    const tool = plannerTools.find((t) => t.name === 'write_30_day_plan');
    expect(tool).toBeDefined();
    const desc = tool!.description.toLowerCase();
    expect(desc.includes('listen') || desc.includes('learn')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Knowledge Rules
// ═══════════════════════════════════════════════════════════════════════

describe('90-Day Plan Knowledge Rules', () => {
  const rules = [
    { name: 'RULE_0_PHILOSOPHY', value: RULE_0_PHILOSOPHY },
    { name: 'RULE_1_PHASE_STRUCTURE', value: RULE_1_PHASE_STRUCTURE },
    { name: 'RULE_2_STAKEHOLDER_MANAGEMENT', value: RULE_2_STAKEHOLDER_MANAGEMENT },
    { name: 'RULE_3_QUICK_WINS', value: RULE_3_QUICK_WINS },
    { name: 'RULE_4_MEASURABILITY', value: RULE_4_MEASURABILITY },
    { name: 'RULE_5_REALISTIC_PACING', value: RULE_5_REALISTIC_PACING },
    { name: 'RULE_6_EXECUTIVE_CONTEXT', value: RULE_6_EXECUTIVE_CONTEXT },
    { name: 'RULE_7_SELF_REVIEW', value: RULE_7_SELF_REVIEW },
  ];

  it('all 8 rules are non-empty strings (length > 50)', () => {
    for (const rule of rules) {
      expect(typeof rule.value).toBe('string');
      expect(rule.value.length).toBeGreaterThan(50);
    }
  });

  it('NINETY_DAY_PLAN_RULES combines all 8 rules', () => {
    expect(NINETY_DAY_PLAN_RULES).toBeTruthy();
    for (const rule of rules) {
      expect(NINETY_DAY_PLAN_RULES).toContain(rule.value);
    }
  });

  it('RULE_0_PHILOSOPHY mentions strategic', () => {
    expect(RULE_0_PHILOSOPHY.toLowerCase()).toContain('strategic');
  });

  it('RULE_1_PHASE_STRUCTURE mentions Listen & Learn and Lead & Deliver', () => {
    expect(RULE_1_PHASE_STRUCTURE).toContain('Listen & Learn');
    expect(RULE_1_PHASE_STRUCTURE).toContain('Lead & Deliver');
  });

  it('RULE_2_STAKEHOLDER_MANAGEMENT mentions stakeholder', () => {
    expect(RULE_2_STAKEHOLDER_MANAGEMENT.toLowerCase()).toContain('stakeholder');
  });

  it('RULE_3_QUICK_WINS mentions credibility', () => {
    expect(RULE_3_QUICK_WINS.toLowerCase()).toContain('credibility');
  });

  it('RULE_4_MEASURABILITY mentions observable', () => {
    expect(RULE_4_MEASURABILITY.toLowerCase()).toContain('observable');
  });

  it('RULE_5_REALISTIC_PACING mentions learning curve', () => {
    expect(RULE_5_REALISTIC_PACING.toLowerCase()).toContain('learning curve');
  });

  it('RULE_6_EXECUTIVE_CONTEXT mentions C-suite and VP', () => {
    expect(RULE_6_EXECUTIVE_CONTEXT).toContain('C-suite');
    expect(RULE_6_EXECUTIVE_CONTEXT).toContain('VP');
  });

  it('RULE_7_SELF_REVIEW mentions three distinct phases', () => {
    expect(RULE_7_SELF_REVIEW.toLowerCase()).toContain('three distinct phases');
  });

  it('each rule uses markdown formatting', () => {
    for (const rule of rules) {
      const hasMarkdown = rule.value.includes('#') || rule.value.includes('- ') || rule.value.includes('*');
      expect(hasMarkdown).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Type Constants (via type checking — verify types exist and are usable)
// ═══════════════════════════════════════════════════════════════════════

describe('90-Day Plan Type Constants', () => {
  it('PhaseNumber supports 30, 60, 90', () => {
    const phases: PhaseNumber[] = [30, 60, 90];
    expect(phases).toHaveLength(3);
    expect(phases).toContain(30);
    expect(phases).toContain(60);
    expect(phases).toContain(90);
  });

  it('ActivityCategory supports relationship, learning, delivery, strategy', () => {
    const categories: ActivityCategory[] = ['relationship', 'learning', 'delivery', 'strategy'];
    expect(categories).toHaveLength(4);
  });

  it('StakeholderRelationship supports 5 types', () => {
    const relationships: StakeholderRelationship[] = [
      'direct_report', 'peer', 'superior', 'cross_functional', 'external',
    ];
    expect(relationships).toHaveLength(5);
  });

  it('StakeholderPriority supports critical, high, medium, low', () => {
    const priorities: StakeholderPriority[] = ['critical', 'high', 'medium', 'low'];
    expect(priorities).toHaveLength(4);
  });

  it('ImpactLevel supports high, medium, low', () => {
    const levels: ImpactLevel[] = ['high', 'medium', 'low'];
    expect(levels).toHaveLength(3);
  });

  it('EffortLevel supports low, medium, high', () => {
    const levels: EffortLevel[] = ['low', 'medium', 'high'];
    expect(levels).toHaveLength(3);
  });

  it('ImportanceLevel supports critical, high, medium', () => {
    const levels: ImportanceLevel[] = ['critical', 'high', 'medium'];
    expect(levels).toHaveLength(3);
  });

  it('RiskLikelihood supports high, medium, low', () => {
    const levels: RiskLikelihood[] = ['high', 'medium', 'low'];
    expect(levels).toHaveLength(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// ProductConfig
// ═══════════════════════════════════════════════════════════════════════

describe('90-Day Plan ProductConfig', () => {
  const config = createNinetyDayPlanProductConfig();

  it('creates a valid product config with domain ninety-day-plan', () => {
    expect(config.domain).toBe('ninety-day-plan');
  });

  it('has 2 agents (researcher, planner)', () => {
    expect(config.agents).toHaveLength(2);
    expect(config.agents[0].name).toBe('researcher');
    expect(config.agents[1].name).toBe('planner');
  });

  it('has stage messages on researcher (research)', () => {
    expect(config.agents[0].stageMessage).toBeDefined();
    expect(config.agents[0].stageMessage!.startStage).toBe('research');
  });

  it('has stage messages on planner (planning)', () => {
    expect(config.agents[1].stageMessage).toBeDefined();
    expect(config.agents[1].stageMessage!.startStage).toBe('planning');
  });

  it('createInitialState produces valid state with current_stage=research', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    expect(state.session_id).toBe('sess-1');
    expect(state.user_id).toBe('user-1');
    expect(state.current_stage).toBe('research');
    expect(state.stakeholder_map).toEqual([]);
    expect(state.quick_wins).toEqual([]);
    expect(state.learning_priorities).toEqual([]);
    expect(state.phases).toEqual([]);
  });

  it('createInitialState accepts role_context', () => {
    const state = config.createInitialState('sess-1', 'user-1', {
      role_context: {
        target_role: 'VP Engineering',
        target_company: 'Acme Corp',
        target_industry: 'Technology',
      },
    });
    expect(state.role_context.target_role).toBe('VP Engineering');
    expect(state.role_context.target_company).toBe('Acme Corp');
    expect(state.role_context.target_industry).toBe('Technology');
  });

  it('buildAgentMessage for researcher includes resume text and role context', () => {
    const state = config.createInitialState('sess-1', 'user-1', {
      role_context: {
        target_role: 'VP Engineering',
        target_company: 'Acme Corp',
        target_industry: 'Technology',
      },
    });
    const msg = config.buildAgentMessage('researcher', state, {
      resume_text: 'Jane Smith, 15 years of technology leadership...',
    });
    expect(msg).toContain('Jane Smith');
    expect(msg).toContain('Resume');
    expect(msg).toContain('VP Engineering');
    expect(msg).toContain('Acme Corp');
  });

  it('buildAgentMessage for planner includes stakeholder and quick win summaries', () => {
    const state = config.createInitialState('sess-1', 'user-1', {
      role_context: {
        target_role: 'VP Engineering',
        target_company: 'Acme Corp',
        target_industry: 'Technology',
      },
    });
    state.stakeholder_map = [
      {
        name_or_role: 'CTO',
        relationship_type: 'superior',
        priority: 'critical',
        engagement_strategy: 'Weekly 1:1 meetings',
      },
    ];
    state.quick_wins = [
      {
        description: 'Streamline sprint planning process',
        impact: 'high',
        effort: 'low',
        timeline_days: 14,
        stakeholder_benefit: 'CTO sees faster delivery',
      },
    ];
    const msg = config.buildAgentMessage('planner', state, {});
    expect(msg).toContain('CTO');
    expect(msg).toContain('Streamline sprint planning');
    expect(msg).toContain('write_30_day_plan');
    expect(msg).toContain('write_60_day_plan');
    expect(msg).toContain('write_90_day_plan');
    expect(msg).toContain('assemble_strategic_plan');
  });

  it('buildAgentMessage for unknown agent returns empty string', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    const msg = config.buildAgentMessage('unknown', state, {});
    expect(msg).toBe('');
  });

  it('validateAfterAgent throws when researcher produces no stakeholder_map', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    expect(() => config.validateAfterAgent!('researcher', state)).toThrow('stakeholder map');
  });

  it('validateAfterAgent passes when researcher produces stakeholder_map', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    state.stakeholder_map = [
      {
        name_or_role: 'CTO',
        relationship_type: 'superior',
        priority: 'critical',
        engagement_strategy: 'Weekly 1:1 meetings',
      },
    ];
    expect(() => config.validateAfterAgent!('researcher', state)).not.toThrow();
  });

  it('validateAfterAgent throws when planner produces no final_report', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    expect(() => config.validateAfterAgent!('planner', state)).toThrow('final report');
  });

  it('validateAfterAgent passes when planner produces final_report', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    state.final_report = '# 90-Day Strategic Plan';
    expect(() => config.validateAfterAgent!('planner', state)).not.toThrow();
  });

  it('finalizeResult emits plan_complete event', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    state.final_report = '# 90-Day Strategic Plan Report';
    state.quality_score = 92;
    state.phases = [
      {
        phase: 30,
        title: 'Listen & Learn',
        theme: 'Absorb context',
        objectives: ['Meet all stakeholders'],
        key_activities: [],
        milestones: [],
        risks: [],
      },
      {
        phase: 60,
        title: 'Contribute & Build',
        theme: 'Execute quick wins',
        objectives: ['Deliver first quick win'],
        key_activities: [],
        milestones: [],
        risks: [],
      },
      {
        phase: 90,
        title: 'Lead & Deliver',
        theme: 'Drive strategy',
        objectives: ['Present 6-month vision'],
        key_activities: [],
        milestones: [],
        risks: [],
      },
    ];

    const events: NinetyDayPlanSSEEvent[] = [];
    const result = config.finalizeResult(state, {}, (e) => events.push(e));

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('plan_complete');
    const evt = events[0] as Extract<NinetyDayPlanSSEEvent, { type: 'plan_complete' }>;
    expect(evt.session_id).toBe('sess-1');
    expect(evt.report).toBe('# 90-Day Strategic Plan Report');
    expect(evt.quality_score).toBe(92);
    expect(evt.phase_count).toBe(3);

    const res = result as Record<string, unknown>;
    expect(res.report).toBe('# 90-Day Strategic Plan Report');
    expect(res.quality_score).toBe(92);
  });

  it('onComplete for researcher transfers resume_data, stakeholder_map, quick_wins, learning_priorities', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    const scratchpad: Record<string, unknown> = {
      resume_data: {
        name: 'Jane',
        current_title: 'VP Engineering',
        career_summary: 'Experienced leader',
        key_skills: ['Engineering', 'Strategy'],
        key_achievements: ['Led platform migration'],
        work_history: [],
      },
      stakeholder_map: [
        {
          name_or_role: 'CTO',
          relationship_type: 'superior',
          priority: 'critical',
          engagement_strategy: 'Weekly 1:1 meetings',
        },
      ],
      quick_wins: [
        {
          description: 'Improve CI/CD pipeline',
          impact: 'high',
          effort: 'low',
          timeline_days: 14,
          stakeholder_benefit: 'Faster deployments',
        },
      ],
      learning_priorities: [
        {
          area: 'Company culture and processes',
          importance: 'critical',
          resources: ['1:1 with team leads'],
          timeline: 'Week 1-2',
        },
      ],
    };
    const noop = () => {};
    config.agents[0].onComplete!(scratchpad, state, noop);
    expect(state.resume_data).toBeDefined();
    expect(state.resume_data!.name).toBe('Jane');
    expect(state.stakeholder_map).toHaveLength(1);
    expect(state.stakeholder_map[0].name_or_role).toBe('CTO');
    expect(state.quick_wins).toHaveLength(1);
    expect(state.learning_priorities).toHaveLength(1);
  });

  it('onComplete for planner transfers phases, final_report, quality_score', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    const scratchpad: Record<string, unknown> = {
      phases: [
        {
          phase: 30,
          title: 'Listen & Learn',
          theme: 'Absorb context',
          objectives: ['Meet stakeholders'],
          key_activities: [],
          milestones: [],
          risks: [],
        },
      ],
      final_report: '# 90-Day Plan',
      quality_score: 88,
    };
    const noop = () => {};
    config.agents[1].onComplete!(scratchpad, state, noop);
    expect(state.phases).toHaveLength(1);
    expect(state.phases[0].title).toBe('Listen & Learn');
    expect(state.final_report).toBe('# 90-Day Plan');
    expect(state.quality_score).toBe(88);
  });
});
