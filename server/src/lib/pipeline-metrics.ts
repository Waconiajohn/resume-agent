interface PipelineCounters {
  completions_total: number;
  errors_total: number;
  completions_by_domain: Record<string, number>;
  errors_by_domain: Record<string, number>;
}

const counters: PipelineCounters = {
  completions_total: 0,
  errors_total: 0,
  completions_by_domain: {},
  errors_by_domain: {},
};

let durationCount = 0;
let durationSumMs = 0;

let costTotalUsd = 0;

// Active users: Map<userId, lastSeenTs> — count entries where lastSeen is within 24h
const activeUsers = new Map<string, number>();
const ACTIVE_USER_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_ACTIVE_USERS = 10_000;

export function recordPipelineCompletion(domain: string, durationMs: number, costUsd: number): void {
  counters.completions_total += 1;
  counters.completions_by_domain[domain] = (counters.completions_by_domain[domain] ?? 0) + 1;
  durationCount += 1;
  durationSumMs += durationMs;
  costTotalUsd += costUsd;
}

export function recordPipelineError(domain: string): void {
  counters.errors_total += 1;
  counters.errors_by_domain[domain] = (counters.errors_by_domain[domain] ?? 0) + 1;
}

export function recordActiveUser(userId: string): void {
  if (!activeUsers.has(userId) && activeUsers.size >= MAX_ACTIVE_USERS) {
    // Evict the oldest entry
    let oldestKey: string | undefined;
    let oldestTs = Infinity;
    for (const [key, ts] of activeUsers) {
      if (ts < oldestTs) {
        oldestTs = ts;
        oldestKey = key;
      }
    }
    if (oldestKey !== undefined) {
      activeUsers.delete(oldestKey);
    }
  }
  activeUsers.set(userId, Date.now());
}

export function getPipelineMetrics() {
  const now = Date.now();
  let activeUsers24h = 0;
  for (const ts of activeUsers.values()) {
    if (now - ts < ACTIVE_USER_WINDOW_MS) {
      activeUsers24h += 1;
    }
  }

  return {
    completions_total: counters.completions_total,
    errors_total: counters.errors_total,
    completions_by_domain: { ...counters.completions_by_domain },
    errors_by_domain: { ...counters.errors_by_domain },
    avg_duration_ms: durationCount > 0 ? Math.round(durationSumMs / durationCount) : 0,
    llm_cost_estimate_total_usd: Math.round(costTotalUsd * 10000) / 10000,
    active_users_24h: activeUsers24h,
  };
}

export function resetPipelineMetricsForTest(): void {
  counters.completions_total = 0;
  counters.errors_total = 0;
  counters.completions_by_domain = {};
  counters.errors_by_domain = {};
  durationCount = 0;
  durationSumMs = 0;
  costTotalUsd = 0;
  activeUsers.clear();
}
