/**
 * Job Finder Agent — Unit Tests
 *
 * Coverage:
 *  1. Type shape: JobFinderState has required fields
 *  2. Searcher tools: search_career_pages, generate_search_queries,
 *     search_network_connections, deduplicate_results
 *  3. Ranker tools: score_job_fit, rank_and_narrate, present_results
 *  4. ProductConfig: createInitialState, buildAgentMessage, finalizeResult, validateAfterAgent
 *  5. Route schema: startSchema validates session_id (uuid required)
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockFirecrawlSearch = vi.hoisted(() => vi.fn());
const mockFirecrawlConstructor = vi.hoisted(() =>
  vi.fn(function MockFirecrawlApp() {
    return {
      search: mockFirecrawlSearch,
    };
  }),
);

// ─── Module mocks (hoisted before imports) ──────────────────────────────────

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  },
}));

vi.mock('../lib/llm.js', () => ({
  MODEL_MID: 'mock-mid',
  MODEL_LIGHT: 'mock-light',
  MODEL_ORCHESTRATOR: 'mock-orchestrator',
  MODEL_PRIMARY: 'mock-primary',
  llm: {
    chat: vi.fn().mockResolvedValue({ text: '[]', tool_calls: [], usage: { input_tokens: 10, output_tokens: 20 } }),
    stream: vi.fn(),
  },
  getModelForTier: vi.fn().mockReturnValue('mock-mid'),
}));

vi.mock('../lib/logger.js', () => {
  const noopLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
  return { default: noopLogger };
});

vi.mock('../lib/platform-context.js', () => ({
  getUserContext: vi.fn().mockResolvedValue([]),
  upsertUserContext: vi.fn().mockResolvedValue(null),
}));

vi.mock('../lib/emotional-baseline.js', () => ({
  getEmotionalBaseline: vi.fn().mockResolvedValue(null),
  getToneGuidanceFromInput: vi.fn().mockReturnValue(''),
  getDistressFromInput: vi.fn().mockReturnValue(null),
}));

vi.mock('../lib/ni/career-scraper.js', () => ({
  scrapeCareerPages: vi.fn().mockResolvedValue({
    companiesScanned: 2,
    jobsFound: 5,
    matchingJobs: 3,
    referralAvailable: 1,
    errors: [],
  }),
}));

vi.mock('@mendable/firecrawl-js', () => ({
  default: mockFirecrawlConstructor,
}));

vi.mock('../lib/ni/job-matches-store.js', () => ({
  getJobMatchesByUser: vi.fn().mockResolvedValue([]),
  insertJobMatch: vi.fn().mockResolvedValue({ id: 'match-1', title: 'VP Operations', company_id: 'c1' }),
}));

vi.mock('../lib/ni/connections-store.js', () => ({
  getConnectionsByUser: vi.fn().mockResolvedValue([]),
  getCompanySummary: vi.fn().mockResolvedValue([
    {
      companyRaw: 'Acme Corp',
      companyDisplayName: 'Acme Corporation',
      companyId: 'company-1',
      connectionCount: 3,
      topPositions: ['Director', 'Manager'],
    },
  ]),
}));

vi.mock('../lib/json-repair.js', () => ({
  repairJSON: vi.fn((text: string) => text),
}));

vi.mock('../lib/feature-flags.js', () => ({
  FF_JOB_FINDER: false,
  FF_JOB_TRACKER: false,
}));

// ─── Import after mocks ────────────────────────────────────────────────

import type { JobFinderState, DiscoveredJob, RankedMatch } from '../agents/job-finder/types.js';
import type { AgentContext } from '../agents/runtime/agent-protocol.js';
import { searcherTools } from '../agents/job-finder/searcher/tools.js';
import { rankerTools } from '../agents/job-finder/ranker/tools.js';
import { createJobFinderProductConfig } from '../agents/job-finder/product.js';
import { llm } from '../lib/llm.js';
import { getJobMatchesByUser } from '../lib/ni/job-matches-store.js';
import { getCompanySummary } from '../lib/ni/connections-store.js';
import type { JobFinderSSEEvent } from '../agents/job-finder/types.js';
import { createEmptySharedContext } from '../contracts/shared-context.js';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makeState(overrides?: Partial<JobFinderState>): JobFinderState {
  return {
    session_id: 'test-session',
    user_id: 'test-user',
    current_stage: 'searching',
    search_results: [],
    ranked_results: [],
    user_decisions: [],
    ...overrides,
  };
}

interface TestCtx extends AgentContext<JobFinderState, JobFinderSSEEvent> {
  _state: JobFinderState;
}

function makeCtx(stateOverrides?: Partial<JobFinderState>): TestCtx {
  let state = makeState(stateOverrides);
  const emitSpy = vi.fn();

  return {
    sessionId: 'test-session',
    userId: 'test-user',
    scratchpad: {},
    signal: new AbortController().signal,
    // Cast to satisfy the strict event type while keeping vi.fn() call tracking
    emit: emitSpy as unknown as AgentContext<JobFinderState, JobFinderSSEEvent>['emit'],
    waitForUser: vi.fn().mockResolvedValue({}) as unknown as AgentContext<JobFinderState, JobFinderSSEEvent>['waitForUser'],
    getState: () => state,
    updateState: (patch: Partial<JobFinderState>) => {
      state = { ...state, ...patch };
    },
    sendMessage: vi.fn() as unknown as AgentContext<JobFinderState, JobFinderSSEEvent>['sendMessage'],
    _state: state,
  };
}

const sampleJobs: DiscoveredJob[] = [
  { title: 'VP Operations', company: 'Acme Corp', source: 'career_page', match_score: 85 },
  { title: 'Director of Supply Chain', company: 'Beta Inc', source: 'network', match_score: 72 },
  { title: 'Chief Operating Officer', company: 'Gamma LLC', source: 'career_page', match_score: 60 },
];

// ─── Tests: Type Shape ─────────────────────────────────────────────────────────

describe('JobFinderState type shape', () => {
  it('has all required fields', () => {
    const state = makeState();
    expect(state.session_id).toBe('test-session');
    expect(state.user_id).toBe('test-user');
    expect(state.current_stage).toBe('searching');
    expect(Array.isArray(state.search_results)).toBe(true);
    expect(Array.isArray(state.ranked_results)).toBe(true);
    expect(Array.isArray(state.user_decisions)).toBe(true);
  });

  it('accepts platform_context as optional', () => {
    const state = makeState({
      platform_context: {
        positioning_strategy: { target_role: 'VP Operations' },
        benchmark_candidate: { profile: 'executive' },
      },
    });
    expect(state.platform_context?.positioning_strategy).toEqual({ target_role: 'VP Operations' });
  });
});

// ─── Tests: Searcher Tools ────────────────────────────────────────────────────

describe('Searcher: generate_search_queries', () => {
  const tool = searcherTools.find((t) => t.name === 'generate_search_queries')!;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FIRECRAWL_API_KEY = 'test-firecrawl-key';
    mockFirecrawlSearch.mockResolvedValue({
      web: [
        { title: 'VP Operations - Acme', url: 'https://example.com/jobs/1', description: 'Lead operations' },
        { title: 'COO - Beta', url: 'https://example.com/jobs/2', description: 'Scale manufacturing' },
      ],
    });
  });

  it('returns success with Firecrawl search results', async () => {
    const ctx = makeCtx();
    const result = await tool.execute({ resume_text: 'VP Operations with 15 years experience in supply chain management and logistics optimization at Fortune 500 companies' }, ctx);
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(true);
    expect(parsed.jobs_found).toBe(2);
    expect(parsed.target_titles_searched).toContain('executive');
    expect(ctx.scratchpad.firecrawl_search_results).toHaveLength(2);
  });

  it('returns error for short resume text', async () => {
    const ctx = makeCtx();
    const result = await tool.execute({ resume_text: 'short' }, ctx);
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(false);
  });

  it('emits transparency event', async () => {
    const ctx = makeCtx();
    await tool.execute({ resume_text: 'VP Operations with 15 years experience in supply chain management and logistics optimization at Fortune 500 companies' }, ctx);
    expect(ctx.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'transparency' }),
    );
  });

  it('prefers shared target role when deriving boolean search titles', async () => {
    const sharedContext = createEmptySharedContext();
    sharedContext.targetRole.roleTitle = 'Chief Operating Officer';

    const ctx = makeCtx({ shared_context: sharedContext });
    await tool.execute({ resume_text: 'VP Operations with 15 years experience in supply chain management and logistics optimization at Fortune 500 companies' }, ctx);

    expect(mockFirecrawlSearch).toHaveBeenCalledWith(
      expect.stringContaining('Chief Operating Officer jobs'),
      expect.objectContaining({ limit: 10 }),
    );
  });
});

describe('Searcher: search_network_connections', () => {
  const tool = searcherTools.find((t) => t.name === 'search_network_connections')!;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty result when no job matches in DB', async () => {
    vi.mocked(getJobMatchesByUser).mockResolvedValueOnce([]);
    const ctx = makeCtx();
    const result = await tool.execute({}, ctx);
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(true);
    expect(parsed.network_jobs_found).toBe(0);
    expect(ctx.scratchpad.network_results).toEqual([]);
  });

  it('finds network-adjacent jobs when connections exist', async () => {
    vi.mocked(getJobMatchesByUser).mockResolvedValueOnce([
      {
        id: 'match-1',
        user_id: 'test-user',
        company_id: 'company-1',
        title: 'VP Operations',
        url: 'https://acme.com/jobs/1',
        location: 'New York',
        salary_range: null,
        description_snippet: null,
        match_score: 85,
        referral_available: false,
        connection_count: 0,
        status: 'new',
        scraped_at: null,
        metadata: {},
        created_at: '2026-03-07T00:00:00Z',
        updated_at: '2026-03-07T00:00:00Z',
      },
    ]);
    vi.mocked(getCompanySummary).mockResolvedValueOnce([
      { companyRaw: 'Acme Corp', companyDisplayName: 'Acme Corporation', companyId: 'company-1', connectionCount: 3, topPositions: ['Director'] },
    ]);

    const ctx = makeCtx();
    const result = await tool.execute({}, ctx);
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(true);
    expect(parsed.network_jobs_found).toBe(1);

    const networkResults = ctx.scratchpad.network_results as DiscoveredJob[];
    expect(networkResults).toHaveLength(1);
    expect(networkResults[0].source).toBe('network');
    expect(networkResults[0].title).toBe('VP Operations');
  });
});

describe('Searcher: deduplicate_results', () => {
  const tool = searcherTools.find((t) => t.name === 'deduplicate_results')!;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('merges and deduplicates across sources', async () => {
    const ctx = makeCtx();
    ctx.scratchpad.career_page_results = [
      { title: 'VP Operations', company: 'Acme Corp', source: 'career_page' },
      { title: 'Director Supply Chain', company: 'Beta Inc', source: 'career_page' },
    ];
    ctx.scratchpad.network_results = [
      { title: 'VP Operations', company: 'Acme Corp', source: 'network' }, // duplicate
      { title: 'COO', company: 'Gamma LLC', source: 'network' },
    ];

    const result = await tool.execute({}, ctx);
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(true);
    expect(parsed.unique_results).toBe(3);
    expect(parsed.duplicates_removed).toBe(1);
  });

  it('updates pipeline state with deduplicated results', async () => {
    const ctx = makeCtx();
    ctx.scratchpad.career_page_results = [
      { title: 'VP Operations', company: 'Acme Corp', source: 'career_page' },
    ];
    ctx.scratchpad.network_results = [];

    await tool.execute({}, ctx);
    expect(ctx.getState().search_results).toHaveLength(1);
  });

  it('handles empty scratchpad gracefully', async () => {
    const ctx = makeCtx();
    const result = await tool.execute({}, ctx);
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(true);
    expect(parsed.unique_results).toBe(0);
  });
});

describe('Searcher: search_career_pages', () => {
  const tool = searcherTools.find((t) => t.name === 'search_career_pages')!;

  beforeEach(() => {
    vi.clearAllMocks();
    // Return no companies from NI so the tool hits the 0-companies short-circuit path
    vi.mocked(getCompanySummary).mockResolvedValueOnce([]);
  });

  it('returns success with 0 jobs when no companies available', async () => {
    const ctx = makeCtx();
    const result = await tool.execute({}, ctx);
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(true);
    expect(ctx.scratchpad.career_page_results).toEqual([]);
  });

  it('emits search_progress event', async () => {
    // Also mock getCompanySummary for this test (cleared in beforeEach)
    vi.mocked(getCompanySummary).mockResolvedValueOnce([]);
    const ctx = makeCtx();
    await tool.execute({}, ctx);
    expect(ctx.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'search_progress', source: 'career_page' }),
    );
  });
});

// ─── Tests: Ranker Tools ───────────────────────────────────────────────────────

describe('Ranker: score_job_fit', () => {
  const tool = rankerTools.find((t) => t.name === 'score_job_fit')!;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when no search results in state', async () => {
    const ctx = makeCtx();
    const result = await tool.execute({}, ctx);
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/search_results/);
  });

  it('scores jobs and stores in scratchpad', async () => {
    vi.mocked(llm.chat).mockResolvedValueOnce({
      text: JSON.stringify([
        { title: 'VP Operations', company: 'Acme Corp', fit_score: 88, positioning_alignment: 'Strong match', career_trajectory_fit: 'Natural step up', seniority_fit: 'match', fit_reasoning: 'Excellent fit' },
        { title: 'Director of Supply Chain', company: 'Beta Inc', fit_score: 72, positioning_alignment: 'Moderate match', career_trajectory_fit: 'Lateral move', seniority_fit: 'match', fit_reasoning: 'Good fit' },
        { title: 'Chief Operating Officer', company: 'Gamma LLC', fit_score: 60, positioning_alignment: 'Weak match', career_trajectory_fit: 'Stretch role', seniority_fit: 'under', fit_reasoning: 'Aspirational' },
      ]),
      tool_calls: [],
      usage: { input_tokens: 100, output_tokens: 200 },
    });

    const ctx = makeCtx({ search_results: sampleJobs });
    const result = await tool.execute({}, ctx);
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(true);
    expect(parsed.jobs_scored).toBe(3);
    expect(ctx.scratchpad.scored_jobs).toHaveLength(3);
  });

  it('falls back to neutral scores on LLM parse failure', async () => {
    vi.mocked(llm.chat).mockResolvedValueOnce({
      text: 'not valid json {{{',
      tool_calls: [],
      usage: { input_tokens: 10, output_tokens: 10 },
    });

    const ctx = makeCtx({ search_results: sampleJobs });
    const result = await tool.execute({}, ctx);
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(true);
    // Fallback assigns 50 to each
    const scored = ctx.scratchpad.scored_jobs as Array<{ fit_score: number }>;
    expect(scored.every((j) => j.fit_score === 50)).toBe(true);
  });

  it('includes positioning strategy context in prompt when available', async () => {
    vi.mocked(llm.chat).mockResolvedValueOnce({
      text: '[]',
      tool_calls: [],
      usage: { input_tokens: 10, output_tokens: 10 },
    });

    const ctx = makeCtx({
      search_results: sampleJobs,
      platform_context: { positioning_strategy: { target_role: 'VP Operations', target_industry: 'manufacturing' } },
    });

    await tool.execute({}, ctx);
    const callArgs = vi.mocked(llm.chat).mock.calls[0][0];
    const userContent = callArgs.messages[0].content as string;
    expect(userContent).toContain('POSITIONING STRATEGY');
    expect(userContent).toContain('VP Operations');
  });
});

describe('Ranker: rank_and_narrate', () => {
  const tool = rankerTools.find((t) => t.name === 'rank_and_narrate')!;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when no scored jobs in scratchpad', async () => {
    const ctx = makeCtx({ search_results: sampleJobs });
    const result = await tool.execute({}, ctx);
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(false);
  });

  it('ranks by fit_score descending and writes narratives', async () => {
    vi.mocked(llm.chat).mockResolvedValueOnce({
      text: JSON.stringify([
        { title: 'VP Operations', company: 'Acme Corp', fit_narrative: 'Your supply chain leadership directly maps to this role.' },
        { title: 'Director of Supply Chain', company: 'Beta Inc', fit_narrative: 'Solid fit given your operational background.' },
      ]),
      tool_calls: [],
      usage: { input_tokens: 50, output_tokens: 100 },
    });

    const ctx = makeCtx({ search_results: sampleJobs });
    ctx.scratchpad.scored_jobs = [
      { title: 'VP Operations', company: 'Acme Corp', fit_score: 88, positioning_alignment: 'Strong', career_trajectory_fit: 'Natural', seniority_fit: 'match', fit_reasoning: 'Excellent' },
      { title: 'Director of Supply Chain', company: 'Beta Inc', fit_score: 72, positioning_alignment: 'Moderate', career_trajectory_fit: 'Lateral', seniority_fit: 'match', fit_reasoning: 'Good' },
    ];

    const result = await tool.execute({ max_results: 5 }, ctx);
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(true);

    const ranked = ctx.scratchpad.ranked_results as RankedMatch[];
    expect(ranked).toHaveLength(2);
    // Should be sorted descending by fit_score
    expect(ranked[0].fit_score).toBeGreaterThanOrEqual(ranked[1].fit_score);
    expect(ranked[0].fit_narrative).toBeTruthy();
  });

  it('emits match_found events for top 5 results', async () => {
    vi.mocked(llm.chat).mockResolvedValueOnce({
      text: '[]',
      tool_calls: [],
      usage: { input_tokens: 10, output_tokens: 10 },
    });

    const ctx = makeCtx({ search_results: sampleJobs });
    ctx.scratchpad.scored_jobs = sampleJobs.map((j, i) => ({
      title: j.title,
      company: j.company,
      fit_score: 80 - i * 10,
      positioning_alignment: '',
      career_trajectory_fit: '',
      seniority_fit: 'match',
      fit_reasoning: '',
    }));

    await tool.execute({}, ctx);

    const emitMock = ctx.emit as unknown as ReturnType<typeof vi.fn>;
    const matchFoundEvents = emitMock.mock.calls.filter(
      (args: unknown[]) => (args[0] as { type: string }).type === 'match_found',
    );
    expect(matchFoundEvents.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Ranker: present_results', () => {
  const tool = rankerTools.find((t) => t.name === 'present_results')!;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when no ranked results', async () => {
    const ctx = makeCtx();
    const result = await tool.execute({}, ctx);
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(false);
  });

  it('updates state and emits results_ready', async () => {
    const ctx = makeCtx();
    const rankedMatches: RankedMatch[] = [
      {
        title: 'VP Operations',
        company: 'Acme Corp',
        source: 'career_page',
        fit_score: 88,
        fit_narrative: 'Strong match',
        positioning_alignment: 'Direct alignment',
        career_trajectory_fit: 'Natural progression',
        seniority_fit: 'match',
      },
    ];
    ctx.scratchpad.ranked_results = rankedMatches;

    const result = await tool.execute({}, ctx);
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(true);
    expect(parsed.results_presented).toBe(1);

    expect(ctx.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'results_ready', total_matches: 1 }),
    );
    expect(ctx.getState().ranked_results).toHaveLength(1);
  });
});

// ─── Tests: ProductConfig ─────────────────────────────────────────────────────

describe('createJobFinderProductConfig', () => {
  const config = createJobFinderProductConfig();

  it('has correct domain', () => {
    expect(config.domain).toBe('job-finder');
  });

  it('has 2 agents in correct order', () => {
    expect(config.agents).toHaveLength(2);
    expect(config.agents[0].name).toBe('searcher');
    expect(config.agents[1].name).toBe('ranker');
  });

  it('ranker has review_results gate', () => {
    const rankerPhase = config.agents[1];
    expect(rankerPhase.gates).toHaveLength(1);
    expect(rankerPhase.gates![0].name).toBe('review_results');
  });

  it('createInitialState sets correct defaults', () => {
    const state = config.createInitialState('session-abc', 'user-xyz', { platform_context: undefined });
    expect(state.session_id).toBe('session-abc');
    expect(state.user_id).toBe('user-xyz');
    expect(state.current_stage).toBe('searching');
    expect(state.search_results).toEqual([]);
    expect(state.ranked_results).toEqual([]);
    expect(state.user_decisions).toEqual([]);
  });

  it('createInitialState accepts platform_context from input', () => {
    const platformCtx = { positioning_strategy: { target_role: 'COO' } };
    const state = config.createInitialState('s1', 'u1', { platform_context: platformCtx });
    expect(state.platform_context?.positioning_strategy).toEqual({ target_role: 'COO' });
  });

  describe('buildAgentMessage', () => {
    it('searcher message includes strategy context when available', () => {
      const state = makeState({
        platform_context: { positioning_strategy: { target_role: 'VP Operations', target_titles: ['VP Ops', 'SVP Operations'] } },
      });
      const msg = config.buildAgentMessage('searcher', state, { resume_text: 'A'.repeat(200) });
      expect(msg).toContain('VP Operations');
    });

    it('searcher message includes shared career context when legacy context is absent', () => {
      const sharedContext = createEmptySharedContext();
      sharedContext.candidateProfile.factualSummary = 'Operations executive with large-scale manufacturing leadership';
      sharedContext.targetRole.roleTitle = 'Chief Operating Officer';

      const state = makeState({ shared_context: sharedContext });
      const msg = config.buildAgentMessage('searcher', state, { resume_text: 'A'.repeat(200) });

      expect(msg).toContain('Career Profile');
      expect(msg).toContain('Operations executive with large-scale manufacturing leadership');
      expect(msg).toContain('Chief Operating Officer');
    });

    it('searcher message includes resume text', () => {
      const state = makeState();
      const resumeText = 'Senior executive with 20 years experience in manufacturing and operations leadership at Fortune 500 companies';
      const msg = config.buildAgentMessage('searcher', state, { resume_text: resumeText });
      expect(msg).toContain(resumeText.slice(0, 50));
    });

    it('ranker message lists discovered jobs', () => {
      const state = makeState({ search_results: sampleJobs });
      const msg = config.buildAgentMessage('ranker', state, {});
      expect(msg).toContain('VP Operations');
      expect(msg).toContain('Acme Corp');
    });

    it('returns empty string for unknown agent', () => {
      const state = makeState();
      const msg = config.buildAgentMessage('unknown-agent', state, {});
      expect(msg).toBe('');
    });
  });

  describe('finalizeResult', () => {
    it('emits job_finder_complete and returns result object', () => {
      const emit = vi.fn();
      const state = makeState({
        ranked_results: [
          {
            title: 'VP Ops',
            company: 'Acme',
            source: 'career_page',
            fit_score: 88,
            fit_narrative: 'Strong',
            positioning_alignment: 'Direct',
            career_trajectory_fit: 'Natural',
            seniority_fit: 'match',
          },
        ],
        user_decisions: [
          { company: 'Acme', title: 'VP Ops', status: 'promoted' },
        ],
      });

      const result = config.finalizeResult(state, {}, emit) as Record<string, unknown>;
      expect(emit).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'job_finder_complete', session_id: 'test-session' }),
      );
      expect(result.total_ranked).toBe(1);
      expect(result.promoted_count).toBe(1);
    });
  });

  describe('validateAfterAgent', () => {
    it('throws when searcher produces no results', () => {
      const state = makeState({ search_results: [] });
      expect(() => config.validateAfterAgent!('searcher', state)).toThrow();
    });

    it('passes when searcher has results', () => {
      const state = makeState({ search_results: sampleJobs });
      expect(() => config.validateAfterAgent!('searcher', state)).not.toThrow();
    });

    it('throws when ranker produces no ranked results', () => {
      const state = makeState({ ranked_results: [] });
      expect(() => config.validateAfterAgent!('ranker', state)).toThrow();
    });

    it('passes when ranker has ranked results', () => {
      const state = makeState({
        ranked_results: [
          { title: 'VP Ops', company: 'Acme', source: 'career_page', fit_score: 85, fit_narrative: 'Great', positioning_alignment: 'Strong', career_trajectory_fit: 'Natural', seniority_fit: 'match' },
        ],
      });
      expect(() => config.validateAfterAgent!('ranker', state)).not.toThrow();
    });
  });

  describe('onResponse (review gate)', () => {
    it('stores promoted decisions in user_decisions', () => {
      const rankerPhase = config.agents[1];
      const gate = rankerPhase.gates![0];
      const state = makeState();

      gate.onResponse!([
        { company: 'Acme Corp', title: 'VP Operations', status: 'promoted' },
        { company: 'Beta Inc', title: 'Director', status: 'dismissed' },
      ], state);

      expect(state.user_decisions).toHaveLength(2);
      expect(state.user_decisions[0].status).toBe('promoted');
      expect(state.user_decisions[1].status).toBe('dismissed');
    });

    it('handles invalid response gracefully', () => {
      const rankerPhase = config.agents[1];
      const gate = rankerPhase.gates![0];
      const state = makeState();

      gate.onResponse!(null, state);
      expect(state.user_decisions).toEqual([]);
    });
  });

  describe('emitError', () => {
    it('emits pipeline_error event', () => {
      const emit = vi.fn();
      config.emitError!('searching', 'Something went wrong', emit);
      expect(emit).toHaveBeenCalledWith({
        type: 'pipeline_error',
        stage: 'searching',
        error: 'Something went wrong',
      });
    });
  });
});

// ─── Tests: Route Schema ───────────────────────────────────────────────────────

describe('Route startSchema validation', () => {
  it('validates valid session_id', async () => {
    const { z } = await import('zod');
    const schema = z.object({
      session_id: z.string().uuid(),
      resume_text: z.string().min(50).max(100_000).optional(),
    });

    const valid = schema.safeParse({ session_id: '550e8400-e29b-41d4-a716-446655440000' });
    expect(valid.success).toBe(true);
  });

  it('rejects non-uuid session_id', async () => {
    const { z } = await import('zod');
    const schema = z.object({
      session_id: z.string().uuid(),
      resume_text: z.string().min(50).max(100_000).optional(),
    });

    const invalid = schema.safeParse({ session_id: 'not-a-uuid' });
    expect(invalid.success).toBe(false);
  });

  it('accepts missing resume_text (optional)', async () => {
    const { z } = await import('zod');
    const schema = z.object({
      session_id: z.string().uuid(),
      resume_text: z.string().min(50).max(100_000).optional(),
    });

    const valid = schema.safeParse({ session_id: '550e8400-e29b-41d4-a716-446655440000' });
    expect(valid.success).toBe(true);
  });
});
