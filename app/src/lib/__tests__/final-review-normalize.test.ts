import { describe, expect, it } from 'vitest';
import { normalizeFinalReviewResult } from '../final-review-normalize';

describe('normalizeFinalReviewResult', () => {
  it('fills missing nested sections with safe defaults', () => {
    const normalized = normalizeFinalReviewResult({
      six_second_scan: {
        reason: 'Something stands out.',
      },
      concerns: [
        {
          id: 'concern_1',
          observation: 'Metrics are thin.',
          why_it_hurts: 'The impact is hard to trust.',
          fix_strategy: 'Add measurable results.',
        },
      ],
    });

    expect(normalized).not.toBeNull();
    expect(normalized?.hiring_manager_verdict.rating).toBe('needs_improvement');
    expect(normalized?.fit_assessment.job_description_fit).toBe('moderate');
    expect(normalized?.six_second_scan.decision).toBe('skip');
    expect(normalized?.concerns[0]?.requires_candidate_input).toBe(false);
  });

  it('upgrades older saved final-review snapshots into the current shape', () => {
    const normalized = normalizeFinalReviewResult({
      overall_impression: 'Credible draft, but stronger metrics are needed.',
      verdict: 'possible interview',
      strengths: ['Improved operating margin by 4 points'],
      concerns: ['Needs stronger board-facing communication proof'],
      missing_elements: ['Specific ownership of enterprise budget'],
    });

    expect(normalized).not.toBeNull();
    expect(normalized?.hiring_manager_verdict.rating).toBe('possible_interview');
    expect(normalized?.top_wins).toHaveLength(1);
    expect(normalized?.six_second_scan.top_signals_seen[0]?.signal).toContain('Improved operating margin');
    expect(normalized?.six_second_scan.important_signals_missing[0]?.signal).toContain('Specific ownership');
    expect(normalized?.concerns[0]?.observation).toContain('board-facing communication');
    expect(normalized?.improvement_summary[0]).toContain('Specific ownership');
  });

  it('returns null for non-object input', () => {
    expect(normalizeFinalReviewResult(null)).toBeNull();
    expect(normalizeFinalReviewResult('bad payload')).toBeNull();
  });
});
