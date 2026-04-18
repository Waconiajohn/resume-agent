// Phase 4.11 runner: re-run ONLY the verify stage against existing Phase 4.10
// snapshots. Isolates the verify v1.2.1 prompt change as the sole variable.
//
// Usage:
//   node --import tsx --env-file=.env scripts/verify-only.mjs [--only <slug>]
//
// Reads: snapshots/<slug>/classify.json, strategy.json, written.json
// Writes: snapshots/<slug>/verify.json, verify.telemetry.json (OVERWRITES)
//
// Cost model: verify on gpt-4.1 ~$0.023/fixture × 19 ≈ $0.44.

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyWithTelemetry } from '../src/v3/verify/index.ts';

const HERE = resolve(fileURLToPath(import.meta.url), '..');
const SNAPSHOTS_DIR = resolve(HERE, '../test-fixtures/snapshots');

const PRICING = {
  'deepseek-ai/deepseek-v3.2-maas': { input: 0.14, output: 0.28 },
  'gpt-4.1': { input: 2.0, output: 8.0 },
  'gpt-5': { input: 5.0, output: 15.0 },
  'gpt-5-mini': { input: 0.50, output: 1.50 },
};

function costOf(model, inTok, outTok) {
  const p = PRICING[model];
  if (!p) return 0;
  return (inTok / 1_000_000) * p.input + (outTok / 1_000_000) * p.output;
}

function parseArgs(argv) {
  const opts = { only: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--only') opts.only = argv[++i];
  }
  return opts;
}

function discoverSnapshots() {
  return readdirSync(SNAPSHOTS_DIR)
    .filter((d) => d.startsWith('fixture-'))
    .filter((d) => {
      const dir = join(SNAPSHOTS_DIR, d);
      return (
        existsSync(join(dir, 'classify.json')) &&
        existsSync(join(dir, 'strategy.json')) &&
        existsSync(join(dir, 'written.json'))
      );
    })
    .sort();
}

async function runVerify(slug) {
  const dir = join(SNAPSHOTS_DIR, slug);
  const resume = JSON.parse(readFileSync(join(dir, 'classify.json'), 'utf8'));
  const strategy = JSON.parse(readFileSync(join(dir, 'strategy.json'), 'utf8'));
  const written = JSON.parse(readFileSync(join(dir, 'written.json'), 'utf8'));

  const v = await verifyWithTelemetry(written, resume, strategy, { variant: 'v1' });

  writeFileSync(join(dir, 'verify.json'), JSON.stringify(v.result, null, 2) + '\n');
  writeFileSync(join(dir, 'verify.telemetry.json'), JSON.stringify(v.telemetry, null, 2) + '\n');

  const cost = costOf(v.telemetry.model, v.telemetry.inputTokens, v.telemetry.outputTokens);
  const errCount = v.result.issues.filter((i) => i.severity === 'error').length;
  const warnCount = v.result.issues.filter((i) => i.severity === 'warning').length;

  return { slug, passed: v.result.passed, errCount, warnCount, cost, telemetry: v.telemetry };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  let fixtures = discoverSnapshots();
  if (opts.only) fixtures = fixtures.filter((f) => f === opts.only);

  console.log(`# verify-only re-run (fixtures: ${fixtures.length})`);
  console.log(`# variant: v1 (reads server/prompts/verify.v1.md at current HEAD)`);
  console.log('');

  const results = [];
  let totalCost = 0;
  let totalPassed = 0;

  for (const slug of fixtures) {
    process.stdout.write(`→ ${slug}\n`);
    try {
      const r = await runVerify(slug);
      totalCost += r.cost;
      if (r.passed) totalPassed++;
      process.stdout.write(
        `   verify: ${r.telemetry.durationMs}ms  passed=${r.passed}  errors=${r.errCount}  warnings=${r.warnCount}  $${r.cost.toFixed(4)}\n\n`,
      );
      results.push(r);
    } catch (err) {
      process.stdout.write(`   ✗ FAILED: ${err instanceof Error ? err.message : String(err)}\n\n`);
    }
  }

  console.log('# Totals');
  console.log(`# fixtures: ${fixtures.length}`);
  console.log(`# passed:   ${totalPassed}/${results.length}`);
  console.log(`# cost:     $${totalCost.toFixed(4)}`);

  for (const r of results) {
    const status = r.passed ? 'PASS' : `FAIL ${r.errCount}`;
    console.log(`${r.slug.padEnd(50)} ${status}`);
  }
}

main().catch((err) => {
  console.error('FATAL:', err instanceof Error ? err.stack : err);
  process.exit(2);
});
