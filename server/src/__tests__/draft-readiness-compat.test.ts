import { describe, expect, it } from 'vitest';
import {
  buildCoverageOnlyDraftPathDecisionMessage,
  normalizeCoverageOnlyReadiness,
  normalizeDraftPathDecisionCompat,
} from '../lib/draft-readiness-compat.js';

describe('draft readiness compatibility normalization', () => {
  it('treats legacy evidence-only blocker artifacts as ready when coverage is complete', () => {
    const result = normalizeCoverageOnlyReadiness({
      ready: false,
      blocking_reasons: ['evidence_target'],
      remaining_evidence_needed: 2,
      remaining_coverage_needed: 0,
      coverage_score: 70,
      coverage_threshold: 70,
    });

    expect(result.ready).toBe(true);
    expect(result.blockingReasons).toEqual([]);
    expect(result.remainingCoverageNeeded).toBe(0);
    expect(result.normalizedLegacyEvidenceGate).toBe(true);
  });

  it('preserves coverage blockers when coverage is still short', () => {
    const result = normalizeCoverageOnlyReadiness({
      ready: false,
      blocking_reasons: ['evidence_target', 'coverage_threshold'],
      remaining_evidence_needed: 0,
      remaining_coverage_needed: 20,
      coverage_score: 50,
      coverage_threshold: 70,
    });

    expect(result.ready).toBe(false);
    expect(result.blockingReasons).toEqual(['coverage_threshold']);
    expect(result.remainingCoverageNeeded).toBe(20);
  });

  it('rewrites legacy draft path decision metadata to coverage-only semantics', () => {
    const result = normalizeDraftPathDecisionCompat({
      ready: false,
      proceeding_reason: 'momentum_mode',
      blocking_reasons: ['evidence_target'],
      remaining_coverage_needed: 0,
      coverage_score: 70,
      coverage_threshold: 70,
      message: 'Proceeding... Remaining blockers: 2 more evidence items',
    });

    expect(result.ready).toBe(true);
    expect(result.proceedingReason).toBe('readiness_met');
    expect(result.blockingReasons).toEqual([]);
    expect(result.shouldRewriteMessage).toBe(true);

    const message = buildCoverageOnlyDraftPathDecisionMessage({
      workflowMode: 'balanced',
      coverageScore: 70,
      coverageThreshold: 70,
      ready: result.ready,
      proceedingReason: result.proceedingReason,
      remainingCoverageNeeded: result.remainingCoverageNeeded,
      topRemainingRequirement: null,
    });
    expect(message).toContain('readiness is strong enough');
    expect(message).toContain('coverage 70% vs target 70%');
    expect(message.toLowerCase()).not.toContain('evidence');
  });
});
