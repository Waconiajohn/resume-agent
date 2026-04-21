/**
 * Interview Prep Agents — Unit tests.
 *
 * Verifies:
 * - Both agents register with the agent registry
 * - Both agents can be discovered via registry
 * - ProductConfig compiles and is well-formed
 * - Agent tools have correct names and model tiers
 * - Interview-prep domain appears in registry
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

vi.mock('../lib/perplexity.js', () => ({
  queryPerplexity: vi.fn(),
  queryWithFallback: vi.fn(),
}));

vi.mock('../lib/platform-context.js', () => ({
  getUserContext: vi.fn().mockResolvedValue([]),
  upsertUserContext: vi.fn().mockResolvedValue({ id: 'mock-id' }),
}));

vi.mock('../lib/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  createSessionLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { agentRegistry } from '../agents/runtime/agent-registry.js';

// Import agent modules to trigger registration side effects
import '../agents/interview-prep/researcher/agent.js';
import '../agents/interview-prep/writer/agent.js';
import { createInterviewPrepProductConfig } from '../agents/interview-prep/product.js';
import { researcherTools } from '../agents/interview-prep/researcher/tools.js';
import { writerTools } from '../agents/interview-prep/writer/tools.js';
import { createEmptySharedContext } from '../contracts/shared-context.js';
import {
  INTERVIEW_PREP_RULES,
  RULE_0_AUDIENCE,
  RULE_1_STRUCTURE,
  RULE_2_QUALITY,
  RULE_3_STAR,
  RULE_4_TAILORING,
  RULE_5_EXECUTIVE,
  RULE_6_CAREER_STORY,
  RULE_7_SOURCING,
  RULE_8_FORMATTING,
  RULE_9_SELF_REVIEW,
  RULE_10_CLOSING,
} from '../agents/interview-prep/knowledge/rules.js';
import { SECTION_ORDER } from '../agents/interview-prep/types.js';

// ─── Agent Registration ───────────────────────────────────────────

describe('Interview Prep Agent Registration', () => {
  it('researcher is registered in the agent registry', () => {
    expect(agentRegistry.has('interview-prep', 'researcher')).toBe(true);
  });

  it('writer is registered in the agent registry', () => {
    expect(agentRegistry.has('interview-prep', 'writer')).toBe(true);
  });

  it('interview-prep domain appears in listDomains', () => {
    const domains = agentRegistry.listDomains();
    expect(domains).toContain('interview-prep');
  });

  it('researcher has expected capabilities', () => {
    const desc = agentRegistry.describe('interview-prep', 'researcher');
    expect(desc).toBeDefined();
    expect(desc!.capabilities).toContain('resume_parsing');
    expect(desc!.capabilities).toContain('company_research');
    expect(desc!.capabilities).toContain('interview_question_sourcing');
  });

  it('writer has expected capabilities', () => {
    const desc = agentRegistry.describe('interview-prep', 'writer');
    expect(desc).toBeDefined();
    expect(desc!.capabilities).toContain('interview_prep_writing');
    expect(desc!.capabilities).toContain('career_storytelling');
    expect(desc!.capabilities).toContain('star_methodology');
    expect(desc!.capabilities).toContain('self_review');
  });

  it('researcher has 4 tools (3 + emit_transparency)', () => {
    const desc = agentRegistry.describe('interview-prep', 'researcher');
    expect(desc).toBeDefined();
    expect(desc!.tools).toHaveLength(4);
    expect(desc!.tools).toContain('parse_inputs');
    expect(desc!.tools).toContain('research_company');
    expect(desc!.tools).toContain('find_interview_questions');
    expect(desc!.tools).toContain('emit_transparency');
  });

  it('writer has 10 tools (9 + emit_transparency)', () => {
    const desc = agentRegistry.describe('interview-prep', 'writer');
    expect(desc).toBeDefined();
    expect(desc!.tools).toHaveLength(10);
    expect(desc!.tools).toContain('write_section');
    expect(desc!.tools).toContain('self_review_section');
    expect(desc!.tools).toContain('build_career_story');
    expect(desc!.tools).toContain('assemble_report');
    expect(desc!.tools).toContain('generate_thank_you_notes');
    expect(desc!.tools).toContain('generate_follow_up_email');
    expect(desc!.tools).toContain('generate_interview_debrief');
    expect(desc!.tools).toContain('recall_story_bank');
    expect(desc!.tools).toContain('save_story');
    expect(desc!.tools).toContain('emit_transparency');
  });

  it('findByCapability discovers interview-prep writer', () => {
    const creators = agentRegistry.findByCapability('interview_prep_writing', 'interview-prep');
    expect(creators.length).toBeGreaterThanOrEqual(1);
    expect(creators[0].identity.name).toBe('writer');
  });

  it('findByCapability discovers interview-prep researcher', () => {
    const creators = agentRegistry.findByCapability('company_research', 'interview-prep');
    expect(creators.length).toBeGreaterThanOrEqual(1);
    expect(creators[0].identity.name).toBe('researcher');
  });
});

// ─── Tool Model Tiers ─────────────────────────────────────────────

describe('Interview Prep Tool Model Tiers', () => {
  it('researcher tools have correct model tiers', () => {
    const tierMap: Record<string, string> = {
      parse_inputs: 'light',
      research_company: 'mid',
      find_interview_questions: 'light',
    };
    for (const tool of researcherTools) {
      expect(tool.model_tier).toBe(tierMap[tool.name]);
    }
  });

  it('writer tools have correct model tiers', () => {
    const tierMap: Record<string, string> = {
      write_section: 'primary',
      self_review_section: 'mid',
      build_career_story: 'primary',
      assemble_report: 'light',
      generate_thank_you_notes: 'primary',
      generate_follow_up_email: 'primary',
      generate_interview_debrief: 'mid',
      recall_story_bank: 'light',
      save_story: 'light',
    };
    for (const tool of writerTools) {
      expect(tool.model_tier).toBe(tierMap[tool.name]);
    }
  });

  it('all tools have descriptions', () => {
    for (const tool of [...researcherTools, ...writerTools]) {
      expect(tool.description).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(20);
    }
  });

  it('all tools have input_schema with type object', () => {
    for (const tool of [...researcherTools, ...writerTools]) {
      expect(tool.input_schema.type).toBe('object');
    }
  });

  it('write_section has section enum in input schema', () => {
    const writeTool = writerTools.find(t => t.name === 'write_section')!;
    const props = writeTool.input_schema.properties as Record<string, Record<string, unknown>> | undefined;
    const sectionProp = props?.section;
    expect(sectionProp).toBeDefined();
    expect(sectionProp!.enum).toBeDefined();
    expect(sectionProp!.enum as unknown[]).toHaveLength(9);
  });
});

// ─── Knowledge Rules ──────────────────────────────────────────────

describe('Interview Prep Knowledge Rules', () => {
  const rules = [
    { name: 'RULE_0_AUDIENCE', value: RULE_0_AUDIENCE },
    { name: 'RULE_1_STRUCTURE', value: RULE_1_STRUCTURE },
    { name: 'RULE_2_QUALITY', value: RULE_2_QUALITY },
    { name: 'RULE_3_STAR', value: RULE_3_STAR },
    { name: 'RULE_4_TAILORING', value: RULE_4_TAILORING },
    { name: 'RULE_5_EXECUTIVE', value: RULE_5_EXECUTIVE },
    { name: 'RULE_6_CAREER_STORY', value: RULE_6_CAREER_STORY },
    { name: 'RULE_7_SOURCING', value: RULE_7_SOURCING },
    { name: 'RULE_8_FORMATTING', value: RULE_8_FORMATTING },
    { name: 'RULE_9_SELF_REVIEW', value: RULE_9_SELF_REVIEW },
    { name: 'RULE_10_CLOSING', value: RULE_10_CLOSING },
  ];

  it('all 11 rules are non-empty strings', () => {
    for (const rule of rules) {
      expect(typeof rule.value).toBe('string');
      expect(rule.value.length).toBeGreaterThan(50);
    }
  });

  it('INTERVIEW_PREP_RULES combines all 11 rules', () => {
    expect(INTERVIEW_PREP_RULES).toBeTruthy();
    for (const rule of rules) {
      expect(INTERVIEW_PREP_RULES).toContain(rule.value);
    }
  });

  it('RULE_3_STAR mentions minimum 12 sentences', () => {
    expect(RULE_3_STAR).toContain('12');
  });

  it('RULE_6_CAREER_STORY mentions discovery questions', () => {
    expect(RULE_6_CAREER_STORY).toContain('discovery');
  });

  it('RULE_10_CLOSING mentions 5 options', () => {
    expect(RULE_10_CLOSING).toContain('5');
  });
});

// ─── Section Order ────────────────────────────────────────────────

describe('Interview Prep Section Order', () => {
  it('has exactly 9 sections', () => {
    expect(SECTION_ORDER).toHaveLength(9);
  });

  it('sections are in correct document order', () => {
    expect(SECTION_ORDER[0]).toBe('company_research');
    expect(SECTION_ORDER[1]).toBe('elevator_pitch');
    expect(SECTION_ORDER[2]).toBe('requirements_fit');
    expect(SECTION_ORDER[3]).toBe('technical_questions');
    expect(SECTION_ORDER[4]).toBe('behavioral_questions');
    expect(SECTION_ORDER[5]).toBe('three_two_one');
    expect(SECTION_ORDER[6]).toBe('why_me');
    expect(SECTION_ORDER[7]).toBe('thirty_sixty_ninety');
    expect(SECTION_ORDER[8]).toBe('final_tips');
  });
});

// ─── ProductConfig ────────────────────────────────────────────────

describe('Interview Prep ProductConfig', () => {
  it('creates a valid product config', () => {
    const config = createInterviewPrepProductConfig();
    expect(config.domain).toBe('interview-prep');
    expect(config.agents).toHaveLength(2);
    expect(config.agents[0].name).toBe('researcher');
    expect(config.agents[1].name).toBe('writer');
  });

  it('has stage messages on both agents', () => {
    const config = createInterviewPrepProductConfig();
    expect(config.agents[0].stageMessage).toBeDefined();
    expect(config.agents[0].stageMessage!.startStage).toBe('research');
    expect(config.agents[1].stageMessage).toBeDefined();
    expect(config.agents[1].stageMessage!.startStage).toBe('writing');
  });

  it('createInitialState produces valid state', () => {
    const config = createInterviewPrepProductConfig();
    const state = config.createInitialState('sess-1', 'user-1', {});
    expect(state.session_id).toBe('sess-1');
    expect(state.user_id).toBe('user-1');
    expect(state.current_stage).toBe('research');
    expect(state.sections).toBeDefined();
  });

  it('createInitialState preserves shared_context when provided', () => {
    const config = createInterviewPrepProductConfig();
    const sharedContext = createEmptySharedContext();
    sharedContext.positioningStrategy.positioningAngle = 'Operator preparing concise, proof-backed interview stories';
    const state = config.createInitialState('sess-1', 'user-1', { shared_context: sharedContext });
    expect(state.shared_context?.positioningStrategy.positioningAngle).toBe('Operator preparing concise, proof-backed interview stories');
  });

  it('buildAgentMessage returns content for researcher', () => {
    const config = createInterviewPrepProductConfig();
    const state = config.createInitialState('s', 'u', {});
    const msg = config.buildAgentMessage('researcher', state, {
      resume_text: 'John Doe, VP Operations...',
      job_description: 'We are seeking a VP...',
      company_name: 'Medtronic',
    });
    expect(msg).toContain('Resume');
    expect(msg).toContain('John Doe, VP Operations...');
    expect(msg).toContain('Medtronic');
    expect(msg).toContain('parse_inputs');
  });

  it('buildAgentMessage includes Why-Me story when available', () => {
    const config = createInterviewPrepProductConfig();
    const state = config.createInitialState('s', 'u', {});
    state.platform_context = {
      why_me_story: {
        colleaguesCameForWhat: 'fixing broken teams',
        knownForWhat: 'turnaround leadership',
        whyNotMe: 'deep operational experience others lack',
      },
    };
    const msg = config.buildAgentMessage('researcher', state, {
      resume_text: 'resume',
      job_description: 'jd',
      company_name: 'Acme',
    });
    expect(msg).toContain('Why-Me Story');
    expect(msg).toContain('fixing broken teams');
  });

  it('buildAgentMessage includes positioning strategy when available', () => {
    const config = createInterviewPrepProductConfig();
    const state = config.createInitialState('s', 'u', {});
    state.platform_context = {
      positioning_strategy: { focus: 'operational excellence' },
    };
    const msg = config.buildAgentMessage('researcher', state, {
      resume_text: 'resume',
      job_description: 'jd',
      company_name: 'Acme',
    });
    expect(msg).toContain('Positioning Strategy');
    expect(msg).toContain('operational excellence');
  });

  it('buildAgentMessage includes canonical shared context when legacy room context is absent', () => {
    const config = createInterviewPrepProductConfig();
    const sharedContext = createEmptySharedContext();
    sharedContext.careerNarrative.careerArc = 'Known for turning high-pressure situations into structured execution stories';
    sharedContext.positioningStrategy.positioningAngle = 'Executive operator with strong evidence-backed interview examples';
    const state = config.createInitialState('s', 'u', { shared_context: sharedContext });

    const msg = config.buildAgentMessage('researcher', state, {
      resume_text: 'resume',
      job_description: 'jd',
      company_name: 'Acme',
    });

    expect(msg).toContain('Known for turning high-pressure situations into structured execution stories');
    expect(msg).toContain('Executive operator with strong evidence-backed interview examples');
  });

  it('buildAgentMessage returns content for writer', () => {
    const config = createInterviewPrepProductConfig();
    const state = config.createInitialState('s', 'u', {});
    // buildAgentMessage is synchronous for this product; narrow the union.
    const msg = config.buildAgentMessage('writer', state, {}) as string;
    // Per the AGENT INTEGRITY MANDATE, the message provides context rather
    // than enumerating tool names. We check that the writer is given its
    // goal + the truth-bound constraint, plus one tool hint for the
    // completion gate (assemble_report), not a tool-sequence script.
    expect(msg.length).toBeGreaterThan(0);
    expect(msg).toContain('interview preparation report');
    expect(msg).toMatch(/resume/i);
    expect(msg).toContain('assemble_report');
  });

  it('buildAgentMessage returns empty string for unknown agent', () => {
    const config = createInterviewPrepProductConfig();
    const state = config.createInitialState('s', 'u', {});
    const msg = config.buildAgentMessage('unknown', state, {});
    expect(msg).toBe('');
  });

  it('validateAfterAgent throws when researcher produces no resume_data', () => {
    const config = createInterviewPrepProductConfig();
    const state = config.createInitialState('s', 'u', {});
    expect(() => config.validateAfterAgent!('researcher', state)).toThrow('Researcher did not parse resume data');
  });

  it('validateAfterAgent throws when researcher produces no jd_analysis', () => {
    const config = createInterviewPrepProductConfig();
    const state = config.createInitialState('s', 'u', {});
    state.resume_data = {
      name: 'John',
      current_title: 'VP',
      career_summary: '',
      key_skills: [],
      key_achievements: [],
      work_history: [],
    };
    expect(() => config.validateAfterAgent!('researcher', state)).toThrow('Researcher did not analyze job description');
  });

  it('validateAfterAgent passes when researcher produces both outputs', () => {
    const config = createInterviewPrepProductConfig();
    const state = config.createInitialState('s', 'u', {});
    state.resume_data = {
      name: 'John',
      current_title: 'VP',
      career_summary: '',
      key_skills: [],
      key_achievements: [],
      work_history: [],
    };
    state.jd_analysis = {
      company_name: 'Acme',
      role_title: 'VP Ops',
      requirements: [],
      culture_cues: [],
      seniority_level: 'vp',
    };
    expect(() => config.validateAfterAgent!('researcher', state)).not.toThrow();
  });

  it('validateAfterAgent does not throw for writer (no validation)', () => {
    const config = createInterviewPrepProductConfig();
    const state = config.createInitialState('s', 'u', {});
    // Writer has no validateAfterAgent check — should not throw
    expect(() => config.validateAfterAgent!('writer', state)).not.toThrow();
  });

  it('finalizeResult emits report_complete event', () => {
    const config = createInterviewPrepProductConfig();
    const state = config.createInitialState('s', 'u', {});
    state.final_report = '# Full Report';
    state.quality_score = 85;

    const emitted: unknown[] = [];
    const result = config.finalizeResult(state, {}, (event) => emitted.push(event));

    expect(emitted).toHaveLength(1);
    expect((emitted[0] as Record<string, unknown>).type).toBe('report_complete');
    expect((emitted[0] as Record<string, unknown>).report).toBe('# Full Report');
    expect((emitted[0] as Record<string, unknown>).quality_score).toBe(85);
    expect((result as Record<string, unknown>).report).toBe('# Full Report');
  });

  it('onComplete for researcher transfers scratchpad to state', () => {
    const config = createInterviewPrepProductConfig();
    const state = config.createInitialState('s', 'u', {});
    const scratchpad: Record<string, unknown> = {
      resume_data: { name: 'Test' },
      jd_analysis: { company_name: 'TestCo' },
      company_research: { overview: 'A company' },
      sourced_questions: [{ question: 'Tell me...', source: 'Glassdoor', category: 'behavioral' }],
    };

    config.agents[0].onComplete!(scratchpad, state, () => {});

    expect(state.resume_data).toEqual({ name: 'Test' });
    expect(state.jd_analysis).toEqual({ company_name: 'TestCo' });
    expect(state.company_research).toEqual({ overview: 'A company' });
    expect(state.sourced_questions).toHaveLength(1);
  });

  it('onComplete for researcher does not overwrite existing state', () => {
    const config = createInterviewPrepProductConfig();
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

    // Should keep original since state already had resume_data
    expect(state.resume_data.name).toBe('Original');
  });

  it('onComplete for writer transfers final_report and quality_score', () => {
    const config = createInterviewPrepProductConfig();
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
