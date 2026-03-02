/**
 * Strategist Agent — Tool Unit Tests
 *
 * Covers: parse_resume, analyze_jd, research_company, build_benchmark,
 *         interview_candidate, classify_fit, design_blueprint, emit_transparency
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ─── Module mocks (must be hoisted before any imports that touch mocked modules) ─

vi.mock('../agents/intake.js', () => ({
  runIntakeAgent: vi.fn(),
}));

vi.mock('../agents/research.js', () => ({
  runResearchAgent: vi.fn(),
}));

vi.mock('../agents/gap-analyst.js', () => ({
  runGapAnalyst: vi.fn(),
}));

vi.mock('../agents/architect.js', () => ({
  runArchitect: vi.fn(),
}));

vi.mock('../lib/questionnaire-helpers.js', () => ({
  positioningToQuestionnaire: vi.fn().mockReturnValue([]),
  extractInterviewAnswers: vi.fn().mockReturnValue([]),
  buildQuestionnaireEvent: vi.fn().mockReturnValue({ type: 'questionnaire' }),
}));

vi.mock('../agents/positioning-coach.js', () => ({
  evaluateFollowUp: vi.fn().mockReturnValue(null),
}));

// ─── Import after mocks ───────────────────────────────────────────────

import { runIntakeAgent } from '../agents/intake.js';
import { runResearchAgent } from '../agents/research.js';
import { runGapAnalyst } from '../agents/gap-analyst.js';
import { runArchitect } from '../agents/architect.js';
import { strategistTools } from '../agents/strategist/tools.js';
import type { PipelineState, ResumeAgentContext } from '../agents/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makePipelineState(overrides?: Partial<PipelineState>): PipelineState {
  return {
    session_id: 'test-session',
    user_id: 'test-user',
    current_stage: 'intake',
    approved_sections: [],
    revision_count: 0,
    revision_counts: {},
    token_usage: { input_tokens: 0, output_tokens: 0, estimated_cost_usd: 0 },
    ...overrides,
  };
}

function makeCtx(stateOverrides?: Partial<PipelineState>): ResumeAgentContext & {
  _state: PipelineState;
  emitSpy: ReturnType<typeof vi.fn>;
} {
  let state = makePipelineState(stateOverrides);
  const emitSpy = vi.fn();

  return {
    sessionId: 'test-session',
    userId: 'test-user',
    scratchpad: {},
    signal: new AbortController().signal,
    emit: emitSpy,
    waitForUser: vi.fn().mockResolvedValue('Test answer from candidate'),
    getState: () => state,
    updateState: (patch: Partial<PipelineState>) => {
      state = { ...state, ...patch };
    },
    sendMessage: vi.fn(),
    _state: state,
    emitSpy,
  };
}

function getTool(name: string) {
  const tool = strategistTools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool;
}

function makeIntakeOutput() {
  return {
    contact: { name: 'Jane Doe', email: 'jane@example.com', phone: '555-1234', location: 'New York' },
    summary: 'Senior engineering executive with 15 years of cloud platform experience.',
    experience: [
      { company: 'Acme Corp', title: 'VP Engineering', start_date: 'Jan 2018', end_date: 'Present', bullets: ['Led 45-person org'] },
    ],
    skills: ['Cloud Architecture', 'P&L Ownership', 'Team Leadership'],
    education: [{ degree: 'BS', institution: 'MIT' }],
    certifications: ['AWS Solutions Architect'],
    career_span_years: 15,
    raw_text: 'Jane Doe VP Engineering...',
  };
}

function makeResearchOutput() {
  return {
    jd_analysis: {
      role_title: 'CTO',
      company: 'TechCorp',
      seniority_level: 'executive' as const,
      must_haves: ['engineering leadership', 'cloud architecture'],
      nice_to_haves: ['kubernetes'],
      implicit_requirements: ['executive presence'],
      language_keywords: ['cloud-native', 'P&L'],
    },
    company_research: {
      company_name: 'TechCorp',
      industry: 'technology',
      size: '500-1000',
      culture_signals: ['innovation', 'fast-paced'],
    },
    benchmark_candidate: {
      ideal_profile: 'Seasoned engineering leader with P&L experience',
      language_keywords: ['cloud-native', 'P&L', 'platform'],
      section_expectations: { summary: '3-4 sentences', skills: '4-6 categories' },
    },
  };
}

function makeGapAnalystOutput() {
  return {
    requirements: [
      { requirement: 'engineering leadership', classification: 'strong' as const, evidence: ['Led 45-person org'] },
      { requirement: 'cloud architecture', classification: 'partial' as const, evidence: ['Cloud platform work'] },
    ],
    coverage_score: 82,
    critical_gaps: [],
    addressable_gaps: ['cloud architecture depth'],
    strength_summary: 'Strong leadership background with partial cloud coverage',
  };
}

function makeArchitectOutput() {
  return {
    blueprint_version: '2.0',
    target_role: 'CTO at TechCorp',
    positioning_angle: 'Platform-first engineering executive',
    section_plan: { order: ['header', 'summary', 'experience', 'skills'], rationale: 'Executive order' },
    summary_blueprint: {
      positioning_angle: 'Cloud-first engineering executive',
      must_include: ['cloud architecture'],
      gap_reframe: {},
      tone_guidance: 'Executive, direct',
      keywords_to_embed: ['cloud-native'],
      authentic_phrases_to_echo: [],
      length: '3-4 sentences',
    },
    evidence_allocation: { selected_accomplishments: [], experience_section: {}, unallocated_requirements: [] },
    skills_blueprint: { format: 'categorized' as const, categories: [], keywords_still_missing: [], age_protection_removals: [] },
    experience_blueprint: { roles: [] },
    age_protection: { flags: [], clean: true },
    keyword_map: { 'cloud-native': { target_density: 2, placements: ['summary'], current_count: 0, action: 'add' as const } },
    global_rules: {
      voice: 'Executive, direct',
      bullet_format: 'Action → scope → result',
      length_target: '2 pages',
      ats_rules: 'No tables',
    },
  };
}

// ─── parse_resume ─────────────────────────────────────────────────────

describe('parse_resume', () => {
  const tool = getTool('parse_resume');

  beforeEach(() => {
    vi.mocked(runIntakeAgent).mockReset();
  });

  it('happy path: parses resume from explicit input and persists to scratchpad', async () => {
    vi.mocked(runIntakeAgent).mockResolvedValueOnce(makeIntakeOutput());
    const ctx = makeCtx();

    const result = await tool.execute({ raw_resume_text: 'Jane Doe VP Engineering...' }, ctx) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.experience_count).toBe(1);
    expect(result.skills_count).toBe(3);
    expect(result.career_span_years).toBe(15);
    expect(ctx.scratchpad.intake).toBeDefined();
    expect(ctx.getState().intake).toBeDefined();
  });

  it('falls back to pipeline state raw_text when no input provided', async () => {
    const intake = makeIntakeOutput();
    vi.mocked(runIntakeAgent).mockResolvedValueOnce(intake);
    const ctx = makeCtx({
      intake: { ...intake, raw_text: 'Existing resume text from state' },
    });

    const result = await tool.execute({}, ctx) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(vi.mocked(runIntakeAgent)).toHaveBeenCalledWith({
      raw_resume_text: 'Existing resume text from state',
    });
  });

  it('throws when no resume text is available', async () => {
    const ctx = makeCtx();

    await expect(tool.execute({}, ctx)).rejects.toThrow(
      'No resume text available',
    );
  });

  it('throws when raw_resume_text is empty string', async () => {
    const ctx = makeCtx();

    await expect(tool.execute({ raw_resume_text: '   ' }, ctx)).rejects.toThrow(
      'No resume text available',
    );
  });

  it('truncates summary to 200 characters in return value', async () => {
    const longSummary = 'A'.repeat(300);
    vi.mocked(runIntakeAgent).mockResolvedValueOnce({
      ...makeIntakeOutput(),
      summary: longSummary,
    });
    const ctx = makeCtx();

    const result = await tool.execute({ raw_resume_text: 'some text' }, ctx) as Record<string, unknown>;

    expect((result.summary as string).length).toBeLessThanOrEqual(203); // 200 + '...'
    expect((result.summary as string).endsWith('...')).toBe(true);
  });
});

// ─── analyze_jd ──────────────────────────────────────────────────────

describe('analyze_jd', () => {
  const tool = getTool('analyze_jd');

  beforeEach(() => {
    vi.mocked(runResearchAgent).mockReset();
  });

  it('happy path: runs research agent and returns jd_analysis fields', async () => {
    vi.mocked(runResearchAgent).mockResolvedValueOnce(makeResearchOutput());
    const ctx = makeCtx();
    ctx.scratchpad.intake = makeIntakeOutput();

    const result = await tool.execute(
      { job_description: 'CTO role at TechCorp requiring cloud expertise', company_name: 'TechCorp' },
      ctx,
    ) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.role_title).toBe('CTO');
    expect(result.must_haves_count).toBe(2);
    expect(ctx.scratchpad.research).toBeDefined();
  });

  it('throws when job_description is missing', async () => {
    const ctx = makeCtx();
    ctx.scratchpad.intake = makeIntakeOutput();

    await expect(
      tool.execute({ company_name: 'TechCorp' }, ctx),
    ).rejects.toThrow('job_description is required');
  });

  it('throws when parse_resume has not been called first', async () => {
    const ctx = makeCtx();

    await expect(
      tool.execute({ job_description: 'CTO role', company_name: 'TechCorp' }, ctx),
    ).rejects.toThrow('parse_resume must be called before analyze_jd');
  });

  it('caches research output for subsequent tools', async () => {
    const research = makeResearchOutput();
    vi.mocked(runResearchAgent).mockResolvedValueOnce(research);
    const ctx = makeCtx();
    ctx.scratchpad.intake = makeIntakeOutput();

    await tool.execute({ job_description: 'CTO role at TechCorp', company_name: 'TechCorp' }, ctx);

    expect(ctx.scratchpad.research).toBeDefined();
    expect((ctx.scratchpad.research as typeof research).jd_analysis.role_title).toBe('CTO');
  });
});

// ─── research_company ─────────────────────────────────────────────────

describe('research_company', () => {
  const tool = getTool('research_company');

  beforeEach(() => {
    vi.mocked(runResearchAgent).mockReset();
  });

  it('returns cached company research when analyze_jd was already called', async () => {
    const ctx = makeCtx();
    ctx.scratchpad.research = makeResearchOutput();

    const result = await tool.execute({ company_name: 'TechCorp' }, ctx) as Record<string, unknown>;

    expect(result.source).toBe('cached');
    expect(result.company_name).toBe('TechCorp');
    expect(vi.mocked(runResearchAgent)).not.toHaveBeenCalled();
  });

  it('calls research agent when no cached research exists', async () => {
    vi.mocked(runResearchAgent).mockResolvedValueOnce(makeResearchOutput());
    const ctx = makeCtx();
    ctx.scratchpad.intake = makeIntakeOutput();

    const result = await tool.execute(
      { company_name: 'TechCorp', job_description: 'CTO role' },
      ctx,
    ) as Record<string, unknown>;

    expect(result.source).toBe('fresh');
    expect(vi.mocked(runResearchAgent)).toHaveBeenCalledOnce();
  });

  it('throws when company_name is missing and no cache exists', async () => {
    const ctx = makeCtx();

    await expect(tool.execute({}, ctx)).rejects.toThrow(
      'company_name is required',
    );
  });

  it('throws when parse_resume has not been called and no cache exists', async () => {
    const ctx = makeCtx();
    // company_name IS provided but intake is missing — tool throws about parse_resume

    await expect(
      tool.execute({ company_name: 'TechCorp' }, ctx),
    ).rejects.toThrow('parse_resume must be called before research_company');
  });
});

// ─── build_benchmark ──────────────────────────────────────────────────

describe('build_benchmark', () => {
  const tool = getTool('build_benchmark');

  it('returns benchmark from cached research output', async () => {
    const ctx = makeCtx();
    ctx.scratchpad.research = makeResearchOutput();

    const result = await tool.execute({}, ctx) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.ideal_profile).toBeDefined();
    expect(Array.isArray(result.language_keywords)).toBe(true);
    expect(result.section_expectations).toBeDefined();
  });

  it('throws when no research data is cached (analyze_jd not called)', async () => {
    const ctx = makeCtx();

    await expect(tool.execute({}, ctx)).rejects.toThrow(
      'analyze_jd must be called first',
    );
  });
});

// ─── interview_candidate removed (Sprint 10 Story 3: batch-only mode) ─

// ─── classify_fit ─────────────────────────────────────────────────────

describe('classify_fit', () => {
  const tool = getTool('classify_fit');

  beforeEach(() => {
    vi.mocked(runGapAnalyst).mockReset();
  });

  it('throws when parse_resume has not been called', async () => {
    const ctx = makeCtx();
    ctx.scratchpad.research = makeResearchOutput();

    await expect(tool.execute({}, ctx)).rejects.toThrow('parse_resume must be called first');
  });

  it('throws when analyze_jd has not been called', async () => {
    const ctx = makeCtx();
    ctx.scratchpad.intake = makeIntakeOutput();

    await expect(tool.execute({}, ctx)).rejects.toThrow('analyze_jd must be called first');
  });

  it('happy path: returns coverage score and gap classification', async () => {
    vi.mocked(runGapAnalyst).mockResolvedValueOnce(makeGapAnalystOutput());
    const ctx = makeCtx();
    ctx.scratchpad.intake = makeIntakeOutput();
    ctx.scratchpad.research = makeResearchOutput();

    const result = await tool.execute({}, ctx) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.coverage_score).toBe(82);
    expect(result.requirements_total).toBe(2);
    expect(result.strong_count).toBe(1);
    expect(result.partial_count).toBe(1);
    expect(result.gap_count).toBe(0);
  });

  it('uses positioning_summary input when provided', async () => {
    vi.mocked(runGapAnalyst).mockResolvedValueOnce(makeGapAnalystOutput());
    const ctx = makeCtx();
    ctx.scratchpad.intake = makeIntakeOutput();
    ctx.scratchpad.research = makeResearchOutput();

    await tool.execute({ positioning_summary: 'Cloud-first VP Engineering targeting CTO' }, ctx);

    const positioning = ctx.getState().positioning;
    expect(positioning?.career_arc.label).toBe('Cloud-first VP Engineering targeting CTO');
  });
});

// ─── design_blueprint ─────────────────────────────────────────────────

describe('design_blueprint', () => {
  const tool = getTool('design_blueprint');

  beforeEach(() => {
    vi.mocked(runArchitect).mockReset();
  });

  it('throws when parse_resume has not been called', async () => {
    const ctx = makeCtx();
    ctx.scratchpad.research = makeResearchOutput();
    ctx.scratchpad.positioning = {};
    ctx.scratchpad.gap_analysis = makeGapAnalystOutput();

    await expect(tool.execute({}, ctx)).rejects.toThrow('parse_resume must be called first');
  });

  it('throws when classify_fit has not been called', async () => {
    const ctx = makeCtx();
    ctx.scratchpad.intake = makeIntakeOutput();
    ctx.scratchpad.research = makeResearchOutput();
    // No positioning or gap_analysis in scratchpad

    await expect(tool.execute({}, ctx)).rejects.toThrow('classify_fit must be called first');
  });

  it('happy path: runs architect and emits blueprint_ready event', async () => {
    vi.mocked(runArchitect).mockResolvedValueOnce(makeArchitectOutput());
    const ctx = makeCtx();
    ctx.scratchpad.intake = makeIntakeOutput();
    ctx.scratchpad.research = makeResearchOutput();
    ctx.scratchpad.positioning = { career_arc: { label: 'CTO', evidence: '', user_description: '' }, top_capabilities: [], evidence_library: [], signature_method: null, unconscious_competence: '', domain_insight: '', authentic_phrases: [], gaps_detected: [] };
    ctx.scratchpad.gap_analysis = makeGapAnalystOutput();

    const result = await tool.execute({}, ctx) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.target_role).toBe('CTO at TechCorp');
    expect(result.positioning_angle).toBe('Platform-first engineering executive');
    expect(ctx.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'blueprint_ready' }),
    );
    expect(ctx.scratchpad.blueprint).toBeDefined();
  });
});

// ─── emit_transparency (strategist) ──────────────────────────────────

describe('emit_transparency (strategist)', () => {
  const tool = getTool('emit_transparency');

  it('emits transparency event with provided message', async () => {
    const ctx = makeCtx({ current_stage: 'intake' });

    const result = await tool.execute({ message: 'Analyzing job description...' }, ctx) as Record<string, unknown>;

    expect(result.emitted).toBe(true);
    expect(ctx.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'transparency',
        message: 'Analyzing job description...',
        stage: 'intake',
      }),
    );
  });

  it('returns failure when message is empty', async () => {
    const ctx = makeCtx();

    const result = await tool.execute({ message: '  ' }, ctx) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('coerces non-string message to string', async () => {
    const ctx = makeCtx();

    const result = await tool.execute({ message: 42 }, ctx) as Record<string, unknown>;

    expect(result.emitted).toBe(true);
    expect(result.message).toBe('42');
  });
});
