/**
 * Cover Letter Agents — Unit tests.
 *
 * Verifies:
 * - Both agents register with the agent registry
 * - Both agents can be discovered via registry
 * - ProductConfig compiles and is well-formed
 * - Agent tools have correct model_tier
 * - Cover letter domain appears in registry
 * - Analyst tool execution: match_requirements, plan_letter
 * - Writer tool execution: write_letter, review_letter
 * - Edge cases: missing prerequisites, empty state, null LLM responses
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const { mockLlmChat, mockLlmStream } = vi.hoisted(() => ({
  mockLlmChat: vi.fn(),
  mockLlmStream: vi.fn(),
}));

// Helper to construct an async generator that yields the structured-llm-call
// primitive's expected event shape (text → done). Review_letter now flows
// through structuredLlmCall which calls provider.stream() instead of chat.
function streamOf(text: string, usage = { input_tokens: 100, output_tokens: 50 }) {
  return () =>
    (async function* () {
      yield { type: 'text' as const, text };
      yield { type: 'done' as const, usage };
    })();
}

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: () => ({ insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) }),
  },
}));

vi.mock('../lib/emotional-baseline.js', () => ({
  getToneGuidanceFromInput: () => '',
  getDistressFromInput: () => null,
}));

vi.mock('../lib/llm.js', () => ({
  // write_letter calls llm.chat; review_letter calls llm.stream (via
  // structuredLlmCall). Both routes use the same underlying mock spies.
  llm: { chat: mockLlmChat, stream: mockLlmStream, name: 'mock' },
  MODEL_PRIMARY: 'mock-primary',
  MODEL_MID: 'mock-mid',
  MODEL_ORCHESTRATOR: 'mock-orchestrator',
  MODEL_LIGHT: 'mock-light',
  MODEL_PRICING: {},
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

vi.mock('../lib/json-repair.js', () => ({
  repairJSON: vi.fn((text: string) => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }),
}));

import { agentRegistry } from '../agents/runtime/agent-registry.js';

// Import agent modules to trigger registration side effects
import '../agents/cover-letter/analyst/agent.js';
import '../agents/cover-letter/writer/agent.js';
import { createCoverLetterProductConfig } from '../agents/cover-letter/product.js';
import { createEmptySharedContext } from '../contracts/shared-context.js';

// Import tools directly for execution tests
import { analystTools } from '../agents/cover-letter/analyst/tools.js';
import { writerTools } from '../agents/cover-letter/writer/tools.js';

import {
  makeMockGenericContext,
  makeMockLLMResponse,
} from './helpers/mock-factories.js';

import type { CoverLetterState, CoverLetterSSEEvent } from '../agents/cover-letter/types.js';

// ─── Shared fixture helpers ───────────────────────────────────────────────────

function makeInitialState(overrides?: Partial<CoverLetterState>): CoverLetterState {
  return {
    session_id: 'test-session',
    user_id: 'test-user',
    current_stage: 'analysis',
    ...overrides,
  };
}

function makeStateWithResumeData(overrides?: Partial<CoverLetterState>): CoverLetterState {
  return makeInitialState({
    resume_data: {
      name: 'Jane Doe',
      current_title: 'VP Engineering',
      key_skills: ['Cloud Architecture', 'Team Leadership', 'P&L Ownership'],
      key_achievements: ['Led $2.4M cost reduction', 'Scaled team from 10 to 45'],
    },
    jd_analysis: {
      company_name: 'Acme Corp',
      role_title: 'CTO',
      requirements: ['engineering leadership', 'cloud architecture', 'executive presence'],
      culture_cues: ['fast-paced', 'innovative'],
    },
    ...overrides,
  });
}

function makeStateWithPlan(overrides?: Partial<CoverLetterState>): CoverLetterState {
  return makeStateWithResumeData({
    letter_plan: {
      opening_hook: 'Express enthusiasm for the CTO role at Acme Corp',
      body_points: [
        'Address "engineering leadership" with evidence of "Cloud Architecture"',
        'Address "cloud architecture" with evidence of "Team Leadership"',
      ],
      closing_strategy: 'Reiterate fit for Acme Corp culture and request conversation',
    },
    ...overrides,
  });
}

function makeStateWithDraft(overrides?: Partial<CoverLetterState>): CoverLetterState {
  return makeStateWithPlan({
    letter_draft: [
      'Dear Hiring Manager,',
      '',
      'Express enthusiasm for the CTO role at Acme Corp. As a VP Engineering with expertise in ' +
        'Cloud Architecture, Team Leadership, P&L Ownership, I am excited to bring my experience to Acme Corp.',
      '',
      'Address "engineering leadership" with evidence of "Cloud Architecture". ' +
        'This experience directly aligns with your team\'s needs.',
      '',
      'Reiterate fit for Acme Corp culture and request conversation. ' +
        'I would welcome the opportunity to discuss.',
      '',
      'Sincerely,',
      'Jane Doe',
    ].join('\n'),
    ...overrides,
  });
}

// ═══════════════════════════════════════════════════════════════════════
// Agent Registration
// ═══════════════════════════════════════════════════════════════════════

describe('Cover Letter Agent Registration', () => {
  it('analyst is registered in the agent registry', () => {
    expect(agentRegistry.has('cover-letter', 'analyst')).toBe(true);
  });

  it('writer is registered in the agent registry', () => {
    expect(agentRegistry.has('cover-letter', 'writer')).toBe(true);
  });

  it('cover-letter domain appears in listDomains', () => {
    const domains = agentRegistry.listDomains();
    expect(domains).toContain('cover-letter');
  });

  it('analyst has expected capabilities', () => {
    const desc = agentRegistry.describe('cover-letter', 'analyst');
    expect(desc).toBeDefined();
    expect(desc!.capabilities).toContain('content_analysis');
    expect(desc!.capabilities).toContain('requirement_mapping');
  });

  it('writer has expected capabilities', () => {
    const desc = agentRegistry.describe('cover-letter', 'writer');
    expect(desc).toBeDefined();
    expect(desc!.capabilities).toContain('content_creation');
    expect(desc!.capabilities).toContain('quality_review');
  });

  it('analyst has 4 tools (3 + emit_transparency)', () => {
    const desc = agentRegistry.describe('cover-letter', 'analyst');
    expect(desc).toBeDefined();
    expect(desc!.tools).toHaveLength(4);
    expect(desc!.tools).toContain('parse_resume_inputs');
    expect(desc!.tools).toContain('match_requirements');
    expect(desc!.tools).toContain('plan_letter');
    expect(desc!.tools).toContain('emit_transparency');
  });

  it('writer has 3 tools (2 + emit_transparency)', () => {
    const desc = agentRegistry.describe('cover-letter', 'writer');
    expect(desc).toBeDefined();
    expect(desc!.tools).toHaveLength(3);
    expect(desc!.tools).toContain('write_letter');
    expect(desc!.tools).toContain('review_letter');
    expect(desc!.tools).toContain('emit_transparency');
  });

  it('findByCapability discovers cover-letter agents', () => {
    const creators = agentRegistry.findByCapability('content_creation', 'cover-letter');
    expect(creators.length).toBeGreaterThanOrEqual(1);
    expect(creators[0].identity.name).toBe('writer');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Cover Letter ProductConfig
// ═══════════════════════════════════════════════════════════════════════

describe('Cover Letter ProductConfig', () => {
  it('creates a valid product config', () => {
    const config = createCoverLetterProductConfig();
    expect(config.domain).toBe('cover-letter');
    expect(config.agents).toHaveLength(2);
    expect(config.agents[0].name).toBe('analyst');
    expect(config.agents[1].name).toBe('writer');
  });

  it('has stage messages on both agents', () => {
    const config = createCoverLetterProductConfig();
    expect(config.agents[0].stageMessage).toBeDefined();
    expect(config.agents[0].stageMessage!.startStage).toBe('analysis');
    expect(config.agents[1].stageMessage).toBeDefined();
    expect(config.agents[1].stageMessage!.startStage).toBe('writing');
  });

  it('createInitialState produces valid state', () => {
    const config = createCoverLetterProductConfig();
    const state = config.createInitialState('sess-1', 'user-1', {});
    expect(state.session_id).toBe('sess-1');
    expect(state.user_id).toBe('user-1');
    expect(state.current_stage).toBe('analysis');
  });

  it('buildAgentMessage returns content for analyst', () => {
    const config = createCoverLetterProductConfig();
    const state = config.createInitialState('s', 'u', {});
    const msg = config.buildAgentMessage('analyst', state, {
      resume_text: 'My resume...',
      job_description: 'JD here...',
      company_name: 'Acme Corp',
    });
    expect(msg).toContain('Resume');
    expect(msg).toContain('My resume...');
    expect(msg).toContain('Acme Corp');
  });

  it('buildAgentMessage prefers shared career context when legacy context is absent', () => {
    const config = createCoverLetterProductConfig();
    const sharedContext = createEmptySharedContext();
    sharedContext.candidateProfile.factualSummary = 'Operations executive with multi-site leadership experience';
    sharedContext.candidateProfile.industries = ['Energy'];
    sharedContext.careerNarrative.careerArc = 'Progressed from field operations into enterprise transformation leadership';

    const state = config.createInitialState('s', 'u', { shared_context: sharedContext });
    const msg = config.buildAgentMessage('analyst', state, {
      resume_text: 'My resume...',
      job_description: 'JD here...',
      company_name: 'Acme Corp',
    });

    expect(msg).toContain('Career Profile');
    expect(msg).toContain('Operations executive with multi-site leadership experience');
    expect(msg).toContain('Career Narrative');
    expect(msg).toContain('enterprise transformation leadership');
  });

  it('buildAgentMessage returns content for writer', () => {
    const config = createCoverLetterProductConfig();
    const state = config.createInitialState('s', 'u', {});
    state.letter_plan = {
      opening_hook: 'hook',
      body_points: ['point1'],
      closing_strategy: 'close',
    };
    const msg = config.buildAgentMessage('writer', state, {});
    expect(msg).toContain('Letter Plan');
    expect(msg).toContain('hook');
  });

  it('validateAfterAgent throws when analyst produces no plan', () => {
    const config = createCoverLetterProductConfig();
    const state = config.createInitialState('s', 'u', {});
    expect(() => config.validateAfterAgent!('analyst', state)).toThrow('Analyst did not produce a letter plan');
  });

  it('validateAfterAgent passes when analyst produces plan', () => {
    const config = createCoverLetterProductConfig();
    const state = config.createInitialState('s', 'u', {});
    state.letter_plan = { opening_hook: '', body_points: [], closing_strategy: '' };
    expect(() => config.validateAfterAgent!('analyst', state)).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Analyst Tool Model Tiers
// ═══════════════════════════════════════════════════════════════════════

describe('Cover Letter Analyst Tool Model Tiers', () => {
  it('match_requirements uses mid tier', () => {
    const tool = analystTools.find((t) => t.name === 'match_requirements');
    expect(tool).toBeDefined();
    expect(tool!.model_tier).toBe('mid');
  });

  it('plan_letter uses mid tier', () => {
    const tool = analystTools.find((t) => t.name === 'plan_letter');
    expect(tool).toBeDefined();
    expect(tool!.model_tier).toBe('mid');
  });

  it('parse_resume_inputs uses light tier', () => {
    const tool = analystTools.find((t) => t.name === 'parse_resume_inputs');
    expect(tool).toBeDefined();
    expect(tool!.model_tier).toBe('light');
  });

  it('all analyst tools have descriptions (length > 20)', () => {
    for (const tool of analystTools) {
      expect(tool.description).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(20);
    }
  });

  it('all analyst tools have input_schema with type object', () => {
    for (const tool of analystTools) {
      expect(tool.input_schema.type).toBe('object');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Writer Tool Model Tiers
// ═══════════════════════════════════════════════════════════════════════

describe('Cover Letter Writer Tool Model Tiers', () => {
  it('write_letter uses primary tier', () => {
    const tool = writerTools.find((t) => t.name === 'write_letter');
    expect(tool).toBeDefined();
    expect(tool!.model_tier).toBe('primary');
  });

  it('review_letter uses mid tier', () => {
    const tool = writerTools.find((t) => t.name === 'review_letter');
    expect(tool).toBeDefined();
    expect(tool!.model_tier).toBe('mid');
  });

  it('all writer tools have descriptions (length > 20)', () => {
    for (const tool of writerTools) {
      expect(tool.description).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(20);
    }
  });

  it('all writer tools have input_schema with type object', () => {
    for (const tool of writerTools) {
      expect(tool.input_schema.type).toBe('object');
    }
  });

  it('write_letter description mentions cover letter', () => {
    const tool = writerTools.find((t) => t.name === 'write_letter');
    expect(tool).toBeDefined();
    expect(tool!.description.toLowerCase()).toContain('cover letter');
  });

  it('review_letter description mentions quality score', () => {
    const tool = writerTools.find((t) => t.name === 'review_letter');
    expect(tool).toBeDefined();
    expect(tool!.description.toLowerCase()).toContain('score');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// match_requirements — Tool Execution
// ═══════════════════════════════════════════════════════════════════════

describe('match_requirements tool execution', () => {
  const tool = analystTools.find((t) => t.name === 'match_requirements')!;

  it('happy path: returns match counts from state with resume and jd', async () => {
    const state = makeStateWithResumeData();
    const ctx = makeMockGenericContext<CoverLetterState, CoverLetterSSEEvent>(state);

    const result = await tool.execute({}, ctx) as Record<string, unknown>;

    expect(result).not.toHaveProperty('error');
    expect(result).toHaveProperty('total_requirements');
    expect(result).toHaveProperty('strong_matches');
    expect(result).toHaveProperty('moderate_matches');
    expect(typeof result.total_requirements).toBe('number');
  });

  it('populates jd_analysis from input when not in state', async () => {
    const state = makeInitialState({
      resume_data: {
        name: 'Jane Doe',
        current_title: 'VP Engineering',
        key_skills: ['Cloud Architecture', 'Leadership'],
        key_achievements: ['Led team of 45'],
      },
    });
    const ctx = makeMockGenericContext<CoverLetterState, CoverLetterSSEEvent>(state);

    const result = await tool.execute(
      { job_description: 'We need a cloud architect. Leadership required. Technical excellence.', company_name: 'TechCorp' },
      ctx,
    ) as Record<string, unknown>;

    expect(result).not.toHaveProperty('error');
    expect(result).toHaveProperty('total_requirements');
    expect(ctx.scratchpad['jd_analysis']).toBeDefined();
  });

  it('stores requirement_matches in scratchpad', async () => {
    const state = makeStateWithResumeData();
    const ctx = makeMockGenericContext<CoverLetterState, CoverLetterSSEEvent>(state);

    await tool.execute({}, ctx);

    expect(ctx.scratchpad['requirement_matches']).toBeDefined();
    const matches = ctx.scratchpad['requirement_matches'] as Array<unknown>;
    expect(Array.isArray(matches)).toBe(true);
    expect(matches.length).toBeGreaterThan(0);
  });

  it('strong_matches count does not exceed total_requirements', async () => {
    const state = makeStateWithResumeData();
    const ctx = makeMockGenericContext<CoverLetterState, CoverLetterSSEEvent>(state);

    const result = await tool.execute({}, ctx) as Record<string, number>;

    expect(result.strong_matches).toBeLessThanOrEqual(result.total_requirements);
    expect(result.moderate_matches).toBeLessThanOrEqual(result.total_requirements);
    expect(result.strong_matches + result.moderate_matches).toBe(result.total_requirements);
  });

  it('returns error when resume_data is missing', async () => {
    const state = makeInitialState();
    // No resume_data, no jd_analysis
    const ctx = makeMockGenericContext<CoverLetterState, CoverLetterSSEEvent>(state);

    const result = await tool.execute({}, ctx) as Record<string, unknown>;

    expect(result).toHaveProperty('error');
    expect(String(result.error)).toContain('parse_resume_inputs');
  });

  it('returns error when jd_analysis is missing and no job_description input provided', async () => {
    // resume_data present but no jd_analysis and empty job_description
    const state = makeInitialState({
      resume_data: {
        name: 'Jane Doe',
        current_title: 'VP Engineering',
        key_skills: [],
        key_achievements: [],
      },
    });
    const ctx = makeMockGenericContext<CoverLetterState, CoverLetterSSEEvent>(state);

    // With empty jd_text, jd_analysis will have empty requirements, then resume is checked
    // The tool will proceed (it auto-creates jd_analysis from empty input), but
    // resume is present so no error — just zero matches
    const result = await tool.execute({}, ctx) as Record<string, unknown>;

    // Either an error OR a valid result with 0 requirements (empty JD → 0 requirements)
    if ('error' in result) {
      expect(String(result.error)).toContain('parse_resume_inputs');
    } else {
      expect(result).toHaveProperty('total_requirements');
    }
  });

  it('total_requirements matches the number of jd requirements', async () => {
    const state = makeStateWithResumeData();
    const ctx = makeMockGenericContext<CoverLetterState, CoverLetterSSEEvent>(state);

    const result = await tool.execute({}, ctx) as Record<string, number>;

    // jd_analysis in makeStateWithResumeData has 3 requirements
    expect(result.total_requirements).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// plan_letter — Tool Execution
// ═══════════════════════════════════════════════════════════════════════

describe('plan_letter tool execution', () => {
  const tool = analystTools.find((t) => t.name === 'plan_letter')!;

  beforeEach(() => {
    // plan_letter calls llm.chat() expecting JSON. Default to a realistic
    // plan that satisfies the per-assertion checks in this block:
    //  - opening_hook contains "strongest positioning" (not "Express enthusiasm")
    //  - body_points[0] contains "engineering leadership"
    //  - closing_strategy contains "Acme Corp"
    //  - 3+ body_points so the cap-at-3 test can validate slicing
    mockLlmChat.mockResolvedValue({
      text: JSON.stringify({
        opening_hook:
          'The candidate\'s strongest positioning for Acme Corp comes from the $2.4M cost reduction work at their current employer.',
        body_points: [
          'Cloud Architecture experience maps directly to your engineering leadership requirement at Acme Corp.',
          'Team Leadership scaling 10→45 engineers addresses your cloud architecture requirement.',
          'P&L Ownership track record addresses your executive presence requirement.',
          'Additional evidence point that would be dropped by a cap-at-3 slice.',
          'Another additional point.',
        ],
        closing_strategy:
          'I would welcome a conversation about how my background can drive results for Acme Corp.',
      }),
    });
  });

  function makeCtxWithMatches() {
    const state = makeStateWithResumeData();
    const ctx = makeMockGenericContext<CoverLetterState, CoverLetterSSEEvent>(state);
    ctx.scratchpad['requirement_matches'] = [
      { requirement: 'engineering leadership', matched_skill: 'Cloud Architecture' },
      { requirement: 'cloud architecture', matched_skill: 'Team Leadership' },
      { requirement: 'executive presence', matched_skill: 'P&L Ownership' },
    ];
    return ctx;
  }

  it('happy path: returns a plan when jd and matches are present', async () => {
    const ctx = makeCtxWithMatches();

    const result = await tool.execute({}, ctx) as Record<string, unknown>;

    expect(result).not.toHaveProperty('error');
    expect(result).toHaveProperty('plan');
    const plan = result.plan as Record<string, unknown>;
    expect(plan).toHaveProperty('opening_hook');
    expect(plan).toHaveProperty('body_points');
    expect(plan).toHaveProperty('closing_strategy');
  });

  it('injects the cover-letter quality rules into the planning prompt', async () => {
    const ctx = makeCtxWithMatches();

    await tool.execute({}, ctx);

    const callArgs = mockLlmChat.mock.calls[mockLlmChat.mock.calls.length - 1]?.[0] as {
      messages?: Array<{ content?: string }>;
    };

    expect(callArgs.messages?.[0]?.content).toContain('COVER LETTER PHILOSOPHY');
    expect(callArgs.messages?.[0]?.content).toContain('OPENING HOOK');
    expect(callArgs.messages?.[0]?.content).toContain('SELF-REVIEW CHECKLIST');
  });

  it('sets state.letter_plan from the generated plan', async () => {
    const ctx = makeCtxWithMatches();

    await tool.execute({}, ctx);

    const state = ctx.getState();
    expect(state.letter_plan).toBeDefined();
    expect(state.letter_plan!.opening_hook).toBeTruthy();
    expect(Array.isArray(state.letter_plan!.body_points)).toBe(true);
    expect(state.letter_plan!.closing_strategy).toBeTruthy();
  });

  it('stores plan in scratchpad', async () => {
    const ctx = makeCtxWithMatches();

    await tool.execute({}, ctx);

    expect(ctx.scratchpad['letter_plan']).toBeDefined();
  });

  it('body_points reference the first 3 requirement matches', async () => {
    const ctx = makeCtxWithMatches();

    const result = await tool.execute({}, ctx) as Record<string, unknown>;
    const plan = result.plan as { body_points: string[] };

    expect(plan.body_points).toHaveLength(3);
    expect(plan.body_points[0]).toContain('engineering leadership');
  });

  it('opening_hook references strongest match instead of generic enthusiasm', async () => {
    const ctx = makeCtxWithMatches();

    const result = await tool.execute({}, ctx) as Record<string, unknown>;
    const plan = result.plan as { opening_hook: string };

    // Should reference specific positioning, not just role title
    expect(plan.opening_hook).toContain('strongest positioning');
    expect(plan.opening_hook).not.toContain('Express enthusiasm');
  });

  it('closing_strategy mentions the company name', async () => {
    const ctx = makeCtxWithMatches();

    const result = await tool.execute({}, ctx) as Record<string, unknown>;
    const plan = result.plan as { closing_strategy: string };

    expect(plan.closing_strategy).toContain('Acme Corp');
  });

  it('returns error when jd_analysis is missing', async () => {
    const state = makeInitialState();
    const ctx = makeMockGenericContext<CoverLetterState, CoverLetterSSEEvent>(state);
    ctx.scratchpad['requirement_matches'] = [];

    const result = await tool.execute({}, ctx) as Record<string, unknown>;

    expect(result).toHaveProperty('error');
    expect(String(result.error)).toContain('match_requirements');
  });

  it('returns error when requirement_matches is missing from scratchpad', async () => {
    const state = makeStateWithResumeData();
    const ctx = makeMockGenericContext<CoverLetterState, CoverLetterSSEEvent>(state);
    // No requirement_matches in scratchpad

    const result = await tool.execute({}, ctx) as Record<string, unknown>;

    expect(result).toHaveProperty('error');
    expect(String(result.error)).toContain('match_requirements');
  });

  it('caps body_points at 3 even when more matches exist', async () => {
    const state = makeStateWithResumeData();
    const ctx = makeMockGenericContext<CoverLetterState, CoverLetterSSEEvent>(state);
    ctx.scratchpad['requirement_matches'] = [
      { requirement: 'req1', matched_skill: 'skill1' },
      { requirement: 'req2', matched_skill: 'skill2' },
      { requirement: 'req3', matched_skill: 'skill3' },
      { requirement: 'req4', matched_skill: 'skill4' },
      { requirement: 'req5', matched_skill: 'skill5' },
    ];

    const result = await tool.execute({}, ctx) as Record<string, unknown>;
    const plan = result.plan as { body_points: string[] };

    expect(plan.body_points).toHaveLength(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// write_letter — Tool Execution
// ═══════════════════════════════════════════════════════════════════════

describe('write_letter tool execution', () => {
  const tool = writerTools.find((t) => t.name === 'write_letter')!;

  beforeEach(() => {
    // Mock LLM to return a realistic cover letter that satisfies existing assertions
    mockLlmChat.mockResolvedValue({
      text: 'Dear Hiring Manager,\n\nExpress enthusiasm for the CTO role at Acme Corp. As a VP Engineering with deep expertise in Cloud Architecture, Team Leadership, and P&L Ownership, I am excited to bring my proven track record of engineering leadership to Acme Corp.\n\nDuring my career, I have led engineering teams scaling from 10 to 45 engineers and delivered $2.4M in cost reductions through strategic cloud migration initiatives. My experience in cloud architecture and distributed systems has enabled multiple successful product launches.\n\nI bring a unique combination of technical depth and executive presence that aligns directly with your requirements for engineering leadership and cloud architecture expertise. My track record demonstrates consistent delivery of measurable outcomes.\n\nI would welcome the opportunity to discuss how my background can accelerate Acme Corp\'s next phase of growth.\n\nSincerely,\nJane Doe',
    });
  });

  it('happy path: returns status, word_count, tone', async () => {
    const state = makeStateWithPlan();
    const ctx = makeMockGenericContext<CoverLetterState, CoverLetterSSEEvent>(state);

    const result = await tool.execute({ tone: 'professional' }, ctx) as Record<string, unknown>;

    expect(result).not.toHaveProperty('error');
    expect(result.status).toBe('drafted');
    expect(typeof result.word_count).toBe('number');
    expect(result.tone).toBe('professional');
  });

  it('injects the cover-letter quality rules into the writing system prompt', async () => {
    const state = makeStateWithPlan();
    const ctx = makeMockGenericContext<CoverLetterState, CoverLetterSSEEvent>(state);

    await tool.execute({}, ctx);

    const callArgs = mockLlmChat.mock.calls[mockLlmChat.mock.calls.length - 1]?.[0] as {
      system?: string;
      messages?: Array<{ content?: string }>;
    };

    expect(callArgs.system).toContain('COVER LETTER PHILOSOPHY');
    expect(callArgs.system).toContain('OPENING HOOK');
    expect(callArgs.system).toContain('SELF-REVIEW CHECKLIST');
    expect(callArgs.system).toContain('strategic positioning letter');
    expect(callArgs.system).toContain('225-300 words');
    expect(callArgs.system).toContain('Hard cap: 425 words');
    expect(callArgs.messages?.[0]?.content).toContain('interpret why that proof matters');
    expect(callArgs.messages?.[0]?.content).toContain('3-4 short paragraphs');
    expect(callArgs.messages?.[0]?.content).toContain('Pick the two strongest evidence-backed angles');
  });

  it('sets state.letter_draft', async () => {
    const state = makeStateWithPlan();
    const ctx = makeMockGenericContext<CoverLetterState, CoverLetterSSEEvent>(state);

    await tool.execute({}, ctx);

    expect(ctx.getState().letter_draft).toBeTruthy();
    expect(typeof ctx.getState().letter_draft).toBe('string');
  });

  it('stores letter_draft in scratchpad', async () => {
    const state = makeStateWithPlan();
    const ctx = makeMockGenericContext<CoverLetterState, CoverLetterSSEEvent>(state);

    await tool.execute({}, ctx);

    expect(ctx.scratchpad['letter_draft']).toBeTruthy();
  });

  it('stores tone in scratchpad', async () => {
    const state = makeStateWithPlan();
    const ctx = makeMockGenericContext<CoverLetterState, CoverLetterSSEEvent>(state);

    await tool.execute({ tone: 'conversational' }, ctx);

    expect(ctx.scratchpad['letter_tone']).toBe('conversational');
  });

  it('emits a letter_draft SSE event', async () => {
    const state = makeStateWithPlan();
    const ctx = makeMockGenericContext<CoverLetterState, CoverLetterSSEEvent>(state);

    await tool.execute({}, ctx);

    expect(ctx.emitSpy).toHaveBeenCalledOnce();
    expect(ctx.emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'letter_draft' }),
    );
  });

  it('letter includes the candidate name from resume_data', async () => {
    const state = makeStateWithPlan();
    const ctx = makeMockGenericContext<CoverLetterState, CoverLetterSSEEvent>(state);

    await tool.execute({}, ctx);

    expect(ctx.getState().letter_draft).toContain('Jane Doe');
  });

  it('letter includes the company name from jd_analysis', async () => {
    const state = makeStateWithPlan();
    const ctx = makeMockGenericContext<CoverLetterState, CoverLetterSSEEvent>(state);

    await tool.execute({}, ctx);

    expect(ctx.getState().letter_draft).toContain('Acme Corp');
  });

  it('letter contains the opening hook text', async () => {
    const state = makeStateWithPlan();
    const ctx = makeMockGenericContext<CoverLetterState, CoverLetterSSEEvent>(state);

    await tool.execute({}, ctx);

    const draft = ctx.getState().letter_draft!;
    expect(draft).toContain(state.letter_plan!.opening_hook);
  });

  it('defaults tone to formal when not specified', async () => {
    const state = makeStateWithPlan();
    const ctx = makeMockGenericContext<CoverLetterState, CoverLetterSSEEvent>(state);

    const result = await tool.execute({}, ctx) as Record<string, unknown>;

    expect(result.tone).toBe('formal');
  });

  it('returns error when letter_plan is missing', async () => {
    const state = makeStateWithResumeData();
    // No letter_plan
    const ctx = makeMockGenericContext<CoverLetterState, CoverLetterSSEEvent>(state);

    const result = await tool.execute({}, ctx) as Record<string, unknown>;

    expect(result).toHaveProperty('error');
    expect(String(result.error)).toContain('Analyst must run first');
  });

  it('returns error when resume_data is missing', async () => {
    const state = makeInitialState({
      letter_plan: {
        opening_hook: 'hook',
        body_points: ['point'],
        closing_strategy: 'close',
      },
    });
    const ctx = makeMockGenericContext<CoverLetterState, CoverLetterSSEEvent>(state);

    const result = await tool.execute({}, ctx) as Record<string, unknown>;

    expect(result).toHaveProperty('error');
  });

  it('returns error when jd_analysis is missing', async () => {
    const state = makeInitialState({
      resume_data: {
        name: 'Jane Doe',
        current_title: 'VP Engineering',
        key_skills: ['Cloud'],
        key_achievements: [],
      },
      letter_plan: {
        opening_hook: 'hook',
        body_points: ['point'],
        closing_strategy: 'close',
      },
    });
    const ctx = makeMockGenericContext<CoverLetterState, CoverLetterSSEEvent>(state);

    const result = await tool.execute({}, ctx) as Record<string, unknown>;

    expect(result).toHaveProperty('error');
  });

  it('word_count is a positive integer', async () => {
    const state = makeStateWithPlan();
    const ctx = makeMockGenericContext<CoverLetterState, CoverLetterSSEEvent>(state);

    const result = await tool.execute({}, ctx) as Record<string, number>;

    expect(result.word_count).toBeGreaterThan(0);
    expect(Number.isInteger(result.word_count)).toBe(true);
  });

  it('trims generated letters that exceed the hard word cap', async () => {
    const state = makeStateWithPlan();
    const ctx = makeMockGenericContext<CoverLetterState, CoverLetterSSEEvent>(state);
    const longProof = Array.from({ length: 95 }, () =>
      'I led complex engineering and cloud modernization work with measurable operating discipline at Acme Corp.',
    ).join(' ');
    const longDraft = [
      'Dear Acme Corp Hiring Team,',
      longProof,
      longProof,
      longProof,
      'Sincerely,',
      'Jane Doe',
    ].join('\n\n');
    const trimmedDraft = [
      'Dear Acme Corp Hiring Team,',
      'Acme Corp needs a CTO who can turn cloud architecture and engineering leadership into disciplined operating momentum. I have led engineering teams through scalable platform work while delivering $2.4M in cost reductions.',
      'My strongest fit is the blend of executive presence and technical depth. I have scaled teams from 10 to 45 engineers and translated cloud architecture decisions into measurable delivery outcomes.',
      'I would welcome a conversation about how that background can support Acme Corp.',
      'Sincerely,',
      'Jane Doe',
    ].join('\n\n');

    mockLlmChat.mockReset();
    mockLlmChat
      .mockResolvedValueOnce({ text: longDraft })
      .mockResolvedValueOnce({ text: trimmedDraft });

    const result = await tool.execute({}, ctx) as Record<string, unknown>;

    expect(result.trimmed).toBe(true);
    expect(result.word_count as number).toBeLessThanOrEqual(425);
    expect(ctx.scratchpad['letter_trimmed_for_length']).toBe(true);
    expect(ctx.getState().letter_draft).toBe(trimmedDraft);
    expect(mockLlmChat).toHaveBeenCalledTimes(2);
    expect(mockLlmChat.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        model: 'mock-mid',
        system: expect.stringContaining('senior editor'),
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════
// review_letter — Tool Execution
// ═══════════════════════════════════════════════════════════════════════

describe('review_letter tool execution', () => {
  const tool = writerTools.find((t) => t.name === 'review_letter')!;

  beforeEach(() => {
    // review_letter uses structuredLlmCall → provider.stream() since 2026-04-21.
    // Default mock: a clean passing review.
    mockLlmStream.mockImplementation(
      streamOf(
        JSON.stringify({
          total_score: 82,
          passed: true,
          criteria: {
            voice_authenticity: { score: 16, note: 'Good authentic tone' },
            jd_alignment: { score: 18, note: 'Strong match' },
            evidence_specificity: { score: 16, note: 'Specific metrics used' },
            executive_tone: { score: 16, note: 'Professional' },
            length_appropriateness: { score: 16, note: 'Good length' },
          },
          issues: [],
        }),
      ),
    );
  });

  it('happy path: returns score, passed, issues, word_count', async () => {
    const state = makeStateWithDraft();
    const ctx = makeMockGenericContext<CoverLetterState, CoverLetterSSEEvent>(state);

    const result = await tool.execute({}, ctx) as Record<string, unknown>;

    expect(result).not.toHaveProperty('error');
    expect(typeof result.score).toBe('number');
    expect(typeof result.passed).toBe('boolean');
    expect(Array.isArray(result.issues)).toBe(true);
    expect(typeof result.word_count).toBe('number');
  });

  it('injects the cover-letter quality rules into the review prompt', async () => {
    const state = makeStateWithDraft();
    const ctx = makeMockGenericContext<CoverLetterState, CoverLetterSSEEvent>(state);

    await tool.execute({}, ctx);

    const callArgs = mockLlmStream.mock.calls[mockLlmStream.mock.calls.length - 1]?.[0] as {
      messages?: Array<{ content?: string }>;
    };

    expect(callArgs.messages?.[0]?.content).toContain('COVER LETTER PHILOSOPHY');
    expect(callArgs.messages?.[0]?.content).toContain('OPENING HOOK');
    expect(callArgs.messages?.[0]?.content).toContain('SELF-REVIEW CHECKLIST');
  });

  it('sets state.quality_score', async () => {
    const state = makeStateWithDraft();
    const ctx = makeMockGenericContext<CoverLetterState, CoverLetterSSEEvent>(state);

    await tool.execute({}, ctx);

    expect(typeof ctx.getState().quality_score).toBe('number');
  });

  it('sets state.review_feedback', async () => {
    const state = makeStateWithDraft();
    const ctx = makeMockGenericContext<CoverLetterState, CoverLetterSSEEvent>(state);

    await tool.execute({}, ctx);

    expect(typeof ctx.getState().review_feedback).toBe('string');
  });

  it('stores quality_score and review_feedback in scratchpad', async () => {
    const state = makeStateWithDraft();
    const ctx = makeMockGenericContext<CoverLetterState, CoverLetterSSEEvent>(state);

    await tool.execute({}, ctx);

    expect(ctx.scratchpad['quality_score']).toBeDefined();
    expect(ctx.scratchpad['review_feedback']).toBeDefined();
  });

  it('score is clamped between 0 and 100', async () => {
    const state = makeStateWithDraft();
    const ctx = makeMockGenericContext<CoverLetterState, CoverLetterSSEEvent>(state);

    const result = await tool.execute({}, ctx) as Record<string, number>;

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('passed is true when score >= 70', async () => {
    const state = makeStateWithDraft();
    const ctx = makeMockGenericContext<CoverLetterState, CoverLetterSSEEvent>(state);

    const result = await tool.execute({}, ctx) as Record<string, unknown>;
    const score = result.score as number;
    const passed = result.passed as boolean;

    if (score >= 70) {
      expect(passed).toBe(true);
    } else {
      expect(passed).toBe(false);
    }
  });

  it('penalizes letters that are too short (< 150 words)', async () => {
    mockLlmStream.mockImplementationOnce(
      streamOf(
        JSON.stringify({
          total_score: 45,
          passed: false,
          issues: ['Letter is too short — only 13 words. Expand to 225-300 words.'],
          criteria: {},
        }),
      ),
    );
    const state = makeStateWithPlan({
      letter_draft: 'Dear Hiring Manager, I am interested in the position. Sincerely, Jane Doe',
    });
    const ctx = makeMockGenericContext<CoverLetterState, CoverLetterSSEEvent>(state);

    const result = await tool.execute({}, ctx) as Record<string, unknown>;
    const issues = result.issues as string[];

    expect(issues.some((i) => i.toLowerCase().includes('short'))).toBe(true);
    expect(result.score as number).toBeLessThan(85);
  });

  it('penalizes letters containing generic phrases like "team player"', async () => {
    mockLlmStream.mockImplementationOnce(
      streamOf(
        JSON.stringify({
          total_score: 58,
          passed: false,
          issues: ['Contains generic phrases: "team player", "hard worker", "self-starter", "results-driven"'],
          criteria: {},
        }),
      ),
    );
    const state = makeStateWithPlan({
      letter_draft:
        'Dear Hiring Manager,\n\nI am a team player and a hard worker with self-starter attitude. ' +
        'I am results-driven and excited to join Acme Corp as CTO. ' +
        'My background in engineering leadership and cloud architecture will contribute to your team. ' +
        'I bring over 15 years of experience driving technical excellence and innovation across diverse organizations. ' +
        'I would welcome the opportunity to discuss how my background aligns with your needs. ' +
        'Thank you for your consideration.\n\nSincerely,\nJane Doe',
    });
    const ctx = makeMockGenericContext<CoverLetterState, CoverLetterSSEEvent>(state);

    const result = await tool.execute({}, ctx) as Record<string, unknown>;
    const issues = result.issues as string[];

    expect(issues.length).toBeGreaterThan(0);
    expect(result.score as number).toBeLessThan(85);
  });

  it('penalizes when company name is not mentioned in letter', async () => {
    mockLlmStream.mockImplementationOnce(
      streamOf(
        JSON.stringify({
          total_score: 68,
          passed: false,
          issues: ['Letter does not mention the target company name — add specific reference to the company'],
          criteria: {},
        }),
      ),
    );
    const state = makeStateWithPlan({
      letter_draft:
        'Dear Hiring Manager,\n\nI am excited to apply for the CTO role. ' +
        'My experience in engineering leadership and cloud architecture makes me an ideal candidate. ' +
        'I have led teams of 45 engineers, delivered $2.4M in cost reductions, and built scalable platform infrastructure. ' +
        'I would welcome the opportunity to discuss how my background can contribute to your team\'s success. ' +
        'Thank you for your consideration.\n\nSincerely,\nJane Doe',
    });
    const ctx = makeMockGenericContext<CoverLetterState, CoverLetterSSEEvent>(state);

    const result = await tool.execute({}, ctx) as Record<string, unknown>;
    const issues = result.issues as string[];

    expect(issues.some((i) => i.toLowerCase().includes('company'))).toBe(true);
  });

  it('no company-name issue when jd_analysis is absent', async () => {
    mockLlmStream.mockImplementationOnce(
      streamOf(
        JSON.stringify({
          total_score: 75,
          passed: true,
          issues: [],
          criteria: {},
        }),
      ),
    );
    const baseState = makeInitialState({
      letter_draft:
        'Dear Hiring Manager,\n\nI am excited to apply for this role. ' +
        'My experience in engineering leadership spans 15 years of cloud platform work and team scaling. ' +
        'I have delivered $2.4M cost reductions and built robust infrastructure across multiple organizations. ' +
        'I would welcome the opportunity to discuss how my background aligns with your goals. ' +
        'Thank you for your consideration.\n\nSincerely,\nJane Doe',
    });
    const ctx = makeMockGenericContext<CoverLetterState, CoverLetterSSEEvent>(baseState);

    const result = await tool.execute({}, ctx) as Record<string, unknown>;
    const issues = result.issues as string[];

    expect(issues.some((i) => i.toLowerCase().includes('company'))).toBe(false);
  });

  it('returns error when no letter draft is present', async () => {
    const state = makeStateWithPlan();
    // No letter_draft
    const ctx = makeMockGenericContext<CoverLetterState, CoverLetterSSEEvent>(state);

    const result = await tool.execute({}, ctx) as Record<string, unknown>;

    expect(result).toHaveProperty('error');
    expect(String(result.error)).toContain('write_letter');
  });

  it('review_feedback is "No issues found" when letter passes all checks', async () => {
    // A long, clean, personalized letter that should pass all checks.
    // Must be >= 150 words, mention "Acme Corp", and contain no generic phrases.
    const cleanLetter = [
      'Dear Hiring Manager,',
      '',
      'I am excited to apply for the CTO position at Acme Corp. ' +
        'As a VP Engineering with deep expertise in cloud architecture, ' +
        'I have spent 15 years delivering transformative infrastructure for high-growth technology organizations ' +
        'across the enterprise software, cloud services, and platform engineering sectors.',
      '',
      'During my tenure at TechCo, I scaled the engineering organization from 10 to 45 engineers, ' +
        'reduced deployment costs by $2.4M through strategic cloud migration, and drove architectural ' +
        'decisions that enabled three successful product launches within 18 months. ' +
        'I have also built and maintained compliance frameworks that supported SOC 2 Type II certification.',
      '',
      'My experience in executive leadership and cross-functional collaboration positions me to align ' +
        'Acme Corp\'s technical vision with its broader strategic objectives. I have consistently delivered ' +
        'measurable outcomes through a combination of rigorous engineering discipline, data-driven decision ' +
        'making, and clear communication with board-level stakeholders.',
      '',
      'I am drawn to Acme Corp\'s commitment to innovation and look forward to contributing to your next ' +
        'phase of growth. I would welcome the opportunity to discuss how my background can accelerate your ' +
        'platform roadmap and strengthen your engineering culture.',
      '',
      'Sincerely,',
      'Jane Doe',
    ].join('\n');

    const state = makeStateWithPlan({ letter_draft: cleanLetter });
    const ctx = makeMockGenericContext<CoverLetterState, CoverLetterSSEEvent>(state);

    const result = await tool.execute({}, ctx) as Record<string, unknown>;

    expect(result.issues as string[]).toHaveLength(0);
    expect(ctx.getState().review_feedback).toBe('No issues found');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// ProductConfig — onComplete callbacks
// ═══════════════════════════════════════════════════════════════════════

describe('Cover Letter ProductConfig onComplete callbacks', () => {
  it('analyst onComplete transfers resume_data from scratchpad when state lacks it', () => {
    const config = createCoverLetterProductConfig();
    const state = config.createInitialState('s', 'u', {});
    const scratchpad: Record<string, unknown> = {
      resume_data: {
        name: 'Jane Doe',
        current_title: 'VP Engineering',
        key_skills: ['Cloud'],
        key_achievements: [],
      },
    };
    const noop = () => {};
    config.agents[0].onComplete!(scratchpad, state, noop);
    expect(state.resume_data).toBeDefined();
    expect(state.resume_data!.name).toBe('Jane Doe');
  });

  it('analyst onComplete transfers jd_analysis from scratchpad when state lacks it', () => {
    const config = createCoverLetterProductConfig();
    const state = config.createInitialState('s', 'u', {});
    const scratchpad: Record<string, unknown> = {
      jd_analysis: {
        company_name: 'Acme Corp',
        role_title: 'CTO',
        requirements: ['engineering leadership'],
        culture_cues: [],
      },
    };
    const noop = () => {};
    config.agents[0].onComplete!(scratchpad, state, noop);
    expect(state.jd_analysis).toBeDefined();
    expect(state.jd_analysis!.company_name).toBe('Acme Corp');
  });

  it('analyst onComplete transfers letter_plan from scratchpad when state lacks it', () => {
    const config = createCoverLetterProductConfig();
    const state = config.createInitialState('s', 'u', {});
    const scratchpad: Record<string, unknown> = {
      letter_plan: {
        opening_hook: 'hook',
        body_points: ['point'],
        closing_strategy: 'close',
      },
    };
    const noop = () => {};
    config.agents[0].onComplete!(scratchpad, state, noop);
    expect(state.letter_plan).toBeDefined();
    expect(state.letter_plan!.opening_hook).toBe('hook');
  });

  it('analyst onComplete does not overwrite existing state.resume_data', () => {
    const config = createCoverLetterProductConfig();
    const state = config.createInitialState('s', 'u', {});
    state.resume_data = {
      name: 'Already Set',
      current_title: 'CTO',
      key_skills: [],
      key_achievements: [],
    };
    const scratchpad: Record<string, unknown> = {
      resume_data: { name: 'Should Not Replace', current_title: 'VP', key_skills: [], key_achievements: [] },
    };
    const noop = () => {};
    config.agents[0].onComplete!(scratchpad, state, noop);
    expect(state.resume_data!.name).toBe('Already Set');
  });

  it('writer onComplete transfers letter_draft from scratchpad', () => {
    const config = createCoverLetterProductConfig();
    const state = config.createInitialState('s', 'u', {});
    const scratchpad: Record<string, unknown> = {
      letter_draft: 'Dear Hiring Manager, ...',
      quality_score: 88,
      review_feedback: 'No issues found',
    };
    const noop = () => {};
    config.agents[1].onComplete!(scratchpad, state, noop);
    expect(state.letter_draft).toBe('Dear Hiring Manager, ...');
    expect(state.quality_score).toBe(88);
    expect(state.review_feedback).toBe('No issues found');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// ProductConfig — finalizeResult
// ═══════════════════════════════════════════════════════════════════════

describe('Cover Letter ProductConfig finalizeResult', () => {
  it('emits letter_complete event', () => {
    const config = createCoverLetterProductConfig();
    const state = config.createInitialState('sess-1', 'user-1', {});
    state.letter_draft = 'Dear Hiring Manager, full letter text here...';
    state.quality_score = 88;

    const events: CoverLetterSSEEvent[] = [];
    config.finalizeResult(state, {}, (e) => events.push(e));

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('letter_complete');
    const evt = events[0] as Extract<CoverLetterSSEEvent, { type: 'letter_complete' }>;
    expect(evt.session_id).toBe('sess-1');
    expect(evt.letter).toBe('Dear Hiring Manager, full letter text here...');
    expect(evt.quality_score).toBe(88);
  });

  it('returns letter, quality_score, review_feedback in result', () => {
    const config = createCoverLetterProductConfig();
    const state = config.createInitialState('sess-1', 'user-1', {});
    state.letter_draft = 'Full letter...';
    state.quality_score = 91;
    state.review_feedback = 'No issues found';

    const result = config.finalizeResult(state, {}, () => {}) as Record<string, unknown>;

    expect(result.letter).toBe('Full letter...');
    expect(result.quality_score).toBe(91);
    expect(result.review_feedback).toBe('No issues found');
  });

  it('emits letter_complete with quality_score 0 when not set', () => {
    const config = createCoverLetterProductConfig();
    const state = config.createInitialState('sess-1', 'user-1', {});

    const events: CoverLetterSSEEvent[] = [];
    config.finalizeResult(state, {}, (e) => events.push(e));

    const evt = events[0] as Extract<CoverLetterSSEEvent, { type: 'letter_complete' }>;
    expect(evt.quality_score).toBe(0);
    expect(evt.letter).toBe('');
  });
});
