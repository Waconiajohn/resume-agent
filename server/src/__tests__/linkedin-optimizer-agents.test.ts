/**
 * LinkedIn Optimizer Agents — Unit tests.
 *
 * Verifies:
 * - Both agents register with the agent registry
 * - Both agents can be discovered via registry
 * - ProductConfig compiles and is well-formed
 * - Agent tools have correct names and model tiers
 * - linkedin-optimizer domain appears in registry
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
import '../agents/linkedin-optimizer/analyzer/agent.js';
import '../agents/linkedin-optimizer/writer/agent.js';
import { createLinkedInOptimizerProductConfig } from '../agents/linkedin-optimizer/product.js';
import { analyzerTools } from '../agents/linkedin-optimizer/analyzer/tools.js';
import { writerTools } from '../agents/linkedin-optimizer/writer/tools.js';
import { createEmptySharedContext } from '../contracts/shared-context.js';
import {
  LINKEDIN_OPTIMIZER_RULES,
  RULE_0_AUDIENCE,
  RULE_1_HEADLINE,
  RULE_2_ABOUT,
  RULE_3_EXPERIENCE,
  RULE_4_KEYWORDS,
  RULE_5_CONSISTENCY,
  RULE_6_RECRUITER,
  RULE_7_SELF_REVIEW,
} from '../agents/linkedin-optimizer/knowledge/rules.js';
import { SECTION_ORDER } from '../agents/linkedin-optimizer/types.js';

// ─── Agent Registration ───────────────────────────────────────────

describe('LinkedIn Optimizer Agent Registration', () => {
  it('analyzer is registered in the agent registry', () => {
    expect(agentRegistry.has('linkedin-optimizer', 'analyzer')).toBe(true);
  });

  it('writer is registered in the agent registry', () => {
    expect(agentRegistry.has('linkedin-optimizer', 'writer')).toBe(true);
  });

  it('linkedin-optimizer domain appears in listDomains', () => {
    const domains = agentRegistry.listDomains();
    expect(domains).toContain('linkedin-optimizer');
  });

  it('analyzer has expected capabilities', () => {
    const desc = agentRegistry.describe('linkedin-optimizer', 'analyzer');
    expect(desc).toBeDefined();
    expect(desc!.capabilities).toContain('resume_parsing');
    expect(desc!.capabilities).toContain('profile_analysis');
    expect(desc!.capabilities).toContain('keyword_gap_analysis');
  });

  it('writer has expected capabilities', () => {
    const desc = agentRegistry.describe('linkedin-optimizer', 'writer');
    expect(desc).toBeDefined();
    expect(desc!.capabilities).toContain('linkedin_writing');
    expect(desc!.capabilities).toContain('headline_optimization');
    expect(desc!.capabilities).toContain('keyword_optimization');
    expect(desc!.capabilities).toContain('self_review');
  });

  it('analyzer has 5 tools (4 + emit_transparency)', () => {
    const desc = agentRegistry.describe('linkedin-optimizer', 'analyzer');
    expect(desc).toBeDefined();
    expect(desc!.tools).toHaveLength(5);
    expect(desc!.tools).toContain('parse_inputs');
    expect(desc!.tools).toContain('analyze_current_profile');
    expect(desc!.tools).toContain('identify_keyword_gaps');
    expect(desc!.tools).toContain('simulate_recruiter_search');
    expect(desc!.tools).toContain('emit_transparency');
  });

  it('writer has 6 tools (5 + emit_transparency)', () => {
    const desc = agentRegistry.describe('linkedin-optimizer', 'writer');
    expect(desc).toBeDefined();
    expect(desc!.tools).toHaveLength(6);
    expect(desc!.tools).toContain('write_headline');
    expect(desc!.tools).toContain('write_about');
    expect(desc!.tools).toContain('write_experience_entries');
    expect(desc!.tools).toContain('optimize_keywords');
    expect(desc!.tools).toContain('assemble_report');
    expect(desc!.tools).toContain('emit_transparency');
  });

  it('findByCapability discovers linkedin-optimizer writer', () => {
    const creators = agentRegistry.findByCapability('linkedin_writing', 'linkedin-optimizer');
    expect(creators.length).toBeGreaterThanOrEqual(1);
    expect(creators[0].identity.name).toBe('writer');
  });

  it('findByCapability discovers linkedin-optimizer analyzer', () => {
    const creators = agentRegistry.findByCapability('profile_analysis', 'linkedin-optimizer');
    expect(creators.length).toBeGreaterThanOrEqual(1);
    expect(creators[0].identity.name).toBe('analyzer');
  });
});

// ─── Tool Model Tiers ─────────────────────────────────────────────

describe('LinkedIn Optimizer Tool Model Tiers', () => {
  it('analyzer tools have correct model tiers', () => {
    const tierMap: Record<string, string> = {
      parse_inputs: 'light',
      analyze_current_profile: 'mid',
      identify_keyword_gaps: 'mid',
      simulate_recruiter_search: 'mid',
    };
    for (const tool of analyzerTools) {
      expect(tool.model_tier).toBe(tierMap[tool.name]);
    }
  });

  it('writer tools have correct model tiers', () => {
    const tierMap: Record<string, string> = {
      write_headline: 'primary',
      write_about: 'primary',
      write_experience_entries: 'primary',
      optimize_keywords: 'mid',
      assemble_report: 'mid',
    };
    for (const tool of writerTools) {
      expect(tool.model_tier).toBe(tierMap[tool.name]);
    }
  });

  it('all tools have descriptions', () => {
    for (const tool of [...analyzerTools, ...writerTools]) {
      expect(tool.description).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(20);
    }
  });

  it('all tools have input_schema with type object', () => {
    for (const tool of [...analyzerTools, ...writerTools]) {
      expect(tool.input_schema.type).toBe('object');
    }
  });
});

// ─── Knowledge Rules ──────────────────────────────────────────────

describe('LinkedIn Optimizer Knowledge Rules', () => {
  const rules = [
    { name: 'RULE_0_AUDIENCE', value: RULE_0_AUDIENCE },
    { name: 'RULE_1_HEADLINE', value: RULE_1_HEADLINE },
    { name: 'RULE_2_ABOUT', value: RULE_2_ABOUT },
    { name: 'RULE_3_EXPERIENCE', value: RULE_3_EXPERIENCE },
    { name: 'RULE_4_KEYWORDS', value: RULE_4_KEYWORDS },
    { name: 'RULE_5_CONSISTENCY', value: RULE_5_CONSISTENCY },
    { name: 'RULE_6_RECRUITER', value: RULE_6_RECRUITER },
    { name: 'RULE_7_SELF_REVIEW', value: RULE_7_SELF_REVIEW },
  ];

  it('all 8 rules are non-empty strings', () => {
    for (const rule of rules) {
      expect(typeof rule.value).toBe('string');
      expect(rule.value.length).toBeGreaterThan(50);
    }
  });

  it('LINKEDIN_OPTIMIZER_RULES combines all 8 rules', () => {
    expect(LINKEDIN_OPTIMIZER_RULES).toBeTruthy();
    for (const rule of rules) {
      expect(LINKEDIN_OPTIMIZER_RULES).toContain(rule.value);
    }
  });

  it('RULE_1_HEADLINE mentions 220 characters', () => {
    expect(RULE_1_HEADLINE).toContain('220');
  });

  it('RULE_2_ABOUT mentions 1,500 characters minimum', () => {
    expect(RULE_2_ABOUT).toContain('1,500');
  });

  it('RULE_4_KEYWORDS mentions 15-20 keywords', () => {
    expect(RULE_4_KEYWORDS).toContain('15-20');
  });

  it('RULE_6_RECRUITER mentions 6-8 seconds', () => {
    expect(RULE_6_RECRUITER).toContain('6-8 seconds');
  });

  it('RULE_7_SELF_REVIEW mentions checklist items', () => {
    expect(RULE_7_SELF_REVIEW).toContain('first person');
    expect(RULE_7_SELF_REVIEW).toContain('Never fabricate');
  });
});

// ─── Section Order ────────────────────────────────────────────────

describe('LinkedIn Optimizer Section Order', () => {
  it('has exactly 4 sections', () => {
    expect(SECTION_ORDER).toHaveLength(4);
  });

  it('sections are in correct order', () => {
    expect(SECTION_ORDER[0]).toBe('headline');
    expect(SECTION_ORDER[1]).toBe('about');
    expect(SECTION_ORDER[2]).toBe('experience');
    expect(SECTION_ORDER[3]).toBe('keywords');
  });
});

// ─── ProductConfig ────────────────────────────────────────────────

describe('LinkedIn Optimizer ProductConfig', () => {
  it('creates a valid product config', () => {
    const config = createLinkedInOptimizerProductConfig();
    expect(config.domain).toBe('linkedin-optimizer');
    expect(config.agents).toHaveLength(2);
    expect(config.agents[0].name).toBe('analyzer');
    expect(config.agents[1].name).toBe('writer');
  });

  it('has stage messages on both agents', () => {
    const config = createLinkedInOptimizerProductConfig();
    expect(config.agents[0].stageMessage).toBeDefined();
    expect(config.agents[0].stageMessage!.startStage).toBe('analysis');
    expect(config.agents[1].stageMessage).toBeDefined();
    expect(config.agents[1].stageMessage!.startStage).toBe('writing');
  });

  it('createInitialState produces valid state', () => {
    const config = createLinkedInOptimizerProductConfig();
    const state = config.createInitialState('sess-1', 'user-1', {});
    expect(state.session_id).toBe('sess-1');
    expect(state.user_id).toBe('user-1');
    expect(state.current_stage).toBe('analysis');
    expect(state.sections).toBeDefined();
  });

  it('createInitialState preserves shared_context when provided', () => {
    const config = createLinkedInOptimizerProductConfig();
    const sharedContext = createEmptySharedContext();
    sharedContext.positioningStrategy.positioningAngle = 'Executive profile built around transformation outcomes';
    const state = config.createInitialState('sess-1', 'user-1', { shared_context: sharedContext });
    expect(state.shared_context?.positioningStrategy.positioningAngle).toBe('Executive profile built around transformation outcomes');
  });

  it('buildAgentMessage returns content for analyzer', () => {
    const config = createLinkedInOptimizerProductConfig();
    const state = config.createInitialState('s', 'u', {});
    const msg = config.buildAgentMessage('analyzer', state, {
      resume_text: 'John Doe, VP Operations...',
      linkedin_headline: 'VP of Operations',
      linkedin_about: 'Experienced executive...',
    });
    expect(msg).toContain('Resume');
    expect(msg).toContain('John Doe, VP Operations...');
    expect(msg).toContain('LinkedIn Profile');
    expect(msg).toContain('parse_inputs');
  });

  it('buildAgentMessage includes Why-Me story when available', () => {
    const config = createLinkedInOptimizerProductConfig();
    const state = config.createInitialState('s', 'u', {});
    state.platform_context = {
      why_me_story: {
        colleaguesCameForWhat: 'fixing broken teams',
        knownForWhat: 'turnaround leadership',
        whyNotMe: 'deep operational experience others lack',
      },
    };
    const msg = config.buildAgentMessage('analyzer', state, {
      resume_text: 'resume',
    });
    expect(msg).toContain('Why-Me Story');
    expect(msg).toContain('fixing broken teams');
  });

  it('buildAgentMessage includes canonical shared context when legacy room context is absent', () => {
    const config = createLinkedInOptimizerProductConfig();
    const sharedContext = createEmptySharedContext();
    sharedContext.careerNarrative.careerArc = 'Career narrative centered on scaling delivery systems with measurable outcomes';
    sharedContext.positioningStrategy.positioningAngle = 'Operator translating transformation work into recruiter-friendly proof';
    const state = config.createInitialState('s', 'u', { shared_context: sharedContext });

    const msg = config.buildAgentMessage('analyzer', state, { resume_text: 'resume' });
    expect(msg).toContain('Career narrative centered on scaling delivery systems with measurable outcomes');
    expect(msg).toContain('Operator translating transformation work into recruiter-friendly proof');
  });

  it('buildAgentMessage returns content for writer', () => {
    const config = createLinkedInOptimizerProductConfig();
    const state = config.createInitialState('s', 'u', {});
    // buildAgentMessage is synchronous for this product; narrow the union.
    const msg = config.buildAgentMessage('writer', state, {}) as string;
    // Per the AGENT INTEGRITY MANDATE, writer messages provide context
    // (goal + data + constraints) rather than enumerate a tool sequence.
    // We verify substance rather than tool names.
    expect(msg.length).toBeGreaterThan(0);
    expect(msg).toMatch(/linkedin profile/i);
    expect(msg).toMatch(/evidence/i);
  });

  it('buildAgentMessage returns empty string for unknown agent', () => {
    const config = createLinkedInOptimizerProductConfig();
    const state = config.createInitialState('s', 'u', {});
    const msg = config.buildAgentMessage('unknown', state, {});
    expect(msg).toBe('');
  });

  it('validateAfterAgent throws when analyzer produces no resume_data', () => {
    const config = createLinkedInOptimizerProductConfig();
    const state = config.createInitialState('s', 'u', {});
    expect(() => config.validateAfterAgent!('analyzer', state)).toThrow('Analyzer did not parse resume data');
  });

  it('validateAfterAgent passes when analyzer produces resume_data', () => {
    const config = createLinkedInOptimizerProductConfig();
    const state = config.createInitialState('s', 'u', {});
    state.resume_data = {
      name: 'John',
      current_title: 'VP',
      career_summary: '',
      key_skills: [],
      key_achievements: [],
      work_history: [],
    };
    expect(() => config.validateAfterAgent!('analyzer', state)).not.toThrow();
  });

  it('validateAfterAgent does not throw when writer produces no final_report — it warns', () => {
    // Per the AGENT INTEGRITY MANDATE, validateAfterAgent throws ONLY for
    // critical pipeline dependencies. A missing final_report is not a hard
    // failure — finalizeResult handles it by emitting an empty report
    // rather than crashing. The production code logs a warning instead.
    const config = createLinkedInOptimizerProductConfig();
    const state = config.createInitialState('s', 'u', {});
    expect(() => config.validateAfterAgent!('writer', state)).not.toThrow();
  });

  it('validateAfterAgent passes if writer produces final_report', () => {
    const config = createLinkedInOptimizerProductConfig();
    const state = config.createInitialState('s', 'u', {});
    state.final_report = '# Report';
    expect(() => config.validateAfterAgent!('writer', state)).not.toThrow();
  });

  it('finalizeResult emits report_complete event', () => {
    const config = createLinkedInOptimizerProductConfig();
    const state = config.createInitialState('s', 'u', {});
    state.final_report = '# LinkedIn Report';
    state.quality_score = 90;

    const emitted: unknown[] = [];
    const result = config.finalizeResult(state, {}, (event) => emitted.push(event));

    expect(emitted).toHaveLength(1);
    expect((emitted[0] as Record<string, unknown>).type).toBe('report_complete');
    expect((emitted[0] as Record<string, unknown>).report).toBe('# LinkedIn Report');
    expect((emitted[0] as Record<string, unknown>).quality_score).toBe(90);
    expect((result as Record<string, unknown>).report).toBe('# LinkedIn Report');
  });

  it('onComplete for analyzer transfers scratchpad to state', () => {
    const config = createLinkedInOptimizerProductConfig();
    const state = config.createInitialState('s', 'u', {});
    const scratchpad: Record<string, unknown> = {
      resume_data: { name: 'Test' },
      profile_analysis: { headline_assessment: 'Needs work' },
      keyword_analysis: { coverage_score: 42 },
    };

    config.agents[0].onComplete!(scratchpad, state, () => {});

    expect(state.resume_data).toEqual({ name: 'Test' });
    expect(state.profile_analysis).toEqual({ headline_assessment: 'Needs work' });
    expect(state.keyword_analysis).toEqual({ coverage_score: 42 });
  });

  it('onComplete for analyzer does not overwrite existing state', () => {
    const config = createLinkedInOptimizerProductConfig();
    const state = config.createInitialState('s', 'u', {});
    state.resume_data = {
      name: 'Original',
      current_title: 'VP',
      career_summary: '',
      key_skills: [],
      key_achievements: [],
      work_history: [],
    };

    config.agents[0].onComplete!({ resume_data: { name: 'Scratchpad' } }, state, () => {});

    expect(state.resume_data.name).toBe('Original');
  });

  it('onComplete for writer transfers final_report and quality_score', () => {
    const config = createLinkedInOptimizerProductConfig();
    const state = config.createInitialState('s', 'u', {});
    const scratchpad: Record<string, unknown> = {
      final_report: '# Report Content',
      quality_score: 92,
    };

    config.agents[1].onComplete!(scratchpad, state, () => {});

    expect(state.final_report).toBe('# Report Content');
    expect(state.quality_score).toBe(92);
  });
});
