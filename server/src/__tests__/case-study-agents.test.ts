/**
 * Case Study Agent (#17) — Server tests.
 *
 * Tests agent registration, tool model tiers, knowledge rules,
 * format/impact type constants, and ProductConfig behavior.
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
  CASE_STUDY_FORMATS,
  CASE_STUDY_FORMAT_LABELS,
  IMPACT_CATEGORIES,
  IMPACT_CATEGORY_LABELS,
} from '../agents/case-study/types.js';

import type {
  CaseStudyState,
  CaseStudySSEEvent,
} from '../agents/case-study/types.js';

// ─── Knowledge Rules ─────────────────────────────────────────────────

import {
  RULE_0_PHILOSOPHY,
  RULE_1_STAR_CAR,
  RULE_2_METRICS,
  RULE_3_NARRATIVE,
  RULE_4_CONSULTING_GRADE,
  RULE_5_SELECTION,
  RULE_6_TRANSFERABILITY,
  RULE_7_SELF_REVIEW,
  CASE_STUDY_RULES,
} from '../agents/case-study/knowledge/rules.js';

// ─── Agent Registry ──────────────────────────────────────────────────

import { agentRegistry } from '../agents/runtime/agent-registry.js';

// ─── Agent Configs (trigger registration side effects) ───────────────

import { analystConfig } from '../agents/case-study/analyst/agent.js';
import { writerConfig } from '../agents/case-study/writer/agent.js';

// ─── Tools ───────────────────────────────────────────────────────────

import { analystTools } from '../agents/case-study/analyst/tools.js';
import { writerTools } from '../agents/case-study/writer/tools.js';

// ─── ProductConfig ───────────────────────────────────────────────────

import { createCaseStudyProductConfig } from '../agents/case-study/product.js';

// ═══════════════════════════════════════════════════════════════════════
// Agent Registration
// ═══════════════════════════════════════════════════════════════════════

describe('Case Study Agent Registration', () => {
  it('analyst is registered in the agent registry', () => {
    expect(agentRegistry.has('case-study', 'analyst')).toBe(true);
  });

  it('writer is registered in the agent registry', () => {
    expect(agentRegistry.has('case-study', 'writer')).toBe(true);
  });

  it('case-study domain appears in listDomains', () => {
    const domains = agentRegistry.listDomains();
    expect(domains).toContain('case-study');
  });

  it('analyst has expected capabilities', () => {
    const desc = agentRegistry.describe('case-study', 'analyst');
    expect(desc).toBeDefined();
    expect(desc!.capabilities).toContain('achievement_analysis');
    expect(desc!.capabilities).toContain('impact_scoring');
    expect(desc!.capabilities).toContain('narrative_extraction');
    expect(desc!.capabilities).toContain('metric_identification');
  });

  it('writer has expected capabilities', () => {
    const desc = agentRegistry.describe('case-study', 'writer');
    expect(desc).toBeDefined();
    expect(desc!.capabilities).toContain('case_study_writing');
    expect(desc!.capabilities).toContain('narrative_structuring');
    expect(desc!.capabilities).toContain('metric_presentation');
    expect(desc!.capabilities).toContain('portfolio_assembly');
  });

  it('analyst has correct tool count (4 + emit_transparency = 5)', () => {
    const desc = agentRegistry.describe('case-study', 'analyst');
    expect(desc).toBeDefined();
    expect(desc!.tools).toHaveLength(5);
  });

  it('analyst tools include expected names', () => {
    const desc = agentRegistry.describe('case-study', 'analyst');
    expect(desc).toBeDefined();
    expect(desc!.tools).toContain('parse_achievements');
    expect(desc!.tools).toContain('score_impact');
    expect(desc!.tools).toContain('extract_narrative_elements');
    expect(desc!.tools).toContain('identify_metrics');
    expect(desc!.tools).toContain('emit_transparency');
  });

  it('writer has correct tool count (4 + emit_transparency = 5)', () => {
    const desc = agentRegistry.describe('case-study', 'writer');
    expect(desc).toBeDefined();
    expect(desc!.tools).toHaveLength(5);
  });

  it('writer tools include expected names', () => {
    const desc = agentRegistry.describe('case-study', 'writer');
    expect(desc).toBeDefined();
    expect(desc!.tools).toContain('write_case_study');
    expect(desc!.tools).toContain('add_metrics_visualization');
    expect(desc!.tools).toContain('quality_review');
    expect(desc!.tools).toContain('assemble_portfolio');
    expect(desc!.tools).toContain('emit_transparency');
  });

  it('findByCapability discovers analyst', () => {
    const creators = agentRegistry.findByCapability('achievement_analysis', 'case-study');
    expect(creators.length).toBeGreaterThanOrEqual(1);
    expect(creators[0].identity.name).toBe('analyst');
  });

  it('findByCapability discovers writer', () => {
    const creators = agentRegistry.findByCapability('case_study_writing', 'case-study');
    expect(creators.length).toBeGreaterThanOrEqual(1);
    expect(creators[0].identity.name).toBe('writer');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Tool Model Tiers
// ═══════════════════════════════════════════════════════════════════════

describe('Case Study Tool Model Tiers', () => {
  it('analyst tools have correct model tiers', () => {
    const tiers = Object.fromEntries(analystTools.map((t) => [t.name, t.model_tier]));
    expect(tiers.parse_achievements).toBe('mid');
    expect(tiers.score_impact).toBe('mid');
    expect(tiers.extract_narrative_elements).toBe('mid');
    expect(tiers.identify_metrics).toBe('light');
  });

  it('writer tools have correct model tiers', () => {
    const tiers = Object.fromEntries(writerTools.map((t) => [t.name, t.model_tier]));
    expect(tiers.write_case_study).toBe('primary');
    expect(tiers.add_metrics_visualization).toBe('mid');
    expect(tiers.quality_review).toBe('mid');
    expect(tiers.assemble_portfolio).toBe('mid');
  });

  it('all tools have descriptions (length > 20)', () => {
    for (const tool of [...analystTools, ...writerTools]) {
      expect(tool.description).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(20);
    }
  });

  it('all tools have input_schema with type object', () => {
    for (const tool of [...analystTools, ...writerTools]) {
      expect(tool.input_schema.type).toBe('object');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Knowledge Rules
// ═══════════════════════════════════════════════════════════════════════

describe('Case Study Knowledge Rules', () => {
  const rules = [
    { name: 'RULE_0_PHILOSOPHY', value: RULE_0_PHILOSOPHY },
    { name: 'RULE_1_STAR_CAR', value: RULE_1_STAR_CAR },
    { name: 'RULE_2_METRICS', value: RULE_2_METRICS },
    { name: 'RULE_3_NARRATIVE', value: RULE_3_NARRATIVE },
    { name: 'RULE_4_CONSULTING_GRADE', value: RULE_4_CONSULTING_GRADE },
    { name: 'RULE_5_SELECTION', value: RULE_5_SELECTION },
    { name: 'RULE_6_TRANSFERABILITY', value: RULE_6_TRANSFERABILITY },
    { name: 'RULE_7_SELF_REVIEW', value: RULE_7_SELF_REVIEW },
  ];

  it('all 8 rules are non-empty strings (length > 50)', () => {
    for (const rule of rules) {
      expect(typeof rule.value).toBe('string');
      expect(rule.value.length).toBeGreaterThan(50);
    }
  });

  it('CASE_STUDY_RULES combines all 8 rules', () => {
    expect(CASE_STUDY_RULES).toBeTruthy();
    for (const rule of rules) {
      expect(CASE_STUDY_RULES).toContain(rule.value);
    }
  });

  it('RULE_1_STAR_CAR mentions STAR or CAR', () => {
    const mentionsStarOrCar = RULE_1_STAR_CAR.includes('STAR') || RULE_1_STAR_CAR.includes('CAR');
    expect(mentionsStarOrCar).toBe(true);
  });

  it('RULE_2_METRICS mentions metrics or quantif', () => {
    const mentionsMetrics = RULE_2_METRICS.includes('metrics') || RULE_2_METRICS.includes('Metrics') || RULE_2_METRICS.includes('quantif');
    expect(mentionsMetrics).toBe(true);
  });

  it('RULE_3_NARRATIVE mentions narrative or voice', () => {
    const mentionsNarrative = RULE_3_NARRATIVE.includes('narrative') || RULE_3_NARRATIVE.includes('Narrative') || RULE_3_NARRATIVE.includes('voice') || RULE_3_NARRATIVE.includes('Voice');
    expect(mentionsNarrative).toBe(true);
  });

  it('RULE_4_CONSULTING_GRADE mentions consulting', () => {
    const mentionsConsulting = RULE_4_CONSULTING_GRADE.toLowerCase().includes('consulting');
    expect(mentionsConsulting).toBe(true);
  });

  it('RULE_5_SELECTION mentions selection or criteria', () => {
    const mentionsSelection = RULE_5_SELECTION.toLowerCase().includes('selection') || RULE_5_SELECTION.toLowerCase().includes('criteria');
    expect(mentionsSelection).toBe(true);
  });

  it('RULE_6_TRANSFERABILITY mentions transferable', () => {
    const mentionsTransferable = RULE_6_TRANSFERABILITY.toLowerCase().includes('transferable');
    expect(mentionsTransferable).toBe(true);
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

describe('Case Study Type Constants', () => {
  it('CASE_STUDY_FORMATS has exactly 5 entries', () => {
    expect(CASE_STUDY_FORMATS).toHaveLength(5);
  });

  it('all formats have labels', () => {
    for (const format of CASE_STUDY_FORMATS) {
      expect(CASE_STUDY_FORMAT_LABELS[format]).toBeTruthy();
      expect(typeof CASE_STUDY_FORMAT_LABELS[format]).toBe('string');
    }
  });

  it('CASE_STUDY_FORMATS includes consulting, board, portfolio', () => {
    expect(CASE_STUDY_FORMATS).toContain('consulting');
    expect(CASE_STUDY_FORMATS).toContain('board');
    expect(CASE_STUDY_FORMATS).toContain('portfolio');
  });

  it('IMPACT_CATEGORIES has exactly 6 entries', () => {
    expect(IMPACT_CATEGORIES).toHaveLength(6);
  });

  it('all categories have labels', () => {
    for (const category of IMPACT_CATEGORIES) {
      expect(IMPACT_CATEGORY_LABELS[category]).toBeTruthy();
      expect(typeof IMPACT_CATEGORY_LABELS[category]).toBe('string');
    }
  });

  it('IMPACT_CATEGORIES includes revenue, cost_savings, transformation', () => {
    expect(IMPACT_CATEGORIES).toContain('revenue');
    expect(IMPACT_CATEGORIES).toContain('cost_savings');
    expect(IMPACT_CATEGORIES).toContain('transformation');
  });

  it('IMPACT_CATEGORIES in correct order', () => {
    expect(IMPACT_CATEGORIES).toEqual([
      'revenue',
      'cost_savings',
      'efficiency',
      'growth',
      'transformation',
      'risk_mitigation',
    ]);
  });

  it('FORMAT_LABELS are human-readable', () => {
    for (const format of CASE_STUDY_FORMATS) {
      const label = CASE_STUDY_FORMAT_LABELS[format];
      // Human-readable labels should contain spaces or capital letters and be >3 chars
      expect(label.length).toBeGreaterThan(3);
      const hasUpperCase = /[A-Z]/.test(label);
      expect(hasUpperCase).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// ProductConfig
// ═══════════════════════════════════════════════════════════════════════

describe('Case Study ProductConfig', () => {
  const config = createCaseStudyProductConfig();

  it('creates a valid product config with domain case-study', () => {
    expect(config.domain).toBe('case-study');
  });

  it('has 2 agents (analyst, writer)', () => {
    expect(config.agents).toHaveLength(2);
    expect(config.agents[0].name).toBe('analyst');
    expect(config.agents[1].name).toBe('writer');
  });

  it('has stage messages on analyst (analysis)', () => {
    expect(config.agents[0].stageMessage).toBeDefined();
    expect(config.agents[0].stageMessage!.startStage).toBe('analysis');
  });

  it('has stage messages on writer (writing)', () => {
    expect(config.agents[1].stageMessage).toBeDefined();
    expect(config.agents[1].stageMessage!.startStage).toBe('writing');
  });

  it('createInitialState produces valid state with current_stage=analysis and case_studies=[]', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    expect(state.session_id).toBe('sess-1');
    expect(state.user_id).toBe('user-1');
    expect(state.current_stage).toBe('analysis');
    expect(state.case_studies).toEqual([]);
  });

  it('buildAgentMessage for analyst includes resume text', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    const msg = config.buildAgentMessage('analyst', state, {
      resume_text: 'Jane Doe, 15 years of executive leadership...',
    });
    expect(msg).toContain('Jane Doe');
    expect(msg).toContain('Resume');
  });

  it('buildAgentMessage for analyst includes positioning strategy when available', () => {
    const state = config.createInitialState('sess-1', 'user-1', {
      platform_context: {
        positioning_strategy: { theme: 'operational excellence' },
      },
    });
    const msg = config.buildAgentMessage('analyst', state, {
      resume_text: 'Resume here...',
    });
    expect(msg).toContain('Positioning Strategy');
    expect(msg).toContain('operational excellence');
  });

  it('buildAgentMessage for writer includes tool workflow', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    const msg = config.buildAgentMessage('writer', state, {});
    expect(msg).toContain('write_case_study');
    expect(msg).toContain('add_metrics_visualization');
    expect(msg).toContain('quality_review');
    expect(msg).toContain('assemble_portfolio');
  });

  it('buildAgentMessage for unknown agent returns empty string', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    const msg = config.buildAgentMessage('unknown', state, {});
    expect(msg).toBe('');
  });

  it('validateAfterAgent throws when analyst produces no selected_achievements', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    expect(() => config.validateAfterAgent!('analyst', state)).toThrow('selected achievements');
  });

  it('validateAfterAgent passes when analyst produces selected_achievements', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    state.selected_achievements = [
      {
        id: 'ach_1',
        title: 'Led $50M turnaround',
        company: 'Acme',
        role: 'VP Operations',
        impact_score: 90,
        impact_category: 'transformation',
        situation: 'Division losing money',
        approach: 'Restructured operations',
        results: 'Achieved profitability',
        metrics: [{ label: 'Savings', value: '$50M', context: 'Annual' }],
        transferable_lessons: ['Turnaround pattern'],
        tags: ['operations'],
      },
    ];
    expect(() => config.validateAfterAgent!('analyst', state)).not.toThrow();
  });

  it('validateAfterAgent throws when writer produces no final_report', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    expect(() => config.validateAfterAgent!('writer', state)).toThrow('final report');
  });

  it('validateAfterAgent passes when writer produces final_report', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    state.final_report = '# Case Study Portfolio';
    expect(() => config.validateAfterAgent!('writer', state)).not.toThrow();
  });

  it('finalizeResult emits collection_complete event', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    state.final_report = '# Case Study Portfolio Report';
    state.quality_score = 85;
    state.case_studies = [
      {
        achievement_id: 'ach_1',
        title: 'Turnaround Case Study',
        executive_summary: 'Led a turnaround...',
        situation: 'Division losing $4M',
        approach: 'Restructured operations',
        results: 'Achieved profitability in 3 quarters',
        metrics: [{ label: 'Cost Savings', value: '$4M', context: 'Annual run rate' }],
        lessons: 'Turnaround pattern applies across industries',
        word_count: 650,
        quality_score: 85,
        narrative_clarity: 88,
        metric_specificity: 82,
        strategic_framing: 84,
      },
    ];

    const events: CaseStudySSEEvent[] = [];
    const result = config.finalizeResult(state, {}, (e) => events.push(e));

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('collection_complete');
    const evt = events[0] as Extract<CaseStudySSEEvent, { type: 'collection_complete' }>;
    expect(evt.session_id).toBe('sess-1');
    expect(evt.report).toBe('# Case Study Portfolio Report');
    expect(evt.quality_score).toBe(85);
    expect(evt.case_study_count).toBe(1);

    const res = result as Record<string, unknown>;
    expect(res.report).toBe('# Case Study Portfolio Report');
    expect(res.quality_score).toBe(85);
  });

  it('onComplete for analyst transfers resume_data, achievements, selected_achievements', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    const scratchpad: Record<string, unknown> = {
      resume_data: {
        name: 'Jane',
        current_title: 'VP Operations',
        career_summary: 'Experienced leader',
        key_skills: ['Operations', 'Strategy'],
        key_achievements: ['Led $50M turnaround'],
        work_history: [],
      },
      achievements: [
        { id: 'ach_1', title: 'Turnaround', company: 'Acme', role: 'VP Ops', description: 'Led turnaround' },
        { id: 'ach_2', title: 'Growth', company: 'Beta', role: 'COO', description: 'Scaled operations' },
      ],
      selected_achievements: [
        {
          id: 'ach_1',
          title: 'Turnaround',
          company: 'Acme',
          role: 'VP Ops',
          impact_score: 92,
          impact_category: 'transformation',
          situation: '',
          approach: '',
          results: '',
          metrics: [],
          transferable_lessons: [],
          tags: [],
        },
      ],
    };
    const noop = () => {};
    config.agents[0].onComplete!(scratchpad, state, noop);
    expect(state.resume_data).toBeDefined();
    expect(state.resume_data!.name).toBe('Jane');
    expect(state.achievements).toHaveLength(2);
    expect(state.selected_achievements).toHaveLength(1);
    expect(state.selected_achievements![0].id).toBe('ach_1');
  });

  it('onComplete for writer transfers case_studies, final_report, quality_score', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    const scratchpad: Record<string, unknown> = {
      case_studies: [
        {
          achievement_id: 'ach_1',
          title: 'Turnaround Case Study',
          executive_summary: 'Led a turnaround...',
          situation: 'Division losing $4M',
          approach: 'Restructured operations',
          results: 'Achieved profitability',
          metrics: [{ label: 'Savings', value: '$4M', context: 'Annual' }],
          lessons: 'Pattern applies broadly',
          word_count: 600,
          quality_score: 88,
          narrative_clarity: 90,
          metric_specificity: 85,
          strategic_framing: 87,
        },
      ],
      final_report: '# Full Case Study Portfolio',
      quality_score: 88,
    };
    const noop = () => {};
    config.agents[1].onComplete!(scratchpad, state, noop);
    expect(state.case_studies).toHaveLength(1);
    expect(state.case_studies[0].title).toBe('Turnaround Case Study');
    expect(state.final_report).toBe('# Full Case Study Portfolio');
    expect(state.quality_score).toBe(88);
  });
});
