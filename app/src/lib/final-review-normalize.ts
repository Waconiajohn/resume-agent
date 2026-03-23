import type {
  FinalReviewConcern,
  FinalReviewFitAssessment,
  FinalReviewResult,
  FinalReviewSignal,
  FinalReviewStructureRecommendation,
  FinalReviewTopWin,
  FinalReviewVerdict,
} from '@/types/resume-v2';

const DEFAULT_SCAN_DECISION: FinalReviewResult['six_second_scan']['decision'] = 'skip';
const DEFAULT_RATING: FinalReviewVerdict['rating'] = 'needs_improvement';
const DEFAULT_FINAL_REVIEW_FIX_STRATEGY = 'Review this concern and add truthful supporting proof before export if you have it.';
const DEFAULT_FINAL_REVIEW_QUESTION = 'What concrete truthful detail would address this concern?';
const DEFAULT_FIT: FinalReviewFitAssessment = {
  job_description_fit: 'moderate',
  benchmark_alignment: 'moderate',
  business_impact: 'moderate',
  clarity_and_credibility: 'moderate',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function normalizeDecision(value: unknown): FinalReviewResult['six_second_scan']['decision'] {
  return value === 'continue_reading' ? 'continue_reading' : DEFAULT_SCAN_DECISION;
}

function normalizeRating(value: unknown): FinalReviewVerdict['rating'] {
  switch (value) {
    case 'strong_interview_candidate':
    case 'possible_interview':
    case 'needs_improvement':
    case 'likely_rejected':
      return value;
    default:
      return DEFAULT_RATING;
  }
}

function normalizeFitValue(value: unknown): FinalReviewFitAssessment[keyof FinalReviewFitAssessment] {
  switch (value) {
    case 'strong':
    case 'moderate':
    case 'weak':
      return value;
    default:
      return 'moderate';
  }
}

function normalizeSignals(value: unknown, includeVisibility: boolean): FinalReviewSignal[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const signal = asString(item.signal).trim();
    if (!signal) return [];
    const normalized: FinalReviewSignal = {
      signal,
      why_it_matters: asString(item.why_it_matters, 'This signal affects interview momentum.'),
    };
    if (includeVisibility) {
      normalized.visible_in_top_third = Boolean(item.visible_in_top_third);
    }
    return [normalized];
  });
}

function normalizeTopWins(value: unknown): FinalReviewTopWin[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const win = asString(item.win).trim();
    if (!win) return [];
    return [{
      win,
      why_powerful: asString(item.why_powerful, 'This is one of the strongest signals on the current resume.'),
      aligned_requirement: asString(item.aligned_requirement, 'General role fit'),
      prominent_enough: typeof item.prominent_enough === 'boolean' ? item.prominent_enough : true,
      repositioning_recommendation: asString(
        item.repositioning_recommendation,
        'Keep this evidence visible in the top half of the resume.',
      ),
    }];
  });
}

function normalizeConcernType(value: unknown): FinalReviewConcern['type'] {
  switch (value) {
    case 'missing_evidence':
    case 'weak_positioning':
    case 'missing_metric':
    case 'unclear_scope':
    case 'benchmark_gap':
    case 'clarity_issue':
    case 'credibility_risk':
      return value;
    default:
      return 'missing_evidence';
  }
}

function normalizeConcernSeverity(value: unknown): FinalReviewConcern['severity'] {
  switch (value) {
    case 'critical':
    case 'moderate':
    case 'minor':
      return value;
    default:
      return 'moderate';
  }
}

function normalizeConcerns(value: unknown): FinalReviewConcern[] {
  if (!Array.isArray(value)) return [];
  const concerns: FinalReviewConcern[] = [];
  value.forEach((item, index) => {
    if (typeof item === 'string') {
      const observation = item.trim();
      if (!observation) return;
      concerns.push({
        id: `legacy_concern_${index + 1}`,
        severity: 'moderate',
        type: 'missing_evidence',
        observation,
        why_it_hurts: 'This weakens interview confidence until the resume shows stronger proof.',
        fix_strategy: DEFAULT_FINAL_REVIEW_FIX_STRATEGY,
        requires_candidate_input: true,
        clarifying_question: DEFAULT_FINAL_REVIEW_QUESTION,
      });
      return;
    }
    if (!isRecord(item)) return;
    const observation = asString(item.observation).trim();
    if (!observation) return;
    const clarifyingQuestion = asString(item.clarifying_question).trim();
    const requiresCandidateInput = typeof item.requires_candidate_input === 'boolean'
      ? item.requires_candidate_input
      : Boolean(clarifyingQuestion);

    concerns.push({
      id: asString(item.id, `concern_${index + 1}`),
      severity: normalizeConcernSeverity(item.severity),
      type: normalizeConcernType(item.type),
      observation,
      why_it_hurts: asString(item.why_it_hurts, 'This issue weakens interview odds.'),
      fix_strategy: asString(item.fix_strategy, DEFAULT_FINAL_REVIEW_FIX_STRATEGY),
      target_section: asString(item.target_section).trim() || undefined,
      related_requirement: asString(item.related_requirement).trim() || undefined,
      suggested_resume_edit: asString(item.suggested_resume_edit).trim() || undefined,
      requires_candidate_input: requiresCandidateInput,
      clarifying_question: clarifyingQuestion || (requiresCandidateInput ? DEFAULT_FINAL_REVIEW_QUESTION : undefined),
    });
  });
  return concerns;
}

function normalizeRecommendations(value: unknown): FinalReviewStructureRecommendation[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const issue = asString(item.issue).trim();
    if (!issue) return [];
    const priority = item.priority === 'high' || item.priority === 'medium' || item.priority === 'low'
      ? item.priority
      : 'medium';
    return [{
      issue,
      recommendation: asString(item.recommendation, 'Move the strongest proof higher on the resume.'),
      priority,
    }];
  });
}

function legacyTopWins(root: Record<string, unknown>): FinalReviewTopWin[] {
  return asStringArray(root.strengths).slice(0, 3).map((strength) => ({
    win: strength,
    why_powerful: 'This was identified as a visible strength in an earlier Final Review snapshot.',
    aligned_requirement: 'General role fit',
    prominent_enough: true,
    repositioning_recommendation: 'Keep this visible near the top of the resume.',
  }));
}

function legacyMissingSignals(root: Record<string, unknown>): FinalReviewSignal[] {
  return asStringArray(root.missing_elements).slice(0, 5).map((item) => ({
    signal: item,
    why_it_matters: 'This was flagged as missing in an earlier Final Review snapshot.',
  }));
}

function deriveLegacySummary(root: Record<string, unknown>): string {
  const overall = asString(root.overall_impression).trim();
  if (overall) return overall;
  const verdict = asString(root.verdict).trim();
  if (verdict) return verdict;
  return 'This Final Review was loaded from an earlier session. Re-run Final Review for a fresh, full critique.';
}

function deriveLegacyRating(root: Record<string, unknown>): FinalReviewVerdict['rating'] {
  const verdict = asString(root.verdict).toLowerCase();
  if (verdict.includes('strong')) return 'strong_interview_candidate';
  if (verdict.includes('possible')) return 'possible_interview';
  if (verdict.includes('reject')) return 'likely_rejected';
  return DEFAULT_RATING;
}

export function normalizeFinalReviewResult(input: unknown): FinalReviewResult | null {
  if (!isRecord(input)) return null;

  const scan = isRecord(input.six_second_scan) ? input.six_second_scan : null;
  const verdict = isRecord(input.hiring_manager_verdict) ? input.hiring_manager_verdict : null;
  const fit = isRecord(input.fit_assessment) ? input.fit_assessment : null;
  const benchmark = isRecord(input.benchmark_comparison) ? input.benchmark_comparison : null;

  const topWins = normalizeTopWins(input.top_wins);
  const legacyWins = topWins.length > 0 ? topWins : legacyTopWins(input);
  const concerns = normalizeConcerns(input.concerns);
  const improvementSummary = asStringArray(input.improvement_summary);
  const legacyMissing = legacyMissingSignals(input);

  const result: FinalReviewResult = {
    six_second_scan: {
      decision: normalizeDecision(scan?.decision),
      reason: asString(scan?.reason, deriveLegacySummary(input)),
      top_signals_seen: normalizeSignals(scan?.top_signals_seen, true),
      important_signals_missing: normalizeSignals(scan?.important_signals_missing, false),
    },
    hiring_manager_verdict: {
      rating: normalizeRating(verdict?.rating ?? deriveLegacyRating(input)),
      summary: asString(verdict?.summary, deriveLegacySummary(input)),
    },
    fit_assessment: {
      job_description_fit: normalizeFitValue(fit?.job_description_fit),
      benchmark_alignment: normalizeFitValue(fit?.benchmark_alignment),
      business_impact: normalizeFitValue(fit?.business_impact),
      clarity_and_credibility: normalizeFitValue(fit?.clarity_and_credibility),
    },
    top_wins: legacyWins,
    concerns,
    structure_recommendations: normalizeRecommendations(input.structure_recommendations),
    benchmark_comparison: {
      advantages_vs_benchmark: asStringArray(benchmark?.advantages_vs_benchmark),
      gaps_vs_benchmark: asStringArray(benchmark?.gaps_vs_benchmark),
      reframing_opportunities: asStringArray(benchmark?.reframing_opportunities),
    },
    improvement_summary: improvementSummary.length > 0
      ? improvementSummary
      : asStringArray(input.missing_elements),
  };

  if (result.six_second_scan.top_signals_seen.length === 0 && legacyWins.length > 0) {
    result.six_second_scan.top_signals_seen = legacyWins.map((win) => ({
      signal: win.win,
      why_it_matters: win.why_powerful,
      visible_in_top_third: win.prominent_enough,
    }));
  }

  if (result.six_second_scan.important_signals_missing.length === 0 && legacyMissing.length > 0) {
    result.six_second_scan.important_signals_missing = legacyMissing;
  }

  if (result.improvement_summary.length === 0 && concerns.length > 0) {
    result.improvement_summary = concerns.slice(0, 3).map((concern) => concern.fix_strategy);
  }

  if (result.six_second_scan.reason.trim().length === 0) {
    result.six_second_scan.reason = 'Re-run Final Review to refresh the recruiter scan for the current draft.';
  }

  if (result.hiring_manager_verdict.summary.trim().length === 0) {
    result.hiring_manager_verdict.summary = 'Re-run Final Review to refresh the hiring manager verdict for the current draft.';
  }

  return result;
}
