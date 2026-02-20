import { describe, it, expect, beforeEach } from 'vitest';
import {
  getRequestMetrics,
  recordRequestMetric,
  resetRequestMetricsForTest,
} from '../lib/request-metrics.js';

describe('request metrics', () => {
  beforeEach(() => {
    resetRequestMetricsForTest();
  });

  it('tracks status counters and special statuses', () => {
    recordRequestMetric(200, 25);
    recordRequestMetric(204, 60);
    recordRequestMetric(302, 80);
    recordRequestMetric(429, 120);
    recordRequestMetric(503, 1500);

    const metrics = getRequestMetrics();
    expect(metrics.counters.total).toBe(5);
    expect(metrics.counters.status_2xx).toBe(2);
    expect(metrics.counters.status_3xx).toBe(1);
    expect(metrics.counters.status_4xx).toBe(1);
    expect(metrics.counters.status_5xx).toBe(1);
    expect(metrics.counters.status_429).toBe(1);
    expect(metrics.counters.status_503).toBe(1);
  });

  it('computes latency aggregates and percentile upper bounds', () => {
    recordRequestMetric(200, 40);
    recordRequestMetric(200, 90);
    recordRequestMetric(200, 260);
    recordRequestMetric(200, 1200);
    recordRequestMetric(200, 7400);

    const metrics = getRequestMetrics();
    expect(metrics.latency.count).toBe(5);
    expect(metrics.latency.avg_ms).toBe(1798);
    expect(metrics.latency.p50_ms_upper_bound).toBe(500);
    expect(metrics.latency.p95_ms_upper_bound).toBe(10000);
    expect(metrics.latency.p99_ms_upper_bound).toBe(10000);
    expect(metrics.latency.histogram.reduce((sum, n) => sum + n, 0)).toBe(5);
  });
});
