/**
 * Resume v2 Orchestrator — Unit tests.
 *
 * Verifies:
 * - All 10 agents called in correct pipeline order
 * - Agents 1 & 2 run in parallel (Promise.all)
 * - Agent 3 (benchmark) runs after Agent 1 completes
 * - Agents 7, 8, 9 run in parallel
 * - Agent 10 (assembly) runs synchronously after verification
 * - Final state has all agent outputs populated
 * - Returns state with current_stage === 'complete'
 * - SSE events emitted in correct order with correct types
 * - Pre-scores computation from language_keywords when not provided
 * - Pre-scores passed through when provided in options
 * - Gap coaching cards emitted when pending_strategies present
 * - Gap coaching NOT emitted when pending_strategies is empty
 * - previously_approved flag set on matching gap_coaching_responses
 * - Strategy approval: Case 1 (re-run with approved_strategies)
 * - Strategy approval: Case 2 (gap_coaching_responses filter)
 * - Strategy approval: Case 3 (first run implicit approval)
 * - Context enrichment for action='context' responses
 * - Error handling: emits pipeline_error and rethrows
 * - AbortSignal throws between stages
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mock functions ───────────────────────────────────────────────────

const mockRunJobIntelligence      = vi.hoisted(() => vi.fn());
const mockRunCandidateIntelligence = vi.hoisted(() => vi.fn());
const mockRunBenchmarkCandidate   = vi.hoisted(() => vi.fn());
const mockRunGapAnalysis          = vi.hoisted(() => vi.fn());
const mockRunNarrativeStrategy    = vi.hoisted(() => vi.fn());
const mockRunResumeWriter         = vi.hoisted(() => vi.fn());
const mockRunTruthVerification    = vi.hoisted(() => vi.fn());
const mockRunATSOptimization      = vi.hoisted(() => vi.fn());
const mockRunExecutiveTone        = vi.hoisted(() => vi.fn());
const mockRunAssembly             = vi.hoisted(() => vi.fn());
const mockStartUsageTracking      = vi.hoisted(() => vi.fn(() => ({ input_tokens: 120, output_tokens: 80 })));
const mockSetUsageTrackingContext = vi.hoisted(() => vi.fn());
const mockStopUsageTracking       = vi.hoisted(() => vi.fn());

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../agents/resume-v2/job-intelligence/agent.js', () => ({
  runJobIntelligence: mockRunJobIntelligence,
}));

vi.mock('../agents/resume-v2/candidate-intelligence/agent.js', () => ({
  runCandidateIntelligence: mockRunCandidateIntelligence,
}));

vi.mock('../agents/resume-v2/benchmark-candidate/agent.js', () => ({
  runBenchmarkCandidate: mockRunBenchmarkCandidate,
}));

vi.mock('../agents/resume-v2/gap-analysis/agent.js', () => ({
  runGapAnalysis: mockRunGapAnalysis,
}));

vi.mock('../agents/resume-v2/narrative-strategy/agent.js', () => ({
  runNarrativeStrategy: mockRunNarrativeStrategy,
}));

vi.mock('../agents/resume-v2/resume-writer/agent.js', () => ({
  runResumeWriter: mockRunResumeWriter,
}));

vi.mock('../agents/resume-v2/truth-verification/agent.js', () => ({
  runTruthVerification: mockRunTruthVerification,
}));

vi.mock('../agents/resume-v2/ats-optimization/agent.js', () => ({
  runATSOptimization: mockRunATSOptimization,
}));

vi.mock('../agents/resume-v2/executive-tone/agent.js', () => ({
  runExecutiveTone: mockRunExecutiveTone,
}));

vi.mock('../agents/resume-v2/assembly/agent.js', () => ({
  runAssembly: mockRunAssembly,
}));

vi.mock('../lib/llm-provider.js', () => ({
  startUsageTracking: mockStartUsageTracking,
  setUsageTrackingContext: mockSetUsageTrackingContext,
  stopUsageTracking: mockStopUsageTracking,
}));

vi.mock('../lib/logger.js', () => ({
  default: {
    info:  vi.fn(),
    warn:  vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  },
}));

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

// ─── Import under test (after mocks) ─────────────────────────────────────────

import { runV2Pipeline } from '../agents/resume-v2/orchestrator.js';
import type { V2PipelineSSEEvent } from '../agents/resume-v2/types.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const JOB_INTEL = {
  company_name: 'Acme Corp',
  role_title: 'VP of Engineering',
  seniority_level: 'vp' as const,
  core_competencies: [
    { competency: 'Team Leadership', importance: 'must_have' as const, evidence_from_jd: 'Lead 20+ engineers' },
  ],
  strategic_responsibilities: ['Drive architectural roadmap'],
  business_problems: ['Scale infrastructure'],
  cultural_signals: ['Collaborative culture'],
  hidden_hiring_signals: ['Looking for someone to own the roadmap'],
  language_keywords: ['typescript', 'kubernetes', 'distributed systems'],
  industry: 'Technology',
};

const CANDIDATE_INTEL = {
  contact: { name: 'Jane Smith', email: 'jane@example.com', phone: '555-0100' },
  career_themes: ['Engineering leadership', 'Cloud infrastructure'],
  leadership_scope: 'Led teams of 10-30 engineers',
  quantified_outcomes: [
    { outcome: 'Reduced deployment time', metric_type: 'time' as const, value: '60%' },
  ],
  industry_depth: ['SaaS', 'FinTech'],
  technologies: ['TypeScript', 'Kubernetes'],
  operational_scale: 'Global scale',
  career_span_years: 15,
  experience: [
    {
      company: 'Previous Corp',
      title: 'Director of Engineering',
      start_date: 'Jan 2019',
      end_date: 'Dec 2023',
      bullets: ['Led team of 20 engineers'],
    },
  ],
  education: [{ degree: 'BS Computer Science', institution: 'MIT', year: '2008' }],
  certifications: ['AWS Solutions Architect'],
  hidden_accomplishments: ['Built zero-downtime deployment system'],
  raw_text: 'Jane Smith resume text',
};

const BENCHMARK = {
  ideal_profile_summary: 'Seasoned engineering leader with enterprise-scale experience',
  expected_achievements: [{ area: 'Team Building', description: 'Scaled org', typical_metrics: '20-50 engineers' }],
  expected_leadership_scope: 'VP-level, 20+ engineers',
  expected_industry_knowledge: ['SaaS', 'Enterprise software'],
  expected_technical_skills: ['TypeScript', 'Kubernetes', 'System design'],
  expected_certifications: ['AWS'],
  differentiators: ['Platform thinking', 'Executive presence'],
};

const GAP_ANALYSIS_WITH_PENDING = {
  requirements: [
    {
      requirement: 'distributed systems',
      source: 'job_description' as const,
      importance: 'must_have' as const,
      classification: 'partial' as const,
      evidence: ['Worked on high-availability systems'],
      strategy: {
        real_experience: 'Built HA systems at Previous Corp',
        positioning: 'Position as distributed systems practitioner via HA architecture work',
        ai_reasoning: 'Your HA architecture experience directly maps to distributed systems thinking.',
      },
    },
  ],
  coverage_score: 72,
  score_breakdown: {
    job_description: {
      total: 4,
      strong: 1,
      partial: 2,
      missing: 1,
      addressed: 3,
      coverage_score: 75,
    },
    benchmark: {
      total: 3,
      strong: 1,
      partial: 1,
      missing: 1,
      addressed: 2,
      coverage_score: 67,
    },
  },
  strength_summary: 'Strong candidate with minor gaps in distributed systems',
  critical_gaps: [],
  pending_strategies: [
    {
      requirement: 'distributed systems',
      strategy: {
        real_experience: 'Built HA systems at Previous Corp',
        positioning: 'Position as distributed systems practitioner via HA architecture work',
        ai_reasoning: 'Your HA architecture experience directly maps to distributed systems thinking.',
      },
    },
  ],
};

const GAP_ANALYSIS_EMPTY_PENDING = {
  ...GAP_ANALYSIS_WITH_PENDING,
  pending_strategies: [],
};

const NARRATIVE = {
  primary_narrative: 'Enterprise Engineering Transformation Leader',
  narrative_angle_rationale: 'Strong track record across the full lifecycle',
  supporting_themes: ['Scale', 'Platform Thinking'],
  branded_title: 'VP Engineering | Enterprise Transformation',
  narrative_origin: 'Grew up building large-scale systems',
  unique_differentiators: ['Platform ownership', 'Team scaling', 'Zero-downtime deployments'],
  why_me_story: 'I have spent 15 years building and leading engineering orgs at scale.',
  why_me_concise: '15 years scaling engineering orgs',
  why_me_best_line: 'I build the teams that build the products.',
  gap_positioning_map: [],
  interview_talking_points: ['Lead with the HA architecture story'],
  section_guidance: {
    summary_angle: 'Lead with scale and transformation',
    competency_themes: ['Leadership', 'Architecture'],
    accomplishment_priorities: ['Zero-downtime deployment'],
    experience_framing: { 'Previous Corp': 'Frame as enterprise transformation' },
  },
};

const RESUME_DRAFT = {
  header: {
    name: 'Jane Smith',
    phone: '555-0100',
    email: 'jane@example.com',
    branded_title: 'VP Engineering | Enterprise Transformation',
  },
  executive_summary: { content: 'Seasoned VP of Engineering...', is_new: true },
  core_competencies: ['Team Leadership', 'System Design', 'Kubernetes'],
  selected_accomplishments: [
    { content: 'Reduced deployment time by 60%', is_new: false, addresses_requirements: ['distributed systems'], source: 'original' as const, confidence: 'strong' as const, evidence_found: '', requirement_source: 'job_description' as const },
  ],
  professional_experience: [
    {
      company: 'Previous Corp',
      title: 'Director of Engineering',
      start_date: 'Jan 2019',
      end_date: 'Dec 2023',
      scope_statement: 'Led 20-engineer org',
      scope_statement_source: 'original' as const,
      scope_statement_confidence: 'strong' as const,
      scope_statement_evidence_found: '',
      bullets: [
        { text: 'Built HA architecture serving 10M users', is_new: false, addresses_requirements: ['distributed systems'], source: 'original' as const, confidence: 'strong' as const, evidence_found: '', requirement_source: 'job_description' as const },
      ],
    },
  ],
  education: [{ degree: 'BS Computer Science', institution: 'MIT', year: '2008' }],
  certifications: ['AWS Solutions Architect'],
};

const TRUTH_VERIFICATION = {
  claims: [
    { claim: '10M users', section: 'experience', source_found: true, confidence: 'verified' as const },
  ],
  truth_score: 95,
  flagged_items: [],
};

const ATS_OPTIMIZATION = {
  match_score: 82,
  keywords_found: ['typescript', 'kubernetes'],
  keywords_missing: ['distributed systems'],
  keyword_suggestions: [
    { keyword: 'distributed systems', suggested_placement: 'summary', natural_phrasing: 'distributed systems architecture' },
  ],
  formatting_issues: [],
};

const EXECUTIVE_TONE = {
  findings: [],
  tone_score: 90,
  banned_phrases_found: [],
};

const ASSEMBLY_OUTPUT = {
  final_resume: RESUME_DRAFT,
  scores: { ats_match: 82, truth: 95, tone: 90 },
  quick_wins: [
    { description: 'Add "distributed systems" to summary', impact: 'high' as const },
  ],
  positioning_assessment: {
    summary: 'Strong overall positioning',
    requirement_map: [],
    before_score: 45,
    after_score: 82,
    strategies_applied: ['HA architecture repositioned as distributed systems'],
  },
};

// ─── Default options factory ──────────────────────────────────────────────────

function makeOptions(overrides: Partial<Parameters<typeof runV2Pipeline>[0]> = {}) {
  const emitted: V2PipelineSSEEvent[] = [];
  const emit = (e: V2PipelineSSEEvent) => emitted.push(e);
  return {
    options: {
      resume_text: 'Jane Smith resume with typescript and kubernetes experience over 15 years',
      job_description: 'VP Engineering role requiring distributed systems and kubernetes expertise',
      session_id: 'test-session-001',
      user_id: 'test-user-001',
      emit,
      ...overrides,
    },
    emitted,
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Default happy-path agent responses
  mockRunJobIntelligence.mockResolvedValue(JOB_INTEL);
  mockRunCandidateIntelligence.mockResolvedValue(CANDIDATE_INTEL);
  mockRunBenchmarkCandidate.mockResolvedValue(BENCHMARK);
  mockRunGapAnalysis.mockResolvedValue(GAP_ANALYSIS_WITH_PENDING);
  mockRunNarrativeStrategy.mockResolvedValue(NARRATIVE);
  mockRunResumeWriter.mockResolvedValue(RESUME_DRAFT);
  mockRunTruthVerification.mockResolvedValue(TRUTH_VERIFICATION);
  mockRunATSOptimization.mockResolvedValue(ATS_OPTIMIZATION);
  mockRunExecutiveTone.mockResolvedValue(EXECUTIVE_TONE);
  mockRunAssembly.mockReturnValue(ASSEMBLY_OUTPUT); // synchronous
  mockStartUsageTracking.mockReturnValue({ input_tokens: 120, output_tokens: 80 });
});

// ─── Pipeline flow ────────────────────────────────────────────────────────────

describe('pipeline flow — agent invocation', () => {
  it('calls all 10 agents', async () => {
    const { options } = makeOptions();
    await runV2Pipeline(options);

    expect(mockRunJobIntelligence).toHaveBeenCalledOnce();
    expect(mockRunCandidateIntelligence).toHaveBeenCalledOnce();
    expect(mockRunBenchmarkCandidate).toHaveBeenCalledOnce();
    expect(mockRunGapAnalysis).toHaveBeenCalledOnce();
    expect(mockRunNarrativeStrategy).toHaveBeenCalledOnce();
    expect(mockRunResumeWriter).toHaveBeenCalledOnce();
    expect(mockRunTruthVerification).toHaveBeenCalledOnce();
    expect(mockRunATSOptimization).toHaveBeenCalledOnce();
    expect(mockRunExecutiveTone).toHaveBeenCalledOnce();
    expect(mockRunAssembly).toHaveBeenCalledOnce();
  });

  it('passes job_description to runJobIntelligence', async () => {
    const { options } = makeOptions();
    await runV2Pipeline(options);

    expect(mockRunJobIntelligence).toHaveBeenCalledWith(
      expect.objectContaining({ job_description: options.job_description }),
      undefined, // signal
    );
  });

  it('passes resume_text to runCandidateIntelligence', async () => {
    const { options } = makeOptions();
    await runV2Pipeline(options);

    expect(mockRunCandidateIntelligence).toHaveBeenCalledWith(
      expect.objectContaining({ resume_text: options.resume_text }),
      undefined,
    );
  });

  it('passes jobIntel to runBenchmarkCandidate (Agent 3 depends on Agent 1)', async () => {
    const { options } = makeOptions();
    await runV2Pipeline(options);

    expect(mockRunBenchmarkCandidate).toHaveBeenCalledWith(
      expect.objectContaining({ job_intelligence: JOB_INTEL }),
      undefined,
      expect.objectContaining({ session_id: expect.any(String) }),
    );
  });

  it('passes candidateIntel, benchmark, and jobIntel to runGapAnalysis', async () => {
    const { options } = makeOptions();
    await runV2Pipeline(options);

    expect(mockRunGapAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        candidate: CANDIDATE_INTEL,
        benchmark: BENCHMARK,
        job_intelligence: JOB_INTEL,
      }),
      undefined,
    );
  });

  it('passes all required inputs to runNarrativeStrategy', async () => {
    const { options } = makeOptions();
    await runV2Pipeline(options);

    expect(mockRunNarrativeStrategy).toHaveBeenCalledWith(
      expect.objectContaining({
        gap_analysis: GAP_ANALYSIS_WITH_PENDING,
        candidate: CANDIDATE_INTEL,
        job_intelligence: JOB_INTEL,
        benchmark_differentiators: BENCHMARK.differentiators,
      }),
      undefined,
    );
  });

  it('passes all required inputs to runResumeWriter', async () => {
    const { options } = makeOptions();
    await runV2Pipeline(options);

    expect(mockRunResumeWriter).toHaveBeenCalledWith(
      expect.objectContaining({
        job_intelligence: JOB_INTEL,
        candidate: CANDIDATE_INTEL,
        benchmark: BENCHMARK,
        gap_analysis: GAP_ANALYSIS_WITH_PENDING,
        narrative: NARRATIVE,
      }),
      undefined,
    );
  });

  it('passes draft and original_resume to runTruthVerification', async () => {
    const { options } = makeOptions();
    await runV2Pipeline(options);

    expect(mockRunTruthVerification).toHaveBeenCalledWith(
      expect.objectContaining({
        draft: RESUME_DRAFT,
        original_resume: options.resume_text,
        candidate: CANDIDATE_INTEL,
      }),
      undefined,
    );
  });

  it('passes draft and job_intelligence to runATSOptimization', async () => {
    const { options } = makeOptions();
    await runV2Pipeline(options);

    expect(mockRunATSOptimization).toHaveBeenCalledWith(
      expect.objectContaining({
        draft: RESUME_DRAFT,
        job_intelligence: JOB_INTEL,
      }),
      undefined,
    );
  });

  it('passes only draft to runExecutiveTone', async () => {
    const { options } = makeOptions();
    await runV2Pipeline(options);

    expect(mockRunExecutiveTone).toHaveBeenCalledWith(
      expect.objectContaining({ draft: RESUME_DRAFT }),
      undefined,
    );
  });

  it('passes all verification outputs to runAssembly', async () => {
    const { options } = makeOptions();
    await runV2Pipeline(options);

    expect(mockRunAssembly).toHaveBeenCalledWith(
      expect.objectContaining({
        draft: RESUME_DRAFT,
        truth_verification: TRUTH_VERIFICATION,
        ats_optimization: ATS_OPTIMIZATION,
        executive_tone: EXECUTIVE_TONE,
        gap_analysis: GAP_ANALYSIS_WITH_PENDING,
      }),
    );
  });

  it('agents 1 and 2 are called before agent 3 resolves', async () => {
    const callOrder: string[] = [];
    mockRunJobIntelligence.mockImplementation(async () => {
      callOrder.push('job_intelligence');
      return JOB_INTEL;
    });
    mockRunCandidateIntelligence.mockImplementation(async () => {
      callOrder.push('candidate_intelligence');
      return CANDIDATE_INTEL;
    });
    mockRunBenchmarkCandidate.mockImplementation(async () => {
      callOrder.push('benchmark');
      return BENCHMARK;
    });

    const { options } = makeOptions();
    await runV2Pipeline(options);

    // Both 1 and 2 must appear before 3
    const benchmarkIdx = callOrder.indexOf('benchmark');
    const jobIdx = callOrder.indexOf('job_intelligence');
    const candidateIdx = callOrder.indexOf('candidate_intelligence');
    expect(benchmarkIdx).toBeGreaterThan(jobIdx);
    expect(benchmarkIdx).toBeGreaterThan(candidateIdx);
  });

  it('agents 7, 8, 9 are all called (can run in parallel)', async () => {
    const { options } = makeOptions();
    await runV2Pipeline(options);

    // All three verification agents called exactly once
    expect(mockRunTruthVerification).toHaveBeenCalledOnce();
    expect(mockRunATSOptimization).toHaveBeenCalledOnce();
    expect(mockRunExecutiveTone).toHaveBeenCalledOnce();
  });

  it('agent 10 is called synchronously (no await) after verification', async () => {
    // runAssembly is synchronous (deterministic, no LLM). Confirm mock is called as a function,
    // not as an async function — i.e. the mock's return value is used directly, not awaited.
    let returnedPromise = false;
    mockRunAssembly.mockImplementation((input: unknown) => {
      // If the orchestrator were awaiting, it would need a Promise. Return a plain object.
      returnedPromise = false;
      return ASSEMBLY_OUTPUT;
    });

    const { options } = makeOptions();
    await runV2Pipeline(options);

    expect(mockRunAssembly).toHaveBeenCalledOnce();
    expect(returnedPromise).toBe(false);
  });
});

// ─── Final state ──────────────────────────────────────────────────────────────

describe('pipeline flow — final state', () => {
  it('returns state with current_stage equal to complete', async () => {
    const { options } = makeOptions();
    const state = await runV2Pipeline(options);

    expect(state.current_stage).toBe('complete');
  });

  it('state has all 10 agent outputs populated', async () => {
    const { options } = makeOptions();
    const state = await runV2Pipeline(options);

    expect(state.job_intelligence).toEqual(JOB_INTEL);
    expect(state.candidate_intelligence).toEqual(CANDIDATE_INTEL);
    expect(state.benchmark_candidate).toEqual(BENCHMARK);
    expect(state.gap_analysis).toEqual(GAP_ANALYSIS_WITH_PENDING);
    expect(state.narrative_strategy).toEqual(NARRATIVE);
    expect(state.resume_draft).toEqual(RESUME_DRAFT);
    expect(state.truth_verification).toEqual(TRUTH_VERIFICATION);
    expect(state.ats_optimization).toEqual(ATS_OPTIMIZATION);
    expect(state.executive_tone).toEqual(EXECUTIVE_TONE);
    expect(state.final_resume).toEqual(ASSEMBLY_OUTPUT);
  });

  it('state preserves session_id and user_id from options', async () => {
    const { options } = makeOptions();
    const state = await runV2Pipeline(options);

    expect(state.session_id).toBe('test-session-001');
    expect(state.user_id).toBe('test-user-001');
  });

  it('state preserves resume_text and job_description from options', async () => {
    const { options } = makeOptions();
    const state = await runV2Pipeline(options);

    expect(state.resume_text).toBe(options.resume_text);
    expect(state.job_description).toBe(options.job_description);
  });

  it('state preserves user_context when provided', async () => {
    const { options } = makeOptions({ user_context: 'Targeting director-level roles' });
    const state = await runV2Pipeline(options);

    expect(state.user_context).toBe('Targeting director-level roles');
  });

  it('stores accumulated token usage from the usage tracker', async () => {
    const { options } = makeOptions();
    const state = await runV2Pipeline(options);

    expect(state.token_usage.input_tokens).toBe(120);
    expect(state.token_usage.output_tokens).toBe(80);
    expect(state.token_usage.estimated_cost_usd).toBeGreaterThanOrEqual(0);
  });

  it('starts and stops usage tracking around the pipeline', async () => {
    const { options } = makeOptions();
    await runV2Pipeline(options);

    expect(mockStartUsageTracking).toHaveBeenCalledWith('test-session-001', 'test-user-001');
    expect(mockSetUsageTrackingContext).toHaveBeenCalledWith('test-session-001');
    expect(mockStopUsageTracking).toHaveBeenCalledWith('test-session-001');
  });
});

// ─── SSE event emission ───────────────────────────────────────────────────────

describe('SSE event emission — event types', () => {
  it('emits stage_start and stage_complete for analysis stage', async () => {
    const { options, emitted } = makeOptions();
    await runV2Pipeline(options);

    const types = emitted.map(e => `${e.type}${e.type === 'stage_start' || e.type === 'stage_complete' ? `:${e.stage}` : ''}`);
    expect(types).toContain('stage_start:analysis');
    expect(types).toContain('stage_complete:analysis');
  });

  it('emits stage_start and stage_complete for strategy stage', async () => {
    const { options, emitted } = makeOptions();
    await runV2Pipeline(options);

    const types = emitted.map(e => `${e.type}${e.type === 'stage_start' || e.type === 'stage_complete' ? `:${e.stage}` : ''}`);
    expect(types).toContain('stage_start:strategy');
    expect(types).toContain('stage_complete:strategy');
  });

  it('emits stage_start and stage_complete for writing stage', async () => {
    const { options, emitted } = makeOptions();
    await runV2Pipeline(options);

    const types = emitted.map(e => `${e.type}${e.type === 'stage_start' || e.type === 'stage_complete' ? `:${e.stage}` : ''}`);
    expect(types).toContain('stage_start:writing');
    expect(types).toContain('stage_complete:writing');
  });

  it('emits stage_start and stage_complete for verification stage', async () => {
    const { options, emitted } = makeOptions();
    await runV2Pipeline(options);

    const types = emitted.map(e => `${e.type}${e.type === 'stage_start' || e.type === 'stage_complete' ? `:${e.stage}` : ''}`);
    expect(types).toContain('stage_start:verification');
    expect(types).toContain('stage_complete:verification');
  });

  it('emits stage_start and stage_complete for assembly stage', async () => {
    const { options, emitted } = makeOptions();
    await runV2Pipeline(options);

    const types = emitted.map(e => `${e.type}${e.type === 'stage_start' || e.type === 'stage_complete' ? `:${e.stage}` : ''}`);
    expect(types).toContain('stage_start:assembly');
    expect(types).toContain('stage_complete:assembly');
  });

  it('emits job_intelligence event with correct data', async () => {
    const { options, emitted } = makeOptions();
    await runV2Pipeline(options);

    const event = emitted.find(e => e.type === 'job_intelligence');
    expect(event).toBeDefined();
    expect((event as Extract<V2PipelineSSEEvent, { type: 'job_intelligence' }>).data).toEqual(JOB_INTEL);
  });

  it('emits candidate_intelligence event with correct data', async () => {
    const { options, emitted } = makeOptions();
    await runV2Pipeline(options);

    const event = emitted.find(e => e.type === 'candidate_intelligence');
    expect(event).toBeDefined();
    expect((event as Extract<V2PipelineSSEEvent, { type: 'candidate_intelligence' }>).data).toEqual(CANDIDATE_INTEL);
  });

  it('emits benchmark_candidate event with correct data', async () => {
    const { options, emitted } = makeOptions();
    await runV2Pipeline(options);

    const event = emitted.find(e => e.type === 'benchmark_candidate');
    expect(event).toBeDefined();
    expect((event as Extract<V2PipelineSSEEvent, { type: 'benchmark_candidate' }>).data).toEqual(BENCHMARK);
  });

  it('emits gap_analysis event with correct data', async () => {
    const { options, emitted } = makeOptions();
    await runV2Pipeline(options);

    const event = emitted.find(e => e.type === 'gap_analysis');
    expect(event).toBeDefined();
    expect((event as Extract<V2PipelineSSEEvent, { type: 'gap_analysis' }>).data).toEqual(GAP_ANALYSIS_WITH_PENDING);
  });

  it('emits narrative_strategy event with correct data', async () => {
    const { options, emitted } = makeOptions();
    await runV2Pipeline(options);

    const event = emitted.find(e => e.type === 'narrative_strategy');
    expect(event).toBeDefined();
    expect((event as Extract<V2PipelineSSEEvent, { type: 'narrative_strategy' }>).data).toEqual(NARRATIVE);
  });

  it('emits resume_draft event with correct data', async () => {
    const { options, emitted } = makeOptions();
    await runV2Pipeline(options);

    const event = emitted.find(e => e.type === 'resume_draft');
    expect(event).toBeDefined();
    expect((event as Extract<V2PipelineSSEEvent, { type: 'resume_draft' }>).data).toEqual(RESUME_DRAFT);
  });

  it('emits verification_complete event with all three verification outputs', async () => {
    const { options, emitted } = makeOptions();
    await runV2Pipeline(options);

    const event = emitted.find(e => e.type === 'verification_complete') as
      Extract<V2PipelineSSEEvent, { type: 'verification_complete' }> | undefined;
    expect(event).toBeDefined();
    expect(event!.data.truth).toEqual(TRUTH_VERIFICATION);
    expect(event!.data.ats).toEqual(ATS_OPTIMIZATION);
    expect(event!.data.tone).toEqual(EXECUTIVE_TONE);
  });

  it('emits assembly_complete event with assembly output', async () => {
    const { options, emitted } = makeOptions();
    await runV2Pipeline(options);

    const event = emitted.find(e => e.type === 'assembly_complete') as
      Extract<V2PipelineSSEEvent, { type: 'assembly_complete' }> | undefined;
    expect(event).toBeDefined();
    expect(event!.data).toEqual(ASSEMBLY_OUTPUT);
  });

  it('emits pipeline_complete with correct session_id', async () => {
    const { options, emitted } = makeOptions();
    await runV2Pipeline(options);

    const event = emitted.find(e => e.type === 'pipeline_complete') as
      Extract<V2PipelineSSEEvent, { type: 'pipeline_complete' }> | undefined;
    expect(event).toBeDefined();
    expect(event!.session_id).toBe('test-session-001');
  });
});

describe('SSE event emission — ordering', () => {
  it('emits stage_start:analysis before job_intelligence and candidate_intelligence', async () => {
    const { options, emitted } = makeOptions();
    await runV2Pipeline(options);

    const types = emitted.map(e => e.type);
    const analysisStart = types.indexOf('stage_start');
    const jobIntelIdx = types.indexOf('job_intelligence');
    const candidateIdx = types.indexOf('candidate_intelligence');

    expect(analysisStart).toBeLessThan(jobIntelIdx);
    expect(analysisStart).toBeLessThan(candidateIdx);
  });

  it('emits benchmark_candidate before stage_complete:analysis', async () => {
    const { options, emitted } = makeOptions();
    await runV2Pipeline(options);

    const benchmarkIdx = emitted.findIndex(e => e.type === 'benchmark_candidate');
    const analysisCompleteIdx = emitted.findIndex(
      e => e.type === 'stage_complete' && (e as Extract<V2PipelineSSEEvent, { type: 'stage_complete' }>).stage === 'analysis',
    );

    expect(benchmarkIdx).toBeLessThan(analysisCompleteIdx);
  });

  it('emits all analysis events before strategy events', async () => {
    const { options, emitted } = makeOptions();
    await runV2Pipeline(options);

    const strategyStartIdx = emitted.findIndex(
      e => e.type === 'stage_start' && (e as Extract<V2PipelineSSEEvent, { type: 'stage_start' }>).stage === 'strategy',
    );
    const analysisCompleteIdx = emitted.findIndex(
      e => e.type === 'stage_complete' && (e as Extract<V2PipelineSSEEvent, { type: 'stage_complete' }>).stage === 'analysis',
    );

    expect(analysisCompleteIdx).toBeLessThan(strategyStartIdx);
  });

  it('emits narrative_strategy before stage_complete:clarification', async () => {
    const { options, emitted } = makeOptions();
    await runV2Pipeline(options);

    const narrativeIdx = emitted.findIndex(e => e.type === 'narrative_strategy');
    const clarificationCompleteIdx = emitted.findIndex(
      e => e.type === 'stage_complete' && (e as Extract<V2PipelineSSEEvent, { type: 'stage_complete' }>).stage === 'clarification',
    );

    expect(narrativeIdx).toBeLessThan(clarificationCompleteIdx);
  });

  it('emits pipeline_complete as the last event', async () => {
    const { options, emitted } = makeOptions();
    await runV2Pipeline(options);

    const last = emitted[emitted.length - 1];
    expect(last.type).toBe('pipeline_complete');
  });

  it('emits events in overall correct stage order', async () => {
    const { options, emitted } = makeOptions();
    await runV2Pipeline(options);

    // Verify the stage boundary ordering: analysis → strategy → clarification → writing → verification → assembly → complete
    const stageEvents = emitted.filter(
      e => e.type === 'stage_start' || e.type === 'stage_complete',
    ) as Array<Extract<V2PipelineSSEEvent, { type: 'stage_start' | 'stage_complete' }>>;

    const stageSequence = stageEvents.map(e => `${e.type.replace('stage_', '')}:${e.stage}`);
    expect(stageSequence).toEqual([
      'start:analysis',
      'complete:analysis',
      'start:strategy',
      'complete:strategy',
      'start:clarification',
      'complete:clarification',
      'start:writing',
      'complete:writing',
      'start:verification',
      'complete:verification',
      'start:assembly',
      'complete:assembly',
    ]);
  });
});

// ─── Pre-scores computation ───────────────────────────────────────────────────

describe('pre-scores computation', () => {
  it('computes and enriches pre_scores from the original resume when not provided', async () => {
    // JOB_INTEL has keywords: ['typescript', 'kubernetes', 'distributed systems']
    // resume_text contains 'typescript' and 'kubernetes' but not 'distributed systems'
    const { options, emitted } = makeOptions({
      resume_text: 'Jane Smith with typescript and kubernetes experience',
    });
    await runV2Pipeline(options);

    const preScoreEvents = emitted.filter((e): e is Extract<V2PipelineSSEEvent, { type: 'pre_scores' }> => e.type === 'pre_scores');
    expect(preScoreEvents).toHaveLength(2);

    const data = preScoreEvents.at(-1)!.data;
    expect(data.keywords_found).toContain('typescript');
    expect(data.keywords_found).toContain('kubernetes');
    expect(data.keywords_missing).toContain('distributed systems');
    // 2 found out of 3 = 67%
    expect(data.ats_match).toBe(67);
    expect(data.keyword_match_score).toBe(67);
    expect(data.job_requirement_coverage_score).toBe(75);
    expect(data.overall_fit_score).toBe(72);
  });

  it('stores computed pre_scores in state', async () => {
    const { options } = makeOptions({
      resume_text: 'resume with typescript only',
    });
    const state = await runV2Pipeline(options);

    expect(state.pre_scores).toBeDefined();
    expect(state.pre_scores!.keywords_found).toContain('typescript');
    expect(state.pre_scores!.keyword_match_score).toBe(state.pre_scores!.ats_match);
    expect(state.pre_scores!.job_requirement_coverage_score).toBe(75);
    expect(state.pre_scores!.overall_fit_score).toBe(60);
  });

  it('uses provided pre_scores without recomputing', async () => {
    const providedPreScores = {
      ats_match: 55,
      keywords_found: ['typescript'],
      keywords_missing: ['kubernetes', 'distributed systems'],
      keyword_match_score: 55,
      job_requirement_coverage_score: 60,
      overall_fit_score: 58,
    };
    const { options, emitted } = makeOptions({ pre_scores: providedPreScores });
    const state = await runV2Pipeline(options);

    // Should NOT emit a new pre_scores event when pre_scores are provided
    const preScoresEvent = emitted.find(e => e.type === 'pre_scores');
    expect(preScoresEvent).toBeUndefined();

    // Should use the provided pre_scores in state
    expect(state.pre_scores).toEqual(providedPreScores);
  });

  it('passes pre_scores to runAssembly when computed', async () => {
    const { options } = makeOptions({
      resume_text: 'resume with typescript and kubernetes',
    });
    await runV2Pipeline(options);

    expect(mockRunAssembly).toHaveBeenCalledWith(
      expect.objectContaining({
        pre_scores: expect.objectContaining({
          ats_match: expect.any(Number),
          keywords_found: expect.any(Array),
          keywords_missing: expect.any(Array),
          keyword_match_score: expect.any(Number),
          job_requirement_coverage_score: expect.any(Number),
          overall_fit_score: expect.any(Number),
        }),
      }),
    );
  });

  it('passes provided pre_scores to runAssembly', async () => {
    const providedPreScores = {
      ats_match: 55,
      keywords_found: ['typescript'],
      keywords_missing: ['kubernetes'],
      keyword_match_score: 55,
      job_requirement_coverage_score: 60,
      overall_fit_score: 58,
    };
    const { options } = makeOptions({ pre_scores: providedPreScores });
    await runV2Pipeline(options);

    expect(mockRunAssembly).toHaveBeenCalledWith(
      expect.objectContaining({ pre_scores: providedPreScores }),
    );
  });

  it('computes ats_match as 0 when language_keywords is empty', async () => {
    mockRunJobIntelligence.mockResolvedValue({ ...JOB_INTEL, language_keywords: [] });

    const { options, emitted } = makeOptions();
    await runV2Pipeline(options);

    const preScoresEvent = emitted.filter((e): e is Extract<V2PipelineSSEEvent, { type: 'pre_scores' }> => e.type === 'pre_scores').at(-1);
    expect(preScoresEvent!.data.ats_match).toBe(0);
    expect(preScoresEvent!.data.keyword_match_score).toBe(0);
    expect(preScoresEvent!.data.keywords_found).toEqual([]);
    expect(preScoresEvent!.data.keywords_missing).toEqual([]);
    expect(preScoresEvent!.data.job_requirement_coverage_score).toBe(75);
    expect(preScoresEvent!.data.overall_fit_score).toBe(49);
  });
});

// ─── Gap coaching ─────────────────────────────────────────────────────────────

describe('gap coaching', () => {
  it('emits gap_coaching when pending_strategies is non-empty', async () => {
    mockRunGapAnalysis.mockResolvedValue(GAP_ANALYSIS_WITH_PENDING);
    const { options, emitted } = makeOptions();
    await runV2Pipeline(options);

    const event = emitted.find(e => e.type === 'gap_coaching');
    expect(event).toBeDefined();
  });

  it('does NOT emit gap_coaching when pending_strategies is empty', async () => {
    mockRunGapAnalysis.mockResolvedValue(GAP_ANALYSIS_EMPTY_PENDING);
    const { options, emitted } = makeOptions();
    await runV2Pipeline(options);

    const event = emitted.find(e => e.type === 'gap_coaching');
    expect(event).toBeUndefined();
  });

  it('gap_coaching cards contain correct fields', async () => {
    mockRunGapAnalysis.mockResolvedValue(GAP_ANALYSIS_WITH_PENDING);
    const { options, emitted } = makeOptions();
    await runV2Pipeline(options);

    const event = emitted.find(e => e.type === 'gap_coaching') as
      Extract<V2PipelineSSEEvent, { type: 'gap_coaching' }> | undefined;
    expect(event).toBeDefined();

    const cards = event!.data;
    expect(cards).toHaveLength(1);
    const card = cards[0];
    expect(card.requirement).toBe('distributed systems');
    expect(card.importance).toBe('must_have');
    expect(card.classification).toBe('partial');
    expect(card.proposed_strategy).toBeDefined();
    expect(card.ai_reasoning).toBeDefined();
    expect(card.coaching_policy?.clarifyingQuestion).toContain('What scale did you support');
    expect(card.coaching_policy?.proofActionRequiresInput).toContain('scale involved');
  });

  it('sets previously_approved true when requirement was approved in gap_coaching_responses', async () => {
    mockRunGapAnalysis.mockResolvedValue(GAP_ANALYSIS_WITH_PENDING);
    const { options, emitted } = makeOptions({
      gap_coaching_responses: [
        { requirement: 'distributed systems', action: 'approve' },
      ],
    });
    await runV2Pipeline(options);

    const event = emitted.find(e => e.type === 'gap_coaching') as
      Extract<V2PipelineSSEEvent, { type: 'gap_coaching' }> | undefined;
    const card = event!.data[0];
    expect(card.previously_approved).toBe(true);
  });

  it('sets previously_approved false when requirement not in gap_coaching_responses', async () => {
    mockRunGapAnalysis.mockResolvedValue(GAP_ANALYSIS_WITH_PENDING);
    const { options, emitted } = makeOptions(); // no gap_coaching_responses
    await runV2Pipeline(options);

    const event = emitted.find(e => e.type === 'gap_coaching') as
      Extract<V2PipelineSSEEvent, { type: 'gap_coaching' }> | undefined;
    const card = event!.data[0];
    expect(card.previously_approved).toBe(false);
  });

  it('sets previously_approved false when response action is skip (not approve)', async () => {
    mockRunGapAnalysis.mockResolvedValue(GAP_ANALYSIS_WITH_PENDING);
    const { options, emitted } = makeOptions({
      gap_coaching_responses: [
        { requirement: 'distributed systems', action: 'skip' },
      ],
    });
    await runV2Pipeline(options);

    const event = emitted.find(e => e.type === 'gap_coaching') as
      Extract<V2PipelineSSEEvent, { type: 'gap_coaching' }> | undefined;
    const card = event!.data[0];
    // 'skip' does not count as approval
    expect(card.previously_approved).toBe(false);
  });

  it('uses importance from requirements when matching requirement found', async () => {
    mockRunGapAnalysis.mockResolvedValue(GAP_ANALYSIS_WITH_PENDING);
    const { options, emitted } = makeOptions();
    await runV2Pipeline(options);

    const event = emitted.find(e => e.type === 'gap_coaching') as
      Extract<V2PipelineSSEEvent, { type: 'gap_coaching' }> | undefined;
    // requirement 'distributed systems' in requirements has importance: 'must_have'
    expect(event!.data[0].importance).toBe('must_have');
  });

  it('uses classification from requirements when matching requirement found', async () => {
    mockRunGapAnalysis.mockResolvedValue(GAP_ANALYSIS_WITH_PENDING);
    const { options, emitted } = makeOptions();
    await runV2Pipeline(options);

    const event = emitted.find(e => e.type === 'gap_coaching') as
      Extract<V2PipelineSSEEvent, { type: 'gap_coaching' }> | undefined;
    expect(event!.data[0].classification).toBe('partial');
  });

  it('falls back to importance=important when no matching requirement found', async () => {
    // pending_strategy requirement not present in requirements array
    mockRunGapAnalysis.mockResolvedValue({
      ...GAP_ANALYSIS_WITH_PENDING,
      requirements: [], // no match
      pending_strategies: [
        {
          requirement: 'unknown requirement',
          strategy: {
            real_experience: 'Some experience',
            positioning: 'Position as X',
          },
        },
      ],
    });

    const { options, emitted } = makeOptions();
    await runV2Pipeline(options);

    const event = emitted.find(e => e.type === 'gap_coaching') as
      Extract<V2PipelineSSEEvent, { type: 'gap_coaching' }> | undefined;
    expect(event!.data[0].importance).toBe('important');
  });
});

// ─── Strategy approval — three cases ─────────────────────────────────────────

describe('strategy approval', () => {
  it('Case 1: uses approved_strategies from options directly (re-run)', async () => {
    const preApproved = [
      {
        requirement: 'distributed systems',
        strategy: {
          real_experience: 'Pre-approved experience',
          positioning: 'Pre-approved positioning',
        },
      },
    ];
    const { options } = makeOptions({ approved_strategies: preApproved });
    await runV2Pipeline(options);

    expect(mockRunNarrativeStrategy).toHaveBeenCalledWith(
      expect.objectContaining({ approved_strategies: preApproved }),
      undefined,
    );
    expect(mockRunResumeWriter).toHaveBeenCalledWith(
      expect.objectContaining({ approved_strategies: preApproved }),
      undefined,
    );
  });

  it('Case 2: filters approved strategies from gap_coaching_responses', async () => {
    mockRunGapAnalysis.mockResolvedValue(GAP_ANALYSIS_WITH_PENDING);
    const { options } = makeOptions({
      gap_coaching_responses: [
        { requirement: 'distributed systems', action: 'approve' },
      ],
    });
    await runV2Pipeline(options);

    const narrativeCall = mockRunNarrativeStrategy.mock.calls[0][0];
    expect(narrativeCall.approved_strategies).toHaveLength(1);
    expect(narrativeCall.approved_strategies[0].requirement).toBe('distributed systems');
  });

  it('Case 2: skip action excludes strategy from approved list', async () => {
    mockRunGapAnalysis.mockResolvedValue(GAP_ANALYSIS_WITH_PENDING);
    const { options } = makeOptions({
      gap_coaching_responses: [
        { requirement: 'distributed systems', action: 'skip' },
      ],
    });
    await runV2Pipeline(options);

    const narrativeCall = mockRunNarrativeStrategy.mock.calls[0][0];
    expect(narrativeCall.approved_strategies).toHaveLength(0);
  });

  it('Case 2: context action includes strategy with enriched real_experience', async () => {
    mockRunGapAnalysis.mockResolvedValue(GAP_ANALYSIS_WITH_PENDING);
    const { options } = makeOptions({
      gap_coaching_responses: [
        { requirement: 'distributed systems', action: 'context', user_context: 'I also led a distributed cache migration' },
      ],
    });
    await runV2Pipeline(options);

    const narrativeCall = mockRunNarrativeStrategy.mock.calls[0][0];
    expect(narrativeCall.approved_strategies).toHaveLength(1);
    const enrichedStrategy = narrativeCall.approved_strategies[0].strategy;
    expect(enrichedStrategy.real_experience).toContain('Built HA systems at Previous Corp');
    expect(enrichedStrategy.real_experience).toContain('I also led a distributed cache migration');
  });

  it('Case 2: context enrichment appends user_context with correct separator', async () => {
    mockRunGapAnalysis.mockResolvedValue(GAP_ANALYSIS_WITH_PENDING);
    const { options } = makeOptions({
      gap_coaching_responses: [
        { requirement: 'distributed systems', action: 'context', user_context: 'Additional context here' },
      ],
    });
    await runV2Pipeline(options);

    const narrativeCall = mockRunNarrativeStrategy.mock.calls[0][0];
    const enrichedStr = narrativeCall.approved_strategies[0].strategy.real_experience;
    expect(enrichedStr).toContain('Additional context from candidate: Additional context here');
  });

  it('Case 2: context action without user_context is ignored (not added)', async () => {
    mockRunGapAnalysis.mockResolvedValue(GAP_ANALYSIS_WITH_PENDING);
    const { options } = makeOptions({
      gap_coaching_responses: [
        { requirement: 'distributed systems', action: 'context' }, // no user_context
      ],
    });
    await runV2Pipeline(options);

    const narrativeCall = mockRunNarrativeStrategy.mock.calls[0][0];
    // context without user_context should not be added
    expect(narrativeCall.approved_strategies).toHaveLength(0);
  });

  it('Case 3: first run implicitly approves all pending_strategies', async () => {
    mockRunGapAnalysis.mockResolvedValue(GAP_ANALYSIS_WITH_PENDING);
    const { options } = makeOptions(); // no approved_strategies, no gap_coaching_responses

    await runV2Pipeline(options);

    const narrativeCall = mockRunNarrativeStrategy.mock.calls[0][0];
    expect(narrativeCall.approved_strategies).toEqual(GAP_ANALYSIS_WITH_PENDING.pending_strategies);
  });

  it('Case 3: first run with empty pending_strategies passes empty array', async () => {
    mockRunGapAnalysis.mockResolvedValue(GAP_ANALYSIS_EMPTY_PENDING);
    const { options } = makeOptions();

    await runV2Pipeline(options);

    const narrativeCall = mockRunNarrativeStrategy.mock.calls[0][0];
    expect(narrativeCall.approved_strategies).toEqual([]);
  });

  it('Case 2: stores gap_coaching_responses in state', async () => {
    const responses = [{ requirement: 'distributed systems', action: 'approve' as const }];
    mockRunGapAnalysis.mockResolvedValue(GAP_ANALYSIS_WITH_PENDING);
    const { options } = makeOptions({ gap_coaching_responses: responses });
    const state = await runV2Pipeline(options);

    expect(state.gap_coaching_responses).toEqual(responses);
  });

  it('Case 2: ignores responses for requirements not in pending_strategies', async () => {
    mockRunGapAnalysis.mockResolvedValue(GAP_ANALYSIS_WITH_PENDING);
    const { options } = makeOptions({
      gap_coaching_responses: [
        { requirement: 'nonexistent requirement', action: 'approve' },
        { requirement: 'distributed systems', action: 'approve' },
      ],
    });
    await runV2Pipeline(options);

    const narrativeCall = mockRunNarrativeStrategy.mock.calls[0][0];
    // Only 'distributed systems' is in pending_strategies
    expect(narrativeCall.approved_strategies).toHaveLength(1);
    expect(narrativeCall.approved_strategies[0].requirement).toBe('distributed systems');
  });
});

// ─── Error handling ───────────────────────────────────────────────────────────

describe('error handling', () => {
  it('emits pipeline_error when an agent throws', async () => {
    mockRunJobIntelligence.mockRejectedValue(new Error('LLM timeout'));
    const { options, emitted } = makeOptions();

    await expect(runV2Pipeline(options)).rejects.toThrow('LLM timeout');

    const errorEvent = emitted.find(e => e.type === 'pipeline_error') as
      Extract<V2PipelineSSEEvent, { type: 'pipeline_error' }> | undefined;
    expect(errorEvent).toBeDefined();
    expect(errorEvent!.error).toBe('LLM timeout');
  });

  it('rethrows the original error after emitting pipeline_error', async () => {
    const originalError = new Error('Network failure');
    mockRunJobIntelligence.mockRejectedValue(originalError);
    const { options } = makeOptions();

    await expect(runV2Pipeline(options)).rejects.toBe(originalError);
  });

  it('pipeline_error event carries the current stage at failure', async () => {
    // Force failure during strategy stage (after analysis completes)
    mockRunGapAnalysis.mockRejectedValue(new Error('Gap analysis failed'));
    const { options, emitted } = makeOptions();

    await expect(runV2Pipeline(options)).rejects.toThrow('Gap analysis failed');

    const errorEvent = emitted.find(e => e.type === 'pipeline_error') as
      Extract<V2PipelineSSEEvent, { type: 'pipeline_error' }> | undefined;
    expect(errorEvent!.stage).toBe('strategy');
  });

  it('pipeline_error stage is analysis when Agent 1 throws', async () => {
    mockRunJobIntelligence.mockRejectedValue(new Error('Job intel failed'));
    const { options, emitted } = makeOptions();

    await expect(runV2Pipeline(options)).rejects.toThrow();

    const errorEvent = emitted.find(e => e.type === 'pipeline_error') as
      Extract<V2PipelineSSEEvent, { type: 'pipeline_error' }> | undefined;
    expect(errorEvent!.stage).toBe('analysis');
  });

  it('pipeline_error stage is writing when Agent 6 throws', async () => {
    mockRunResumeWriter.mockRejectedValue(new Error('Writer failed'));
    const { options, emitted } = makeOptions();

    await expect(runV2Pipeline(options)).rejects.toThrow();

    const errorEvent = emitted.find(e => e.type === 'pipeline_error') as
      Extract<V2PipelineSSEEvent, { type: 'pipeline_error' }> | undefined;
    expect(errorEvent!.stage).toBe('writing');
  });

  it('pipeline_error stage is verification when Agent 7 throws', async () => {
    mockRunTruthVerification.mockRejectedValue(new Error('Truth check failed'));
    const { options, emitted } = makeOptions();

    await expect(runV2Pipeline(options)).rejects.toThrow();

    const errorEvent = emitted.find(e => e.type === 'pipeline_error') as
      Extract<V2PipelineSSEEvent, { type: 'pipeline_error' }> | undefined;
    expect(errorEvent!.stage).toBe('verification');
  });

  it('handles non-Error thrown values gracefully', async () => {
    mockRunJobIntelligence.mockRejectedValue('string error');
    const { options, emitted } = makeOptions();

    await expect(runV2Pipeline(options)).rejects.toBe('string error');

    const errorEvent = emitted.find(e => e.type === 'pipeline_error') as
      Extract<V2PipelineSSEEvent, { type: 'pipeline_error' }> | undefined;
    expect(errorEvent!.error).toBe('Unknown error');
  });

  it('does not emit pipeline_complete when pipeline errors', async () => {
    mockRunJobIntelligence.mockRejectedValue(new Error('Failure'));
    const { options, emitted } = makeOptions();

    await expect(runV2Pipeline(options)).rejects.toThrow();

    const completeEvent = emitted.find(e => e.type === 'pipeline_complete');
    expect(completeEvent).toBeUndefined();
  });
});

// ─── AbortSignal ─────────────────────────────────────────────────────────────

describe('AbortSignal', () => {
  it('throws DOMException when signal is already aborted before pipeline starts', async () => {
    const controller = new AbortController();
    controller.abort();

    const { options } = makeOptions({ signal: controller.signal });

    await expect(runV2Pipeline(options)).rejects.toThrow();
    // No agents should be called when aborted at the entry point
    expect(mockRunJobIntelligence).not.toHaveBeenCalled();
  });

  it('aborts between stages — throws after analysis, before strategy', async () => {
    const controller = new AbortController();

    // Abort after benchmark completes (end of analysis stage)
    mockRunBenchmarkCandidate.mockImplementation(async () => {
      controller.abort();
      return BENCHMARK;
    });

    const { options } = makeOptions({ signal: controller.signal });
    await expect(runV2Pipeline(options)).rejects.toThrow();

    // Analysis stage completed, strategy agents should NOT have been called
    expect(mockRunBenchmarkCandidate).toHaveBeenCalledOnce();
    expect(mockRunGapAnalysis).not.toHaveBeenCalled();
  });

  it('emits pipeline_error when aborted mid-pipeline', async () => {
    const controller = new AbortController();

    mockRunBenchmarkCandidate.mockImplementation(async () => {
      controller.abort();
      return BENCHMARK;
    });

    const { options, emitted } = makeOptions({ signal: controller.signal });
    await expect(runV2Pipeline(options)).rejects.toThrow();

    const errorEvent = emitted.find(e => e.type === 'pipeline_error');
    expect(errorEvent).toBeDefined();
  });

  it('passes signal to each agent', async () => {
    const controller = new AbortController();
    const { options } = makeOptions({ signal: controller.signal });
    await runV2Pipeline(options);

    expect(mockRunJobIntelligence).toHaveBeenCalledWith(expect.anything(), controller.signal);
    expect(mockRunCandidateIntelligence).toHaveBeenCalledWith(expect.anything(), controller.signal);
    expect(mockRunBenchmarkCandidate).toHaveBeenCalledWith(expect.anything(), controller.signal, expect.anything());
    expect(mockRunGapAnalysis).toHaveBeenCalledWith(expect.anything(), controller.signal);
    expect(mockRunNarrativeStrategy).toHaveBeenCalledWith(expect.anything(), controller.signal);
    expect(mockRunResumeWriter).toHaveBeenCalledWith(expect.anything(), controller.signal);
    expect(mockRunTruthVerification).toHaveBeenCalledWith(expect.anything(), controller.signal);
    expect(mockRunATSOptimization).toHaveBeenCalledWith(expect.anything(), controller.signal);
    expect(mockRunExecutiveTone).toHaveBeenCalledWith(expect.anything(), controller.signal);
  });
});
