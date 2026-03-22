import { describe, expect, it } from 'vitest';
import { buildRewriteQueue } from '../rewrite-queue';
import type { FinalReviewResult, GapAnalysis, JobIntelligence, ResumeDraft } from '@/types/resume-v2';

function makeJobIntelligence(): JobIntelligence {
  return {
    company_name: 'TargetCo',
    role_title: 'VP Operations',
    seniority_level: 'vp',
    core_competencies: [
      {
        competency: 'Operational excellence',
        importance: 'must_have',
        evidence_from_jd: 'Drive measurable operational improvements across the network.',
      },
      {
        competency: 'Executive stakeholder communication',
        importance: 'important',
        evidence_from_jd: 'Communicate strategy and progress to senior leadership.',
      },
    ],
    strategic_responsibilities: ['Lead a multi-site network'],
    business_problems: [],
    cultural_signals: [],
    hidden_hiring_signals: [],
    language_keywords: [],
    industry: 'Manufacturing',
  };
}

function makeResume(): ResumeDraft {
  return {
    header: {
      name: 'Jane Doe',
      phone: '555-0100',
      email: 'jane@example.com',
      branded_title: 'VP Operations',
    },
    executive_summary: {
      content: 'Operator with a strong transformation track record.',
      is_new: false,
      addresses_requirements: ['Executive stakeholder communication'],
    },
    core_competencies: ['Transformation', 'P&L'],
    selected_accomplishments: [],
    professional_experience: [
      {
        company: 'Acme',
        title: 'VP Operations',
        start_date: '2020',
        end_date: 'Present',
        scope_statement: 'Led a multi-site operation.',
        bullets: [
          {
            text: 'Improved fill rate by 14%.',
            is_new: false,
            addresses_requirements: ['Operational excellence'],
          },
        ],
      },
    ],
    education: [],
    certifications: [],
  };
}

function makeFinalReviewResult(): FinalReviewResult {
  return {
    six_second_scan: {
      decision: 'continue_reading',
      reason: 'Strong operational wins are visible early.',
      top_signals_seen: [],
      important_signals_missing: [],
    },
    hiring_manager_verdict: {
      rating: 'possible_interview',
      summary: 'Credible operator, but the executive-facing story needs stronger proof.',
    },
    fit_assessment: {
      job_description_fit: 'moderate',
      benchmark_alignment: 'moderate',
      business_impact: 'strong',
      clarity_and_credibility: 'moderate',
    },
    top_wins: [],
    concerns: [
      {
        id: 'concern_1',
        severity: 'critical',
        type: 'missing_evidence',
        observation: 'Executive communication is not obvious enough.',
        why_it_hurts: 'The hiring manager may not trust the candidate in board-level settings.',
        fix_strategy: 'Add one bullet showing executive-facing communication and stakeholder alignment.',
        related_requirement: 'Executive stakeholder communication',
        requires_candidate_input: true,
        clarifying_question: 'What was the highest-level audience you presented to?',
      },
    ],
    structure_recommendations: [],
    benchmark_comparison: {
      advantages_vs_benchmark: [],
      gaps_vs_benchmark: [],
      reframing_opportunities: [],
    },
    improvement_summary: [],
  };
}

describe('rewrite-queue', () => {
  it('keeps the active queue focused on rewrite work instead of mixing in final review concerns', () => {
    const gapAnalysis: GapAnalysis = {
      requirements: [
        {
          requirement: 'Operational excellence',
          source: 'job_description',
          importance: 'must_have',
          classification: 'strong',
          evidence: ['Improved fill rate by 14%.'],
        },
        {
          requirement: 'Executive stakeholder communication',
          source: 'job_description',
          importance: 'important',
          classification: 'missing',
          evidence: [],
        },
      ],
      coverage_score: 50,
      strength_summary: 'Strong operator, but executive communication needs clearer proof.',
      critical_gaps: ['Executive stakeholder communication'],
      pending_strategies: [],
    };

    const queue = buildRewriteQueue({
      jobIntelligence: makeJobIntelligence(),
      gapAnalysis,
      currentResume: makeResume(),
      finalReviewResult: makeFinalReviewResult(),
    });

    expect(queue.items.every((item) => item.kind === 'requirement')).toBe(true);
    expect(queue.nextItem?.requirement).toBe('Executive stakeholder communication');
    expect(queue.nextItem?.category).toBe('quick_win');
    expect(queue.nextItem?.recommendedNextStep.action).toBe('answer_question');
    expect(queue.summary).toEqual({
      total: 2,
      needsAttention: 1,
      partiallyAddressed: 0,
      resolved: 1,
      hardGapCount: 0,
    });
  });

  it('marks likely credential requirements as hard gaps and ranks quick wins ahead of them', () => {
    const gapAnalysis: GapAnalysis = {
      requirements: [
        {
          requirement: 'Executive stakeholder communication',
          source: 'job_description',
          importance: 'important',
          classification: 'partial',
          evidence: ['Presented operating updates to senior leaders.'],
        },
        {
          requirement: 'Bachelor’s degree in engineering or related field',
          source: 'job_description',
          importance: 'must_have',
          classification: 'missing',
          evidence: [],
          source_evidence: 'Bachelor’s degree in engineering or related field required.',
        },
      ],
      coverage_score: 0,
      strength_summary: '',
      critical_gaps: [],
      pending_strategies: [],
    };

    const queue = buildRewriteQueue({
      jobIntelligence: makeJobIntelligence(),
      gapAnalysis,
      currentResume: makeResume(),
    });

    const hardGap = queue.items.find((item) => item.requirement?.includes('Bachelor'))!;

    expect(queue.nextItem?.requirement).toBe('Executive stakeholder communication');
    expect(hardGap.category).toBe('hard_gap');
    expect(hardGap.recommendedNextStep.action).toBe('check_hard_requirement');
    expect(hardGap.riskNote).toMatch(/real risk/i);
    expect(queue.summary.hardGapCount).toBe(1);
  });

  it('marks inferred resume lines as nearby proof instead of current mapped proof', () => {
    const gapAnalysis: GapAnalysis = {
      requirements: [
        {
          requirement: 'Executive stakeholder communication',
          source: 'job_description',
          importance: 'important',
          classification: 'missing',
          evidence: ['Presented weekly updates to senior leaders during plant turnaround meetings.'],
        },
      ],
      coverage_score: 0,
      strength_summary: '',
      critical_gaps: [],
      pending_strategies: [],
    };

    const resume = makeResume();
    resume.executive_summary.addresses_requirements = [];

    const queue = buildRewriteQueue({
      jobIntelligence: makeJobIntelligence(),
      gapAnalysis,
      currentResume: resume,
    });

    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]?.currentEvidence[0]?.basis).toBe('nearby');
    expect(queue.items[0]?.currentEvidence[0]?.section).toBeUndefined();
    expect(queue.items[0]?.userInstruction).toContain('executive-facing example');
  });

  it('tailors nearby-proof guidance for financial scope requirements', () => {
    const gapAnalysis: GapAnalysis = {
      requirements: [
        {
          requirement: 'Experience with P&L responsibility for $100M+ operations',
          source: 'job_description',
          importance: 'must_have',
          classification: 'partial',
          evidence: ['$175M combined output across multiple plants.'],
        },
      ],
      coverage_score: 0,
      strength_summary: '',
      critical_gaps: [],
      pending_strategies: [],
    };

    const queue = buildRewriteQueue({
      jobIntelligence: makeJobIntelligence(),
      gapAnalysis,
      currentResume: makeResume(),
    });

    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]?.userInstruction).toContain('financial scope');
    expect(queue.items[0]?.userInstruction).toContain('business outcome');
  });

  it('tailors nearby-proof guidance for team and organization scale requirements', () => {
    const gapAnalysis: GapAnalysis = {
      requirements: [
        {
          requirement: 'Proven track record of building and scaling marketing organizations (25+ people)',
          source: 'job_description',
          importance: 'must_have',
          classification: 'partial',
          evidence: ['Led a 28-person marketing organization.'],
        },
      ],
      coverage_score: 0,
      strength_summary: '',
      critical_gaps: [],
      pending_strategies: [],
    };

    const queue = buildRewriteQueue({
      jobIntelligence: makeJobIntelligence(),
      gapAnalysis,
      currentResume: makeResume(),
    });

    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]?.userInstruction).toContain('exact scale involved');
    expect(queue.items[0]?.userInstruction).toContain('team size');
  });

  it('tailors nearby-proof guidance for talent development and leadership pipeline requirements', () => {
    const gapAnalysis: GapAnalysis = {
      requirements: [
        {
          requirement: 'Build and develop operations leadership pipeline',
          source: 'job_description',
          importance: 'must_have',
          classification: 'partial',
          evidence: ['Developed plant managers and promoted two site leaders into regional roles.'],
        },
      ],
      coverage_score: 0,
      strength_summary: '',
      critical_gaps: [],
      pending_strategies: [],
    };

    const queue = buildRewriteQueue({
      jobIntelligence: makeJobIntelligence(),
      gapAnalysis,
      currentResume: makeResume(),
    });

    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]?.userInstruction).toContain('hired, developed, or promoted');
    expect(queue.items[0]?.userInstruction).toContain('leadership bench');
  });

  it('tailors nearby-proof guidance for multi-brand portfolio requirements', () => {
    const gapAnalysis: GapAnalysis = {
      requirements: [
        {
          requirement: 'Background in multi-brand portfolio management',
          source: 'job_description',
          importance: 'must_have',
          classification: 'partial',
          evidence: ['Led marketing organization across 3 product lines at Lakefront Consumer Products.'],
        },
      ],
      coverage_score: 0,
      strength_summary: '',
      critical_gaps: [],
      pending_strategies: [],
    };

    const queue = buildRewriteQueue({
      jobIntelligence: makeJobIntelligence(),
      gapAnalysis,
      currentResume: makeResume(),
    });

    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]?.userInstruction).toContain('brands, product lines, or categories');
    expect(queue.items[0]?.userInstruction).toContain('portfolio work');
  });

  it('tailors nearby-proof guidance for platform-scale architecture requirements', () => {
    const gapAnalysis: GapAnalysis = {
      requirements: [
        {
          requirement: 'Architect data platform components handling 2B+ daily transactions',
          source: 'job_description',
          importance: 'must_have',
          classification: 'partial',
          evidence: ['Implemented Kubernetes-based container orchestration platform serving 50M+ API requests daily.'],
        },
      ],
      coverage_score: 0,
      strength_summary: '',
      critical_gaps: [],
      pending_strategies: [],
    };

    const queue = buildRewriteQueue({
      jobIntelligence: makeJobIntelligence(),
      gapAnalysis,
      currentResume: makeResume(),
    });

    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]?.userInstruction).toContain('transaction volume, request volume, uptime, latency, or system footprint');
    expect(queue.items[0]?.userInstruction).toContain('architected at that scale');
  });

  it('tailors nearby-proof guidance for cross-functional architecture decision requirements', () => {
    const gapAnalysis: GapAnalysis = {
      requirements: [
        {
          requirement: 'Proven ability to lead cross-functional architecture decisions',
          source: 'job_description',
          importance: 'must_have',
          classification: 'partial',
          evidence: ['Led a team of 14 infrastructure and DevOps engineers.'],
        },
      ],
      coverage_score: 0,
      strength_summary: '',
      critical_gaps: [],
      pending_strategies: [],
    };

    const queue = buildRewriteQueue({
      jobIntelligence: makeJobIntelligence(),
      gapAnalysis,
      currentResume: makeResume(),
    });

    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]?.userInstruction).toContain('architecture decision');
    expect(queue.items[0]?.userInstruction).toContain('tradeoff');
    expect(queue.items[0]?.userInstruction).toContain('stakeholders');
  });

  it('does not crash when a live gap-analysis requirement omits the evidence array', () => {
    const gapAnalysis: GapAnalysis = {
      requirements: [
        {
          requirement: 'Executive stakeholder communication',
          source: 'job_description',
          importance: 'important',
          classification: 'missing',
          evidence: undefined as unknown as string[],
        },
      ],
      coverage_score: 0,
      strength_summary: '',
      critical_gaps: [],
      pending_strategies: [],
    };

    const queue = buildRewriteQueue({
      jobIntelligence: makeJobIntelligence(),
      gapAnalysis,
      currentResume: makeResume(),
    });

    expect(queue.items).toHaveLength(1);
    expect(Array.isArray(queue.items[0]?.currentEvidence)).toBe(true);
    expect(queue.items[0]?.requirement).toBe('Executive stakeholder communication');
    expect(queue.summary.total).toBe(1);
  });

  it('does not treat unrelated operational bullets as current proof for on-call and travel requirements', () => {
    const resume = makeResume();
    resume.professional_experience[0].bullets[0] = {
      text: 'Reduced operational times by 12 hours using improved equipment selection and operations techniques.',
      is_new: false,
      addresses_requirements: ['Ability to work on-call outside standard working hours and travel up to 20% of the time'],
    };

    const gapAnalysis: GapAnalysis = {
      requirements: [
        {
          requirement: 'Ability to work on-call outside standard working hours and travel up to 20% of the time',
          source: 'job_description',
          importance: 'must_have',
          classification: 'partial',
          evidence: ['Reduced operational times by 12 hours using improved equipment selection and operations techniques.'],
        },
      ],
      coverage_score: 0,
      strength_summary: '',
      critical_gaps: [],
      pending_strategies: [],
    };

    const queue = buildRewriteQueue({
      jobIntelligence: makeJobIntelligence(),
      gapAnalysis,
      currentResume: resume,
    });

    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]?.currentEvidence).toEqual([]);
    expect(queue.items[0]?.status).toBe('needs_more_evidence');
  });

  it('dedupes repeated benchmark requirements with the same normalized text', () => {
    const gapAnalysis: GapAnalysis = {
      requirements: [
        {
          requirement: 'ERP systems',
          source: 'benchmark',
          importance: 'important',
          classification: 'partial',
          evidence: ['Led ERP rollout across 3 plants.'],
        },
        {
          requirement: 'ERP systems.',
          source: 'benchmark',
          importance: 'must_have',
          classification: 'missing',
          evidence: ['Implemented SAP during operations transformation.'],
          source_evidence: 'Benchmark candidates usually show ERP leadership.',
        },
      ],
      coverage_score: 0,
      strength_summary: '',
      critical_gaps: [],
      pending_strategies: [],
    };

    const queue = buildRewriteQueue({
      jobIntelligence: makeJobIntelligence(),
      gapAnalysis,
      currentResume: makeResume(),
    });

    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]?.id).toBe('requirement:benchmark:erp systems');
    expect(queue.items[0]?.classification).toBe('missing');
    expect(queue.items[0]?.importance).toBe('must_have');
    expect(queue.items[0]?.sourceEvidence[0]?.text).toBe('Benchmark candidates usually show ERP leadership.');
    expect(queue.items[0]?.currentEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: 'Led ERP rollout across 3 plants.' }),
        expect.objectContaining({ text: 'Implemented SAP during operations transformation.' }),
      ]),
    );
  });
});
