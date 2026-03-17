import { describe, it, expect } from 'vitest';
import { getExportGateState } from '../export-bar-gating';

describe('export-bar-gating', () => {
  it('blocks export when Final Review is stale and the warning has not been acknowledged', () => {
    expect(getExportGateState({
      hasCompletedFinalReview: true,
      isFinalReviewStale: true,
      unresolvedCriticalCount: 0,
      warningsAcknowledged: false,
    })).toEqual({
      hasWarnings: true,
      exportBlocked: true,
    });
  });

  it('allows export after the user acknowledges remaining warnings', () => {
    expect(getExportGateState({
      hasCompletedFinalReview: true,
      isFinalReviewStale: true,
      unresolvedCriticalCount: 1,
      warningsAcknowledged: true,
    })).toEqual({
      hasWarnings: true,
      exportBlocked: false,
    });
  });

  it('keeps export open when there are no review warnings', () => {
    expect(getExportGateState({
      hasCompletedFinalReview: true,
      isFinalReviewStale: false,
      unresolvedCriticalCount: 0,
      warningsAcknowledged: false,
    })).toEqual({
      hasWarnings: false,
      exportBlocked: false,
    });
  });
});
