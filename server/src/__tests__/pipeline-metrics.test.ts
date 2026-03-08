import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  recordPipelineCompletion,
  recordPipelineError,
  recordActiveUser,
  getPipelineMetrics,
  resetPipelineMetricsForTest,
} from '../lib/pipeline-metrics.js';

beforeEach(() => {
  resetPipelineMetricsForTest();
});

describe('recordPipelineCompletion', () => {
  it('increments completions_total', () => {
    recordPipelineCompletion('resume', 5000, 0.10);
    recordPipelineCompletion('resume', 3000, 0.05);
    expect(getPipelineMetrics().completions_total).toBe(2);
  });

  it('increments completions_by_domain', () => {
    recordPipelineCompletion('resume', 5000, 0.10);
    recordPipelineCompletion('resume', 3000, 0.05);
    recordPipelineCompletion('cover_letter', 2000, 0.02);
    const metrics = getPipelineMetrics();
    expect(metrics.completions_by_domain['resume']).toBe(2);
    expect(metrics.completions_by_domain['cover_letter']).toBe(1);
  });
});

describe('recordPipelineError', () => {
  it('increments errors_total', () => {
    recordPipelineError('resume');
    recordPipelineError('resume');
    expect(getPipelineMetrics().errors_total).toBe(2);
  });

  it('increments errors_by_domain', () => {
    recordPipelineError('resume');
    recordPipelineError('onboarding');
    const metrics = getPipelineMetrics();
    expect(metrics.errors_by_domain['resume']).toBe(1);
    expect(metrics.errors_by_domain['onboarding']).toBe(1);
  });
});

describe('avg_duration_ms', () => {
  it('calculates average correctly', () => {
    recordPipelineCompletion('resume', 4000, 0);
    recordPipelineCompletion('resume', 6000, 0);
    expect(getPipelineMetrics().avg_duration_ms).toBe(5000);
  });

  it('returns 0 when no completions recorded', () => {
    expect(getPipelineMetrics().avg_duration_ms).toBe(0);
  });
});

describe('llm_cost_estimate_total_usd', () => {
  it('accumulates cost correctly', () => {
    recordPipelineCompletion('resume', 1000, 0.1234);
    recordPipelineCompletion('resume', 1000, 0.0566);
    expect(getPipelineMetrics().llm_cost_estimate_total_usd).toBe(0.18);
  });
});

describe('recordActiveUser', () => {
  it('counts users within 24h window', () => {
    recordActiveUser('user-1');
    recordActiveUser('user-2');
    recordActiveUser('user-3');
    expect(getPipelineMetrics().active_users_24h).toBe(3);
  });

  it('updates timestamp for existing user (no double-count)', () => {
    recordActiveUser('user-1');
    recordActiveUser('user-1');
    expect(getPipelineMetrics().active_users_24h).toBe(1);
  });

  it('does not count users outside 24h window', () => {
    const now = Date.now();
    // Mock Date.now to be 25h in the past
    vi.spyOn(Date, 'now').mockReturnValueOnce(now - 25 * 60 * 60 * 1000);
    recordActiveUser('old-user');
    vi.restoreAllMocks();
    expect(getPipelineMetrics().active_users_24h).toBe(0);
  });
});

describe('resetPipelineMetricsForTest', () => {
  it('clears all counters and maps', () => {
    recordPipelineCompletion('resume', 5000, 0.25);
    recordPipelineError('resume');
    recordActiveUser('user-1');

    resetPipelineMetricsForTest();

    const metrics = getPipelineMetrics();
    expect(metrics.completions_total).toBe(0);
    expect(metrics.errors_total).toBe(0);
    expect(metrics.completions_by_domain).toEqual({});
    expect(metrics.errors_by_domain).toEqual({});
    expect(metrics.avg_duration_ms).toBe(0);
    expect(metrics.llm_cost_estimate_total_usd).toBe(0);
    expect(metrics.active_users_24h).toBe(0);
  });
});

describe('multiple domains tracked separately', () => {
  it('keeps domain counts independent', () => {
    recordPipelineCompletion('resume', 1000, 0.1);
    recordPipelineCompletion('resume', 1000, 0.1);
    recordPipelineCompletion('onboarding', 500, 0.01);
    recordPipelineError('resume');
    recordPipelineError('cover_letter');
    recordPipelineError('cover_letter');

    const metrics = getPipelineMetrics();
    expect(metrics.completions_by_domain['resume']).toBe(2);
    expect(metrics.completions_by_domain['onboarding']).toBe(1);
    expect(metrics.errors_by_domain['resume']).toBe(1);
    expect(metrics.errors_by_domain['cover_letter']).toBe(2);
    expect(metrics.errors_by_domain['onboarding']).toBeUndefined();
  });
});
