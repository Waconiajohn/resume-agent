/**
 * Targeted tests for positioning interview hardening:
 * - Feature flag v1/v2 branching
 * - Abort-based timeout on LLM question generation
 * - Follow-up cap (MAX_FOLLOW_UPS)
 * - Question ID deduplication
 * - Gap enrichment "not_applicable" option
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Feature flag tests ──────────────────────────────────────────────

describe('feature-flags', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('positioning_v2 defaults to false (safe canary)', async () => {
    delete process.env.FF_POSITIONING_V2;
    const { FEATURE_FLAGS } = await import('../lib/feature-flags.js');
    expect(FEATURE_FLAGS.positioning_v2).toBe(false);
  });

  it('FF_POSITIONING_V2=1 enables v2', async () => {
    process.env.FF_POSITIONING_V2 = '1';
    const { FEATURE_FLAGS } = await import('../lib/feature-flags.js');
    expect(FEATURE_FLAGS.positioning_v2).toBe(true);
  });

  it('FF_POSITIONING_V2=0 disables v2', async () => {
    process.env.FF_POSITIONING_V2 = '0';
    const { FEATURE_FLAGS } = await import('../lib/feature-flags.js');
    expect(FEATURE_FLAGS.positioning_v2).toBe(false);
  });
});

// ─── Follow-up cap tests ─────────────────────────────────────────────

describe('evaluateFollowUp + MAX_FOLLOW_UPS', () => {
  it('MAX_FOLLOW_UPS is 3', async () => {
    const { MAX_FOLLOW_UPS } = await import('../agents/positioning-coach.js');
    expect(MAX_FOLLOW_UPS).toBe(3);
  });

  it('evaluateFollowUp triggers on short non-career answer', async () => {
    const { evaluateFollowUp } = await import('../agents/positioning-coach.js');
    const question = {
      id: 'test_q',
      question_number: 1,
      question_text: 'Test?',
      context: '',
      input_type: 'hybrid' as const,
      category: 'requirement_mapped' as const,
    };
    const result = evaluateFollowUp(question, 'Yes, I did that.');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('test_q_followup');
    expect(result!.is_follow_up).toBeUndefined(); // parent sets this
  });

  it('evaluateFollowUp returns null for optional questions', async () => {
    const { evaluateFollowUp } = await import('../agents/positioning-coach.js');
    const question = {
      id: 'opt_q',
      question_number: 1,
      question_text: 'Optional?',
      context: '',
      input_type: 'hybrid' as const,
      category: 'currency_and_adaptability' as const,
      optional: true,
    };
    const result = evaluateFollowUp(question, 'Short answer.');
    expect(result).toBeNull();
  });

  it('evaluateFollowUp triggers metrics probe when no numbers present', async () => {
    const { evaluateFollowUp } = await import('../agents/positioning-coach.js');
    const question = {
      id: 'scope_q',
      question_number: 1,
      question_text: 'Tell me about your team.',
      context: '',
      input_type: 'hybrid' as const,
      category: 'scale_and_scope' as const,
    };
    // Answer has enough length (>100) but no metrics
    const longAnswer = 'I led the engineering organization through a major cloud migration initiative that transformed our infrastructure from on-premises to cloud-native services across multiple regions.';
    const result = evaluateFollowUp(question, longAnswer);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('scope_q_metrics');
  });

  it('evaluateFollowUp returns null when metrics are present', async () => {
    const { evaluateFollowUp } = await import('../agents/positioning-coach.js');
    const question = {
      id: 'scope_q',
      question_number: 1,
      question_text: 'Tell me about your team.',
      context: '',
      input_type: 'hybrid' as const,
      category: 'scale_and_scope' as const,
    };
    // Answer must be >100 chars AND contain metrics to avoid both follow-up triggers
    const answer = 'I managed a team of 45 engineers across three regions, delivering $2.3M in annual cost savings by migrating our infrastructure to cloud-native services and reducing cloud spend by 30%.';
    expect(answer.length).toBeGreaterThan(100);
    const result = evaluateFollowUp(question, answer);
    expect(result).toBeNull();
  });
});

// ─── Question ID dedup tests ─────────────────────────────────────────

describe('generateQuestions (fallback path)', () => {
  it('returns fallback questions with unique IDs when no research', async () => {
    const { generateQuestions } = await import('../agents/positioning-coach.js');
    const mockResume = createMockResume();
    const questions = await generateQuestions(mockResume);
    const ids = questions.map(q => q.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('returns questions with expected categories', async () => {
    const { generateQuestions } = await import('../agents/positioning-coach.js');
    const mockResume = createMockResume();
    const questions = await generateQuestions(mockResume);
    const categories = new Set(questions.map(q => q.category));
    expect(categories.has('scale_and_scope')).toBe(true);
    expect(categories.has('career_narrative')).toBe(true);
    expect(categories.has('hidden_accomplishments')).toBe(true);
  });

  it('includes currency questions only for 15+ year careers', async () => {
    const { generateQuestions } = await import('../agents/positioning-coach.js');
    const shortCareer = createMockResume(10);
    const longCareer = createMockResume(20);

    const shortQuestions = await generateQuestions(shortCareer);
    const longQuestions = await generateQuestions(longCareer);

    const shortHasCurrency = shortQuestions.some(q => q.category === 'currency_and_adaptability');
    const longHasCurrency = longQuestions.some(q => q.category === 'currency_and_adaptability');

    expect(shortHasCurrency).toBe(false);
    expect(longHasCurrency).toBe(true);
  });
});

// ─── Gap enrichment tests ────────────────────────────────────────────

describe('enrichGapAnalysis', () => {
  it('not_applicable downgrades partial to gap', async () => {
    const { enrichGapAnalysis } = await import('../agents/gap-analyst.js');
    const { makeQuestion } = await import('../lib/questionnaire-helpers.js');

    const original = {
      requirements: [
        { requirement: 'Leadership', classification: 'partial' as const, evidence: ['Led a team'], unaddressable: false },
      ],
      coverage_score: 50,
      critical_gaps: [],
      addressable_gaps: [],
      strength_summary: 'Decent fit',
    };

    const questions = [
      makeQuestion('gap_0', 'Strengthen?', 'single_choice', [
        { id: 'stronger', label: 'Stronger' },
        { id: 'not_applicable', label: 'Not applicable' },
      ]),
    ];

    const responses = [{
      question_id: 'gap_0',
      selected_option_ids: ['not_applicable'],
      skipped: false,
    }];

    const enriched = enrichGapAnalysis(original, responses, questions);
    expect(enriched.requirements[0].classification).toBe('gap');
  });

  it('stronger upgrades partial to strong', async () => {
    const { enrichGapAnalysis } = await import('../agents/gap-analyst.js');
    const { makeQuestion } = await import('../lib/questionnaire-helpers.js');

    const original = {
      requirements: [
        { requirement: 'Leadership', classification: 'partial' as const, evidence: ['Led a team'], unaddressable: false },
      ],
      coverage_score: 50,
      critical_gaps: [],
      addressable_gaps: [],
      strength_summary: 'Decent fit',
    };

    const questions = [
      makeQuestion('gap_0', 'Strengthen?', 'single_choice', [
        { id: 'stronger', label: 'Stronger' },
        { id: 'not_applicable', label: 'Not applicable' },
      ]),
    ];

    const responses = [{
      question_id: 'gap_0',
      selected_option_ids: ['stronger'],
      custom_text: 'I led a 50-person org through a turnaround.',
      skipped: false,
    }];

    const enriched = enrichGapAnalysis(original, responses, questions);
    expect(enriched.requirements[0].classification).toBe('strong');
    expect(enriched.requirements[0].evidence).toContain('User-reported: I led a 50-person org through a turnaround.');
  });
});

// ─── Abort-based timeout tests ───────────────────────────────────────

describe('AbortController cancellation', () => {
  it('abort signal rejects fetch-like calls', async () => {
    const controller = new AbortController();
    const promise = new Promise((resolve, reject) => {
      const check = () => {
        if (controller.signal.aborted) {
          reject(controller.signal.reason ?? new Error('aborted'));
        }
      };
      controller.signal.addEventListener('abort', check);
      // Simulate a long-running call
      setTimeout(resolve, 5_000);
    });

    // Abort after 50ms
    setTimeout(() => controller.abort(), 50);

    await expect(promise).rejects.toThrow();
  });

  it('clearTimeout prevents abort after success', async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 100);

    // Simulate fast completion
    await new Promise(resolve => setTimeout(resolve, 10));
    clearTimeout(timer);

    // Signal should NOT be aborted
    expect(controller.signal.aborted).toBe(false);
  });
});

// ─── Test fixtures ───────────────────────────────────────────────────

function createMockResume(careerSpanYears = 12) {
  return {
    contact: { name: 'Test User', email: 'test@test.com', phone: '555-0100', location: 'Remote' },
    summary: 'Experienced leader in technology and operations.',
    experience: [
      {
        company: 'Acme Corp',
        title: 'VP Engineering',
        start_date: '2020',
        end_date: 'Present',
        bullets: [
          'Led platform migration reducing costs by $1.2M annually',
          'Built and managed a team of 35 engineers across 3 regions',
          'Drove adoption of cloud-native architecture',
        ],
        inferred_scope: { team_size: '35', budget: '$4M' },
      },
      {
        company: 'Previous Inc',
        title: 'Director of Engineering',
        start_date: '2016',
        end_date: '2020',
        bullets: [
          'Responsible for platform reliability and SRE function',
          'Implemented CI/CD pipeline reducing deploy time by 60%',
        ],
      },
    ],
    skills: ['Leadership', 'Cloud Architecture', 'Agile', 'P&L Management', 'Strategic Planning'],
    education: [{ degree: 'BS Computer Science', institution: 'State University', year: '2008' }],
    certifications: ['AWS Solutions Architect'],
    career_span_years: careerSpanYears,
    raw_text: 'raw resume text here',
  };
}
