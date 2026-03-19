import { describe, expect, it } from 'vitest';

import {
  buildFinalReviewPrompts,
  extractHardRequirementRisksFromGapAnalysis,
  extractMaterialJobFitRisksFromGapAnalysis,
  getEffectiveHardRequirementRisks,
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

  it('does not treat preferred-only qualifications as hard screen-out risks', () => {
    const prompts = buildFinalReviewPrompts({
      companyName: 'Meridian Consumer Brands',
      roleTitle: 'Chief Marketing Officer',
      resumeText: 'Transformational marketing leader with consumer growth wins.',
      jobDescription: 'MBA preferred. 15+ years of progressive marketing leadership required.',
      jobRequirements: [
        'MBA preferred',
        '15+ years of progressive marketing leadership in consumer products/CPG',
      ],
      hiddenSignals: [],
      benchmarkProfileSummary: undefined,
      benchmarkRequirements: [],
      careerProfile: null,
    });

    expect(prompts.userPrompt).toContain('15+ years of progressive marketing leadership in consumer products/CPG');
    expect(prompts.userPrompt).not.toContain('POTENTIAL HARD REQUIREMENTS / SCREEN-OUT RISKS:\n- MBA preferred');
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

  it('forces hard requirement risks to remain visible in the final verdict', () => {
    const hardRisks = extractHardRequirementRisksFromGapAnalysis({
      requirements: [
        {
          requirement: "Bachelor's degree in engineering",
          classification: 'missing',
        },
        {
          requirement: 'PE certification',
          classification: 'partial',
        },
      ],
    });

    const stabilized = stabilizeFinalReviewResult({
      six_second_scan: {
        decision: 'continue_reading',
        reason: 'Promising first pass.',
        top_signals_seen: [
          {
            signal: '17 years of drilling operations experience',
            why_it_matters: 'Shows strong operating depth.',
            visible_in_top_third: true,
          },
        ],
        important_signals_missing: [],
      },
      hiring_manager_verdict: {
        rating: 'strong_interview_candidate',
        summary: 'Strong drilling operator with compelling field depth.',
      },
      fit_assessment: {
        job_description_fit: 'strong',
        benchmark_alignment: 'moderate',
        business_impact: 'strong',
        clarity_and_credibility: 'strong',
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
    }, { hardRequirementRisks: hardRisks });

    expect(stabilized.hiring_manager_verdict.rating).toBe('possible_interview');
    expect(stabilized.concerns[0]?.severity).toBe('critical');
    expect(stabilized.concerns[0]?.related_requirement).toContain("Bachelor's degree");
    expect(stabilized.six_second_scan.important_signals_missing.some((item) => item.signal.includes("Bachelor's degree"))).toBe(true);
    expect(stabilized.hiring_manager_verdict.summary).toMatch(/screening risk|hard requirement/i);
    expect(stabilized.fit_assessment.job_description_fit).toBe('moderate');
    expect(stabilized.fit_assessment.benchmark_alignment).toBe('moderate');
    expect(stabilized.fit_assessment.clarity_and_credibility).toBe('moderate');
  });

  it('ignores preferred-only qualifications when extracting hard requirement risks', () => {
    const hardRisks = extractHardRequirementRisksFromGapAnalysis({
      requirements: [
        {
          requirement: 'MBA preferred',
          classification: 'missing',
          source: 'job_description',
        },
        {
          requirement: '15+ years of progressive marketing leadership in consumer products/CPG',
          classification: 'missing',
          source: 'job_description',
        },
      ],
    });

    expect(hardRisks).toEqual([
      '15+ years of progressive marketing leadership in consumer products/CPG',
    ]);
  });

  it('ignores benchmark-only credential gaps when extracting hard requirement risks', () => {
    const hardRisks = extractHardRequirementRisksFromGapAnalysis({
      requirements: [
        {
          requirement: 'MBA',
          classification: 'missing',
          source: 'benchmark',
        },
        {
          requirement: "Bachelor's degree in engineering",
          classification: 'missing',
          source: 'job_description',
        },
      ],
    });

    expect(hardRisks).toEqual([
      "Bachelor's degree in engineering",
    ]);
  });

  it('does not treat standalone certifications or advanced degrees as hard risks without required language', () => {
    const hardRisks = extractHardRequirementRisksFromGapAnalysis({
      requirements: [
        {
          requirement: 'APICS CSCP or CPIM certification',
          classification: 'missing',
          source: 'job_description',
        },
        {
          requirement: 'MBA',
          classification: 'missing',
          source: 'job_description',
        },
        {
          requirement: "Bachelor's degree in engineering or operations management",
          classification: 'missing',
          source: 'job_description',
        },
      ],
    });

    expect(hardRisks).toEqual([
      "Bachelor's degree in engineering or operations management",
    ]);
  });

  it('dedupes near-equivalent degree risks so the same screen-out is not counted twice', () => {
    const hardRisks = extractHardRequirementRisksFromGapAnalysis({
      requirements: [
        {
          requirement: "Bachelor's degree or higher in Chemical Engineering, Civil Engineering, Mechanical Engineering, Petroleum Engineering, other related engineering field, or foreign equivalent",
          classification: 'missing',
          source: 'job_description',
        },
        {
          requirement: "Bachelor's degree or higher in a related engineering field",
          classification: 'missing',
          source: 'job_description',
        },
      ],
    });

    expect(hardRisks).toHaveLength(1);
    expect(hardRisks[0]).toContain("Bachelor's degree");
  });

  it('dedupes generic relevant-field degree risks against the more specific engineering degree version', () => {
    const hardRisks = extractHardRequirementRisksFromGapAnalysis({
      requirements: [
        {
          requirement: "Bachelor's degree or higher in Chemical Engineering, Civil Engineering, Mechanical Engineering, Petroleum Engineering, or related field",
          classification: 'missing',
          source: 'job_description',
        },
      ],
      critical_gaps: [
        "Bachelor's degree in a relevant field",
      ],
    });

    expect(hardRisks).toHaveLength(1);
    expect(hardRisks[0]).toContain("Bachelor's degree");
  });

  it('dedupes equivalent years-threshold risks with slightly different phrasing', () => {
    const hardRisks = extractHardRequirementRisksFromGapAnalysis({
      requirements: [
        {
          requirement: '10+ years in cloud infrastructure/architecture roles',
          classification: 'missing',
          source: 'job_description',
        },
      ],
      critical_gaps: [
        '10+ years of experience in cloud infrastructure/architecture roles',
      ],
    });

    expect(hardRisks).toEqual([
      '10+ years in cloud infrastructure/architecture roles',
    ]);
  });

  it('includes explicit hard-risk critical gaps even when the requirement list is incomplete', () => {
    const hardRisks = extractHardRequirementRisksFromGapAnalysis({
      requirements: [],
      critical_gaps: [
        "Bachelor's degree in engineering or operations management",
        'Experience in PE-backed manufacturing environments',
      ],
    });

    expect(hardRisks).toEqual([
      "Bachelor's degree in engineering or operations management",
    ]);
  });

  it('ignores critical-gap years risks that are already satisfied by a strong requirement match', () => {
    const hardRisks = extractHardRequirementRisksFromGapAnalysis({
      requirements: [
        {
          requirement: '10+ years in cloud infrastructure/architecture roles',
          classification: 'strong',
          source: 'job_description',
        },
      ],
      critical_gaps: [
        '10+ years in cloud infrastructure/architecture roles',
      ],
    });

    expect(hardRisks).toEqual([]);
  });

  it('does not let preferred-only critical gaps re-enter as hard risks', () => {
    const hardRisks = extractHardRequirementRisksFromGapAnalysis({
      requirements: [
        {
          requirement: 'MBA preferred',
          classification: 'missing',
          source: 'job_description',
        },
      ],
      critical_gaps: ['MBA'],
    });

    expect(hardRisks).toEqual([]);
  });

  it('does not let benchmark-only credential gaps re-enter as hard risks through critical gaps', () => {
    const hardRisks = extractHardRequirementRisksFromGapAnalysis({
      requirements: [
        {
          requirement: 'MBA',
          classification: 'missing',
          source: 'benchmark',
        },
      ],
      critical_gaps: ['MBA'],
    });

    expect(hardRisks).toEqual([]);
  });

  it('keeps mixed required-plus-preferred degree strings as hard risks when the required degree is still missing', () => {
    const hardRisks = extractHardRequirementRisksFromGapAnalysis({
      requirements: [
        {
          requirement: "Bachelor's degree in engineering or operations management; MBA or MS preferred",
          classification: 'missing',
          source: 'job_description',
        },
      ],
      critical_gaps: ["Bachelor's degree in engineering or operations management"],
    });

    expect(hardRisks).toEqual([
      "Bachelor's degree in engineering or operations management",
    ]);
  });

  it('suppresses years-threshold risks when final review already shows sufficient years of experience', () => {
    const result: Parameters<typeof stabilizeFinalReviewResult>[0] = {
      six_second_scan: {
        decision: 'continue_reading',
        reason: 'Strong first impression.',
        top_signals_seen: [
          {
            signal: '12 years of experience driving cloud infrastructure strategy',
            why_it_matters: 'Clears the years threshold.',
            visible_in_top_third: true,
          },
        ],
        important_signals_missing: [],
      },
      hiring_manager_verdict: {
        rating: 'possible_interview',
        summary: 'Strong cloud architect with 12 years of experience in cloud infrastructure and architecture.',
      },
      fit_assessment: {
        job_description_fit: 'strong',
        benchmark_alignment: 'strong',
        business_impact: 'strong',
        clarity_and_credibility: 'strong',
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
    };
    const effectiveRisks = getEffectiveHardRequirementRisks(result, ['10+ years in cloud infrastructure/architecture roles']);
    const stabilized = stabilizeFinalReviewResult(result, { hardRequirementRisks: ['10+ years in cloud infrastructure/architecture roles'] });

    expect(effectiveRisks).toEqual([]);
    expect(stabilized.concerns.some((concern) => concern.id === 'hard_requirement_risk')).toBe(false);
    expect(stabilized.six_second_scan.important_signals_missing.some((item) => item.signal.includes('10+ years'))).toBe(false);
    expect(stabilized.fit_assessment.job_description_fit).toBe('strong');
  });

  it('caps fit-assessment optimism when a single hard requirement risk remains', () => {
    const stabilized = stabilizeFinalReviewResult({
      six_second_scan: {
        decision: 'continue_reading',
        reason: 'Promising first pass.',
        top_signals_seen: [
          {
            signal: '$180M revenue growth experience',
            why_it_matters: 'Demonstrates commercial impact.',
            visible_in_top_third: true,
          },
        ],
        important_signals_missing: [],
      },
      hiring_manager_verdict: {
        rating: 'possible_interview',
        summary: 'Strong consumer marketing leader with meaningful growth wins.',
      },
      fit_assessment: {
        job_description_fit: 'strong',
        benchmark_alignment: 'strong',
        business_impact: 'strong',
        clarity_and_credibility: 'strong',
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
    }, { hardRequirementRisks: ['MBA'] });

    expect(stabilized.hiring_manager_verdict.rating).toBe('possible_interview');
    expect(stabilized.fit_assessment.job_description_fit).toBe('moderate');
    expect(stabilized.fit_assessment.benchmark_alignment).toBe('moderate');
    expect(stabilized.fit_assessment.business_impact).toBe('strong');
    expect(stabilized.fit_assessment.clarity_and_credibility).toBe('moderate');
  });

  it('drops contradicted years-threshold risks after stabilization adds positive recruiter signals from the summary', () => {
    const stabilized = stabilizeFinalReviewResult({
      six_second_scan: {
        decision: 'continue_reading',
        reason: '',
        top_signals_seen: [],
        important_signals_missing: [],
      },
      hiring_manager_verdict: {
        rating: 'possible_interview',
        summary: 'Strong cloud architect with 12 years of experience in cloud infrastructure and architecture.',
      },
      fit_assessment: {
        job_description_fit: 'strong',
        benchmark_alignment: 'strong',
        business_impact: 'strong',
        clarity_and_credibility: 'strong',
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
    }, { hardRequirementRisks: ['10+ years in cloud infrastructure/architecture roles'] });

    expect(stabilized.concerns.some((concern) => concern.id === 'hard_requirement_risk')).toBe(false);
    expect(stabilized.six_second_scan.important_signals_missing.some((item) => item.signal.includes('10+ years'))).toBe(false);
    expect(stabilized.fit_assessment.job_description_fit).toBe('strong');
  });

  it('extracts material must-have job-fit risks from partial threshold gaps without treating them as hard credentials', () => {
    const risks = extractMaterialJobFitRisksFromGapAnalysis({
      requirements: [
        {
          requirement: 'Build and lead a 40+ person marketing organization',
          source: 'job_description',
          importance: 'must_have',
          classification: 'partial',
        },
        {
          requirement: 'MBA preferred',
          source: 'job_description',
          importance: 'nice_to_have',
          classification: 'missing',
        },
      ],
    });

    expect(risks).toEqual(['Build and lead a 40+ person marketing organization']);
  });

  it('caps final-review optimism when material must-have job-fit risks remain after gap analysis fallback', () => {
    const stabilized = stabilizeFinalReviewResult({
      six_second_scan: {
        decision: 'continue_reading',
        reason: 'Promising first pass.',
        top_signals_seen: [
          {
            signal: 'Built a high-growth marketing function across multiple channels',
            why_it_matters: 'Shows leadership and breadth.',
            visible_in_top_third: true,
          },
        ],
        important_signals_missing: [],
      },
      hiring_manager_verdict: {
        rating: 'strong_interview_candidate',
        summary: 'Compelling senior marketing leader with visible growth wins.',
      },
      fit_assessment: {
        job_description_fit: 'strong',
        benchmark_alignment: 'strong',
        business_impact: 'strong',
        clarity_and_credibility: 'strong',
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
    }, {
      materialJobFitRisks: [
        'Build and lead a 40+ person marketing organization',
        'Experience managing $20M+ marketing budgets with P&L accountability',
      ],
    });

    expect(stabilized.hiring_manager_verdict.rating).toBe('needs_improvement');
    expect(stabilized.fit_assessment.job_description_fit).toBe('weak');
    expect(stabilized.concerns[0]?.id).toBe('material_job_fit_risk');
    expect(stabilized.six_second_scan.important_signals_missing.some((item) => item.signal.includes('40+ person marketing organization'))).toBe(true);
  });

  it('softens a single aggregated material job-fit concern when the recruiter still has clear positive signals', () => {
    const stabilized = stabilizeFinalReviewResult({
      six_second_scan: {
        decision: 'continue_reading',
        reason: 'Strong first impression.',
        top_signals_seen: [
          {
            signal: '12 years of experience driving cloud strategy and execution',
            why_it_matters: 'Shows relevant seniority and scope.',
            visible_in_top_third: true,
          },
          {
            signal: '35% reduction in hosting costs through cloud migration',
            why_it_matters: 'Shows concrete cloud impact.',
            visible_in_top_third: true,
          },
        ],
        important_signals_missing: [],
      },
      hiring_manager_verdict: {
        rating: 'needs_improvement',
        summary: 'The candidate has a strong background in cloud infrastructure and architecture, with achievements in cloud cost reduction and Kubernetes implementation.',
      },
      fit_assessment: {
        job_description_fit: 'weak',
        benchmark_alignment: 'strong',
        business_impact: 'strong',
        clarity_and_credibility: 'weak',
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
    }, {
      materialJobFitRisks: [
        'Experience architecting for regulated industries (financial services or healthcare)',
        'Knowledge of compliance frameworks: SOC 2, HIPAA, or PCI-DSS',
      ],
    });

    expect(stabilized.hiring_manager_verdict.rating).toBe('possible_interview');
    expect(stabilized.concerns[0]?.id).toBe('material_job_fit_risk');
    expect(stabilized.concerns[0]?.severity).toBe('moderate');
    expect(stabilized.fit_assessment.job_description_fit).toBe('moderate');
    expect(stabilized.fit_assessment.clarity_and_credibility).toBe('moderate');
  });

  it('drops material must-have risks when stronger recruiter evidence already proves the financial threshold', () => {
    const stabilized = stabilizeFinalReviewResult({
      six_second_scan: {
        decision: 'continue_reading',
        reason: 'Strong first impression.',
        top_signals_seen: [
          {
            signal: 'Multi-site operations management experience with $175M P&L oversight',
            why_it_matters: 'Shows large-scale financial ownership.',
            visible_in_top_third: true,
          },
        ],
        important_signals_missing: [],
      },
      hiring_manager_verdict: {
        rating: 'possible_interview',
        summary: 'Strong manufacturing operator with visible multi-site scale and financial oversight.',
      },
      fit_assessment: {
        job_description_fit: 'moderate',
        benchmark_alignment: 'strong',
        business_impact: 'strong',
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
    }, {
      materialJobFitRisks: [
        'Experience with P&L responsibility for $100M+ operations',
      ],
    });

    expect(stabilized.concerns.some((concern) => concern.id === 'material_job_fit_risk')).toBe(false);
    expect(stabilized.six_second_scan.important_signals_missing.some((item) => item.signal.includes('$100M+ operations'))).toBe(false);
    expect(stabilized.hiring_manager_verdict.rating).toBe('possible_interview');
  });

  it('softens preferred-qualification missing-signal language so it is not treated like a screen-out risk', () => {
    const stabilized = stabilizeFinalReviewResult({
      six_second_scan: {
        decision: 'continue_reading',
        reason: 'Solid first impression.',
        top_signals_seen: [
          {
            signal: '18 years of manufacturing leadership',
            why_it_matters: 'Shows strong operations depth.',
            visible_in_top_third: true,
          },
        ],
        important_signals_missing: [
          {
            signal: 'APICS CSCP or CPIM certification',
            why_it_matters: 'Lack of this certification may be a screen-out risk, as it is a preferred qualification for the role',
          },
        ],
      },
      hiring_manager_verdict: {
        rating: 'possible_interview',
        summary: 'Strong manufacturing operator with good scale.',
      },
      fit_assessment: {
        job_description_fit: 'moderate',
        benchmark_alignment: 'moderate',
        business_impact: 'strong',
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

    expect(stabilized.six_second_scan.important_signals_missing[0]?.why_it_matters).toContain('competitive disadvantage');
    expect(stabilized.six_second_scan.important_signals_missing[0]?.why_it_matters).not.toContain('screen-out risk');
  });
});
