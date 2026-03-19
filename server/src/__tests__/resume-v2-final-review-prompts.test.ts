import { describe, expect, it } from 'vitest';

import {
  buildFinalReviewPrompts,
  extractHardRequirementRisksFromGapAnalysis,
  extractMaterialJobFitRisksFromGapAnalysis,
  finalReviewResultSchema,
  getEffectiveHardRequirementRisks,
  stabilizeFinalReviewResult,
} from '../routes/resume-v2-pipeline-support.js';

describe('resume-v2 final review prompts', () => {
  it('surfaces hard requirements as explicit screen-out risks in the final review prompt', () => {
    const prompts = buildFinalReviewPrompts({
      companyName: 'Northstar Manufacturing',
      roleTitle: 'Director of Manufacturing Engineering',
      resumeText: 'Operations leader with manufacturing optimization experience.',
      jobDescription: 'Bachelor’s degree in engineering required. Optimize plant performance through process data.',
      jobRequirements: [
        'Bachelor’s degree in Industrial Engineering or related field required',
        'Optimize plant performance by analyzing production and process data',
      ],
      hiddenSignals: ['Needs someone who can support plant leaders with daily operational guidance'],
      benchmarkProfileSummary: 'Strong manufacturing engineering leader with plant optimization wins.',
      benchmarkRequirements: ['Project management', 'Plant-floor communication'],
      careerProfile: null,
    });

    expect(prompts.systemPrompt).toContain('call that out directly as a screen-out risk');
    expect(prompts.systemPrompt).toContain('Hard requirements that are not clearly evidenced should be elevated as real screening risks.');
    expect(prompts.systemPrompt).toContain('Every positive claim must point to specific resume evidence');
    expect(prompts.systemPrompt).toContain('Avoid vague statements like "clear executive summary"');
    expect(prompts.systemPrompt).toContain('If proof is missing, omit suggested_resume_edit and ask a clarifying question instead of inventing new experience, training, or certifications.');
    expect(prompts.userPrompt).toContain('POTENTIAL HARD REQUIREMENTS / SCREEN-OUT RISKS');
    expect(prompts.userPrompt).toContain('Bachelor’s degree in Industrial Engineering or related field required');
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
            signal: '18 years of multi-site operations leadership',
            why_it_matters: 'Shows strong operating depth.',
            visible_in_top_third: true,
          },
        ],
        important_signals_missing: [],
      },
      hiring_manager_verdict: {
        rating: 'strong_interview_candidate',
        summary: 'Strong operations executive with compelling scale and execution depth.',
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
          requirement: "Bachelor's degree or higher in Industrial Engineering, Mechanical Engineering, Operations Management, or related field",
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
          requirement: "Bachelor's degree or higher in Industrial Engineering, Mechanical Engineering, Operations Management, or related field",
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

  it('removes contradicted years-threshold concerns when stronger evidence already proves the requirement', () => {
    const stabilized = stabilizeFinalReviewResult({
      six_second_scan: {
        decision: 'continue_reading',
        reason: 'Strong first impression.',
        top_signals_seen: [
          {
            signal: '18 years of progressive operations/manufacturing leadership',
            why_it_matters: 'Clears the seniority threshold.',
            visible_in_top_third: true,
          },
        ],
        important_signals_missing: [
          {
            signal: 'Direct mention of 15+ years of progressive operations/manufacturing leadership',
            why_it_matters: 'This is a hard requirement for the job, and its absence may raise concerns',
          },
        ],
      },
      hiring_manager_verdict: {
        rating: 'possible_interview',
        summary: 'The candidate has a strong background in operations leadership. However, the candidate\'s experience is slightly shorter than the required 15+ years, which may be a concern.',
      },
      fit_assessment: {
        job_description_fit: 'moderate',
        benchmark_alignment: 'strong',
        business_impact: 'strong',
        clarity_and_credibility: 'moderate',
      },
      top_wins: [],
      concerns: [
        {
          id: 'concern_1',
          severity: 'moderate',
          type: 'missing_evidence',
          observation: 'The candidate\'s experience is slightly shorter than the required 15+ years',
          why_it_hurts: 'This may raise concerns about the candidate\'s ability to meet the job\'s requirements',
          target_section: 'Professional Experience',
          related_requirement: '15+ years of progressive operations/manufacturing leadership',
          fix_strategy: 'Add earlier career detail if needed.',
          requires_candidate_input: true,
          clarifying_question: 'Can you provide earlier experience?',
        },
      ],
      structure_recommendations: [],
      benchmark_comparison: {
        advantages_vs_benchmark: [],
        gaps_vs_benchmark: [],
        reframing_opportunities: [],
      },
      improvement_summary: [
        'Add a statement to address the 15+ year experience requirement',
      ],
    });

    expect(stabilized.six_second_scan.important_signals_missing).toHaveLength(0);
    expect(stabilized.concerns).toHaveLength(0);
    expect(stabilized.improvement_summary).toHaveLength(0);
    expect(stabilized.hiring_manager_verdict.summary).not.toContain('slightly shorter than the required 15+ years');
  });

  it('uses the drafted resume text to clear years-threshold hard risks the reviewer failed to echo', () => {
    const stabilized = stabilizeFinalReviewResult({
      six_second_scan: {
        decision: 'continue_reading',
        reason: 'Strong first impression.',
        top_signals_seen: [
          {
            signal: 'Reduced hosting costs by 35% through cloud migration',
            why_it_matters: 'Shows strong cloud impact.',
            visible_in_top_third: true,
          },
        ],
        important_signals_missing: [],
      },
      hiring_manager_verdict: {
        rating: 'possible_interview',
        summary: 'Strong cloud architect with meaningful platform scale and cloud cost optimization.',
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
      hardRequirementRisks: ['10+ years in cloud infrastructure/architecture roles'],
      resumeText: 'Senior Cloud Architect\n12 years in cloud infrastructure/architecture roles driving enterprise modernization.',
    });

    expect(stabilized.concerns.some((concern) => concern.id === 'hard_requirement_risk')).toBe(false);
    expect(stabilized.six_second_scan.important_signals_missing.some((item) => item.signal.includes('10+ years'))).toBe(false);
    expect(stabilized.hiring_manager_verdict.rating).toBe('possible_interview');
  });

  it('uses the drafted resume text to clear degree hard risks when the credential is explicit', () => {
    const stabilized = stabilizeFinalReviewResult({
      six_second_scan: {
        decision: 'continue_reading',
        reason: 'Strong manufacturing background and solid operational wins.',
        top_signals_seen: [
          {
            signal: '18 years of experience in manufacturing and operations leadership',
            why_it_matters: 'Shows deep operations tenure.',
            visible_in_top_third: true,
          },
        ],
        important_signals_missing: [],
      },
      hiring_manager_verdict: {
        rating: 'possible_interview',
        summary: 'Strong operations executive with meaningful scale and process discipline.',
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
    }, {
      hardRequirementRisks: [
        "Bachelor's degree or higher in Industrial Engineering, Mechanical Engineering, Operations Management, or related field",
      ],
      resumeText: 'EDUCATION\nBachelor of Science in Industrial Engineering, Georgia Institute of Technology',
    });

    expect(stabilized.concerns.some((concern) => concern.id === 'hard_requirement_risk')).toBe(false);
    expect(stabilized.six_second_scan.important_signals_missing.some((item) => item.signal.includes("Bachelor's degree"))).toBe(false);
    expect(stabilized.hiring_manager_verdict.summary).not.toMatch(/screening risk|not clearly evidenced/i);
  });

  it('treats alternative degree branches as satisfied when one valid field is explicit in the draft', () => {
    const stabilized = stabilizeFinalReviewResult({
      six_second_scan: {
        decision: 'continue_reading',
        reason: 'Strong operations leadership and execution background.',
        top_signals_seen: [
          {
            signal: '18 years of progressive operations/manufacturing leadership',
            why_it_matters: 'Shows the required leadership tenure.',
            visible_in_top_third: true,
          },
        ],
        important_signals_missing: [],
      },
      hiring_manager_verdict: {
        rating: 'possible_interview',
        summary: 'Strong operations executive with meaningful cost savings and multi-site leadership.',
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
    }, {
      hardRequirementRisks: [
        "Bachelor's degree in engineering or operations management",
      ],
      resumeText: 'EDUCATION\nM.S. Industrial Engineering, Texas A&M University\nB.S. Mechanical Engineering, Ohio State University',
    });

    expect(stabilized.concerns.some((concern) => concern.id === 'hard_requirement_risk')).toBe(false);
    expect(stabilized.six_second_scan.important_signals_missing.some((item) => item.signal.includes("Bachelor's degree"))).toBe(false);
    expect(stabilized.hiring_manager_verdict.summary).not.toMatch(/screening risk|not clearly evidenced/i);
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

  it('does not treat travel availability as a resume-based material job-fit risk', () => {
    const risks = extractMaterialJobFitRisksFromGapAnalysis({
      requirements: [
        {
          requirement: 'Ability to travel up to 20% of the time',
          source: 'job_description',
          importance: 'must_have',
          classification: 'missing',
        },
      ],
    });

    expect(risks).toEqual([]);
  });

  it('drops material degree risks when the drafted resume already shows a valid credential branch', () => {
    const stabilized = stabilizeFinalReviewResult({
      six_second_scan: {
        decision: 'continue_reading',
        reason: 'Strong operations leadership and scale.',
        top_signals_seen: [
          {
            signal: 'Transformational Operations Leader with 18 years of experience and $175M P&L',
            why_it_matters: 'Shows the scale expected for the role.',
            visible_in_top_third: true,
          },
        ],
        important_signals_missing: [],
      },
      hiring_manager_verdict: {
        rating: 'possible_interview',
        summary: 'Strong manufacturing operator with visible scale and financial ownership.',
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
        "Bachelor's degree in engineering or operations management",
      ],
      resumeText: 'EDUCATION\nM.S. Industrial Engineering, Texas A&M University\nB.S. Mechanical Engineering, Ohio State University',
    });

    expect(stabilized.concerns.some((concern) => concern.id === 'material_job_fit_risk')).toBe(false);
    expect(stabilized.six_second_scan.important_signals_missing.some((item) => item.signal.includes("Bachelor's degree"))).toBe(false);
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
    expect(stabilized.concerns[0]?.fix_strategy).toBe('If true, add one concrete example showing Build and lead a 40+ person marketing organization.');
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
    expect(stabilized.concerns[0]?.fix_strategy).toBe('If true, add one concrete example showing Experience architecting for regulated industries (financial services or healthcare).');
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

  it('softens hiring-manager summaries that overstate communication strength while the same proof is flagged as missing', () => {
    const stabilized = stabilizeFinalReviewResult({
      six_second_scan: {
        decision: 'continue_reading',
        reason: 'Good first impression.',
        top_signals_seen: [
          {
            signal: '12 years in cloud infrastructure/architecture roles',
            why_it_matters: 'Shows role-relevant seniority.',
            visible_in_top_third: true,
          },
        ],
        important_signals_missing: [
          {
            signal: 'Excellent communication skills for presenting to executive stakeholders',
            why_it_matters: 'This is a must-have part of the role fit, and the current draft does not yet prove it strongly enough.',
          },
        ],
      },
      hiring_manager_verdict: {
        rating: 'possible_interview',
        summary: 'The candidate demonstrates strong technical expertise in cloud infrastructure and architecture, as well as excellent communication skills and a proven track record of leading cross-functional teams.',
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
    });

    expect(stabilized.hiring_manager_verdict.summary).not.toContain('excellent communication skills');
    expect(stabilized.hiring_manager_verdict.summary).toContain('validated more explicitly');
  });

  it('softens hiring-manager summaries that call the candidate a strong fit while must-have role-fit proof is still missing', () => {
    const stabilized = stabilizeFinalReviewResult({
      six_second_scan: {
        decision: 'continue_reading',
        reason: 'Relevant cloud background.',
        top_signals_seen: [
          {
            signal: '12 years of experience in cloud infrastructure and architecture',
            why_it_matters: 'Clears the years threshold for the role.',
            visible_in_top_third: true,
          },
          {
            signal: 'Reduced hosting costs by 35% through cloud migration',
            why_it_matters: 'Shows cloud cost optimization impact.',
            visible_in_top_third: true,
          },
        ],
        important_signals_missing: [
          {
            signal: 'Experience architecting for regulated industries (financial services or healthcare)',
            why_it_matters: 'This is a must-have part of the role fit, and the current draft does not yet prove it strongly enough.',
          },
        ],
      },
      hiring_manager_verdict: {
        rating: 'needs_improvement',
        summary: 'The candidate makes them a strong fit for the Senior Cloud Architect role, with strong cloud cost optimization and architecture leadership experience.',
      },
      fit_assessment: {
        job_description_fit: 'weak',
        benchmark_alignment: 'moderate',
        business_impact: 'moderate',
        clarity_and_credibility: 'weak',
      },
      top_wins: [],
      concerns: [
        {
          id: 'material_job_fit_risk',
          severity: 'critical',
          type: 'missing_evidence',
          observation: 'Must-have role-fit evidence is still thin: Experience architecting for regulated industries (financial services or healthcare)',
          why_it_hurts: 'Even without being a formal credential screen-out, this can weaken the interview case when the requirement is central to the role.',
          target_section: 'Summary or most relevant experience bullets',
          related_requirement: 'Experience architecting for regulated industries (financial services or healthcare)',
          fix_strategy: 'Prioritize direct proof for this requirement before treating the draft as final.',
          requires_candidate_input: true,
          clarifying_question: 'What is the strongest real example from your background that proves this must-have requirement?',
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

    expect(stabilized.hiring_manager_verdict.summary).not.toContain('strong fit for the Senior Cloud Architect role');
    expect(stabilized.hiring_manager_verdict.summary).toContain('key fit evidence is still incomplete');
  });

  it('adds a caveat when the summary claims a must-have signal that the same review still flags as thin', () => {
    const stabilized = stabilizeFinalReviewResult({
      six_second_scan: {
        decision: 'continue_reading',
        reason: 'Strong first impression.',
        top_signals_seen: [
          {
            signal: '$14.2M in cumulative cost savings',
            why_it_matters: 'Shows large-scale operational impact.',
            visible_in_top_third: true,
          },
        ],
        important_signals_missing: [
          {
            signal: 'Talent development and building high-performing teams',
            why_it_matters: 'This is a must-have part of the role fit, and the current draft does not yet prove it strongly enough.',
          },
        ],
      },
      hiring_manager_verdict: {
        rating: 'possible_interview',
        summary: 'The candidate’s experience in lean manufacturing, quality systems, and talent development aligns well with the job requirements.',
      },
      fit_assessment: {
        job_description_fit: 'moderate',
        benchmark_alignment: 'strong',
        business_impact: 'strong',
        clarity_and_credibility: 'moderate',
      },
      top_wins: [],
      concerns: [
        {
          id: 'material_job_fit_risk',
          severity: 'moderate',
          type: 'missing_evidence',
          observation: 'Must-have role-fit evidence is still thin: Talent development and building high-performing teams',
          why_it_hurts: 'Even without being a formal credential screen-out, this can weaken the interview case when the requirement is central to the role.',
          target_section: 'Summary or most relevant experience bullets',
          related_requirement: 'Talent development and building high-performing teams',
          fix_strategy: 'Prioritize direct proof for this requirement before treating the draft as final.',
          requires_candidate_input: true,
          clarifying_question: 'What is the strongest real example from your background that proves this must-have requirement?',
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

    expect(stabilized.hiring_manager_verdict.summary).toContain('The clearest remaining proof gap is Talent development and building high-performing teams.');
  });

  it('rebuilds improvement_summary from the real concerns instead of keeping generic filler', () => {
    const stabilized = stabilizeFinalReviewResult({
      six_second_scan: {
        decision: 'continue_reading',
        reason: 'Strong first impression.',
        top_signals_seen: [
          {
            signal: '$14.2M in cumulative cost savings',
            why_it_matters: 'Shows scale and business impact.',
            visible_in_top_third: true,
          },
        ],
        important_signals_missing: [
          {
            signal: 'Demonstrated success in talent development and building high-performing teams',
            why_it_matters: 'This is a must-have part of the role fit, and the current draft does not yet prove it strongly enough.',
          },
        ],
      },
      hiring_manager_verdict: {
        rating: 'possible_interview',
        summary: 'Strong manufacturing operations leader with meaningful cost savings.',
      },
      fit_assessment: {
        job_description_fit: 'moderate',
        benchmark_alignment: 'strong',
        business_impact: 'strong',
        clarity_and_credibility: 'moderate',
      },
      top_wins: [],
      concerns: [
        {
          id: 'material_job_fit_risk',
          severity: 'moderate',
          type: 'missing_evidence',
          observation: 'Must-have role-fit evidence is still thin: Demonstrated success in talent development and building high-performing teams',
          why_it_hurts: 'Even without being a formal credential screen-out, this can weaken the interview case when the requirement is central to the role.',
          target_section: 'Summary or most relevant experience bullets',
          related_requirement: 'Demonstrated success in talent development and building high-performing teams',
          fix_strategy: 'Prioritize direct proof for this requirement before treating the draft as final.',
          requires_candidate_input: true,
          clarifying_question: 'What is the strongest example from your background that proves this?',
        },
        {
          id: 'concern_1',
          severity: 'moderate',
          type: 'missing_evidence',
          observation: 'The candidate lacks clear evidence of post-acquisition integration experience.',
          why_it_hurts: 'This omission may raise concerns about readiness for the role.',
          target_section: 'Professional Experience',
          related_requirement: 'Lead post-acquisition operational integration for 2-3 planned acquisitions',
          fix_strategy: 'Add specific examples or a brief description of any experience related to post-acquisition integration, even if it was not a primary responsibility, to address this gap. Only add sample language that is already directly supported by the resume or by a truthful candidate clarification.',
          requires_candidate_input: true,
          clarifying_question: 'Can you describe any acquisition or merger integration work you have done?',
        },
      ],
      structure_recommendations: [],
      benchmark_comparison: {
        advantages_vs_benchmark: [],
        gaps_vs_benchmark: [],
        reframing_opportunities: [],
      },
      improvement_summary: [
        'Consider adding a career progression timeline for clarity',
        'Use clear headings and white space to make the resume easier to read',
      ],
    });

    expect(stabilized.concerns[0]?.fix_strategy).toBe('If true, add one concrete example showing Demonstrated success in talent development and building high-performing teams.');
    expect(stabilized.improvement_summary).toEqual([
      'If true, add one concrete example showing Demonstrated success in talent development and building high-performing teams.',
      'If true, add one concrete example showing Lead post-acquisition operational integration for 2-3 planned acquisitions.',
    ]);
  });

  it('fills missing concern explanation fields when the final-review model omits them', () => {
    const parsed = finalReviewResultSchema.parse({
      six_second_scan: {
        decision: 'continue_reading',
        reason: 'Strong first impression.',
        top_signals_seen: [],
        important_signals_missing: [],
      },
      hiring_manager_verdict: {
        rating: 'possible_interview',
        summary: 'Promising candidate.',
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
          observation: 'Board-level communication is not explicit.',
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

    expect(parsed.concerns[0]?.why_it_hurts).toBe('This issue weakens interview odds.');
    expect(parsed.concerns[0]?.fix_strategy).toBe('Strengthen the supporting proof before export.');
    expect(parsed.concerns[0]?.severity).toBe('moderate');
    expect(parsed.concerns[0]?.type).toBe('missing_evidence');
  });

  it('removes speculative suggested resume edits that introduce unsupported experience or certifications', () => {
    const stabilized = stabilizeFinalReviewResult({
      six_second_scan: {
        decision: 'continue_reading',
        reason: 'Strong first impression.',
        top_signals_seen: [
          {
            signal: 'Led enterprise cloud transformation and cost optimization',
            why_it_matters: 'Shows cloud strategy depth.',
            visible_in_top_third: true,
          },
        ],
        important_signals_missing: [],
      },
      hiring_manager_verdict: {
        rating: 'possible_interview',
        summary: 'Strong cloud leader, but some platform specificity is still thin.',
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
          severity: 'moderate',
          type: 'missing_evidence',
          observation: 'Lack of direct experience with Azure or GCP.',
          why_it_hurts: 'This weakens fit for a multi-cloud architecture role.',
          fix_strategy: 'Clarify any adjacent multi-cloud proof and tighten the wording.',
          suggested_resume_edit: "Add a bullet point to the Professional Experience section highlighting experience with Azure or GCP, such as 'Designed and implemented a hybrid cloud architecture using AWS and Azure, resulting in a 25% reduction in cloud costs.'",
          requires_candidate_input: false,
        },
      ],
      structure_recommendations: [],
      benchmark_comparison: {
        advantages_vs_benchmark: [],
        gaps_vs_benchmark: [],
        reframing_opportunities: [],
      },
      improvement_summary: [],
    }, {
      resumeText: 'Enterprise architect with AWS modernization, cost optimization, and platform governance experience.',
    });

    expect(stabilized.concerns[0]?.suggested_resume_edit).toBeUndefined();
    expect(stabilized.concerns[0]?.requires_candidate_input).toBe(true);
    expect(stabilized.concerns[0]?.clarifying_question).toContain('truthful example');
    expect(stabilized.concerns[0]?.fix_strategy).toContain('Only add sample language');
  });

  it('keeps grounded suggested resume edits when the supporting proof is already in the resume', () => {
    const stabilized = stabilizeFinalReviewResult({
      six_second_scan: {
        decision: 'continue_reading',
        reason: 'Strong first impression.',
        top_signals_seen: [
          {
            signal: 'Led Azure and GCP migration programs across enterprise platforms',
            why_it_matters: 'Shows direct multi-cloud experience.',
            visible_in_top_third: true,
          },
        ],
        important_signals_missing: [],
      },
      hiring_manager_verdict: {
        rating: 'strong_interview_candidate',
        summary: 'Strong cloud leader with direct Azure and GCP migration evidence.',
      },
      fit_assessment: {
        job_description_fit: 'strong',
        benchmark_alignment: 'strong',
        business_impact: 'strong',
        clarity_and_credibility: 'strong',
      },
      top_wins: [],
      concerns: [
        {
          id: 'concern_1',
          severity: 'minor',
          type: 'weak_positioning',
          observation: 'Azure and GCP work could be surfaced more clearly near the top.',
          why_it_hurts: 'The recruiter may miss direct multi-cloud evidence on a quick skim.',
          fix_strategy: 'Move the clearest multi-cloud line into the summary.',
          suggested_resume_edit: 'Led Azure and GCP migration programs across enterprise platforms, improving cloud resilience and governance.',
          requires_candidate_input: false,
        },
      ],
      structure_recommendations: [],
      benchmark_comparison: {
        advantages_vs_benchmark: [],
        gaps_vs_benchmark: [],
        reframing_opportunities: [],
      },
      improvement_summary: [],
    }, {
      resumeText: 'Enterprise architect who led Azure and GCP migration programs across enterprise platforms and improved governance.',
    });

    expect(stabilized.concerns[0]?.suggested_resume_edit).toContain('Azure and GCP migration');
    expect(stabilized.concerns[0]?.requires_candidate_input).toBe(false);
  });

  it('does not treat hiring-manager summary language as resume evidence for speculative edits', () => {
    const stabilized = stabilizeFinalReviewResult({
      six_second_scan: {
        decision: 'continue_reading',
        reason: 'Strong first impression.',
        top_signals_seen: [
          {
            signal: 'Drove consumer brand repositioning and digital growth at scale',
            why_it_matters: 'Shows real growth leadership.',
            visible_in_top_third: true,
          },
        ],
        important_signals_missing: [],
      },
      hiring_manager_verdict: {
        rating: 'possible_interview',
        summary: 'Strong marketing leader, but experience in PE-backed environments with a focus on growth and value creation is still thin.',
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
          severity: 'moderate',
          type: 'missing_evidence',
          observation: 'Lack of clear evidence of experience in PE-backed environments with a focus on growth and value creation.',
          why_it_hurts: 'May raise questions about operating fit.',
          fix_strategy: 'Clarify any adjacent PE-backed proof and tighten the wording.',
          suggested_resume_edit: "Added a bullet point under Vice President of Marketing: 'Partnered with private equity sponsors to drive growth and value creation initiatives.'",
          requires_candidate_input: false,
        },
      ],
      structure_recommendations: [],
      benchmark_comparison: {
        advantages_vs_benchmark: [],
        gaps_vs_benchmark: [],
        reframing_opportunities: [],
      },
      improvement_summary: [],
    }, {
      resumeText: 'Consumer products marketing executive who repositioned brands, led digital growth, and improved team performance.',
    });

    expect(stabilized.concerns[0]?.suggested_resume_edit).toBeUndefined();
    expect(stabilized.concerns[0]?.requires_candidate_input).toBe(true);
    expect(stabilized.concerns[0]?.clarifying_question).toContain('truthful example');
  });

  it('removes speculative suggested edits that introduce unsupported acquisition or integration claims', () => {
    const stabilized = stabilizeFinalReviewResult({
      six_second_scan: {
        decision: 'continue_reading',
        reason: 'Strong first impression.',
        top_signals_seen: [
          {
            signal: 'Generated $14.2M in cost savings through lean manufacturing and automation initiatives',
            why_it_matters: 'Shows operations impact.',
            visible_in_top_third: true,
          },
        ],
        important_signals_missing: [],
      },
      hiring_manager_verdict: {
        rating: 'possible_interview',
        summary: 'Strong operator, but PE-backed and post-acquisition integration evidence is still thin.',
      },
      fit_assessment: {
        job_description_fit: 'moderate',
        benchmark_alignment: 'strong',
        business_impact: 'strong',
        clarity_and_credibility: 'moderate',
      },
      top_wins: [],
      concerns: [
        {
          id: 'concern_1',
          severity: 'moderate',
          type: 'missing_evidence',
          observation: 'Lack of explicit mention of PE-backed manufacturing environments or post-acquisition integration.',
          why_it_hurts: 'These are meaningful context gaps for the role.',
          fix_strategy: 'Add specific examples if they are real.',
          suggested_resume_edit: "Example: 'Supported the integration of acquired businesses, driving operational synergies and cost savings through lean practices and strategic planning.'",
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
    }, {
      resumeText: 'Operations executive with multi-site manufacturing leadership, lean transformations, and automation wins.',
    });

    expect(stabilized.concerns[0]?.suggested_resume_edit).toBeUndefined();
    expect(stabilized.concerns[0]?.requires_candidate_input).toBe(true);
    expect(stabilized.concerns[0]?.clarifying_question).toContain('truthful example');
  });

  it('removes placeholder suggested edits that only say candidate input is required', () => {
    const stabilized = stabilizeFinalReviewResult({
      six_second_scan: {
        decision: 'continue_reading',
        reason: 'Strong first impression.',
        top_signals_seen: [
          {
            signal: 'Generated $14.2M in cumulative cost savings',
            why_it_matters: 'Shows real operating impact.',
            visible_in_top_third: true,
          },
        ],
        important_signals_missing: [],
      },
      hiring_manager_verdict: {
        rating: 'possible_interview',
        summary: 'Strong operator with one proof gap still to confirm.',
      },
      fit_assessment: {
        job_description_fit: 'moderate',
        benchmark_alignment: 'strong',
        business_impact: 'strong',
        clarity_and_credibility: 'moderate',
      },
      top_wins: [],
      concerns: [
        {
          id: 'concern_1',
          severity: 'moderate',
          type: 'missing_evidence',
          observation: 'Post-acquisition integration proof is not explicit.',
          why_it_hurts: 'This is central to the role.',
          target_section: 'Professional Experience',
          related_requirement: 'Lead post-acquisition operational integration',
          fix_strategy: 'Add specific examples if they are real.',
          suggested_resume_edit: 'None without explicit candidate input.',
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

    expect(stabilized.concerns[0]?.suggested_resume_edit).toBeUndefined();
    expect(stabilized.concerns[0]?.clarifying_question).toContain('truthful example');
  });

  it('removes suggested resume edits that introduce unsupported metrics', () => {
    const stabilized = stabilizeFinalReviewResult({
      six_second_scan: {
        decision: 'continue_reading',
        reason: 'Strong first impression.',
        top_signals_seen: [
          {
            signal: 'Drove 340% increase in digital-attributed revenue over 3 years',
            why_it_matters: 'Shows real growth impact.',
            visible_in_top_third: true,
          },
        ],
        important_signals_missing: [],
      },
      hiring_manager_verdict: {
        rating: 'possible_interview',
        summary: 'Strong consumer marketing leader, but digital transformation metrics should be sharper.',
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
          severity: 'moderate',
          type: 'missing_metric',
          observation: 'Lack of specific metrics related to digital transformation and marketing automation.',
          why_it_hurts: 'May raise questions about ability to lead digital transformation.',
          fix_strategy: 'Add specific metrics tied to digital transformation work.',
          suggested_resume_edit: "Example: 'Led digital transformation efforts, resulting in a 25% increase in marketing efficiency and a 30% increase in e-commerce sales'",
          requires_candidate_input: false,
        },
      ],
      structure_recommendations: [],
      benchmark_comparison: {
        advantages_vs_benchmark: [],
        gaps_vs_benchmark: [],
        reframing_opportunities: [],
      },
      improvement_summary: [],
    }, {
      resumeText: 'Marketing executive who drove a 340% increase in digital-attributed revenue over 3 years and improved brand awareness by 23%.',
    });

    expect(stabilized.concerns[0]?.suggested_resume_edit).toBeUndefined();
    expect(stabilized.concerns[0]?.requires_candidate_input).toBe(true);
    expect(stabilized.concerns[0]?.fix_strategy).toContain('Only add sample language');
  });

  it('dedupes near-equivalent concerns and keeps the stronger aggregated material-fit concern', () => {
    const stabilized = stabilizeFinalReviewResult({
      six_second_scan: {
        decision: 'continue_reading',
        reason: 'Strong first impression.',
        top_signals_seen: [
          {
            signal: '12 years in cloud architecture and platform engineering',
            why_it_matters: 'Shows core cloud depth.',
            visible_in_top_third: true,
          },
        ],
        important_signals_missing: [],
      },
      hiring_manager_verdict: {
        rating: 'possible_interview',
        summary: 'Credible cloud architect, but regulated-industry evidence is still thin.',
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
          severity: 'minor',
          type: 'clarity_issue',
          observation: 'Compliance experience in regulated industries is not explicitly stated.',
          why_it_hurts: 'This may create uncertainty about regulated-industry fit.',
          target_section: 'Professional Experience',
          related_requirement: 'Experience architecting for regulated industries',
          fix_strategy: 'Add specific compliance examples if they are real.',
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
    }, {
      materialJobFitRisks: ['Experience architecting for regulated industries'],
      resumeText: 'Cloud architect with AWS platform modernization and platform engineering leadership.',
    });

    expect(stabilized.concerns).toHaveLength(1);
    expect(stabilized.concerns[0]?.id).toBe('material_job_fit_risk');
    expect(stabilized.concerns[0]?.related_requirement).toContain('regulated industries');
  });

  it('rewrites low-signal improvement actions into requirement-specific next steps', () => {
    const stabilized = stabilizeFinalReviewResult({
      six_second_scan: {
        decision: 'continue_reading',
        reason: 'Strong first impression.',
        top_signals_seen: [
          {
            signal: '12 years in cloud architecture and platform engineering',
            why_it_matters: 'Shows core cloud depth.',
            visible_in_top_third: true,
          },
        ],
        important_signals_missing: [],
      },
      hiring_manager_verdict: {
        rating: 'possible_interview',
        summary: 'Credible cloud architect with one multi-cloud proof gap.',
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
          severity: 'moderate',
          type: 'missing_evidence',
          observation: 'Azure or GCP experience is not explicit.',
          why_it_hurts: 'The role asks for AWS plus one additional cloud.',
          target_section: 'Professional Experience',
          related_requirement: 'Deep expertise in AWS and one additional cloud',
          fix_strategy: 'Add specific examples',
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

    expect(stabilized.concerns[0]?.fix_strategy).toBe('If true, add one concrete example showing Deep expertise in AWS and one additional cloud.');
    expect(stabilized.improvement_summary[0]).toBe('If true, add one concrete example showing Deep expertise in AWS and one additional cloud.');
  });

  it('rewrites low-signal bullet-point guidance into requirement-specific concern text', () => {
    const stabilized = stabilizeFinalReviewResult({
      six_second_scan: {
        decision: 'continue_reading',
        reason: 'Strong first impression.',
        top_signals_seen: [
          {
            signal: 'Built large-scale AWS infrastructure and reduced hosting costs by 35%',
            why_it_matters: 'Shows strong platform impact.',
            visible_in_top_third: true,
          },
        ],
        important_signals_missing: [],
      },
      hiring_manager_verdict: {
        rating: 'possible_interview',
        summary: 'Strong cloud leader with one multi-cloud proof gap.',
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
          severity: 'moderate',
          type: 'missing_evidence',
          observation: 'Azure or GCP experience is not explicit.',
          why_it_hurts: 'The role asks for AWS plus one additional cloud.',
          target_section: 'Professional Experience',
          related_requirement: 'Experience with Azure or GCP',
          fix_strategy: 'Consider adding a bullet point or a separate section to highlight any relevant experience with Azure or GCP.',
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

    expect(stabilized.concerns[0]?.fix_strategy).toBe('If true, add one concrete example showing Experience with Azure or GCP.');
    expect(stabilized.improvement_summary[0]).toBe('If true, add one concrete example showing Experience with Azure or GCP.');
  });

  it('rewrites generic provide-more-examples guidance into requirement-specific concern text', () => {
    const stabilized = stabilizeFinalReviewResult({
      six_second_scan: {
        decision: 'continue_reading',
        reason: 'Strong first impression.',
        top_signals_seen: [
          {
            signal: '12+ years leading cloud architecture and platform engineering',
            why_it_matters: 'Shows credible platform depth.',
            visible_in_top_third: true,
          },
        ],
        important_signals_missing: [],
      },
      hiring_manager_verdict: {
        rating: 'possible_interview',
        summary: 'Credible cloud architect with one regulated-industry proof gap.',
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
          severity: 'minor',
          type: 'weak_positioning',
          observation: 'Compliance and security experience is not clearly highlighted.',
          why_it_hurts: 'The job description emphasizes regulated-industry compliance and security depth.',
          target_section: 'Professional Experience',
          related_requirement: 'Knowledge of compliance frameworks: SOC 2, HIPAA, or PCI-DSS',
          fix_strategy: 'Provide more specific examples of experience in compliance and security in regulated industries in the professional experience section.',
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

    expect(stabilized.concerns[0]?.fix_strategy).toBe('If true, add one concrete example showing Knowledge of compliance frameworks: SOC 2, HIPAA, or PCI-DSS.');
    expect(stabilized.improvement_summary[0]).toBe('If true, add one concrete example showing Knowledge of compliance frameworks: SOC 2, HIPAA, or PCI-DSS.');
  });

  it('rewrites generic add-more-detail guidance into requirement-specific concern text', () => {
    const stabilized = stabilizeFinalReviewResult({
      six_second_scan: {
        decision: 'continue_reading',
        reason: 'Strong first impression.',
        top_signals_seen: [
          {
            signal: 'Improved plant throughput and reduced defect rates across three facilities',
            why_it_matters: 'Shows strong operations impact.',
            visible_in_top_third: true,
          },
        ],
        important_signals_missing: [],
      },
      hiring_manager_verdict: {
        rating: 'possible_interview',
        summary: 'Credible operations leader with one smart-manufacturing proof gap.',
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
          severity: 'minor',
          type: 'weak_positioning',
          observation: 'Industry 4.0 experience is not fully highlighted.',
          why_it_hurts: 'The role asks for visible smart-manufacturing proof.',
          target_section: 'Professional Experience',
          related_requirement: 'Experience with Industry 4.0 / smart manufacturing technologies',
          fix_strategy: 'Consider adding more detail to the Professional Experience section about the candidate\'s experience with Industry 4.0 technologies.',
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

    expect(stabilized.concerns[0]?.fix_strategy).toBe('If true, add one concrete example showing Experience with Industry 4.0 / smart manufacturing technologies.');
    expect(stabilized.improvement_summary[0]).toBe('If true, add one concrete example showing Experience with Industry 4.0 / smart manufacturing technologies.');
  });

  it('rewrites generic relevant-experience-or-training guidance into requirement-specific concern text', () => {
    const stabilized = stabilizeFinalReviewResult({
      six_second_scan: {
        decision: 'continue_reading',
        reason: 'Strong first impression.',
        top_signals_seen: [
          {
            signal: '15 years of CPG marketing leadership with $180M P&L ownership',
            why_it_matters: 'Shows credible senior marketing depth.',
            visible_in_top_third: true,
          },
        ],
        important_signals_missing: [],
      },
      hiring_manager_verdict: {
        rating: 'possible_interview',
        summary: 'Credible consumer marketing leader with one PE-backed proof gap.',
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
          severity: 'minor',
          type: 'missing_evidence',
          observation: 'Lack of direct experience with PE-backed environments',
          why_it_hurts: 'The role prefers experience in PE-backed environments.',
          target_section: 'Professional Experience',
          related_requirement: 'Experience in PE-backed environments with focus on growth and value creation',
          fix_strategy: 'Add any relevant experience or training related to PE-backed environments',
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

    expect(stabilized.concerns[0]?.fix_strategy).toBe('If true, add one concrete example showing Experience in PE-backed environments with focus on growth and value creation.');
    expect(stabilized.improvement_summary[0]).toBe('If true, add one concrete example showing Experience in PE-backed environments with focus on growth and value creation.');
  });

  it('rewrites generic brief-statement-or-bullet guidance into requirement-specific concern text', () => {
    const stabilized = stabilizeFinalReviewResult({
      six_second_scan: {
        decision: 'continue_reading',
        reason: 'Strong first impression.',
        top_signals_seen: [
          {
            signal: '18 years of progressive operations leadership with $175M P&L oversight',
            why_it_matters: 'Shows credible operations scale.',
            visible_in_top_third: true,
          },
        ],
        important_signals_missing: [],
      },
      hiring_manager_verdict: {
        rating: 'possible_interview',
        summary: 'Credible operations leader with one investor-backed proof gap.',
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
          severity: 'minor',
          type: 'missing_evidence',
          observation: 'Limited direct mention of experience in PE-backed manufacturing environments',
          why_it_hurts: 'The role prefers investor-backed manufacturing exposure.',
          target_section: 'Professional Experience',
          related_requirement: 'Experience in PE-backed manufacturing environments',
          fix_strategy: 'Add a brief statement or bullet point highlighting any relevant experience in PE-backed environments',
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

    expect(stabilized.concerns[0]?.fix_strategy).toBe('If true, add one concrete example showing Experience in PE-backed manufacturing environments.');
    expect(stabilized.improvement_summary[0]).toBe('If true, add one concrete example showing Experience in PE-backed manufacturing environments.');
  });

  it('does not misread PE-backed experience as a PE credential concern', () => {
    const stabilized = stabilizeFinalReviewResult({
      six_second_scan: {
        decision: 'continue_reading',
        reason: 'Strong first impression.',
        top_signals_seen: [],
        important_signals_missing: [],
      },
      hiring_manager_verdict: {
        rating: 'possible_interview',
        summary: 'Credible operations leader with one investor-backed proof gap.',
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
          severity: 'minor',
          type: 'missing_evidence',
          observation: 'Limited direct mention of experience in PE-backed manufacturing environments',
          why_it_hurts: 'The role prefers investor-backed manufacturing exposure.',
          target_section: 'Professional Experience',
          related_requirement: 'Experience in PE-backed manufacturing environments',
          fix_strategy: 'Add a brief statement or bullet point highlighting any relevant experience in PE-backed environments',
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

    expect(stabilized.concerns[0]?.fix_strategy).toBe('If true, add one concrete example showing Experience in PE-backed manufacturing environments.');
  });

  it('uses a specific proof-gap sentence instead of generic final-draft boilerplate', () => {
    const stabilized = stabilizeFinalReviewResult({
      six_second_scan: {
        decision: 'continue_reading',
        reason: 'Strong first impression.',
        top_signals_seen: [
          {
            signal: '12 years in cloud infrastructure and architecture roles',
            why_it_matters: 'Shows real seniority.',
            visible_in_top_third: true,
          },
        ],
        important_signals_missing: [],
      },
      hiring_manager_verdict: {
        rating: 'possible_interview',
        summary: 'The candidate is a credible fit for the role based on cloud infrastructure transformation and leadership experience.',
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
          id: 'material_job_fit_risk',
          severity: 'moderate',
          type: 'missing_evidence',
          observation: 'Must-have role-fit evidence is still thin: Experience architecting for regulated industries',
          why_it_hurts: 'This is central to the role.',
          target_section: 'Summary',
          related_requirement: 'Experience architecting for regulated industries',
          fix_strategy: 'Prioritize direct proof for this requirement before treating the draft as final.',
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

    expect(stabilized.hiring_manager_verdict.summary).toContain('The clearest remaining proof gap is Experience architecting for regulated industries.');
    expect(stabilized.hiring_manager_verdict.summary).not.toContain('final interview-ready draft');
  });

  it('rewrites probe-further summary lines to only mention kept concern topics', () => {
    const stabilized = stabilizeFinalReviewResult({
      six_second_scan: {
        decision: 'continue_reading',
        reason: 'Strong first impression.',
        top_signals_seen: [
          {
            signal: '$14.2M in cumulative cost savings',
            why_it_matters: 'Shows strong operations impact.',
            visible_in_top_third: true,
          },
        ],
        important_signals_missing: [],
      },
      hiring_manager_verdict: {
        rating: 'strong_interview_candidate',
        summary: 'The candidate is a strong fit for the role. However, the hiring manager may want to probe further into the candidate\'s experience with post-acquisition integration and Industry 4.0 initiatives.',
      },
      fit_assessment: {
        job_description_fit: 'strong',
        benchmark_alignment: 'strong',
        business_impact: 'strong',
        clarity_and_credibility: 'strong',
      },
      top_wins: [],
      concerns: [
        {
          id: 'concern_1',
          severity: 'minor',
          type: 'missing_evidence',
          observation: 'The candidate\'s experience in post-acquisition operational integration is not explicitly stated.',
          why_it_hurts: 'This area may still need follow-up.',
          target_section: 'Professional Experience',
          related_requirement: 'Lead post-acquisition operational integration for 2-3 planned acquisitions',
          fix_strategy: 'If true, add one concrete example showing Lead post-acquisition operational integration for 2-3 planned acquisitions.',
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

    expect(stabilized.hiring_manager_verdict.summary).toContain('However, interview follow-up should focus on experience in post-acquisition operational integration.');
    expect(stabilized.hiring_manager_verdict.summary).not.toContain('Industry 4.0 initiatives');
  });

  it('removes certification guidance from non-credential experience concerns', () => {
    const stabilized = stabilizeFinalReviewResult({
      six_second_scan: {
        decision: 'continue_reading',
        reason: 'Strong first impression.',
        top_signals_seen: [
          {
            signal: '12 years in cloud architecture and platform engineering',
            why_it_matters: 'Shows core cloud depth.',
            visible_in_top_third: true,
          },
        ],
        important_signals_missing: [],
      },
      hiring_manager_verdict: {
        rating: 'possible_interview',
        summary: 'Credible cloud architect with one clear multi-cloud proof gap.',
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
          severity: 'moderate',
          type: 'missing_evidence',
          observation: "The candidate's experience with Azure or GCP is not clearly highlighted",
          why_it_hurts: 'The job requires deep expertise in AWS and one additional cloud.',
          target_section: 'Professional Experience',
          related_requirement: 'Deep expertise in AWS and one additional cloud',
          fix_strategy: 'Add specific examples or certifications related to Azure or GCP to demonstrate the candidate’s experience with multiple clouds.',
          requires_candidate_input: true,
          clarifying_question: 'Can you provide examples of your experience working with Azure or GCP, or any relevant certifications you hold?',
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

    expect(stabilized.concerns[0]?.fix_strategy).not.toMatch(/certif/i);
    expect(stabilized.concerns[0]?.clarifying_question).not.toMatch(/certif/i);
    expect(stabilized.concerns[0]?.fix_strategy).toBe('If true, add one concrete example showing Deep expertise in AWS and one additional cloud.');
    expect(stabilized.concerns[0]?.clarifying_question).toContain('Azure or GCP');
  });
});
