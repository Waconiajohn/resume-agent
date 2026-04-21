/**
 * Executive Bio Agent (#16) — Server tests.
 *
 * Tests agent registration, tool model tiers, knowledge rules,
 * bio format/length type constants, and ProductConfig behavior.
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
  BIO_FORMATS,
  BIO_FORMAT_LABELS,
  BIO_LENGTHS,
  BIO_LENGTH_LABELS,
  BIO_LENGTH_TARGETS,
} from '../agents/executive-bio/types.js';

import type {
  ExecutiveBioState,
  ExecutiveBioSSEEvent,
} from '../agents/executive-bio/types.js';

// ─── Knowledge Rules ─────────────────────────────────────────────────

import {
  RULE_0_PHILOSOPHY,
  RULE_1_FORMAT_GUIDANCE,
  RULE_2_LENGTH_CALIBRATION,
  RULE_3_TONE,
  RULE_4_POSITIONING,
  RULE_5_ACHIEVEMENTS,
  RULE_6_EXECUTIVE_STANDARDS,
  RULE_7_SELF_REVIEW,
  EXECUTIVE_BIO_RULES,
} from '../agents/executive-bio/knowledge/rules.js';

// ─── Agent Registry ──────────────────────────────────────────────────

import { agentRegistry } from '../agents/runtime/agent-registry.js';

// ─── Agent Configs (trigger registration side effects) ───────────────

import { writerConfig } from '../agents/executive-bio/writer/agent.js';

// ─── Tools ───────────────────────────────────────────────────────────

import { writerTools } from '../agents/executive-bio/writer/tools.js';
import { createEmptySharedContext } from '../contracts/shared-context.js';

// ─── ProductConfig ───────────────────────────────────────────────────

import { createExecutiveBioProductConfig } from '../agents/executive-bio/product.js';

// ═══════════════════════════════════════════════════════════════════════
// Agent Registration
// ═══════════════════════════════════════════════════════════════════════

describe('Executive Bio Agent Registration', () => {
  it('writer is registered in the agent registry', () => {
    expect(agentRegistry.has('executive-bio', 'writer')).toBe(true);
  });

  it('executive-bio domain appears in listDomains', () => {
    const domains = agentRegistry.listDomains();
    expect(domains).toContain('executive-bio');
  });

  it('writer has expected capabilities', () => {
    const desc = agentRegistry.describe('executive-bio', 'writer');
    expect(desc).toBeDefined();
    expect(desc!.capabilities).toContain('bio_writing');
    expect(desc!.capabilities).toContain('format_adaptation');
    expect(desc!.capabilities).toContain('length_calibration');
    expect(desc!.capabilities).toContain('positioning_integration');
  });

  it('writer has correct tool count (4 + emit_transparency = 5)', () => {
    const desc = agentRegistry.describe('executive-bio', 'writer');
    expect(desc).toBeDefined();
    expect(desc!.tools).toHaveLength(5);
  });

  it('writer tools include expected names', () => {
    const desc = agentRegistry.describe('executive-bio', 'writer');
    expect(desc).toBeDefined();
    expect(desc!.tools).toContain('analyze_positioning');
    expect(desc!.tools).toContain('write_bio');
    expect(desc!.tools).toContain('quality_check_bio');
    expect(desc!.tools).toContain('assemble_bio_collection');
    expect(desc!.tools).toContain('emit_transparency');
  });

  it('findByCapability discovers executive-bio writer for bio_writing', () => {
    const creators = agentRegistry.findByCapability('bio_writing', 'executive-bio');
    expect(creators.length).toBeGreaterThanOrEqual(1);
    expect(creators[0].identity.name).toBe('writer');
  });

  it('findByCapability discovers executive-bio writer for format_adaptation', () => {
    const creators = agentRegistry.findByCapability('format_adaptation', 'executive-bio');
    expect(creators.length).toBeGreaterThanOrEqual(1);
    expect(creators[0].identity.name).toBe('writer');
  });

  it('writer model is primary', () => {
    expect(writerConfig.model).toBe('primary');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Tool Model Tiers
// ═══════════════════════════════════════════════════════════════════════

describe('Executive Bio Tool Model Tiers', () => {
  it('writer tools have correct model tiers', () => {
    const tiers = Object.fromEntries(writerTools.map((t) => [t.name, t.model_tier]));
    expect(tiers.analyze_positioning).toBe('mid');
    expect(tiers.write_bio).toBe('primary');
    expect(tiers.quality_check_bio).toBe('mid');
    expect(tiers.assemble_bio_collection).toBe('mid');
  });

  it('all tools have descriptions (length > 20)', () => {
    for (const tool of writerTools) {
      expect(tool.description).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(20);
    }
  });

  it('all tools have input_schema with type object', () => {
    for (const tool of writerTools) {
      expect(tool.input_schema.type).toBe('object');
    }
  });

  it('write_bio description mentions format', () => {
    const writeBio = writerTools.find((t) => t.name === 'write_bio');
    expect(writeBio).toBeDefined();
    expect(writeBio!.description.toLowerCase()).toContain('format');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Knowledge Rules
// ═══════════════════════════════════════════════════════════════════════

describe('Executive Bio Knowledge Rules', () => {
  const rules = [
    { name: 'RULE_0_PHILOSOPHY', value: RULE_0_PHILOSOPHY },
    { name: 'RULE_1_FORMAT_GUIDANCE', value: RULE_1_FORMAT_GUIDANCE },
    { name: 'RULE_2_LENGTH_CALIBRATION', value: RULE_2_LENGTH_CALIBRATION },
    { name: 'RULE_3_TONE', value: RULE_3_TONE },
    { name: 'RULE_4_POSITIONING', value: RULE_4_POSITIONING },
    { name: 'RULE_5_ACHIEVEMENTS', value: RULE_5_ACHIEVEMENTS },
    { name: 'RULE_6_EXECUTIVE_STANDARDS', value: RULE_6_EXECUTIVE_STANDARDS },
    { name: 'RULE_7_SELF_REVIEW', value: RULE_7_SELF_REVIEW },
  ];

  it('all 8 rules are non-empty strings (length > 50)', () => {
    for (const rule of rules) {
      expect(typeof rule.value).toBe('string');
      expect(rule.value.length).toBeGreaterThan(50);
    }
  });

  it('EXECUTIVE_BIO_RULES combines all 8 rules', () => {
    expect(EXECUTIVE_BIO_RULES).toBeTruthy();
    for (const rule of rules) {
      expect(EXECUTIVE_BIO_RULES).toContain(rule.value);
    }
  });

  it('RULE_1_FORMAT_GUIDANCE mentions speaker, board, advisory', () => {
    expect(RULE_1_FORMAT_GUIDANCE).toContain('Speaker');
    expect(RULE_1_FORMAT_GUIDANCE).toContain('Board');
    expect(RULE_1_FORMAT_GUIDANCE).toContain('Advisory');
  });

  it('RULE_2_LENGTH_CALIBRATION mentions 50 words and 500 words', () => {
    expect(RULE_2_LENGTH_CALIBRATION).toContain('50 words');
    expect(RULE_2_LENGTH_CALIBRATION).toContain('500 words');
  });

  it('RULE_3_TONE mentions "third person" and "first person"', () => {
    expect(RULE_3_TONE).toContain('Third-person');
    expect(RULE_3_TONE).toContain('First-person');
  });

  it('RULE_4_POSITIONING mentions "differentiators"', () => {
    expect(RULE_4_POSITIONING).toContain('differentiators');
  });

  it('RULE_5_ACHIEVEMENTS mentions metrics', () => {
    expect(RULE_5_ACHIEVEMENTS.toLowerCase()).toContain('metrics');
  });

  it('RULE_6_EXECUTIVE_STANDARDS mentions VP+, board, or C-suite', () => {
    expect(RULE_6_EXECUTIVE_STANDARDS).toContain('VP');
    expect(RULE_6_EXECUTIVE_STANDARDS).toContain('Board');
    expect(RULE_6_EXECUTIVE_STANDARDS).toContain('C-suite');
  });

  it('RULE_7_SELF_REVIEW mentions "Never fabricate"', () => {
    expect(RULE_7_SELF_REVIEW).toContain('Never fabricate');
  });

  it('each rule has some markdown formatting', () => {
    for (const rule of rules) {
      const hasMarkdown = rule.value.includes('#') || rule.value.includes('- ') || rule.value.includes('*');
      expect(hasMarkdown).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Type Constants
// ═══════════════════════════════════════════════════════════════════════

describe('Executive Bio Type Constants', () => {
  it('BIO_FORMATS has exactly 5 entries', () => {
    expect(BIO_FORMATS).toHaveLength(5);
  });

  it('all bio formats have labels', () => {
    for (const format of BIO_FORMATS) {
      expect(BIO_FORMAT_LABELS[format]).toBeTruthy();
      expect(typeof BIO_FORMAT_LABELS[format]).toBe('string');
    }
  });

  it('BIO_FORMATS includes speaker, board, linkedin_featured', () => {
    expect(BIO_FORMATS).toContain('speaker');
    expect(BIO_FORMATS).toContain('board');
    expect(BIO_FORMATS).toContain('linkedin_featured');
  });

  it('BIO_LENGTHS has exactly 4 entries', () => {
    expect(BIO_LENGTHS).toHaveLength(4);
  });

  it('all bio lengths have labels', () => {
    for (const length of BIO_LENGTHS) {
      expect(BIO_LENGTH_LABELS[length]).toBeTruthy();
      expect(typeof BIO_LENGTH_LABELS[length]).toBe('string');
    }
  });

  it('BIO_LENGTH_TARGETS has correct word counts', () => {
    expect(BIO_LENGTH_TARGETS.micro).toBe(50);
    expect(BIO_LENGTH_TARGETS.short).toBe(100);
    expect(BIO_LENGTH_TARGETS.standard).toBe(250);
    expect(BIO_LENGTH_TARGETS.full).toBe(500);
  });

  it('BIO_LENGTHS are in correct order (micro, short, standard, full)', () => {
    expect(BIO_LENGTHS).toEqual(['micro', 'short', 'standard', 'full']);
  });

  it('BIO_FORMAT_LABELS values are human-readable', () => {
    expect(BIO_FORMAT_LABELS.speaker).toBe('Speaker Bio');
    expect(BIO_FORMAT_LABELS.linkedin_featured).toBe('LinkedIn Featured');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// ProductConfig
// ═══════════════════════════════════════════════════════════════════════

describe('Executive Bio ProductConfig', () => {
  const config = createExecutiveBioProductConfig();

  it('creates a valid product config with domain executive-bio', () => {
    expect(config.domain).toBe('executive-bio');
  });

  it('has 1 agent (writer) — single-agent pipeline', () => {
    expect(config.agents).toHaveLength(1);
    expect(config.agents[0].name).toBe('writer');
  });

  it('has stage message on writer (startStage: writing)', () => {
    expect(config.agents[0].stageMessage).toBeDefined();
    expect(config.agents[0].stageMessage!.startStage).toBe('writing');
  });

  it('createInitialState produces valid state with current_stage=writing', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    expect(state.session_id).toBe('sess-1');
    expect(state.user_id).toBe('user-1');
    expect(state.current_stage).toBe('writing');
  });

  it('createInitialState defaults requested_formats to all 5 when not specified', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    expect(state.requested_formats).toHaveLength(5);
    expect(state.requested_formats).toContain('speaker');
    expect(state.requested_formats).toContain('board');
    expect(state.requested_formats).toContain('advisory');
    expect(state.requested_formats).toContain('professional');
    expect(state.requested_formats).toContain('linkedin_featured');
  });

  it('createInitialState preserves shared_context when provided', () => {
    const sharedContext = createEmptySharedContext();
    sharedContext.careerNarrative.leadershipIdentity = 'Board-ready operator with transformation depth';
    const state = config.createInitialState('sess-1', 'user-1', { shared_context: sharedContext });
    expect(state.shared_context?.careerNarrative.leadershipIdentity).toBe('Board-ready operator with transformation depth');
  });

  it('createInitialState defaults requested_lengths to [standard] when not specified', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    expect(state.requested_lengths).toEqual(['standard']);
  });

  it('createInitialState accepts custom requested_formats', () => {
    const state = config.createInitialState('sess-1', 'user-1', {
      requested_formats: ['speaker', 'board'],
    });
    expect(state.requested_formats).toEqual(['speaker', 'board']);
  });

  it('buildAgentMessage for writer includes resume text', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    const msg = config.buildAgentMessage('writer', state, {
      resume_text: 'Jane Smith, 15 years of technology leadership...',
    });
    expect(msg).toContain('Jane Smith');
    expect(msg).toContain('Resume');
  });

  it('buildAgentMessage for writer includes requested formats', () => {
    const state = config.createInitialState('sess-1', 'user-1', {
      requested_formats: ['speaker', 'board'],
    });
    const msg = config.buildAgentMessage('writer', state, {
      resume_text: 'Resume here...',
    });
    expect(msg).toContain('speaker');
    expect(msg).toContain('board');
    expect(msg).toContain('Requested Formats');
  });

  it('buildAgentMessage for writer includes Career Profile when in platform_context', () => {
    const state = config.createInitialState('sess-1', 'user-1', {
      platform_context: {
        career_profile: {
          version: 'career_profile_v2',
          source: 'career_profile',
          generated_at: '2026-03-16T00:00:00.000Z',
          targeting: {
            target_roles: ['COO'],
            target_industries: ['Tech'],
            seniority: 'C-suite',
            transition_type: 'growth',
            preferred_company_environments: [],
          },
          positioning: {
            core_strengths: ['Digital transformation'],
            proof_themes: ['Execution'],
            differentiators: ['Operator'],
            adjacent_positioning: [],
            positioning_statement: 'Transformation executive',
            narrative_summary: 'Transformation executive',
            leadership_scope: 'Global',
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
          profile_summary: 'Transformation executive',
        },
      },
    });
    const msg = config.buildAgentMessage('writer', state, {
      resume_text: 'Resume here...',
    });
    expect(msg).toContain('Career Profile');
    expect(msg).toContain('Transformation executive');
  });

  it('buildAgentMessage for writer prefers shared narrative and positioning when available', () => {
    const sharedContext = createEmptySharedContext();
    sharedContext.careerNarrative.careerArc = 'Scaled operational turnarounds across complex portfolio companies';
    sharedContext.positioningStrategy.positioningAngle = 'Transformation executive for board-facing growth and execution';
    const state = config.createInitialState('sess-1', 'user-1', {
      shared_context: sharedContext,
    });

    const msg = config.buildAgentMessage('writer', state, { resume_text: 'Resume here...' });
    expect(msg).toContain('Scaled operational turnarounds across complex portfolio companies');
    expect(msg).toContain('Transformation executive for board-facing growth and execution');
  });

  it('buildAgentMessage for unknown agent returns empty string', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    const msg = config.buildAgentMessage('unknown', state, {});
    expect(msg).toBe('');
  });

  it('validateAfterAgent throws when writer produces no final_report', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    expect(() => config.validateAfterAgent!('writer', state)).toThrow('final report');
  });

  it('validateAfterAgent throws when writer produces no bios', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    state.final_report = '# Report';
    expect(() => config.validateAfterAgent!('writer', state)).toThrow('bios');
  });

  it('validateAfterAgent passes when writer produces final_report and bios', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    state.final_report = '# Executive Bio Collection';
    state.bios = [{ format: 'speaker' as const, length: 'standard' as const, target_words: 250, content: 'Bio', actual_words: 50, quality_score: 85, tone: 'third_person' as const, positioning_alignment: 80 }];
    expect(() => config.validateAfterAgent!('writer', state)).not.toThrow();
  });

  it('finalizeResult emits collection_complete event', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    state.final_report = '# Bio Collection Report';
    state.quality_score = 91;
    state.bios = [
      {
        format: 'speaker',
        length: 'standard',
        target_words: 250,
        content: 'A polished speaker bio...',
        actual_words: 245,
        quality_score: 91,
        tone: 'third_person',
        positioning_alignment: 88,
      },
    ];

    const events: ExecutiveBioSSEEvent[] = [];
    const result = config.finalizeResult(state, {}, (e) => events.push(e));

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('collection_complete');
    const evt = events[0] as Extract<ExecutiveBioSSEEvent, { type: 'collection_complete' }>;
    expect(evt.session_id).toBe('sess-1');
    expect(evt.report).toBe('# Bio Collection Report');
    expect(evt.quality_score).toBe(91);
    expect(evt.bio_count).toBe(1);

    const res = result as Record<string, unknown>;
    expect(res.report).toBe('# Bio Collection Report');
    expect(res.quality_score).toBe(91);
  });

  it('onComplete transfers bios, final_report, quality_score, positioning_analysis from scratchpad to state', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    const scratchpad: Record<string, unknown> = {
      positioning_analysis: {
        core_identity: 'Technology transformation leader',
        key_achievements: ['Led $100M digital transformation'],
        differentiators: ['Cross-industry pattern recognition'],
        target_audience: 'Board nominating committees',
        tone_recommendation: 'Authoritative and strategic',
      },
      bios: [
        {
          format: 'speaker',
          length: 'standard',
          target_words: 250,
          content: 'A speaker bio...',
          actual_words: 248,
          quality_score: 90,
          tone: 'third_person',
          positioning_alignment: 85,
        },
      ],
      final_report: '# Executive Bio Collection — Jane Smith',
      quality_score: 90,
      resume_data: {
        name: 'Jane Smith',
        current_title: 'VP Engineering',
        career_summary: 'Experienced technology leader',
        key_skills: ['Digital Transformation', 'Team Building'],
        key_achievements: ['Led $100M transformation'],
        work_history: [],
      },
    };
    const noop = () => {};
    config.agents[0].onComplete!(scratchpad, state, noop);
    expect(state.positioning_analysis).toBeDefined();
    expect(state.positioning_analysis!.core_identity).toBe('Technology transformation leader');
    expect(state.bios).toHaveLength(1);
    expect(state.final_report).toBe('# Executive Bio Collection — Jane Smith');
    expect(state.quality_score).toBe(90);
    expect(state.resume_data?.name).toBe('Jane Smith');
  });
});
