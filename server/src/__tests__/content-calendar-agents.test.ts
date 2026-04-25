/**
 * Content Calendar Agents — Unit tests.
 *
 * Verifies:
 * - Both agents register with the agent registry
 * - Both agents can be discovered via registry
 * - ProductConfig compiles and is well-formed
 * - Agent tools have correct names and model tiers
 * - content-calendar domain appears in registry
 * - Knowledge rules are complete and non-empty
 * - ProductConfig state, messages, and validation work correctly
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
          order: () => ({
            limit: () => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
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
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  createSessionLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { agentRegistry } from '../agents/runtime/agent-registry.js';

// Import agent modules to trigger registration side effects
import '../agents/content-calendar/strategist/agent.js';
import '../agents/content-calendar/writer/agent.js';
import { createContentCalendarProductConfig } from '../agents/content-calendar/product.js';
import { strategistTools } from '../agents/content-calendar/strategist/tools.js';
import { writerTools } from '../agents/content-calendar/writer/tools.js';
import { createEmptySharedContext } from '../contracts/shared-context.js';
import {
  CONTENT_CALENDAR_RULES,
  RULE_0_PHILOSOPHY,
  RULE_1_CONTENT_MIX,
  RULE_2_HOOKS,
  RULE_3_STRUCTURE,
  RULE_4_HASHTAGS,
  RULE_5_SCHEDULE,
  RULE_6_ENGAGEMENT,
  RULE_7_SELF_REVIEW,
} from '../agents/content-calendar/knowledge/rules.js';
import { CONTENT_TYPES, CONTENT_TYPE_LABELS } from '../agents/content-calendar/types.js';

// ─── Agent Registration ───────────────────────────────────────────

describe('Content Calendar Agent Registration', () => {
  it('strategist is registered in the agent registry', () => {
    expect(agentRegistry.has('content-calendar', 'strategist')).toBe(true);
  });

  it('writer is registered in the agent registry', () => {
    expect(agentRegistry.has('content-calendar', 'writer')).toBe(true);
  });

  it('content-calendar domain appears in listDomains', () => {
    const domains = agentRegistry.listDomains();
    expect(domains).toContain('content-calendar');
  });

  it('strategist has expected capabilities', () => {
    const desc = agentRegistry.describe('content-calendar', 'strategist');
    expect(desc).toBeDefined();
    expect(desc!.capabilities).toContain('content_strategy');
    expect(desc!.capabilities).toContain('theme_identification');
    expect(desc!.capabilities).toContain('audience_analysis');
    expect(desc!.capabilities).toContain('expertise_analysis');
  });

  it('writer has expected capabilities', () => {
    const desc = agentRegistry.describe('content-calendar', 'writer');
    expect(desc).toBeDefined();
    expect(desc!.capabilities).toContain('linkedin_content_writing');
    expect(desc!.capabilities).toContain('hook_crafting');
    expect(desc!.capabilities).toContain('hashtag_optimization');
    expect(desc!.capabilities).toContain('calendar_assembly');
  });

  it('strategist has 5 tools (4 + emit_transparency)', () => {
    const desc = agentRegistry.describe('content-calendar', 'strategist');
    expect(desc).toBeDefined();
    expect(desc!.tools).toHaveLength(5);
    expect(desc!.tools).toContain('analyze_expertise');
    expect(desc!.tools).toContain('identify_themes');
    expect(desc!.tools).toContain('map_audience_interests');
    expect(desc!.tools).toContain('plan_content_mix');
    expect(desc!.tools).toContain('emit_transparency');
  });

  it('writer has 6 tools (5 + emit_transparency)', () => {
    const desc = agentRegistry.describe('content-calendar', 'writer');
    expect(desc).toBeDefined();
    expect(desc!.tools).toHaveLength(6);
    expect(desc!.tools).toContain('write_post');
    expect(desc!.tools).toContain('craft_hook');
    expect(desc!.tools).toContain('add_hashtags');
    expect(desc!.tools).toContain('schedule_post');
    expect(desc!.tools).toContain('assemble_calendar');
    expect(desc!.tools).toContain('emit_transparency');
  });

  it('findByCapability discovers content-calendar writer', () => {
    const creators = agentRegistry.findByCapability('linkedin_content_writing', 'content-calendar');
    expect(creators.length).toBeGreaterThanOrEqual(1);
    expect(creators[0].identity.name).toBe('writer');
  });

  it('findByCapability discovers content-calendar strategist', () => {
    const creators = agentRegistry.findByCapability('content_strategy', 'content-calendar');
    expect(creators.length).toBeGreaterThanOrEqual(1);
    expect(creators[0].identity.name).toBe('strategist');
  });
});

// ─── Tool Model Tiers ─────────────────────────────────────────────

describe('Content Calendar Tool Model Tiers', () => {
  it('strategist tools have correct model tiers', () => {
    const tierMap: Record<string, string> = {
      analyze_expertise: 'light',
      identify_themes: 'mid',
      map_audience_interests: 'mid',
      plan_content_mix: 'mid',
    };
    for (const tool of strategistTools) {
      expect(tool.model_tier).toBe(tierMap[tool.name]);
    }
  });

  it('writer tools have correct model tiers', () => {
    const tierMap: Record<string, string> = {
      write_post: 'primary',
      craft_hook: 'primary',
      add_hashtags: 'mid',
      schedule_post: 'light',
      assemble_calendar: 'mid',
    };
    for (const tool of writerTools) {
      expect(tool.model_tier).toBe(tierMap[tool.name]);
    }
  });

  it('all tools have descriptions', () => {
    for (const tool of [...strategistTools, ...writerTools]) {
      expect(tool.description).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(20);
    }
  });

  it('all tools have input_schema with type object', () => {
    for (const tool of [...strategistTools, ...writerTools]) {
      expect(tool.input_schema.type).toBe('object');
    }
  });
});

// ─── Knowledge Rules ──────────────────────────────────────────────

describe('Content Calendar Knowledge Rules', () => {
  const rules = [
    { name: 'RULE_0_PHILOSOPHY', value: RULE_0_PHILOSOPHY },
    { name: 'RULE_1_CONTENT_MIX', value: RULE_1_CONTENT_MIX },
    { name: 'RULE_2_HOOKS', value: RULE_2_HOOKS },
    { name: 'RULE_3_STRUCTURE', value: RULE_3_STRUCTURE },
    { name: 'RULE_4_HASHTAGS', value: RULE_4_HASHTAGS },
    { name: 'RULE_5_SCHEDULE', value: RULE_5_SCHEDULE },
    { name: 'RULE_6_ENGAGEMENT', value: RULE_6_ENGAGEMENT },
    { name: 'RULE_7_SELF_REVIEW', value: RULE_7_SELF_REVIEW },
  ];

  it('all 8 rules are non-empty strings', () => {
    for (const rule of rules) {
      expect(typeof rule.value).toBe('string');
      expect(rule.value.length).toBeGreaterThan(50);
    }
  });

  it('CONTENT_CALENDAR_RULES combines all 8 rules', () => {
    expect(CONTENT_CALENDAR_RULES).toBeTruthy();
    for (const rule of rules) {
      expect(CONTENT_CALENDAR_RULES).toContain(rule.value);
    }
  });

  it('RULE_1_CONTENT_MIX mentions 7 content types', () => {
    expect(RULE_1_CONTENT_MIX).toContain('Thought Leadership');
    expect(RULE_1_CONTENT_MIX).toContain('Storytelling');
    expect(RULE_1_CONTENT_MIX).toContain('Engagement');
  });

  it('RULE_2_HOOKS mentions 210 characters', () => {
    expect(RULE_2_HOOKS).toContain('210');
  });

  it('RULE_3_STRUCTURE uses the 250-word article target', () => {
    expect(RULE_3_STRUCTURE).toContain('250 words');
    expect(RULE_3_STRUCTURE).toContain('200-275');
    expect(RULE_3_STRUCTURE).toContain('never over 300');
  });

  it('RULE_4_HASHTAGS mentions 3-5 hashtags', () => {
    expect(RULE_4_HASHTAGS).toContain('3-5');
  });

  it('RULE_5_SCHEDULE mentions 4 posts per week', () => {
    expect(RULE_5_SCHEDULE).toContain('4 posts per week');
  });

  it('RULE_7_SELF_REVIEW mentions hook test', () => {
    expect(RULE_7_SELF_REVIEW).toContain('Hook test');
    expect(RULE_7_SELF_REVIEW).toContain('Never fabricate');
  });
});

// ─── Content Types ────────────────────────────────────────────────

describe('Content Calendar Content Types', () => {
  it('has exactly 7 content types', () => {
    expect(CONTENT_TYPES).toHaveLength(7);
  });

  it('all content types have labels', () => {
    for (const type of CONTENT_TYPES) {
      expect(CONTENT_TYPE_LABELS[type]).toBeTruthy();
      expect(CONTENT_TYPE_LABELS[type].length).toBeGreaterThan(3);
    }
  });

  it('content types are in correct order', () => {
    expect(CONTENT_TYPES[0]).toBe('thought_leadership');
    expect(CONTENT_TYPES[1]).toBe('storytelling');
    expect(CONTENT_TYPES[6]).toBe('career_lesson');
  });
});

// ─── ProductConfig ────────────────────────────────────────────────

describe('Content Calendar ProductConfig', () => {
  it('creates a valid product config', () => {
    const config = createContentCalendarProductConfig();
    expect(config.domain).toBe('content-calendar');
    expect(config.agents).toHaveLength(2);
    expect(config.agents[0].name).toBe('strategist');
    expect(config.agents[1].name).toBe('writer');
  });

  it('has stage messages on both agents', () => {
    const config = createContentCalendarProductConfig();
    expect(config.agents[0].stageMessage).toBeDefined();
    expect(config.agents[0].stageMessage!.startStage).toBe('strategy');
    expect(config.agents[1].stageMessage).toBeDefined();
    expect(config.agents[1].stageMessage!.startStage).toBe('writing');
  });

  it('createInitialState produces valid state', () => {
    const config = createContentCalendarProductConfig();
    const state = config.createInitialState('sess-1', 'user-1', {});
    expect(state.session_id).toBe('sess-1');
    expect(state.user_id).toBe('user-1');
    expect(state.current_stage).toBe('strategy');
    expect(state.posts).toBeDefined();
    expect(Array.isArray(state.posts)).toBe(true);
  });

  it('createInitialState preserves shared_context when provided', () => {
    const config = createContentCalendarProductConfig();
    const sharedContext = createEmptySharedContext();
    sharedContext.positioningStrategy.positioningAngle = 'Operations storyteller for industrial transformation';
    const state = config.createInitialState('sess-1', 'user-1', { shared_context: sharedContext });
    expect(state.shared_context?.positioningStrategy.positioningAngle).toBe('Operations storyteller for industrial transformation');
  });

  it('buildAgentMessage returns content for strategist', () => {
    const config = createContentCalendarProductConfig();
    const state = config.createInitialState('s', 'u', {});
    const msg = config.buildAgentMessage('strategist', state, {
      resume_text: 'John Doe, VP Operations...',
    });
    expect(msg).toContain('John Doe, VP Operations...');
    expect(msg).toContain('Objective');
  });

  it('buildAgentMessage includes Career Profile when available', () => {
    const config = createContentCalendarProductConfig();
    const state = config.createInitialState('s', 'u', {});
    state.platform_context = {
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
          proof_themes: ['Team repair'],
          differentiators: ['Fixer'],
          adjacent_positioning: [],
          positioning_statement: 'Turnaround operator',
          narrative_summary: 'Turnaround leader',
          leadership_scope: 'Multi-site',
          scope_of_responsibility: 'Operations',
        },
        narrative: {
          colleagues_came_for_what: 'fixing broken teams',
          known_for_what: 'turnaround leadership',
          why_not_me: 'deep operational experience others lack',
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
    };
    const msg = config.buildAgentMessage('strategist', state, {
      resume_text: 'resume',
    });
    expect(msg).toContain('Career Profile');
    expect(msg).toContain('Turnaround operator');
  });

  it('buildAgentMessage includes LinkedIn profile analysis when available', () => {
    const config = createContentCalendarProductConfig();
    const state = config.createInitialState('s', 'u', {});
    state.platform_context = {
      linkedin_analysis: {
        keyword_analysis: {
          coverage_score: 42,
          missing_keywords: ['Cloud', 'DevOps'],
          recommended_keywords: ['Platform'],
        },
        profile_analysis: {
          headline_assessment: 'Needs stronger target-role language',
          about_assessment: 'Good story, weak keyword density',
          positioning_gaps: ['Target role not explicit'],
          strengths: ['Strong leadership tone'],
        },
      },
    };
    const msg = config.buildAgentMessage('strategist', state, {
      resume_text: 'resume',
    });
    expect(msg).toContain('LinkedIn Profile Analysis');
    expect(msg).toContain('Cloud, DevOps');
    expect(msg).toContain('Needs stronger target-role language');
  });

  it('buildAgentMessage includes canonical shared context when legacy room context is absent', () => {
    const config = createContentCalendarProductConfig();
    const state = config.createInitialState('s', 'u', {});
    const sharedContext = createEmptySharedContext();
    sharedContext.candidateProfile.factualSummary = 'Operations executive building resilient industrial teams';
    sharedContext.careerNarrative.careerArc = 'Known for turning fragmented operations into steady execution engines';
    sharedContext.positioningStrategy.positioningAngle = 'Industrial operations leader with a systems lens';
    state.shared_context = sharedContext;

    const msg = config.buildAgentMessage('strategist', state, { resume_text: 'resume' });
    expect(msg).toContain('Operations executive building resilient industrial teams');
    expect(msg).toContain('Known for turning fragmented operations into steady execution engines');
    expect(msg).toContain('Industrial operations leader with a systems lens');
  });

  it('buildAgentMessage returns content for writer', () => {
    const config = createContentCalendarProductConfig();
    const state = config.createInitialState('s', 'u', {});
    const msg = config.buildAgentMessage('writer', state, {});
    expect(msg).toContain('scheduled post day');
    expect(msg).toContain('content calendar');
  });

  it('buildAgentMessage returns empty string for unknown agent', () => {
    const config = createContentCalendarProductConfig();
    const state = config.createInitialState('s', 'u', {});
    const msg = config.buildAgentMessage('unknown', state, {});
    expect(msg).toBe('');
  });

  it('validateAfterAgent throws when strategist produces no resume_data', () => {
    const config = createContentCalendarProductConfig();
    const state = config.createInitialState('s', 'u', {});
    expect(() => config.validateAfterAgent!('strategist', state)).toThrow();
  });

  it('validateAfterAgent passes when strategist produces resume_data', () => {
    const config = createContentCalendarProductConfig();
    const state = config.createInitialState('s', 'u', {});
    state.resume_data = {
      name: 'John',
      current_title: 'VP',
      career_summary: '',
      key_skills: [],
      key_achievements: [],
      work_history: [],
    };
    expect(() => config.validateAfterAgent!('strategist', state)).not.toThrow();
  });

  it('validateAfterAgent throws if writer produces no final_report', () => {
    const config = createContentCalendarProductConfig();
    const state = config.createInitialState('s', 'u', {});
    expect(() => config.validateAfterAgent!('writer', state)).toThrow('final report');
  });

  it('validateAfterAgent passes if writer produces final_report', () => {
    const config = createContentCalendarProductConfig();
    const state = config.createInitialState('s', 'u', {});
    state.final_report = '# Report';
    expect(() => config.validateAfterAgent!('writer', state)).not.toThrow();
  });

  it('finalizeResult emits calendar_complete event', () => {
    const config = createContentCalendarProductConfig();
    const state = config.createInitialState('s', 'u', {});
    state.final_report = '# Content Calendar';
    state.quality_score = 85;
    state.posts = [];

    const emitted: unknown[] = [];
    const result = config.finalizeResult(state, {}, (event) => emitted.push(event));

    expect(emitted).toHaveLength(1);
    expect((emitted[0] as Record<string, unknown>).type).toBe('calendar_complete');
    expect((emitted[0] as Record<string, unknown>).report).toBe('# Content Calendar');
    expect((emitted[0] as Record<string, unknown>).quality_score).toBe(85);
    expect((result as Record<string, unknown>).report).toBe('# Content Calendar');
  });

  it('onComplete for strategist transfers scratchpad to state', () => {
    const config = createContentCalendarProductConfig();
    const state = config.createInitialState('s', 'u', {});
    const scratchpad: Record<string, unknown> = {
      resume_data: { name: 'Test' },
      expertise_analysis: { core_expertise: ['ops'] },
      audience_mapping: { primary_audience: 'C-suite' },
      themes: [{ id: 't1', name: 'Theme 1' }],
      content_mix: { posts_per_week: 4 },
    };

    config.agents[0].onComplete!(scratchpad, state, () => {});

    expect(state.resume_data).toEqual({ name: 'Test' });
    expect(state.expertise_analysis).toEqual({ core_expertise: ['ops'] });
    expect(state.audience_mapping).toEqual({ primary_audience: 'C-suite' });
    expect(state.themes).toEqual([{ id: 't1', name: 'Theme 1' }]);
    expect(state.content_mix).toEqual({ posts_per_week: 4 });
  });

  it('onComplete for writer transfers final_report and scores', () => {
    const config = createContentCalendarProductConfig();
    const state = config.createInitialState('s', 'u', {});
    const scratchpad: Record<string, unknown> = {
      final_report: '# Calendar Report',
      quality_score: 88,
      coherence_score: 92,
      posts: [{ day: 1, hook: 'test' }],
    };

    config.agents[1].onComplete!(scratchpad, state, () => {});

    expect(state.final_report).toBe('# Calendar Report');
    expect(state.quality_score).toBe(88);
    expect(state.coherence_score).toBe(92);
  });
});
