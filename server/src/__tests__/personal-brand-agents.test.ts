/**
 * Personal Brand Audit Agent (#19) — Server tests.
 *
 * Tests agent registration, tool model tiers, knowledge rules,
 * brand source/finding category type constants, and ProductConfig behavior.
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
  BRAND_SOURCES,
  BRAND_SOURCE_LABELS,
  FINDING_CATEGORIES,
  FINDING_CATEGORY_LABELS,
} from '../agents/personal-brand/types.js';

import type {
  PersonalBrandState,
  PersonalBrandSSEEvent,
} from '../agents/personal-brand/types.js';

// ─── Knowledge Rules ─────────────────────────────────────────────────

import {
  RULE_0_PHILOSOPHY,
  RULE_1_CONSISTENCY,
  RULE_2_AUDIENCE_ALIGNMENT,
  RULE_3_VALUE_PROPOSITION,
  RULE_4_EXECUTIVE_PRESENCE,
  RULE_5_GAP_IDENTIFICATION,
  RULE_6_PRIORITIZATION,
  RULE_7_SELF_REVIEW,
  PERSONAL_BRAND_RULES,
} from '../agents/personal-brand/knowledge/rules.js';

// ─── Agent Registry ──────────────────────────────────────────────────

import { agentRegistry } from '../agents/runtime/agent-registry.js';

// ─── Agent Configs (trigger registration side effects) ───────────────

import { auditorConfig } from '../agents/personal-brand/auditor/agent.js';
import { advisorConfig } from '../agents/personal-brand/advisor/agent.js';

// ─── Tools ───────────────────────────────────────────────────────────

import { auditorTools } from '../agents/personal-brand/auditor/tools.js';
import { advisorTools } from '../agents/personal-brand/advisor/tools.js';

// ─── ProductConfig ───────────────────────────────────────────────────

import { createPersonalBrandProductConfig } from '../agents/personal-brand/product.js';

// ═══════════════════════════════════════════════════════════════════════
// Agent Registration
// ═══════════════════════════════════════════════════════════════════════

describe('Personal Brand Agent Registration', () => {
  it('auditor is registered in the agent registry', () => {
    expect(agentRegistry.has('personal-brand', 'auditor')).toBe(true);
  });

  it('advisor is registered in the agent registry', () => {
    expect(agentRegistry.has('personal-brand', 'advisor')).toBe(true);
  });

  it('personal-brand domain appears in listDomains', () => {
    const domains = agentRegistry.listDomains();
    expect(domains).toContain('personal-brand');
  });

  it('auditor has expected capabilities', () => {
    const desc = agentRegistry.describe('personal-brand', 'auditor');
    expect(desc).toBeDefined();
    expect(desc!.capabilities).toContain('brand_analysis');
    expect(desc!.capabilities).toContain('consistency_scoring');
    expect(desc!.capabilities).toContain('gap_identification');
    expect(desc!.capabilities).toContain('cross_source_comparison');
  });

  it('advisor has expected capabilities', () => {
    const desc = agentRegistry.describe('personal-brand', 'advisor');
    expect(desc).toBeDefined();
    expect(desc!.capabilities).toContain('recommendation_writing');
    expect(desc!.capabilities).toContain('gap_analysis');
    expect(desc!.capabilities).toContain('priority_ranking');
    expect(desc!.capabilities).toContain('report_assembly');
  });

  it('auditor has correct tool count (4 + emit_transparency = 5)', () => {
    const desc = agentRegistry.describe('personal-brand', 'auditor');
    expect(desc).toBeDefined();
    expect(desc!.tools).toHaveLength(5);
  });

  it('auditor tools include expected names', () => {
    const desc = agentRegistry.describe('personal-brand', 'auditor');
    expect(desc).toBeDefined();
    expect(desc!.tools).toContain('analyze_resume_brand');
    expect(desc!.tools).toContain('analyze_linkedin_brand');
    expect(desc!.tools).toContain('analyze_bio_brand');
    expect(desc!.tools).toContain('score_consistency');
    expect(desc!.tools).toContain('emit_transparency');
  });

  it('advisor has correct tool count (4 + emit_transparency = 5)', () => {
    const desc = agentRegistry.describe('personal-brand', 'advisor');
    expect(desc).toBeDefined();
    expect(desc!.tools).toHaveLength(5);
  });

  it('advisor tools include expected names', () => {
    const desc = agentRegistry.describe('personal-brand', 'advisor');
    expect(desc).toBeDefined();
    expect(desc!.tools).toContain('identify_gaps');
    expect(desc!.tools).toContain('write_recommendations');
    expect(desc!.tools).toContain('prioritize_fixes');
    expect(desc!.tools).toContain('assemble_audit_report');
    expect(desc!.tools).toContain('emit_transparency');
  });

  it('findByCapability discovers auditor', () => {
    const creators = agentRegistry.findByCapability('brand_analysis', 'personal-brand');
    expect(creators.length).toBeGreaterThanOrEqual(1);
    expect(creators[0].identity.name).toBe('auditor');
  });

  it('findByCapability discovers advisor', () => {
    const creators = agentRegistry.findByCapability('recommendation_writing', 'personal-brand');
    expect(creators.length).toBeGreaterThanOrEqual(1);
    expect(creators[0].identity.name).toBe('advisor');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Tool Model Tiers
// ═══════════════════════════════════════════════════════════════════════

describe('Personal Brand Tool Model Tiers', () => {
  it('auditor tools have correct model tiers', () => {
    const tiers = Object.fromEntries(auditorTools.map((t) => [t.name, t.model_tier]));
    expect(tiers.analyze_resume_brand).toBe('mid');
    expect(tiers.analyze_linkedin_brand).toBe('mid');
    expect(tiers.analyze_bio_brand).toBe('mid');
    expect(tiers.score_consistency).toBe('mid');
  });

  it('advisor tools have correct model tiers', () => {
    const tiers = Object.fromEntries(advisorTools.map((t) => [t.name, t.model_tier]));
    expect(tiers.identify_gaps).toBe('mid');
    expect(tiers.write_recommendations).toBe('primary');
    expect(tiers.prioritize_fixes).toBe('mid');
    expect(tiers.assemble_audit_report).toBe('mid');
  });

  it('all tools have descriptions (length > 20)', () => {
    for (const tool of [...auditorTools, ...advisorTools]) {
      expect(tool.description).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(20);
    }
  });

  it('all tools have input_schema with type object', () => {
    for (const tool of [...auditorTools, ...advisorTools]) {
      expect(tool.input_schema.type).toBe('object');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Knowledge Rules
// ═══════════════════════════════════════════════════════════════════════

describe('Personal Brand Knowledge Rules', () => {
  const rules = [
    { name: 'RULE_0_PHILOSOPHY', value: RULE_0_PHILOSOPHY },
    { name: 'RULE_1_CONSISTENCY', value: RULE_1_CONSISTENCY },
    { name: 'RULE_2_AUDIENCE_ALIGNMENT', value: RULE_2_AUDIENCE_ALIGNMENT },
    { name: 'RULE_3_VALUE_PROPOSITION', value: RULE_3_VALUE_PROPOSITION },
    { name: 'RULE_4_EXECUTIVE_PRESENCE', value: RULE_4_EXECUTIVE_PRESENCE },
    { name: 'RULE_5_GAP_IDENTIFICATION', value: RULE_5_GAP_IDENTIFICATION },
    { name: 'RULE_6_PRIORITIZATION', value: RULE_6_PRIORITIZATION },
    { name: 'RULE_7_SELF_REVIEW', value: RULE_7_SELF_REVIEW },
  ];

  it('all 8 rules are non-empty strings (length > 50)', () => {
    for (const rule of rules) {
      expect(typeof rule.value).toBe('string');
      expect(rule.value.length).toBeGreaterThan(50);
    }
  });

  it('PERSONAL_BRAND_RULES combines all 8 rules', () => {
    expect(PERSONAL_BRAND_RULES).toBeTruthy();
    for (const rule of rules) {
      expect(PERSONAL_BRAND_RULES).toContain(rule.value);
    }
  });

  it('RULE_0_PHILOSOPHY mentions coherence', () => {
    expect(RULE_0_PHILOSOPHY.toLowerCase()).toContain('coherence');
  });

  it('RULE_1_CONSISTENCY mentions value proposition alignment', () => {
    const mentionsValueProp = RULE_1_CONSISTENCY.toLowerCase().includes('value proposition');
    expect(mentionsValueProp).toBe(true);
  });

  it('RULE_2_AUDIENCE_ALIGNMENT mentions audience', () => {
    expect(RULE_2_AUDIENCE_ALIGNMENT.toLowerCase()).toContain('audience');
  });

  it('RULE_3_VALUE_PROPOSITION mentions elevator', () => {
    expect(RULE_3_VALUE_PROPOSITION.toLowerCase()).toContain('elevator');
  });

  it('RULE_4_EXECUTIVE_PRESENCE mentions authority', () => {
    expect(RULE_4_EXECUTIVE_PRESENCE.toLowerCase()).toContain('authority');
  });

  it('RULE_5_GAP_IDENTIFICATION mentions evidence-based', () => {
    expect(RULE_5_GAP_IDENTIFICATION.toLowerCase()).toContain('evidence-based');
  });

  it('RULE_6_PRIORITIZATION mentions quick wins', () => {
    expect(RULE_6_PRIORITIZATION.toLowerCase()).toContain('quick wins');
  });

  it('RULE_7_SELF_REVIEW mentions "Never fabricate" or "No fabricated"', () => {
    const mentionsFabricate = RULE_7_SELF_REVIEW.includes('fabricat');
    expect(mentionsFabricate).toBe(true);
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

describe('Personal Brand Type Constants', () => {
  it('BRAND_SOURCES has exactly 5 entries', () => {
    expect(BRAND_SOURCES).toHaveLength(5);
  });

  it('all brand sources have labels', () => {
    for (const source of BRAND_SOURCES) {
      expect(BRAND_SOURCE_LABELS[source]).toBeTruthy();
      expect(typeof BRAND_SOURCE_LABELS[source]).toBe('string');
    }
  });

  it('BRAND_SOURCES includes resume, linkedin, bio, website, portfolio', () => {
    expect(BRAND_SOURCES).toContain('resume');
    expect(BRAND_SOURCES).toContain('linkedin');
    expect(BRAND_SOURCES).toContain('bio');
    expect(BRAND_SOURCES).toContain('website');
    expect(BRAND_SOURCES).toContain('portfolio');
  });

  it('BRAND_SOURCES are in correct order', () => {
    expect(BRAND_SOURCES).toEqual(['resume', 'linkedin', 'bio', 'website', 'portfolio']);
  });

  it('FINDING_CATEGORIES has exactly 6 entries', () => {
    expect(FINDING_CATEGORIES).toHaveLength(6);
  });

  it('all finding categories have labels', () => {
    for (const category of FINDING_CATEGORIES) {
      expect(FINDING_CATEGORY_LABELS[category]).toBeTruthy();
      expect(typeof FINDING_CATEGORY_LABELS[category]).toBe('string');
    }
  });

  it('FINDING_CATEGORIES includes messaging_inconsistency, value_prop_gap, tone_mismatch', () => {
    expect(FINDING_CATEGORIES).toContain('messaging_inconsistency');
    expect(FINDING_CATEGORIES).toContain('value_prop_gap');
    expect(FINDING_CATEGORIES).toContain('tone_mismatch');
  });

  it('FINDING_CATEGORIES in correct order', () => {
    expect(FINDING_CATEGORIES).toEqual([
      'messaging_inconsistency',
      'value_prop_gap',
      'tone_mismatch',
      'missing_element',
      'outdated_content',
      'audience_misalignment',
    ]);
  });

  it('BRAND_SOURCE_LABELS are human-readable', () => {
    expect(BRAND_SOURCE_LABELS.resume).toBe('Resume');
    expect(BRAND_SOURCE_LABELS.linkedin).toBe('LinkedIn Profile');
    expect(BRAND_SOURCE_LABELS.bio).toBe('Professional Bio');
  });

  it('FINDING_CATEGORY_LABELS are human-readable', () => {
    expect(FINDING_CATEGORY_LABELS.messaging_inconsistency).toBe('Messaging Inconsistency');
    expect(FINDING_CATEGORY_LABELS.value_prop_gap).toBe('Value Proposition Gap');
    expect(FINDING_CATEGORY_LABELS.tone_mismatch).toBe('Tone Mismatch');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// ProductConfig
// ═══════════════════════════════════════════════════════════════════════

describe('Personal Brand ProductConfig', () => {
  const config = createPersonalBrandProductConfig();

  it('creates a valid product config with domain personal-brand', () => {
    expect(config.domain).toBe('personal-brand');
  });

  it('has 2 agents (auditor, advisor)', () => {
    expect(config.agents).toHaveLength(2);
    expect(config.agents[0].name).toBe('auditor');
    expect(config.agents[1].name).toBe('advisor');
  });

  it('has stage messages on auditor (auditing)', () => {
    expect(config.agents[0].stageMessage).toBeDefined();
    expect(config.agents[0].stageMessage!.startStage).toBe('auditing');
  });

  it('has stage messages on advisor (advising)', () => {
    expect(config.agents[1].stageMessage).toBeDefined();
    expect(config.agents[1].stageMessage!.startStage).toBe('advising');
  });

  it('createInitialState produces valid state with current_stage=auditing', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    expect(state.session_id).toBe('sess-1');
    expect(state.user_id).toBe('user-1');
    expect(state.current_stage).toBe('auditing');
    expect(state.audit_findings).toEqual([]);
    expect(state.recommendations).toEqual([]);
  });

  it('createInitialState accepts brand_sources', () => {
    const state = config.createInitialState('sess-1', 'user-1', {
      brand_sources: [
        { source: 'resume', content: 'Resume text...' },
        { source: 'linkedin', content: 'LinkedIn text...' },
      ],
    });
    expect(state.brand_sources).toHaveLength(2);
    expect(state.brand_sources[0].source).toBe('resume');
  });

  it('buildAgentMessage for auditor includes brand source content', () => {
    const state = config.createInitialState('sess-1', 'user-1', {
      brand_sources: [
        { source: 'resume', content: 'Jane Doe, VP of Marketing...' },
      ],
    });
    const msg = config.buildAgentMessage('auditor', state, {});
    expect(msg).toContain('Jane Doe');
    expect(msg).toContain('Resume');
  });

  it('buildAgentMessage for auditor includes positioning strategy when available', () => {
    const state = config.createInitialState('sess-1', 'user-1', {
      brand_sources: [{ source: 'resume', content: 'Resume...' }],
      platform_context: {
        positioning_strategy: { theme: 'operational excellence' },
      },
    });
    const msg = config.buildAgentMessage('auditor', state, {});
    expect(msg).toContain('Positioning Strategy');
    expect(msg).toContain('operational excellence');
  });

  it('buildAgentMessage for advisor includes tool workflow', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    const msg = config.buildAgentMessage('advisor', state, {});
    expect(msg).toContain('identify_gaps');
    expect(msg).toContain('write_recommendations');
    expect(msg).toContain('prioritize_fixes');
    expect(msg).toContain('assemble_audit_report');
  });

  it('buildAgentMessage for unknown agent returns empty string', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    const msg = config.buildAgentMessage('unknown', state, {});
    expect(msg).toBe('');
  });

  it('validateAfterAgent throws when auditor produces no audit_findings', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    expect(() => config.validateAfterAgent!('auditor', state)).toThrow('audit findings');
  });

  it('validateAfterAgent passes when auditor produces audit_findings', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    state.audit_findings = [
      {
        id: 'rf_1',
        category: 'value_prop_gap',
        severity: 'high',
        title: 'Missing value proposition',
        description: 'Resume lacks a clear value proposition in the headline',
        source: 'resume',
        affected_elements: ['headline'],
        recommendation: 'Add a value-driven headline',
      },
    ];
    expect(() => config.validateAfterAgent!('auditor', state)).not.toThrow();
  });

  it('validateAfterAgent throws when advisor produces no final_report', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    expect(() => config.validateAfterAgent!('advisor', state)).toThrow('final report');
  });

  it('validateAfterAgent passes when advisor produces final_report', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    state.final_report = '# Brand Audit Report';
    expect(() => config.validateAfterAgent!('advisor', state)).not.toThrow();
  });

  it('finalizeResult emits collection_complete event', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    state.final_report = '# Personal Brand Audit Report';
    state.quality_score = 78;
    state.audit_findings = [
      {
        id: 'rf_1',
        category: 'value_prop_gap',
        severity: 'high',
        title: 'Missing value proposition',
        description: 'Resume lacks clarity',
        source: 'resume',
        affected_elements: ['headline'],
        recommendation: 'Add value-driven headline',
      },
    ];

    const events: PersonalBrandSSEEvent[] = [];
    const result = config.finalizeResult(state, {}, (e) => events.push(e));

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('collection_complete');
    const evt = events[0] as Extract<PersonalBrandSSEEvent, { type: 'collection_complete' }>;
    expect(evt.session_id).toBe('sess-1');
    expect(evt.report).toBe('# Personal Brand Audit Report');
    expect(evt.quality_score).toBe(78);
    expect(evt.finding_count).toBe(1);

    const res = result as Record<string, unknown>;
    expect(res.report).toBe('# Personal Brand Audit Report');
    expect(res.quality_score).toBe(78);
  });

  it('onComplete for auditor transfers resume_data and all_findings', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    const scratchpad: Record<string, unknown> = {
      resume_data: {
        name: 'Jane',
        current_title: 'VP Marketing',
        career_summary: 'Experienced leader',
        key_skills: ['Marketing', 'Strategy'],
        key_achievements: ['Led brand transformation'],
        work_history: [],
      },
      all_findings: [
        {
          id: 'rf_1',
          category: 'value_prop_gap',
          severity: 'high',
          title: 'Missing value proposition',
          description: 'Headline lacks clarity',
          source: 'resume',
          affected_elements: ['headline'],
          recommendation: 'Add value-driven headline',
        },
      ],
    };
    const noop = () => {};
    config.agents[0].onComplete!(scratchpad, state, noop);
    expect(state.resume_data).toBeDefined();
    expect(state.resume_data!.name).toBe('Jane');
    expect(state.audit_findings).toHaveLength(1);
    expect(state.audit_findings[0].id).toBe('rf_1');
  });

  it('onComplete for advisor transfers recommendations, final_report, quality_score', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    const scratchpad: Record<string, unknown> = {
      recommendations: [
        {
          priority: 1,
          category: 'Messaging Alignment',
          title: 'Rewrite LinkedIn headline',
          description: 'Change headline to match resume positioning',
          effort: 'low',
          impact: 'high',
          affected_sources: ['linkedin'],
        },
      ],
      final_report: '# Full Brand Audit Report',
      quality_score: 82,
    };
    const noop = () => {};
    config.agents[1].onComplete!(scratchpad, state, noop);
    expect(state.recommendations).toHaveLength(1);
    expect(state.recommendations[0].title).toBe('Rewrite LinkedIn headline');
    expect(state.final_report).toBe('# Full Brand Audit Report');
    expect(state.quality_score).toBe(82);
  });
});
