import { describe, expect, it } from 'vitest';

import {
  buildFinalReviewPrompts,
  stabilizeFinalReviewResult,
} from '../routes/resume-v2-pipeline-support.js';

describe('resume-v2 final review prompts', () => {
  it('surfaces hard requirements as explicit screen-out risks in the final review prompt', () => {
    const prompts = buildFinalReviewPrompts({
      companyName: 'Acme Energy',
      roleTitle: 'Senior Drilling Engineer',
      resumeText: 'Operations leader with drilling optimization experience.',
      jobDescription: 'Bachelor’s degree in engineering required. Optimize drilling performance.',
      jobRequirements: [
        'Bachelor’s degree in Chemical Engineering or related field required',
        'Optimize drilling performance by analyzing drilling data',
      ],
      hiddenSignals: ['Needs someone who can support field operations daily'],
      benchmarkProfileSummary: 'Strong drilling engineer with field depth and optimization wins.',
      benchmarkRequirements: ['Project management', 'Wellsite communication'],
      careerProfile: null,
    });

    expect(prompts.systemPrompt).toContain('call that out directly as a screen-out risk');
    expect(prompts.systemPrompt).toContain('Hard requirements that are not clearly evidenced should be elevated as real screening risks.');
    expect(prompts.systemPrompt).toContain('Every positive claim must point to specific resume evidence');
    expect(prompts.systemPrompt).toContain('Avoid vague statements like "clear executive summary"');
    expect(prompts.userPrompt).toContain('POTENTIAL HARD REQUIREMENTS / SCREEN-OUT RISKS');
    expect(prompts.userPrompt).toContain('Bachelor’s degree in Chemical Engineering or related field required');
  });

  it('omits the hard-requirements block when the job requirements are normal proof-building items', () => {
    const prompts = buildFinalReviewPrompts({
      companyName: 'Acme SaaS',
      roleTitle: 'VP Operations',
      resumeText: 'Operator with scale and stakeholder management experience.',
      jobDescription: 'Drive network excellence and communicate to senior leadership.',
      jobRequirements: [
        'Drive measurable operational improvements across the network',
        'Communicate strategy and progress to senior leadership',
      ],
      hiddenSignals: [],
      benchmarkProfileSummary: undefined,
      benchmarkRequirements: [],
      careerProfile: null,
    });

    expect(prompts.userPrompt).not.toContain('POTENTIAL HARD REQUIREMENTS / SCREEN-OUT RISKS');
  });

  it('stabilizes contradictory recruiter-scan output using the stronger final-review signals', () => {
    const stabilized = stabilizeFinalReviewResult({
      six_second_scan: {
        decision: 'skip',
        reason: 'Mixed first impression.',
        top_signals_seen: [],
        important_signals_missing: [],
      },
      hiring_manager_verdict: {
        rating: 'possible_interview',
        summary: 'Strong operator with enough evidence to keep in the funnel.',
      },
      fit_assessment: {
        job_description_fit: 'strong',
        benchmark_alignment: 'moderate',
        business_impact: 'strong',
        clarity_and_credibility: 'moderate',
      },
      top_wins: [
        {
          win: 'Delivered $14.2M in cost savings across 3 facilities',
          why_powerful: 'Shows scale, impact, and multi-site leadership.',
          aligned_requirement: 'Operational excellence',
          prominent_enough: true,
          repositioning_recommendation: 'Keep this high on page one.',
        },
      ],
      concerns: [
        {
          id: 'concern_1',
          severity: 'moderate',
          type: 'missing_evidence',
          observation: 'Board communication depth is thin.',
          why_it_hurts: 'The hiring manager may want clearer executive-facing proof.',
          fix_strategy: 'Add one bullet showing executive communication.',
          requires_candidate_input: true,
        },
      ],
      structure_recommendations: [],
      benchmark_comparison: {
        advantages_vs_benchmark: [],
        gaps_vs_benchmark: [],
        reframing_opportunities: [],
      },
      improvement_summary: [],
    });

    expect(stabilized.six_second_scan.decision).toBe('continue_reading');
    expect(stabilized.six_second_scan.top_signals_seen[0]?.signal).toContain('$14.2M');
    expect(stabilized.six_second_scan.important_signals_missing[0]?.signal).toContain('Board communication');
  });

  it('derives a recruiter signal from a positive summary when the model omits top wins', () => {
    const stabilized = stabilizeFinalReviewResult({
      six_second_scan: {
        decision: 'skip',
        reason: 'Mixed first impression.',
        top_signals_seen: [],
        important_signals_missing: [],
      },
      hiring_manager_verdict: {
        rating: 'needs_improvement',
        summary: 'The candidate has a strong background in cloud migration, cost optimization, and team leadership.',
      },
      fit_assessment: {
        job_description_fit: 'moderate',
        benchmark_alignment: 'moderate',
        business_impact: 'moderate',
        clarity_and_credibility: 'moderate',
      },
      top_wins: [],
      concerns: [],
      structure_recommendations: [],
      benchmark_comparison: {
        advantages_vs_benchmark: [],
        gaps_vs_benchmark: [],
        reframing_opportunities: [],
      },
      improvement_summary: [],
    });

    expect(stabilized.six_second_scan.top_signals_seen).toHaveLength(1);
    expect(stabilized.six_second_scan.top_signals_seen[0]?.signal).toContain('strong background');
    expect(stabilized.six_second_scan.decision).toBe('continue_reading');
  });
});
