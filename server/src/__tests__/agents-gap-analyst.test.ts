import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockChat = vi.hoisted(() => vi.fn());
vi.mock('../lib/llm.js', () => ({
  llm: { chat: mockChat },
  MODEL_LIGHT: 'mock-light',
  MODEL_PRIMARY: 'mock-primary',
  MODEL_MID: 'mock-mid',
  MODEL_ORCHESTRATOR: 'mock-orchestrator',
  MODEL_PRICING: {},
}));

import { runGapAnalyst, generateGapQuestions, enrichGapAnalysis } from '../agents/gap-analyst.js';
import type {
  GapAnalystInput,
  GapAnalystOutput,
  IntakeOutput,
  PositioningProfile,
  JDAnalysis,
  BenchmarkCandidate,
  QuestionnaireResponse,
} from '../agents/types.js';

// ─── Fixture Factories ────────────────────────────────────────────────────────

function makeLLMResponse(data: Record<string, unknown>) {
  return {
    text: JSON.stringify(data),
    tool_calls: [],
    usage: { input_tokens: 0, output_tokens: 0 },
  };
}

function makeIntakeOutput(): IntakeOutput {
  return {
    contact: { name: 'Jane Smith', email: 'jane@example.com', phone: '', location: 'Seattle, WA' },
    summary: 'Engineering leader with 12 years in cloud infrastructure.',
    experience: [
      {
        company: 'Acme Corp',
        title: 'VP Engineering',
        start_date: '2015',
        end_date: 'Present',
        bullets: [
          'Led team of 45 engineers across 3 product lines',
          'Reduced infrastructure costs by $2.4M annually',
          'Increased deployment frequency by 300%',
        ],
      },
    ],
    skills: ['AWS', 'Kubernetes', 'Python', 'Team Leadership'],
    education: [{ degree: 'BS Computer Science', institution: 'UW', year: '2005' }],
    certifications: ['AWS Solutions Architect'],
    career_span_years: 12,
    raw_text: 'Jane Smith VP Engineering...',
  };
}

function makePositioningProfile(): PositioningProfile {
  return {
    career_arc: {
      label: 'Builder',
      evidence: 'Built engineering orgs from scratch',
      user_description: 'I build things — teams, platforms, cultures',
    },
    top_capabilities: [
      {
        capability: 'Scales engineering organizations',
        evidence: ['Grew team from 2 to 45', 'Led cloud migration'],
        source: 'both',
      },
    ],
    evidence_library: [
      {
        id: 'ev_001',
        situation: 'Legacy infrastructure causing outages',
        action: 'Led full cloud migration',
        result: 'Reduced costs by $2.4M and improved uptime to 99.95%',
        metrics_defensible: true,
        user_validated: true,
        mapped_requirements: ['cloud architecture'],
      },
    ],
    signature_method: null,
    unconscious_competence: 'Navigating ambiguity and building consensus',
    domain_insight: 'Best engineering orgs are built around developer experience',
    authentic_phrases: ['build for scale', 'platform-first thinking'],
    gaps_detected: [],
  };
}

function makeJDAnalysis(): JDAnalysis {
  return {
    role_title: 'CTO',
    company: 'TechCorp',
    seniority_level: 'executive',
    must_haves: ['engineering leadership', 'cloud architecture', 'P&L ownership'],
    nice_to_haves: ['kubernetes', 'distributed systems'],
    implicit_requirements: ['executive presence'],
    language_keywords: ['cloud-native', 'P&L', 'engineering excellence'],
  };
}

function makeBenchmark(): BenchmarkCandidate {
  return {
    ideal_profile: 'Seasoned CTO with cloud transformation experience and P&L ownership.',
    language_keywords: ['cloud-native', 'engineering excellence'],
    section_expectations: {},
  };
}

function makeGapAnalystInput(): GapAnalystInput {
  return {
    parsed_resume: makeIntakeOutput(),
    positioning: makePositioningProfile(),
    jd_analysis: makeJDAnalysis(),
    benchmark: makeBenchmark(),
  };
}

function makeValidGapLLMOutput() {
  return {
    requirements: [
      {
        requirement: 'engineering leadership',
        classification: 'strong',
        evidence: ['Led team of 45 engineers', 'Increased deployment frequency by 300%'],
        resume_location: 'experience.0.bullet.0',
        positioning_source: null,
        strengthen: null,
        mitigation: null,
        unaddressable: false,
      },
      {
        requirement: 'cloud architecture',
        classification: 'strong',
        evidence: ['Reduced infrastructure costs by $2.4M annually'],
        resume_location: 'experience.0.bullet.1',
        positioning_source: 'ev_001',
        strengthen: null,
        mitigation: null,
        unaddressable: false,
      },
      {
        requirement: 'P&L ownership',
        classification: 'partial',
        evidence: ['Budget ownership implied by team scope'],
        resume_location: null,
        positioning_source: null,
        strengthen: 'Explicitly state P&L dollar amount',
        mitigation: null,
        unaddressable: false,
      },
      {
        requirement: 'kubernetes',
        classification: 'gap',
        evidence: [],
        resume_location: null,
        positioning_source: null,
        strengthen: null,
        mitigation: 'Frame AWS container orchestration experience as adjacent',
        unaddressable: false,
      },
      {
        requirement: 'distributed systems',
        classification: 'gap',
        evidence: [],
        resume_location: null,
        positioning_source: null,
        strengthen: null,
        mitigation: null,
        unaddressable: true,
      },
      {
        requirement: 'executive presence',
        classification: 'partial',
        evidence: ['Led executive team', 'Cross-functional leadership'],
        resume_location: null,
        positioning_source: null,
        strengthen: 'Add board presentation examples',
        mitigation: null,
        unaddressable: false,
      },
    ],
    strength_summary: 'Strong technical leader with proven cloud experience; P&L and executive presence need strengthening.',
  };
}

// ─── normalizeClassification tests ───────────────────────────────────────────

describe('runGapAnalyst - normalizeClassification', () => {
  beforeEach(() => mockChat.mockReset());

  it('maps "Strong Match" to strong', async () => {
    const output = makeValidGapLLMOutput();
    output.requirements[0].classification = 'Strong Match';
    mockChat.mockResolvedValueOnce(makeLLMResponse(output));

    const result = await runGapAnalyst(makeGapAnalystInput());
    expect(result.requirements[0].classification).toBe('strong');
  });

  it('maps "partial match" to partial', async () => {
    const output = makeValidGapLLMOutput();
    output.requirements[0].classification = 'partial match';
    mockChat.mockResolvedValueOnce(makeLLMResponse(output));

    const result = await runGapAnalyst(makeGapAnalystInput());
    expect(result.requirements[0].classification).toBe('partial');
  });

  it('maps "missing" to gap', async () => {
    const output = makeValidGapLLMOutput();
    output.requirements[0].classification = 'missing';
    mockChat.mockResolvedValueOnce(makeLLMResponse(output));

    const result = await runGapAnalyst(makeGapAnalystInput());
    expect(result.requirements[0].classification).toBe('gap');
  });

  it('defaults unknown classification to gap', async () => {
    const output = makeValidGapLLMOutput();
    output.requirements[0].classification = 'somewhat_okay';
    mockChat.mockResolvedValueOnce(makeLLMResponse(output));

    const result = await runGapAnalyst(makeGapAnalystInput());
    expect(result.requirements[0].classification).toBe('gap');
  });

  it('maps "does not meet" to gap (not partial)', async () => {
    const output = makeValidGapLLMOutput();
    output.requirements[0].classification = 'does not meet requirements';
    mockChat.mockResolvedValueOnce(makeLLMResponse(output));

    const result = await runGapAnalyst(makeGapAnalystInput());
    expect(result.requirements[0].classification).toBe('gap');
  });
});

// ─── runGapAnalyst main tests ─────────────────────────────────────────────────

describe('runGapAnalyst', () => {
  beforeEach(() => mockChat.mockReset());

  it('maps requirements to correct classifications', async () => {
    mockChat.mockResolvedValueOnce(makeLLMResponse(makeValidGapLLMOutput()));

    const result = await runGapAnalyst(makeGapAnalystInput());

    const engLeadership = result.requirements.find(r => r.requirement === 'engineering leadership');
    const plOwnership = result.requirements.find(r => r.requirement === 'P&L ownership');
    const kubernetes = result.requirements.find(r => r.requirement === 'kubernetes');

    expect(engLeadership?.classification).toBe('strong');
    expect(plOwnership?.classification).toBe('partial');
    expect(kubernetes?.classification).toBe('gap');
  });

  it('calculates coverage_score correctly', async () => {
    mockChat.mockResolvedValueOnce(makeLLMResponse(makeValidGapLLMOutput()));

    const result = await runGapAnalyst(makeGapAnalystInput());

    // 6 total: 2 strong + 2 partial + 2 gap
    // coverage = (2 + 2*0.5) / 6 * 100 = 3/6 * 100 = 50
    expect(result.coverage_score).toBe(50);
  });

  it('identifies critical gaps (gap classification, not unaddressable)', async () => {
    mockChat.mockResolvedValueOnce(makeLLMResponse(makeValidGapLLMOutput()));

    const result = await runGapAnalyst(makeGapAnalystInput());

    // kubernetes is gap with mitigation, not unaddressable → critical gap
    // distributed systems is gap but unaddressable → NOT critical gap
    expect(result.critical_gaps).toContain('kubernetes');
    expect(result.critical_gaps).not.toContain('distributed systems');
  });

  it('identifies addressable gaps (gap classification with mitigation, not unaddressable)', async () => {
    mockChat.mockResolvedValueOnce(makeLLMResponse(makeValidGapLLMOutput()));

    const result = await runGapAnalyst(makeGapAnalystInput());

    // kubernetes has mitigation and is not unaddressable
    expect(result.addressable_gaps.some(g => g.includes('kubernetes'))).toBe(true);
    // distributed systems is unaddressable → not in addressable_gaps
    expect(result.addressable_gaps.some(g => g.includes('distributed systems'))).toBe(false);
  });

  it('returns strength_summary from LLM', async () => {
    mockChat.mockResolvedValueOnce(makeLLMResponse(makeValidGapLLMOutput()));

    const result = await runGapAnalyst(makeGapAnalystInput());
    expect(result.strength_summary).toContain('Strong technical leader');
  });

  it('normalizes string evidence to array', async () => {
    const output = makeValidGapLLMOutput();
    // LLM may return evidence as a string instead of array
    (output.requirements[0] as Record<string, unknown>).evidence = 'Led team of 45 engineers';
    mockChat.mockResolvedValueOnce(makeLLMResponse(output));

    const result = await runGapAnalyst(makeGapAnalystInput());
    expect(Array.isArray(result.requirements[0].evidence)).toBe(true);
    expect(result.requirements[0].evidence[0]).toBe('Led team of 45 engineers');
  });

  it('falls back to all-gap when LLM returns invalid JSON', async () => {
    mockChat.mockResolvedValueOnce({ text: 'INVALID JSON', tool_calls: [], usage: { input_tokens: 0, output_tokens: 0 } });

    const result = await runGapAnalyst(makeGapAnalystInput());

    // All requirements should be classified as gap
    for (const req of result.requirements) {
      expect(req.classification).toBe('gap');
    }
    expect(result.coverage_score).toBe(0);
  });

  it('falls back to all-gap when LLM returns object without requirements array', async () => {
    mockChat.mockResolvedValueOnce(makeLLMResponse({ no_requirements_key: true }));

    const result = await runGapAnalyst(makeGapAnalystInput());

    for (const req of result.requirements) {
      expect(req.classification).toBe('gap');
    }
  });

  it('sets unaddressable flag correctly', async () => {
    mockChat.mockResolvedValueOnce(makeLLMResponse(makeValidGapLLMOutput()));

    const result = await runGapAnalyst(makeGapAnalystInput());

    const distributedSystems = result.requirements.find(r => r.requirement === 'distributed systems');
    expect(distributedSystems?.unaddressable).toBe(true);
  });
});

// ─── generateGapQuestions tests ──────────────────────────────────────────────

describe('generateGapQuestions', () => {
  function makeGapAnalysis(overrides?: Partial<GapAnalystOutput>): GapAnalystOutput {
    return {
      requirements: [
        { requirement: 'kubernetes', classification: 'gap', evidence: [] },
        { requirement: 'distributed systems', classification: 'gap', evidence: [] },
        { requirement: 'P&L ownership', classification: 'partial', evidence: ['Budget management implied'] },
        { requirement: 'executive presence', classification: 'partial', evidence: ['Led executive team'] },
        { requirement: 'engineering leadership', classification: 'strong', evidence: ['Led 45 engineers'] },
      ],
      coverage_score: 40,
      critical_gaps: ['kubernetes', 'distributed systems'],
      addressable_gaps: ['kubernetes'],
      strength_summary: 'Strong leadership, gaps in kubernetes',
      ...overrides,
    };
  }

  it('generates questions for gap and partial requirements', () => {
    const analysis = makeGapAnalysis();
    const questions = generateGapQuestions(analysis);

    expect(questions.length).toBeGreaterThan(0);
    // Should not include the strong requirement
    expect(questions.some(q => q.question_text.includes('engineering leadership'))).toBe(false);
  });

  it('caps at 6 questions maximum', () => {
    const manyGaps = makeGapAnalysis({
      requirements: Array.from({ length: 10 }, (_, i) => ({
        requirement: `requirement_${i}`,
        classification: 'gap' as const,
        evidence: [],
      })),
      critical_gaps: [],
      addressable_gaps: [],
    });

    const questions = generateGapQuestions(manyGaps);
    expect(questions.length).toBeLessThanOrEqual(6);
  });

  it('prioritizes gaps over partials', () => {
    const analysis = makeGapAnalysis();
    const questions = generateGapQuestions(analysis);

    // Gaps should come before partials
    const gapIndices = questions
      .map((q, i) => ({ q, i }))
      .filter(({ q }) => q.question_text.includes('kubernetes') || q.question_text.includes('distributed systems'))
      .map(({ i }) => i);

    const partialIndices = questions
      .map((q, i) => ({ q, i }))
      .filter(({ q }) => q.question_text.includes('P&L') || q.question_text.includes('executive'))
      .map(({ i }) => i);

    if (gapIndices.length > 0 && partialIndices.length > 0) {
      expect(Math.min(...gapIndices)).toBeLessThan(Math.min(...partialIndices));
    }
  });

  it('gap questions have GAP_OPTIONS', () => {
    const analysis = makeGapAnalysis();
    const questions = generateGapQuestions(analysis);

    const gapQuestion = questions.find(q => q.question_text.includes('kubernetes'));
    expect(gapQuestion).toBeDefined();
    expect(gapQuestion?.options?.some(o => o.id === 'significant')).toBe(true);
    expect(gapQuestion?.options?.some(o => o.id === 'none')).toBe(true);
  });

  it('partial questions have PARTIAL_OPTIONS', () => {
    const analysis = makeGapAnalysis({
      requirements: [
        { requirement: 'P&L ownership', classification: 'partial', evidence: ['Budget management'] },
      ],
      critical_gaps: [],
      addressable_gaps: [],
    });

    const questions = generateGapQuestions(analysis);
    const partialQ = questions[0];
    expect(partialQ?.options?.some(o => o.id === 'stronger')).toBe(true);
    expect(partialQ?.options?.some(o => o.id === 'covers_it')).toBe(true);
  });

  it('returns empty array when all requirements are strong', () => {
    const analysis = makeGapAnalysis({
      requirements: [
        { requirement: 'engineering leadership', classification: 'strong', evidence: ['Led 45 engineers'] },
      ],
      critical_gaps: [],
      addressable_gaps: [],
    });

    const questions = generateGapQuestions(analysis);
    expect(questions).toHaveLength(0);
  });
});

// ─── enrichGapAnalysis tests ──────────────────────────────────────────────────

describe('enrichGapAnalysis', () => {
  function makeBaseAnalysis(): GapAnalystOutput {
    return {
      requirements: [
        { requirement: 'kubernetes', classification: 'gap', evidence: [] },
        { requirement: 'P&L ownership', classification: 'partial', evidence: ['Budget management implied'] },
      ],
      coverage_score: 25,
      critical_gaps: ['kubernetes'],
      addressable_gaps: [],
      strength_summary: 'Some gaps exist.',
    };
  }

  it('reclassifies gap → strong when user selects significant', () => {
    const analysis = makeBaseAnalysis();
    const questions = generateGapQuestions(analysis);
    const responses: QuestionnaireResponse[] = [
      { question_id: 'gap_0', selected_option_ids: ['significant'], custom_text: '', skipped: false },
    ];

    const enriched = enrichGapAnalysis(analysis, responses, questions);
    const req = enriched.requirements.find(r => r.requirement === 'kubernetes');
    expect(req?.classification).toBe('strong');
  });

  it('reclassifies gap → partial when user selects some', () => {
    const analysis = makeBaseAnalysis();
    const questions = generateGapQuestions(analysis);
    const responses: QuestionnaireResponse[] = [
      { question_id: 'gap_0', selected_option_ids: ['some'], custom_text: '', skipped: false },
    ];

    const enriched = enrichGapAnalysis(analysis, responses, questions);
    const req = enriched.requirements.find(r => r.requirement === 'kubernetes');
    expect(req?.classification).toBe('partial');
  });

  it('reclassifies gap → partial when user selects adjacent', () => {
    const analysis = makeBaseAnalysis();
    const questions = generateGapQuestions(analysis);
    const responses: QuestionnaireResponse[] = [
      { question_id: 'gap_0', selected_option_ids: ['adjacent'], custom_text: 'ECS orchestration experience', skipped: false },
    ];

    const enriched = enrichGapAnalysis(analysis, responses, questions);
    const req = enriched.requirements.find(r => r.requirement === 'kubernetes');
    expect(req?.classification).toBe('partial');
  });

  it('keeps gap unchanged when user selects none', () => {
    const analysis = makeBaseAnalysis();
    const questions = generateGapQuestions(analysis);
    const responses: QuestionnaireResponse[] = [
      { question_id: 'gap_0', selected_option_ids: ['none'], custom_text: '', skipped: false },
    ];

    const enriched = enrichGapAnalysis(analysis, responses, questions);
    const req = enriched.requirements.find(r => r.requirement === 'kubernetes');
    expect(req?.classification).toBe('gap');
  });

  it('reclassifies partial → strong when user selects stronger', () => {
    const analysis = makeBaseAnalysis();
    const questions = generateGapQuestions(analysis);
    const responses: QuestionnaireResponse[] = [
      { question_id: 'gap_0', selected_option_ids: ['none'], custom_text: '', skipped: false },
      { question_id: 'gap_1', selected_option_ids: ['stronger'], custom_text: 'I owned $15M P&L directly', skipped: false },
    ];

    const enriched = enrichGapAnalysis(analysis, responses, questions);
    const req = enriched.requirements.find(r => r.requirement === 'P&L ownership');
    expect(req?.classification).toBe('strong');
  });

  it('reclassifies partial → gap when user selects not_applicable', () => {
    const analysis = makeBaseAnalysis();
    const questions = generateGapQuestions(analysis);
    const responses: QuestionnaireResponse[] = [
      { question_id: 'gap_0', selected_option_ids: ['none'], custom_text: '', skipped: false },
      { question_id: 'gap_1', selected_option_ids: ['not_applicable'], custom_text: '', skipped: false },
    ];

    const enriched = enrichGapAnalysis(analysis, responses, questions);
    const req = enriched.requirements.find(r => r.requirement === 'P&L ownership');
    expect(req?.classification).toBe('gap');
  });

  it('appends custom_text to evidence regardless of selected option', () => {
    const analysis = makeBaseAnalysis();
    const questions = generateGapQuestions(analysis);
    const responses: QuestionnaireResponse[] = [
      {
        question_id: 'gap_0',
        selected_option_ids: ['significant'],
        custom_text: 'Managed Kubernetes clusters at scale in AWS EKS',
        skipped: false,
      },
    ];

    const enriched = enrichGapAnalysis(analysis, responses, questions);
    const req = enriched.requirements.find(r => r.requirement === 'kubernetes');
    expect(req?.evidence.some(e => e.includes('Managed Kubernetes clusters'))).toBe(true);
  });

  it('skips enrichment for skipped questions', () => {
    const analysis = makeBaseAnalysis();
    const questions = generateGapQuestions(analysis);
    const responses: QuestionnaireResponse[] = [
      { question_id: 'gap_0', selected_option_ids: ['significant'], custom_text: '', skipped: true },
    ];

    const enriched = enrichGapAnalysis(analysis, responses, questions);
    const req = enriched.requirements.find(r => r.requirement === 'kubernetes');
    // Should remain as gap since response was skipped
    expect(req?.classification).toBe('gap');
  });

  it('recalculates coverage_score after enrichment', () => {
    const analysis = makeBaseAnalysis();
    const questions = generateGapQuestions(analysis);
    // Upgrade gap to strong and partial to strong
    const responses: QuestionnaireResponse[] = [
      { question_id: 'gap_0', selected_option_ids: ['significant'], custom_text: '', skipped: false },
      { question_id: 'gap_1', selected_option_ids: ['stronger'], custom_text: '', skipped: false },
    ];

    const enriched = enrichGapAnalysis(analysis, responses, questions);
    // Now both are strong: 2/2 * 100 = 100
    expect(enriched.coverage_score).toBe(100);
  });
});
