#!/usr/bin/env node
import { spawn } from 'node:child_process';
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
const singleRunner = path.join(serverRoot, 'scripts', 'load-profile.mjs');

const TIER_PRESETS = {
  small: {
    users: 12,
    readRequests: 600,
    readConcurrency: 60,
    sseHoldUsers: 12,
    sseHoldMs: 5000,
    sseChurnRequests: 80,
    sseChurnConcurrency: 24,
    pipelineRequests: 24,
    pipelineConcurrency: 24,
    provisionDelayMs: 120,
  },
  medium: {
    users: 40,
    readRequests: 2400,
    readConcurrency: 120,
    sseHoldUsers: 40,
    sseHoldMs: 12000,
    sseChurnRequests: 200,
    sseChurnConcurrency: 50,
    pipelineRequests: 80,
    pipelineConcurrency: 80,
    provisionDelayMs: 120,
  },
  large: {
    users: 80,
    readRequests: 4800,
    readConcurrency: 200,
    sseHoldUsers: 80,
    sseHoldMs: 15000,
    sseChurnRequests: 400,
    sseChurnConcurrency: 100,
    pipelineRequests: 160,
    pipelineConcurrency: 160,
    provisionDelayMs: 180,
  },
};

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

function toBool(value, fallback = false) {
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function round(n) {
  return Math.round(n * 100) / 100;
}

function formatMs(n) {
  if (!Number.isFinite(n)) return '-';
  return `${Math.round(n)}ms`;
}

function printUsage() {
  console.log(`Tiered load profile runner (small/medium/large).

Usage:
  npm run load:profile:tiers -- [options]

Options:
  --tiers=small,medium,large
  --port=3101
  --cleanup=true|false
  --skip-sse=true|false
  --skip-pipeline=true|false
  --pause-ms=1500
  --pretty=true|false

Examples:
  npm run load:profile:tiers
  npm run load:profile:tiers -- --tiers=small,medium
  npm run load:profile:tiers -- --tiers=small --skip-pipeline=true
`);
}

function mapPresetToArgs(preset) {
  return [
    `--users=${preset.users}`,
    `--read-requests=${preset.readRequests}`,
    `--read-concurrency=${preset.readConcurrency}`,
    `--sse-hold-users=${preset.sseHoldUsers}`,
    `--sse-hold-ms=${preset.sseHoldMs}`,
    `--sse-churn-requests=${preset.sseChurnRequests}`,
    `--sse-churn-concurrency=${preset.sseChurnConcurrency}`,
    `--pipeline-requests=${preset.pipelineRequests}`,
    `--pipeline-concurrency=${preset.pipelineConcurrency}`,
    `--provision-delay-ms=${preset.provisionDelayMs}`,
  ];
}

function extractStep(report, keyStartsWith) {
  return report?.results?.find((r) => typeof r?.name === 'string' && r.name.toLowerCase().startsWith(keyStartsWith)) ?? null;
}

function statusSummary(step) {
  if (!step?.statusCounts) return '-';
  return Object.entries(step.statusCounts)
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    .map(([k, v]) => `${k}:${v}`)
    .join(' ');
}

async function runSingleTier({ tierName, preset, globalFlags }) {
  const args = [
    singleRunner,
    '--pretty=false',
    ...mapPresetToArgs(preset),
    `--port=${globalFlags.port}`,
    `--cleanup=${globalFlags.cleanup}`,
    `--skip-sse=${globalFlags.skipSSE}`,
    `--skip-pipeline=${globalFlags.skipPipeline}`,
  ];

  if (globalFlags.extraArgs['provision-retries']) {
    args.push(`--provision-retries=${globalFlags.extraArgs['provision-retries']}`);
  }
  if (globalFlags.extraArgs['provision-retry-delay-ms']) {
    args.push(`--provision-retry-delay-ms=${globalFlags.extraArgs['provision-retry-delay-ms']}`);
  }
  if (globalFlags.extraArgs['patch-batch-size']) {
    args.push(`--patch-batch-size=${globalFlags.extraArgs['patch-batch-size']}`);
  }

  return new Promise((resolve, reject) => {
    const proc = spawn('node', args, { cwd: serverRoot, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`[${tierName}] exited ${code}\n${stderr || stdout}`));
        return;
      }
      const line = stdout.trim().split('\n').filter(Boolean).slice(-1)[0];
      if (!line) {
        reject(new Error(`[${tierName}] no JSON output`));
        return;
      }
      try {
        const parsed = JSON.parse(line);
        resolve(parsed);
      } catch (err) {
        reject(new Error(`[${tierName}] failed to parse JSON output: ${err instanceof Error ? err.message : String(err)}\n${stdout}`));
      }
    });
  });
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printTable(rows) {
  const header = '| Tier | Read RPS | Read p95 | SSE RPS | SSE p95 | Pipeline p95 | Status mix (read/sse/pipeline) |';
  const sep = '|---|---:|---:|---:|---:|---:|---|';
  console.log(header);
  console.log(sep);
  for (const row of rows) {
    console.log(`| ${row.tier} | ${row.readRps} | ${row.readP95} | ${row.sseRps} | ${row.sseP95} | ${row.pipelineP95} | ${row.statusMix} |`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (toBool(args.help) || toBool(args.h)) {
    printUsage();
    return;
  }

  const tiersRaw = String(args.tiers ?? 'small,medium,large')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  const tiers = tiersRaw.filter((t) => t in TIER_PRESETS);
  if (tiers.length === 0) {
    throw new Error(`No valid tiers selected. Available: ${Object.keys(TIER_PRESETS).join(', ')}`);
  }

  const invalid = tiersRaw.filter((t) => !(t in TIER_PRESETS));
  if (invalid.length > 0) {
    throw new Error(`Invalid tier(s): ${invalid.join(', ')}`);
  }

  const globalFlags = {
    port: toPositiveInt(args.port, 3101),
    cleanup: toBool(args.cleanup, true),
    skipSSE: toBool(args['skip-sse'], false),
    skipPipeline: toBool(args['skip-pipeline'], false),
    pauseMs: toPositiveInt(args['pause-ms'], 1500),
    pretty: toBool(args.pretty, true),
    extraArgs: args,
  };

  const reports = [];
  for (const tier of tiers) {
    const preset = TIER_PRESETS[tier];
    process.stderr.write(`[load-profile:tiers] Running tier '${tier}'...\n`);
    const report = await runSingleTier({ tierName: tier, preset, globalFlags });
    reports.push({ tier, report });
    if (globalFlags.pauseMs > 0 && tier !== tiers[tiers.length - 1]) {
      await sleep(globalFlags.pauseMs);
    }
  }

  const rows = reports.map(({ tier, report }) => {
    const read = extractStep(report, 'get /api/sessions');
    const sse = extractStep(report, 'sse churn');
    const pipeline = extractStep(report, 'post /api/pipeline/start');

    return {
      tier,
      readRps: read ? round(read.rps) : '-',
      readP95: read ? formatMs(read.p95) : '-',
      sseRps: sse ? round(sse.rps) : '-',
      sseP95: sse ? formatMs(sse.p95) : '-',
      pipelineP95: pipeline ? formatMs(pipeline.p95) : '-',
      statusMix: `${statusSummary(read)} / ${statusSummary(sse)} / ${statusSummary(pipeline)}`,
    };
  });

  if (globalFlags.pretty) {
    printTable(rows);
    console.log('');
  }

  const out = {
    timestamp: new Date().toISOString(),
    tiers,
    rows,
    reports: reports.map(({ tier, report }) => ({ tier, report })),
  };

  console.log(globalFlags.pretty ? JSON.stringify(out, null, 2) : JSON.stringify(out));
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[load-profile:tiers] ${msg}`);
  process.exit(1);
});
