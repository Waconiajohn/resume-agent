import { describe, it, expect } from 'vitest';
import { buildRewriteQueue } from '../rewrite-queue';
import type { CoachingThreadSnapshot, FinalReviewResult, GapAnalysis, JobIntelligence, ResumeDraft } from '@/types/resume-v2';

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

function makeGapAnalysis(): GapAnalysis {
  return {
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
  it('prioritizes unresolved critical final-review concerns ahead of requirements and summarizes queue counts', () => {
    const queue = buildRewriteQueue({
      jobIntelligence: makeJobIntelligence(),
      gapAnalysis: makeGapAnalysis(),
      currentResume: makeResume(),
      finalReviewResult: makeFinalReviewResult(),
      resolvedFinalReviewConcernIds: [],
      gapChatSnapshot: {
        items: {
          'executive stakeholder communication': {
            messages: [],
            resolvedLanguage: 'Presented weekly operating reviews to the executive team.',
            error: null,
          },
        },
      } satisfies CoachingThreadSnapshot,
    });

    expect(queue.nextItem?.kind).toBe('final_review');
    expect(queue.nextItem?.concernId).toBe('concern_1');
    expect(queue.items[0].status).toBe('needs_more_evidence');
    expect(queue.items.find((item) => item.requirement === 'Operational excellence')?.status).toBe('already_covered');
    expect(queue.items.find((item) => item.requirement === 'Executive stakeholder communication')?.status).toBe('partially_addressed');
    expect(queue.summary).toEqual({
      total: 3,
      needsAttention: 1,
      partiallyAddressed: 1,
      resolved: 1,
    });
  });

  it('moves final-review concerns into the resolved bucket after the accepted edit is marked resolved', () => {
    const queue = buildRewriteQueue({
      jobIntelligence: makeJobIntelligence(),
      gapAnalysis: makeGapAnalysis(),
      currentResume: makeResume(),
      finalReviewResult: makeFinalReviewResult(),
      resolvedFinalReviewConcernIds: ['concern_1'],
    });

    const concern = queue.items.find((item) => item.concernId === 'concern_1');
    expect(concern?.status).toBe('already_covered');
    expect(concern?.bucket).toBe('resolved');
  });
});
