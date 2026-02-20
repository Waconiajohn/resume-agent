const LATENCY_BUCKETS_MS = [50, 100, 250, 500, 1000, 2000, 5000, 10000];

interface RequestCounters {
  total: number;
  status_2xx: number;
  status_3xx: number;
  status_4xx: number;
  status_5xx: number;
  status_429: number;
  status_503: number;
}

const counters: RequestCounters = {
  total: 0,
  status_2xx: 0,
  status_3xx: 0,
  status_4xx: 0,
  status_5xx: 0,
  status_429: 0,
  status_503: 0,
};

let latencyCount = 0;
let latencySumMs = 0;
const latencyHistogram = new Array<number>(LATENCY_BUCKETS_MS.length + 1).fill(0);

function incrementStatus(status: number): void {
  if (status >= 200 && status < 300) counters.status_2xx += 1;
  else if (status >= 300 && status < 400) counters.status_3xx += 1;
  else if (status >= 400 && status < 500) counters.status_4xx += 1;
  else if (status >= 500) counters.status_5xx += 1;

  if (status === 429) counters.status_429 += 1;
  if (status === 503) counters.status_503 += 1;
}

function observeLatency(ms: number): void {
  latencyCount += 1;
  latencySumMs += ms;
  const idx = LATENCY_BUCKETS_MS.findIndex((limit) => ms <= limit);
  const bucketIndex = idx >= 0 ? idx : LATENCY_BUCKETS_MS.length;
  latencyHistogram[bucketIndex] += 1;
}

function estimatePercentile(p: number): number {
  if (latencyCount <= 0) return 0;
  const target = Math.max(1, Math.ceil(latencyCount * p));
  let running = 0;
  for (let i = 0; i < latencyHistogram.length; i += 1) {
    running += latencyHistogram[i];
    if (running >= target) {
      return i < LATENCY_BUCKETS_MS.length ? LATENCY_BUCKETS_MS[i] : LATENCY_BUCKETS_MS[LATENCY_BUCKETS_MS.length - 1];
    }
  }
  return LATENCY_BUCKETS_MS[LATENCY_BUCKETS_MS.length - 1];
}

export function recordRequestMetric(status: number, latencyMs: number): void {
  counters.total += 1;
  incrementStatus(status);
  observeLatency(latencyMs);
}

export function getRequestMetrics() {
  return {
    counters: { ...counters },
    latency: {
      count: latencyCount,
      avg_ms: latencyCount > 0 ? Math.round((latencySumMs / latencyCount) * 100) / 100 : 0,
      p50_ms_upper_bound: estimatePercentile(0.5),
      p95_ms_upper_bound: estimatePercentile(0.95),
      p99_ms_upper_bound: estimatePercentile(0.99),
      buckets_ms: LATENCY_BUCKETS_MS,
      histogram: [...latencyHistogram],
    },
  };
}

export function resetRequestMetricsForTest(): void {
  counters.total = 0;
  counters.status_2xx = 0;
  counters.status_3xx = 0;
  counters.status_4xx = 0;
  counters.status_5xx = 0;
  counters.status_429 = 0;
  counters.status_503 = 0;
  latencyCount = 0;
  latencySumMs = 0;
  latencyHistogram.fill(0);
}
