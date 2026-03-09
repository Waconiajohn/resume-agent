/**
 * Sprint 62 — Cross-Agent Intelligence Tool Tests
 *
 * Tests:
 * 1. generate_three_ways tool (networking-outreach/writer/tools.ts)
 * 2. simulate_recruiter_search tool (linkedin-optimizer/analyzer/tools.ts)
 *
 * Uses hoisted LLM mock to intercept all llm.chat() calls.
 * Follows the project's tool test pattern from linkedin-optimizer-writer-tools.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mockChat = vi.hoisted(() => vi.fn());

// ─── Module mocks ─────────────────────────────────────────────────────────────

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
  llm: { chat: mockChat },
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

// Pass-through repairJSON so JSON from mock is returned unchanged
vi.mock('../lib/json-repair.js', () => ({
  repairJSON: (text: string) => text,
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { writerTools } from '../agents/networking-outreach/writer/tools.js';
import { analyzerTools } from '../agents/linkedin-optimizer/analyzer/tools.js';
import type {
  NetworkingOutreachState,
  NetworkingOutreachSSEEvent,
} from '../agents/networking-outreach/types.js';
import type {
  LinkedInOptimizerState,
  LinkedInOptimizerSSEEvent,
} from '../agents/linkedin-optimizer/types.js';
import { makeMockGenericContext } from './helpers/index.js';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeNetworkingState(
  overrides: Partial<NetworkingOutreachState> = {},
): NetworkingOutreachState {
  return {
    session_id: 'test-session',
    user_id: 'test-user',
    current_stage: 'writing',
    resume_data: {
      name: 'Jane Executive',
      current_title: 'VP of Engineering',
      career_summary: 'Engineering leader with 15 years of experience.',
      key_skills: ['Cloud Architecture', 'Team Leadership', 'Agile'],
      key_achievements: ['Scaled org from 10 to 80 engineers', 'Reduced cost by 40%'],
      work_history: [
        {
          company: 'Acme Corp',
          title: 'VP Engineering',
          duration: '2018-Present',
          highlights: ['Led migration to cloud'],
        },
      ],
    },
    target_analysis: {
      target_name: 'Bob Director',
      target_title: 'Engineering Director',
      target_company: 'Target Co',
      industry: 'Technology',
      seniority: 'director',
      professional_interests: ['Cloud', 'AI/ML'],
      recent_activity: ['Posted about scaling engineering teams'],
    },
    common_ground: {
      shared_connections: ['Alice Johnson'],
      industry_overlap: ['SaaS', 'Cloud Infrastructure'],
      complementary_expertise: ['Engineering Leadership'],
      mutual_interests: ['Distributed Systems'],
      recommended_angle: 'Shared passion for engineering culture',
    },
    connection_path: {
      connection_degree: '2nd_degree',
      approach_strategy: 'shared_connection',
      connection_rationale: 'Alice knows both of us.',
      value_proposition: 'Can share insights on scaling engineering orgs.',
      risk_level: 'low',
    },
    outreach_plan: {
      sequence_length: 4,
      message_types: ['connection_request', 'follow_up_1', 'value_offer', 'meeting_request'],
      tone: 'professional_warm',
      themes: ['Cloud migration', 'Engineering culture'],
      goal: 'coffee_chat',
    },
    messages: [],
    platform_context: {},
    ...overrides,
  };
}

function makeLinkedInOptimizerState(
  overrides: Partial<LinkedInOptimizerState> = {},
): LinkedInOptimizerState {
  return {
    session_id: 'test-session',
    user_id: 'test-user',
    current_stage: 'analysis',
    sections: {
      headline: undefined,
      about: undefined,
      experience: undefined,
      keywords: undefined,
    },
    experience_entries: [],
    resume_data: {
      name: 'Jane Executive',
      current_title: 'VP Engineering',
      career_summary: 'Engineering leader.',
      key_skills: ['Cloud', 'Leadership'],
      key_achievements: ['Scaled org'],
      work_history: [],
    },
    current_profile: {
      headline: 'VP of Engineering at Acme Corp',
      about: 'I lead engineering teams...',
      experience_text: 'Acme Corp — VP Engineering 2018–Present',
    },
    target_context: {
      target_role: 'Engineering Director',
      target_industry: 'Technology',
      target_seniority: 'director',
    },
    profile_analysis: undefined,
    keyword_analysis: undefined,
    quality_score: undefined,
    final_report: undefined,
    recruiter_search_result: undefined,
    platform_context: {},
    ...overrides,
  };
}

// ─── Tool finder helpers ──────────────────────────────────────────────────────

function findWriterTool(name: string) {
  const tool = writerTools.find((t) => t.name === name);
  if (!tool) throw new Error(`Writer tool '${name}' not found`);
  return tool;
}

function findAnalyzerTool(name: string) {
  const tool = analyzerTools.find((t) => t.name === name);
  if (!tool) throw new Error(`Analyzer tool '${name}' not found`);
  return tool;
}

// ─── generate_three_ways ─────────────────────────────────────────────────────

describe('generate_three_ways tool — registration', () => {
  it('is registered in writerTools', () => {
    expect(writerTools.some((t) => t.name === 'generate_three_ways')).toBe(true);
  });

  it('has required input_schema fields', () => {
    const tool = findWriterTool('generate_three_ways');
    expect(tool.input_schema.required).toContain('company_name');
    expect(tool.input_schema.required).toContain('hiring_manager_name');
    expect(tool.input_schema.required).toContain('company_challenges');
    expect(tool.input_schema.required).toContain('user_positioning');
  });

  it('uses mid model_tier', () => {
    const tool = findWriterTool('generate_three_ways');
    expect(tool.model_tier).toBe('mid');
  });

  it('describes three strategic recommendations', () => {
    const tool = findWriterTool('generate_three_ways');
    expect(tool.description).toContain('Three Ways Power Move');
    expect(tool.description).toContain('3 specific strategic recommendations');
  });
});

describe('generate_three_ways tool — happy path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChat.mockResolvedValue({
      text: JSON.stringify({
        three_ways: [
          {
            title: 'Accelerate Cloud Migration',
            challenge_addressed: 'Legacy infrastructure limiting velocity',
            recommendation: 'Implement phased cloud migration using strangler fig pattern.',
            candidate_proof: 'Led $2M cloud migration at Acme Corp reducing costs by 40%.',
          },
          {
            title: 'Build Engineering Culture',
            challenge_addressed: 'High attrition in engineering',
            recommendation: 'Implement structured growth frameworks and internal mobility.',
            candidate_proof: 'Grew engineering org from 10 to 80 with <5% voluntary attrition.',
          },
          {
            title: 'Modernize Delivery Process',
            challenge_addressed: 'Slow release cycles',
            recommendation: 'Adopt trunk-based development with feature flags.',
            candidate_proof: 'Reduced deploy frequency from weekly to 50+ per day at Acme.',
          },
        ],
        opening_line: "I've been thinking about the challenges Target Co faces at this stage of growth.",
      }),
    });
  });

  it('returns success with 3 recommendations', async () => {
    const tool = findWriterTool('generate_three_ways');
    const state = makeNetworkingState();
    const ctx = makeMockGenericContext<NetworkingOutreachState, NetworkingOutreachSSEEvent>(state);

    const result = await tool.execute(
      {
        company_name: 'Target Co',
        hiring_manager_name: 'Bob Director',
        company_challenges: 'Legacy infrastructure, slow releases, high attrition',
        user_positioning: 'Cloud migration expert, engineering culture builder',
      },
      ctx,
    );

    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(true);
    expect(parsed.company_name).toBe('Target Co');
    expect(parsed.hiring_manager_name).toBe('Bob Director');
    expect(parsed.recommendations_count).toBe(3);
    expect(Array.isArray(parsed.three_ways)).toBe(true);
    expect(parsed.three_ways).toHaveLength(3);
  });

  it('emits transparency events', async () => {
    const tool = findWriterTool('generate_three_ways');
    const state = makeNetworkingState();
    const ctx = makeMockGenericContext<NetworkingOutreachState, NetworkingOutreachSSEEvent>(state);

    await tool.execute(
      {
        company_name: 'Target Co',
        hiring_manager_name: 'Bob Director',
        company_challenges: 'Legacy infrastructure',
        user_positioning: 'Cloud expert',
      },
      ctx,
    );

    expect(ctx.emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'transparency', stage: 'three_ways' }),
    );
  });

  it('stores result in ctx.scratchpad.three_ways_document', async () => {
    const tool = findWriterTool('generate_three_ways');
    const state = makeNetworkingState();
    const ctx = makeMockGenericContext<NetworkingOutreachState, NetworkingOutreachSSEEvent>(state);

    await tool.execute(
      {
        company_name: 'Target Co',
        hiring_manager_name: 'Bob Director',
        company_challenges: 'Legacy systems',
        user_positioning: 'Cloud leader',
      },
      ctx,
    );

    expect(ctx.scratchpad.three_ways_document).toBeDefined();
    expect(ctx.scratchpad.three_ways_document).toHaveProperty('three_ways');
  });

  it('calls MODEL_MID for generation', async () => {
    const tool = findWriterTool('generate_three_ways');
    const state = makeNetworkingState();
    const ctx = makeMockGenericContext<NetworkingOutreachState, NetworkingOutreachSSEEvent>(state);

    await tool.execute(
      {
        company_name: 'Target Co',
        hiring_manager_name: 'Bob',
        company_challenges: 'Growth challenges',
        user_positioning: 'Executive positioning',
      },
      ctx,
    );

    expect(mockChat).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'mock-mid' }),
    );
  });

  it('includes opening_line in result', async () => {
    const tool = findWriterTool('generate_three_ways');
    const state = makeNetworkingState();
    const ctx = makeMockGenericContext<NetworkingOutreachState, NetworkingOutreachSSEEvent>(state);

    const result = await tool.execute(
      {
        company_name: 'Target Co',
        hiring_manager_name: 'Bob',
        company_challenges: 'Growth',
        user_positioning: 'Leader',
      },
      ctx,
    );

    const parsed = JSON.parse(result as string);
    expect(parsed.opening_line).toBeTruthy();
    expect(typeof parsed.opening_line).toBe('string');
  });

  it('uses resume data as context when available', async () => {
    const tool = findWriterTool('generate_three_ways');
    const state = makeNetworkingState();
    const ctx = makeMockGenericContext<NetworkingOutreachState, NetworkingOutreachSSEEvent>(state);

    await tool.execute(
      {
        company_name: 'Target Co',
        hiring_manager_name: 'Bob',
        company_challenges: 'Scaling',
        user_positioning: 'Engineering leader',
      },
      ctx,
    );

    const callArgs = mockChat.mock.calls[0][0];
    const messageContent = callArgs.messages[0].content as string;
    // Resume data should be in the prompt
    expect(messageContent).toContain('Jane Executive');
  });
});

describe('generate_three_ways tool — JSON repair fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChat.mockResolvedValue({
      text: 'Invalid JSON that cannot be parsed {{{}}}',
    });
  });

  it('returns fallback result when LLM returns invalid JSON', async () => {
    const tool = findWriterTool('generate_three_ways');
    const state = makeNetworkingState();
    const ctx = makeMockGenericContext<NetworkingOutreachState, NetworkingOutreachSSEEvent>(state);

    const result = await tool.execute(
      {
        company_name: 'Target Co',
        hiring_manager_name: 'Bob',
        company_challenges: 'Scaling challenges here',
        user_positioning: 'Executive positioning here',
      },
      ctx,
    );

    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(true);
    // Fallback produces at least 1 recommendation
    expect(Array.isArray(parsed.three_ways)).toBe(true);
  });
});

describe('generate_three_ways tool — no resume_data state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChat.mockResolvedValue({
      text: JSON.stringify({
        three_ways: [
          {
            title: 'Rec 1',
            challenge_addressed: 'Challenge 1',
            recommendation: 'Recommendation text',
            candidate_proof: 'Proof from positioning',
          },
        ],
        opening_line: 'Opening line here.',
      }),
    });
  });

  it('uses fallback resume context when resume_data is missing', async () => {
    const tool = findWriterTool('generate_three_ways');
    const state = makeNetworkingState({ resume_data: null as never });
    const ctx = makeMockGenericContext<NetworkingOutreachState, NetworkingOutreachSSEEvent>(state);

    const result = await tool.execute(
      {
        company_name: 'Target Co',
        hiring_manager_name: 'Bob',
        company_challenges: 'Challenges',
        user_positioning: 'Positioning',
      },
      ctx,
    );

    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(true);
  });
});

// ─── simulate_recruiter_search ────────────────────────────────────────────────

describe('simulate_recruiter_search tool — registration', () => {
  it('is registered in analyzerTools', () => {
    expect(analyzerTools.some((t) => t.name === 'simulate_recruiter_search')).toBe(true);
  });

  it('requires profile_text and target_keywords', () => {
    const tool = findAnalyzerTool('simulate_recruiter_search');
    expect(tool.input_schema.required).toContain('profile_text');
    expect(tool.input_schema.required).toContain('target_keywords');
  });

  it('target_keywords is an array type in schema', () => {
    const tool = findAnalyzerTool('simulate_recruiter_search');
    const props = tool.input_schema.properties as Record<string, unknown>;
    const kw = props.target_keywords as Record<string, unknown>;
    expect(kw.type).toBe('array');
  });

  it('uses mid model_tier', () => {
    const tool = findAnalyzerTool('simulate_recruiter_search');
    expect(tool.model_tier).toBe('mid');
  });

  it('describes section weighting in description', () => {
    const tool = findAnalyzerTool('simulate_recruiter_search');
    expect(tool.description).toContain('headline (40%)');
    expect(tool.description).toContain('about (25%)');
    expect(tool.description).toContain('experience (25%)');
  });
});

describe('simulate_recruiter_search tool — validation', () => {
  it('returns error when profile_text is missing', async () => {
    const tool = findAnalyzerTool('simulate_recruiter_search');
    const state = makeLinkedInOptimizerState();
    const ctx = makeMockGenericContext<LinkedInOptimizerState, LinkedInOptimizerSSEEvent>(state);

    const result = await tool.execute(
      { profile_text: '', target_keywords: ['cloud', 'leadership'] },
      ctx,
    );

    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('profile_text');
  });

  it('returns error when target_keywords is empty', async () => {
    const tool = findAnalyzerTool('simulate_recruiter_search');
    const state = makeLinkedInOptimizerState();
    const ctx = makeMockGenericContext<LinkedInOptimizerState, LinkedInOptimizerSSEEvent>(state);

    const result = await tool.execute(
      { profile_text: 'Some profile text', target_keywords: [] },
      ctx,
    );

    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('target_keywords');
  });
});

describe('simulate_recruiter_search tool — happy path', () => {
  const mockSearchResult = {
    overall_score: 72,
    section_analysis: [
      {
        section: 'headline',
        weight: 40,
        keywords_found: ['Cloud', 'Engineering'],
        keywords_missing: ['Director'],
        section_score: 75,
        note: 'Good coverage but missing seniority keyword.',
      },
      {
        section: 'about',
        weight: 25,
        keywords_found: ['Leadership'],
        keywords_missing: ['Agile', 'DevOps'],
        section_score: 60,
        note: 'About section lacks technical keywords.',
      },
      {
        section: 'experience',
        weight: 25,
        keywords_found: ['Cloud', 'Agile'],
        keywords_missing: [],
        section_score: 80,
        note: 'Strong experience section coverage.',
      },
      {
        section: 'skills',
        weight: 10,
        keywords_found: ['Leadership', 'Cloud'],
        keywords_missing: ['DevOps'],
        section_score: 70,
        note: 'Skills section is reasonable.',
      },
    ],
    missing_keywords: ['Director', 'DevOps'],
    recommendations: [
      'Add "Engineering Director" to headline for seniority signal.',
      'Include "DevOps" in about section — it is searched frequently.',
    ],
    verdict: 'Profile ranks in the top 30% for this search — good but improvable.',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockChat.mockResolvedValue({ text: JSON.stringify(mockSearchResult) });
  });

  it('returns success with overall_score', async () => {
    const tool = findAnalyzerTool('simulate_recruiter_search');
    const state = makeLinkedInOptimizerState();
    const ctx = makeMockGenericContext<LinkedInOptimizerState, LinkedInOptimizerSSEEvent>(state);

    const result = await tool.execute(
      {
        profile_text: 'VP of Engineering at Acme Corp | Cloud Leadership | Agile',
        target_keywords: ['Cloud', 'Engineering', 'Leadership', 'Director', 'Agile', 'DevOps'],
        target_role: 'Engineering Director',
      },
      ctx,
    );

    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(true);
    expect(parsed.overall_score).toBe(72);
  });

  it('returns section_analysis with 4 sections', async () => {
    const tool = findAnalyzerTool('simulate_recruiter_search');
    const state = makeLinkedInOptimizerState();
    const ctx = makeMockGenericContext<LinkedInOptimizerState, LinkedInOptimizerSSEEvent>(state);

    const result = await tool.execute(
      {
        profile_text: 'Profile text here',
        target_keywords: ['Cloud', 'Leadership'],
      },
      ctx,
    );

    const parsed = JSON.parse(result as string);
    expect(Array.isArray(parsed.section_analysis)).toBe(true);
    expect(parsed.section_analysis).toHaveLength(4);
  });

  it('returns missing_keywords list', async () => {
    const tool = findAnalyzerTool('simulate_recruiter_search');
    const state = makeLinkedInOptimizerState();
    const ctx = makeMockGenericContext<LinkedInOptimizerState, LinkedInOptimizerSSEEvent>(state);

    const result = await tool.execute(
      { profile_text: 'Profile text', target_keywords: ['Cloud', 'Director', 'DevOps'] },
      ctx,
    );

    const parsed = JSON.parse(result as string);
    expect(Array.isArray(parsed.missing_keywords)).toBe(true);
    expect(parsed.missing_count).toBe(2);
  });

  it('returns actionable recommendations', async () => {
    const tool = findAnalyzerTool('simulate_recruiter_search');
    const state = makeLinkedInOptimizerState();
    const ctx = makeMockGenericContext<LinkedInOptimizerState, LinkedInOptimizerSSEEvent>(state);

    const result = await tool.execute(
      { profile_text: 'Profile text', target_keywords: ['Cloud'] },
      ctx,
    );

    const parsed = JSON.parse(result as string);
    expect(Array.isArray(parsed.recommendations)).toBe(true);
    expect(parsed.recommendations.length).toBeGreaterThan(0);
  });

  it('emits transparency and stage_complete events', async () => {
    const tool = findAnalyzerTool('simulate_recruiter_search');
    const state = makeLinkedInOptimizerState();
    const ctx = makeMockGenericContext<LinkedInOptimizerState, LinkedInOptimizerSSEEvent>(state);

    await tool.execute(
      { profile_text: 'Profile text', target_keywords: ['Cloud', 'Leadership'] },
      ctx,
    );

    expect(ctx.emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'transparency', stage: 'recruiter_search' }),
    );
    expect(ctx.emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'stage_complete', stage: 'recruiter_search' }),
    );
  });

  it('stores result in state.recruiter_search_result', async () => {
    const tool = findAnalyzerTool('simulate_recruiter_search');
    const state = makeLinkedInOptimizerState();
    const ctx = makeMockGenericContext<LinkedInOptimizerState, LinkedInOptimizerSSEEvent>(state);

    await tool.execute(
      { profile_text: 'Profile text', target_keywords: ['Cloud'] },
      ctx,
    );

    expect(ctx.getState().recruiter_search_result).toBeDefined();
    expect(ctx.getState().recruiter_search_result).toHaveProperty('overall_score');
  });

  it('calls MODEL_MID for analysis', async () => {
    const tool = findAnalyzerTool('simulate_recruiter_search');
    const state = makeLinkedInOptimizerState();
    const ctx = makeMockGenericContext<LinkedInOptimizerState, LinkedInOptimizerSSEEvent>(state);

    await tool.execute(
      { profile_text: 'Profile text', target_keywords: ['Cloud'] },
      ctx,
    );

    expect(mockChat).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'mock-mid' }),
    );
  });

  it('includes verdict in result', async () => {
    const tool = findAnalyzerTool('simulate_recruiter_search');
    const state = makeLinkedInOptimizerState();
    const ctx = makeMockGenericContext<LinkedInOptimizerState, LinkedInOptimizerSSEEvent>(state);

    const result = await tool.execute(
      { profile_text: 'Profile text', target_keywords: ['Cloud', 'Leadership'] },
      ctx,
    );

    const parsed = JSON.parse(result as string);
    expect(parsed.verdict).toBeTruthy();
    expect(typeof parsed.verdict).toBe('string');
  });
});

describe('simulate_recruiter_search tool — JSON repair fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChat.mockResolvedValue({ text: '{ invalid json >' });
  });

  it('returns fallback result when LLM returns unparseable JSON', async () => {
    const tool = findAnalyzerTool('simulate_recruiter_search');
    const state = makeLinkedInOptimizerState();
    const ctx = makeMockGenericContext<LinkedInOptimizerState, LinkedInOptimizerSSEEvent>(state);

    const result = await tool.execute(
      {
        profile_text: 'Some profile',
        target_keywords: ['Cloud', 'Leadership', 'Agile'],
      },
      ctx,
    );

    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(true);
    expect(parsed.overall_score).toBe(0);
    expect(Array.isArray(parsed.missing_keywords)).toBe(true);
    // Fallback: missing_keywords should contain the input keywords
    expect(parsed.missing_keywords).toContain('Cloud');
  });
});

// ─── Tool count verification ──────────────────────────────────────────────────

describe('Tool registry', () => {
  it('writerTools includes generate_three_ways as 6th tool', () => {
    expect(writerTools.length).toBeGreaterThanOrEqual(6);
    const names = writerTools.map((t) => t.name);
    expect(names).toContain('generate_three_ways');
  });

  it('analyzerTools includes simulate_recruiter_search', () => {
    expect(analyzerTools.some((t) => t.name === 'simulate_recruiter_search')).toBe(true);
    expect(analyzerTools.length).toBeGreaterThanOrEqual(4);
  });

  it('all writer tools have valid model_tier', () => {
    const validTiers = ['primary', 'mid', 'light', 'orchestrator'];
    for (const tool of writerTools) {
      expect(validTiers).toContain(tool.model_tier);
    }
  });

  it('all analyzer tools have valid model_tier', () => {
    const validTiers = ['primary', 'mid', 'light', 'orchestrator'];
    for (const tool of analyzerTools) {
      expect(validTiers).toContain(tool.model_tier);
    }
  });
});
