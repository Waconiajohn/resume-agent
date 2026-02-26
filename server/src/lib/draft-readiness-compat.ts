export type CoverageBlockingReason = 'coverage_threshold';

type ProceedingReason = 'readiness_met' | 'momentum_mode';

export interface CoverageOnlyReadinessCompat {
  ready: boolean;
  blockingReasons: CoverageBlockingReason[];
  remainingCoverageNeeded?: number;
  normalizedLegacyEvidenceGate: boolean;
}

export interface DraftPathDecisionCompatResult extends CoverageOnlyReadinessCompat {
  proceedingReason: ProceedingReason;
  shouldRewriteMessage: boolean;
}

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return value;
}

function coerceRemainingCoverageNeeded(payload: Record<string, unknown>): number | undefined {
  const remainingCoverage = asFiniteNumber(payload.remaining_coverage_needed);
  if (typeof remainingCoverage === 'number') {
    return Math.max(0, Math.ceil(remainingCoverage));
  }

  const coverageScore = asFiniteNumber(payload.coverage_score);
  const coverageThreshold = asFiniteNumber(payload.coverage_threshold);
  if (typeof coverageScore === 'number' && typeof coverageThreshold === 'number') {
    return Math.max(0, Math.ceil(coverageThreshold - coverageScore));
  }

  return undefined;
}

function getCoverageBlockingReasons(payload: Record<string, unknown>): CoverageBlockingReason[] {
  if (!Array.isArray(payload.blocking_reasons)) return [];
  return payload.blocking_reasons.filter((reason): reason is CoverageBlockingReason => (
    reason === 'coverage_threshold'
  ));
}

function hasLegacyEvidenceTargetBlocker(payload: Record<string, unknown>): boolean {
  return Array.isArray(payload.blocking_reasons) && payload.blocking_reasons.includes('evidence_target');
}

export function normalizeCoverageOnlyReadiness(payload: Record<string, unknown>): CoverageOnlyReadinessCompat {
  const legacyEvidenceTargetBlocker = hasLegacyEvidenceTargetBlocker(payload);
  const remainingCoverageNeeded = coerceRemainingCoverageNeeded(payload);
  const fallbackBlockingReasons = getCoverageBlockingReasons(payload);

  if (typeof remainingCoverageNeeded === 'number') {
    const ready = remainingCoverageNeeded === 0;
    return {
      ready,
      remainingCoverageNeeded,
      blockingReasons: ready ? [] : ['coverage_threshold'],
      normalizedLegacyEvidenceGate: legacyEvidenceTargetBlocker,
    };
  }

  const ready = payload.ready === true;
  return {
    ready,
    remainingCoverageNeeded: undefined,
    blockingReasons: fallbackBlockingReasons,
    normalizedLegacyEvidenceGate: legacyEvidenceTargetBlocker && !fallbackBlockingReasons.includes('coverage_threshold'),
  };
}

export function normalizeDraftPathDecisionCompat(payload: Record<string, unknown>): DraftPathDecisionCompatResult {
  const coverageCompat = normalizeCoverageOnlyReadiness(payload);
  const rawProceedingReason: ProceedingReason = payload.proceeding_reason === 'readiness_met'
    ? 'readiness_met'
    : 'momentum_mode';
  const rawMessage = typeof payload.message === 'string' ? payload.message : '';
  const legacyEvidenceMessage = /\bevidence\b/i.test(rawMessage);

  const proceedingReason = (coverageCompat.normalizedLegacyEvidenceGate || legacyEvidenceMessage) && coverageCompat.ready
    ? 'readiness_met'
    : rawProceedingReason;

  const shouldRewriteMessage = legacyEvidenceMessage;

  return {
    ...coverageCompat,
    proceedingReason,
    shouldRewriteMessage,
  };
}

export function buildCoverageOnlyDraftPathDecisionMessage(input: {
  workflowMode: 'fast_draft' | 'balanced' | 'deep_dive';
  coverageScore?: number;
  coverageThreshold?: number;
  ready: boolean;
  proceedingReason: ProceedingReason;
  remainingCoverageNeeded?: number;
  topRemainingRequirement?: string | null;
}): string {
  const coverageScore = typeof input.coverageScore === 'number' ? input.coverageScore : null;
  const coverageThreshold = typeof input.coverageThreshold === 'number' ? input.coverageThreshold : null;
  const coverageSummary = coverageScore !== null && coverageThreshold !== null
    ? `coverage ${coverageScore}% vs target ${coverageThreshold}%`
    : 'coverage target met';

  if (input.ready || input.proceedingReason === 'readiness_met') {
    return `Proceeding to blueprint design because draft readiness is strong enough (${coverageSummary}).`;
  }

  const blockerText = typeof input.remainingCoverageNeeded === 'number' && input.remainingCoverageNeeded > 0
    ? `${input.remainingCoverageNeeded}% more coverage`
    : 'additional coverage';

  return `Proceeding to blueprint design to keep momentum in ${input.workflowMode} mode, even though readiness is not fully complete yet. Remaining blockers: ${blockerText}${input.topRemainingRequirement ? `. Highest-impact remaining area: ${input.topRemainingRequirement}.` : '.'}`;
}
