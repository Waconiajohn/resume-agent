export interface ExportGateInput {
  hasCompletedFinalReview?: boolean;
  isFinalReviewStale?: boolean;
  unresolvedCriticalCount?: number;
  warningsAcknowledged?: boolean;
}

export interface ExportGateState {
  hasWarnings: boolean;
  exportBlocked: boolean;
}

export function getExportGateState({
  hasCompletedFinalReview = false,
  isFinalReviewStale = false,
  unresolvedCriticalCount = 0,
  warningsAcknowledged = false,
}: ExportGateInput): ExportGateState {
  const hasWarnings = !hasCompletedFinalReview || isFinalReviewStale || unresolvedCriticalCount > 0;
  return {
    hasWarnings,
    exportBlocked: hasWarnings && !warningsAcknowledged,
  };
}
