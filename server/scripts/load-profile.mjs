#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Safety guard: refuse to run against production
if (process.env.NODE_ENV === 'production') {
  console.error('ERROR: Load test scripts must not run in production (NODE_ENV=production). Aborting.');
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, '..');
const distIndexPath = path.join(serverRoot, 'dist', 'index.js');
const envPath = path.join(serverRoot, '.env');

function parseArgs(argv) {
  const out = {};
  for (const raw of argv) {
    if (!raw.startsWith('--')) continue;
    const item = raw.slice(2);
    const eq = item.indexOf('=');
    if (eq === -1) {
      out[item] = 'true';
      continue;
    }
    out[item.slice(0, eq)] = item.slice(eq + 1);
  }
  return out;
}

function parseEnv(text) {
  const out = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    out[key] = value;
  }
  return out;
}

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toBool(value, fallback = false) {
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function sanitizeError(err) {
  return err instanceof Error ? err.message : String(err);
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(fn, options = {}) {
  const maxAttempts = toPositiveInt(options.maxAttempts, 6);
  const baseDelayMs = toPositiveInt(options.baseDelayMs, 500);
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const message = sanitizeError(err);
      const retryable = /\b429\b|rate limit|over_request_rate_limit|timeout/i.test(message);
      if (!retryable || attempt === maxAttempts) break;
      const jitter = Math.floor(Math.random() * 250);
      await sleep(baseDelayMs * Math.pow(1.8, attempt - 1) + jitter);
    }
  }

  throw lastError;
}

async function waitForHealth(baseUrl, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) return true;
    } catch {
      // ignore during startup
    }
    await sleep(300);
  }
  return false;
}

async function runLoad(name, totalRequests, concurrency, task) {
  const latencies = [];
  const statusCounts = new Map();
  let next = 0;

  async function worker() {
    while (true) {
      const idx = next++;
      if (idx >= totalRequests) return;
      const t0 = performance.now();
      let status = 'error';
      try {
        status = await task(idx);
      } catch {
        status = 'error';
      }
      latencies.push(performance.now() - t0);
      statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
    }
  }

  const t0 = performance.now();
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const durationMs = performance.now() - t0;
  latencies.sort((a, b) => a - b);

  return {
    name,
    totalRequests,
    concurrency,
    durationMs,
    rps: totalRequests / (durationMs / 1000),
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    p99: percentile(latencies, 99),
    statusCounts: Object.fromEntries([...statusCounts.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])))),
  };
}

async function fetchMetrics(baseUrl, metricsKey) {
  try {
    const headers = metricsKey ? { Authorization: `Bearer ${metricsKey}` } : undefined;
    const res = await fetch(`${baseUrl}/metrics`, { headers });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function printUsage() {
  console.log(`Load profile runner for Resume Agent server.

Usage:
  npm run load:profile -- [options]

Common options:
  --port=3101
  --users=40
  --read-requests=2400
  --read-concurrency=120
  --sse-hold-users=40
  --sse-hold-ms=12000
  --sse-churn-requests=200
  --sse-churn-concurrency=50
  --pipeline-requests=80
  --pipeline-concurrency=80
  --provision-delay-ms=120
  --cleanup=true|false
  --skip-pipeline=true|false
  --skip-sse=true|false
  --pretty=true|false

Example:
  npm run load:profile -- --users=80 --read-requests=4800 --read-concurrency=200
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (toBool(args.help) || toBool(args.h)) {
    printUsage();
    return;
  }

  try {
    await access(distIndexPath);
  } catch {
    throw new Error('Missing server build output at server/dist/index.js. Run `npm run build` in server first.');
  }

  const envText = await readFile(envPath, 'utf8');
  const envFileVars = parseEnv(envText);
  const env = { ...envFileVars, ...process.env };

  const port = toPositiveInt(args.port, toPositiveInt(env.PORT, 3101));
  const baseUrl = `http://127.0.0.1:${port}`;
  const cleanup = toBool(args.cleanup, true);
  const skipPipeline = toBool(args['skip-pipeline'], false);
  const skipSSE = toBool(args['skip-sse'], false);
  const pretty = toBool(args.pretty, true);
  const provisionDelayMs = toPositiveInt(args['provision-delay-ms'], 120);

  const config = {
    users: toPositiveInt(args.users, 40),
    readRequests: toPositiveInt(args['read-requests'], 2400),
    readConcurrency: toPositiveInt(args['read-concurrency'], 120),
    sseHoldUsers: toPositiveInt(args['sse-hold-users'], 40),
    sseHoldMs: toPositiveInt(args['sse-hold-ms'], 12000),
    sseChurnRequests: toPositiveInt(args['sse-churn-requests'], 200),
    sseChurnConcurrency: toPositiveInt(args['sse-churn-concurrency'], 50),
    pipelineRequests: toPositiveInt(args['pipeline-requests'], 80),
    pipelineConcurrency: toPositiveInt(args['pipeline-concurrency'], 80),
  };

  const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY'];
  for (const key of required) {
    if (!env[key]) {
      throw new Error(`Missing required env var: ${key} (expected in server/.env)`);
    }
  }

  const createdUserIds = [];
  const userTokens = [];
  const userSessionIds = [];
  const holdControllers = [];
  let serverProc = null;
  let serverLogs = '';

  async function cleanupUsers() {
    if (!cleanup || createdUserIds.length === 0) return;
    await Promise.allSettled(createdUserIds.map((id) =>
      fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${id}`, {
        method: 'DELETE',
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }),
    ));
  }

  try {
    serverProc = spawn('node', [distIndexPath], {
      cwd: serverRoot,
      env: {
        ...process.env,
        ...env,
        PORT: String(port),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    serverProc.stdout.on('data', (d) => { serverLogs += d.toString(); });
    serverProc.stderr.on('data', (d) => { serverLogs += d.toString(); });

    const healthy = await waitForHealth(baseUrl, 30000);
    if (!healthy) throw new Error(`Server failed health check on ${baseUrl}\n${serverLogs.slice(-4000)}`);

    async function createUserAndToken(i) {
      const email = `load-profile-${Date.now()}-${i}-${Math.floor(Math.random() * 100000)}@example.com`;
      const password = `LoadProfile!${Math.floor(Math.random() * 1_000_000)}Aa`;

      const createRes = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password, email_confirm: true }),
      });
      if (!createRes.ok) {
        const body = await createRes.text().catch(() => '');
        throw new Error(`create user failed: ${createRes.status} ${body}`);
      }
      const created = await createRes.json();
      const userId = created?.id;
      if (!userId) throw new Error('create user returned no id');

      const tokenRes = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          apikey: env.SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });
      if (!tokenRes.ok) {
        const body = await tokenRes.text().catch(() => '');
        throw new Error(`token grant failed: ${tokenRes.status} ${body}`);
      }
      const tokenJson = await tokenRes.json();
      if (!tokenJson?.access_token) throw new Error('token grant returned no access_token');

      return { userId, token: tokenJson.access_token };
    }

    // Provision users and tokens with retry/backoff (auth API can rate-limit).
    for (let i = 0; i < config.users; i++) {
      const created = await withRetry(() => createUserAndToken(i), {
        maxAttempts: toPositiveInt(args['provision-retries'], 7),
        baseDelayMs: toPositiveInt(args['provision-retry-delay-ms'], 600),
      });
      createdUserIds.push(created.userId);
      userTokens.push(created.token);
      if (provisionDelayMs > 0) await sleep(provisionDelayMs);
    }

    // One session per user.
    for (const token of userTokens) {
      const res = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`create session failed: ${res.status} ${body}`);
      }
      const json = await res.json();
      const sessionId = json?.session?.id;
      if (!sessionId) throw new Error('create session returned no session id');
      userSessionIds.push(sessionId);
    }

    const metricsBaseline = await fetchMetrics(baseUrl, env.METRICS_KEY);

    const readResult = await runLoad(
      'GET /api/sessions (distributed users)',
      config.readRequests,
      config.readConcurrency,
      async (i) => {
        const token = userTokens[i % userTokens.length];
        const res = await fetch(`${baseUrl}/api/sessions`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        return String(res.status);
      },
    );

    const metricsAfterReads = await fetchMetrics(baseUrl, env.METRICS_KEY);

    let metricsDuringSSE = null;
    let metricsAfterSSE = null;
    let sseChurnResult = null;

    if (!skipSSE) {
      const holdCount = Math.min(config.sseHoldUsers, userTokens.length);
      const holdResponses = [];
      for (let i = 0; i < holdCount; i++) {
        const ctrl = new AbortController();
        holdControllers.push(ctrl);
        const token = userTokens[i];
        const sessionId = userSessionIds[i];
        const p = fetch(`${baseUrl}/api/sessions/${sessionId}/sse`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: ctrl.signal,
        }).catch(() => null);
        holdResponses.push(p);
      }

      // Give connections time to establish before taking metrics snapshot.
      await sleep(1500);
      metricsDuringSSE = await fetchMetrics(baseUrl, env.METRICS_KEY);
      await sleep(config.sseHoldMs);

      for (const ctrl of holdControllers) ctrl.abort();
      holdControllers.length = 0;
      // Ensure responses settle.
      await Promise.allSettled(holdResponses);
      await sleep(1500);
      metricsAfterSSE = await fetchMetrics(baseUrl, env.METRICS_KEY);

      sseChurnResult = await runLoad(
        'SSE churn (distributed users, explicit close)',
        config.sseChurnRequests,
        config.sseChurnConcurrency,
        async (i) => {
          const token = userTokens[i % userTokens.length];
          const sessionId = userSessionIds[i % userSessionIds.length];
          const res = await fetch(`${baseUrl}/api/sessions/${sessionId}/sse`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const status = String(res.status);
          // Explicitly close stream body to avoid client-side lingering sockets.
          if (res.body) {
            try { await res.body.cancel(); } catch { /* ignore */ }
          }
          return status;
        },
      );
    }

    let pipelineResult = null;
    if (!skipPipeline) {
      // Put all user sessions into running to test cheap conflict path.
      const patchBatchSize = toPositiveInt(args['patch-batch-size'], 10);
      for (let i = 0; i < userSessionIds.length; i += patchBatchSize) {
        const slice = userSessionIds.slice(i, i + patchBatchSize);
        await Promise.all(slice.map((sessionId) =>
          fetch(`${env.SUPABASE_URL}/rest/v1/coach_sessions?id=eq.${sessionId}`, {
            method: 'PATCH',
            headers: {
              apikey: env.SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
              Prefer: 'return=minimal',
            },
            body: JSON.stringify({
              pipeline_status: 'running',
              pipeline_stage: 'intake',
              pending_gate: null,
              pending_gate_data: null,
            }),
          }),
        ));
      }

      pipelineResult = await runLoad(
        'POST /api/pipeline/start (distributed contention)',
        config.pipelineRequests,
        config.pipelineConcurrency,
        async (i) => {
          const idx = i % userTokens.length;
          const res = await fetch(`${baseUrl}/api/pipeline/start`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${userTokens[idx]}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              session_id: userSessionIds[idx],
              raw_resume_text: 'X'.repeat(120),
              job_description: 'Senior role requiring leadership, strategy, and execution.',
              company_name: 'Load Profile Co',
            }),
          });
          return String(res.status);
        },
      );
    }

    const metricsAfterAll = await fetchMetrics(baseUrl, env.METRICS_KEY);

    const output = {
      timestamp: new Date().toISOString(),
      config: {
        ...config,
        cleanup,
        skipSSE,
        skipPipeline,
        provisionDelayMs,
      },
      env: {
        MAX_TOTAL_SSE_CONNECTIONS: env.MAX_TOTAL_SSE_CONNECTIONS ?? null,
        MAX_SSE_RATE_USERS: env.MAX_SSE_RATE_USERS ?? null,
        MAX_RATE_LIMIT_BUCKETS: env.MAX_RATE_LIMIT_BUCKETS ?? null,
        MAX_PROCESSING_SESSIONS: env.MAX_PROCESSING_SESSIONS ?? null,
        MAX_PROCESSING_SESSIONS_PER_USER: env.MAX_PROCESSING_SESSIONS_PER_USER ?? null,
        MAX_IN_PROCESS_PIPELINES: env.MAX_IN_PROCESS_PIPELINES ?? null,
        MAX_RUNNING_PIPELINES_PER_USER: env.MAX_RUNNING_PIPELINES_PER_USER ?? null,
        MAX_RUNNING_PIPELINES_GLOBAL: env.MAX_RUNNING_PIPELINES_GLOBAL ?? null,
        STALE_RECOVERY_COOLDOWN_MS: env.STALE_RECOVERY_COOLDOWN_MS ?? null,
        MAX_QUEUED_PANEL_PERSISTS: env.MAX_QUEUED_PANEL_PERSISTS ?? null,
      },
      results: [readResult, sseChurnResult, pipelineResult].filter(Boolean),
      metrics: {
        baseline: metricsBaseline,
        after_reads: metricsAfterReads,
        during_sse_hold: metricsDuringSSE,
        after_sse_hold: metricsAfterSSE,
        after_all: metricsAfterAll,
      },
    };

    console.log(pretty ? JSON.stringify(output, null, 2) : JSON.stringify(output));
  } finally {
    for (const ctrl of holdControllers) ctrl.abort();
    await cleanupUsers().catch(() => {});
    if (serverProc) {
      serverProc.kill('SIGTERM');
      await sleep(700);
      if (!serverProc.killed) serverProc.kill('SIGKILL');
    }
  }
}

main().catch((err) => {
  console.error(`[load-profile] ${sanitizeError(err)}`);
  process.exit(1);
});
