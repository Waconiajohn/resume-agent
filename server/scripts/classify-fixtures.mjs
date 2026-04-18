// Phase 3 runner: classify every fixture in extracted/ and write the output
// to snapshots/<slug>/classify.json. Prints per-fixture + total tokens and
// a dollar estimate for the cost trajectory log.
//
// Usage:
//   node --import tsx --env-file=.env scripts/classify-fixtures.mjs [options]
//
// Options:
//   --only <slug>              run a single fixture
//   --subset                   run the 6 diverse fixtures chosen for iteration
//   --filter key=value         run fixtures whose meta matches (repeatable)
//   --prompt-variant <suffix>  load classify.<suffix>.md (default: v1)
//   --no-write                 print output to stdout, do not overwrite snapshots
//   --dry-run                  list fixtures that would run; do not call LLM
//   -h, --help                 print usage
//
// Cost model (claude-opus-4-7 as of 2026-04, published rates):
//   Input:  $15.00 / million tokens
//   Output: $75.00 / million tokens
//
// The total dollar estimate printed at end is a running total for the process —
// not a persistent counter. See docs/v3-rebuild/reports/phase-3-eval.md for the
// cost trajectory across iterations.

import {
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  statSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { classifyWithTelemetry } from '../src/v3/classify/index.ts';

// ─── Paths ─────────────────────────────────────────────────────────────

const HERE = resolve(fileURLToPath(import.meta.url), '..');
const EXTRACTED_DIR = resolve(HERE, '../test-fixtures/resumes/extracted');
const META_DIR = resolve(HERE, '../test-fixtures/resumes/meta');
const SNAPSHOTS_DIR = resolve(HERE, '../test-fixtures/snapshots');

// ─── Diverse subset (Phase 3 iteration target) ─────────────────────────

// Six fixtures spanning the hardest classify challenges. Chosen to exercise
// each major failure mode without costing a full 19-fixture run every iteration.
const DIVERSE_SUBSET = new Set([
  'fixture-01-ben-wedewer-resume-trimmed',              // clean, no-surprise baseline
  'fixture-04-bshook-resume-dirpm-primary',             // cert/edu bleed risk (PMP+MBA+BS+LSS in one block)
  'fixture-07-diana-downs-fst-resume-template',         // unfilled template placeholders (Rule 10)
  'fixture-09-jay-alger-sr-strat-and-bd-ldr',           // U.S. Bank umbrella (Collins Aerospace, 5 sub-roles)
  'fixture-14-lj-2025-resume-v1-7-26',                  // unusual formatting (post-base64-strip)
  'fixture-18-steve-alexander-resume-25',               // career gap narrative (Tatiana pattern)
]);

// ─── Pricing ───────────────────────────────────────────────────────────

const PRICE_INPUT_PER_M = 15.0;   // $ per million input tokens
const PRICE_OUTPUT_PER_M = 75.0;  // $ per million output tokens

function cost(inputTokens, outputTokens) {
  return (inputTokens / 1_000_000) * PRICE_INPUT_PER_M +
    (outputTokens / 1_000_000) * PRICE_OUTPUT_PER_M;
}

// ─── CLI ───────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = {
    only: null,
    subset: false,
    filters: {},
    variant: 'v1',
    write: true,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--only') opts.only = argv[++i];
    else if (a.startsWith('--only=')) opts.only = a.slice(7);
    else if (a === '--subset') opts.subset = true;
    else if (a === '--filter') {
      const kv = argv[++i];
      const eq = kv.indexOf('=');
      if (eq < 1) throw new Error(`--filter expected key=value, got "${kv}"`);
      opts.filters[kv.slice(0, eq)] = kv.slice(eq + 1);
    } else if (a.startsWith('--filter=')) {
      const kv = a.slice(9);
      const eq = kv.indexOf('=');
      if (eq < 1) throw new Error(`--filter expected key=value, got "${kv}"`);
      opts.filters[kv.slice(0, eq)] = kv.slice(eq + 1);
    } else if (a === '--prompt-variant') opts.variant = argv[++i];
    else if (a.startsWith('--prompt-variant=')) opts.variant = a.slice(17);
    else if (a === '--no-write') opts.write = false;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '-h' || a === '--help') {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return opts;
}

function printUsage() {
  process.stdout.write(
    [
      'v3 classify fixture runner',
      '',
      'Usage: node --import tsx --env-file=.env scripts/classify-fixtures.mjs [options]',
      '',
      'Options:',
      '  --only <slug>              run a single fixture by slug',
      '  --subset                   run the 6 diverse Phase 3 fixtures',
      '  --filter key=value         filter by meta field (repeatable)',
      '  --prompt-variant <suffix>  classify.<suffix>.md (default: v1)',
      '  --no-write                 do not overwrite snapshots (print to stdout)',
      '  --dry-run                  list fixtures; do not call LLM',
      '  -h, --help                 print this usage',
      '',
      'Diverse subset fixtures:',
      ...[...DIVERSE_SUBSET].map((s) => `  - ${s}`),
      '',
    ].join('\n'),
  );
}

// ─── Discovery ─────────────────────────────────────────────────────────

function loadMeta(slug) {
  const path = join(META_DIR, `${slug}.yaml`);
  if (!existsSync(path)) return null;
  return yaml.load(readFileSync(path, 'utf8'));
}

function discoverFixtures() {
  if (!existsSync(EXTRACTED_DIR)) return [];
  return readdirSync(EXTRACTED_DIR)
    .filter((f) => f.endsWith('.txt'))
    .sort()
    .map((f) => {
      const slug = f.slice(0, -4);
      return {
        slug,
        extractedPath: join(EXTRACTED_DIR, f),
        meta: loadMeta(slug),
      };
    });
}

function filterFixtures(fixtures, opts) {
  let out = fixtures;
  if (opts.only) {
    out = out.filter((f) => f.slug === opts.only);
    if (out.length === 0) throw new Error(`--only "${opts.only}" matched no fixtures`);
  }
  if (opts.subset) {
    out = out.filter((f) => DIVERSE_SUBSET.has(f.slug));
  }
  for (const [k, v] of Object.entries(opts.filters)) {
    out = out.filter((f) => {
      if (!f.meta) return false;
      if (k === 'category') return f.meta.category === v;
      const c = f.meta.characteristics ?? {};
      return String(c[k]) === v;
    });
  }
  return out;
}

// ─── Run ────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const all = discoverFixtures();
  const fixtures = filterFixtures(all, opts);

  if (fixtures.length === 0) {
    console.log('No fixtures matched.');
    return;
  }

  console.log(`# Classify run (variant: ${opts.variant})`);
  console.log(`# Fixtures: ${fixtures.length}`);
  console.log(`# Pricing: $${PRICE_INPUT_PER_M}/M input, $${PRICE_OUTPUT_PER_M}/M output`);
  console.log('');

  if (opts.dryRun) {
    for (const f of fixtures) console.log(`[dry] ${f.slug}  (${f.meta?.category ?? 'no-meta'})`);
    return;
  }

  const results = [];
  let totalInput = 0;
  let totalOutput = 0;
  let totalFailed = 0;

  for (const fixture of fixtures) {
    const text = readFileSync(fixture.extractedPath, 'utf8');
    const extracted = { plaintext: text, format: 'text', warnings: [] };
    const start = Date.now();

    console.log(`→ ${fixture.slug}  (${fixture.meta?.category ?? 'no-meta'})`);

    let telemetry = null;
    let resume = null;
    let error = null;
    try {
      const out = await classifyWithTelemetry(extracted, { variant: opts.variant });
      resume = out.resume;
      telemetry = out.telemetry;
    } catch (err) {
      error = err;
      totalFailed++;
    }

    const ms = Date.now() - start;

    if (error) {
      console.log(`   ✗ FAILED: ${error instanceof Error ? error.message : String(error)}`);
      results.push({ fixture, error: String(error), ms });
      continue;
    }

    const inputTokens = telemetry.inputTokens;
    const outputTokens = telemetry.outputTokens;
    const runCost = cost(inputTokens, outputTokens);
    totalInput += inputTokens;
    totalOutput += outputTokens;

    // Persist the snapshot.
    if (opts.write) {
      const snapshotDir = join(SNAPSHOTS_DIR, fixture.slug);
      mkdirSync(snapshotDir, { recursive: true });
      writeFileSync(
        join(snapshotDir, 'classify.json'),
        JSON.stringify(resume, null, 2) + '\n',
      );
      writeFileSync(
        join(snapshotDir, 'classify.telemetry.json'),
        JSON.stringify(telemetry, null, 2) + '\n',
      );
    }

    console.log(
      `   ✓ ${ms}ms  in=${inputTokens}tok out=${outputTokens}tok $${runCost.toFixed(4)}` +
        ` | positions=${resume.positions.length} edu=${resume.education.length} certs=${resume.certifications.length} gaps=${resume.careerGaps.length} flags=${resume.flags.length} conf=${resume.overallConfidence.toFixed(2)} pronoun=${resume.pronoun ?? 'null'}`,
    );

    results.push({ fixture, telemetry, resume, ms });
  }

  // ─── Totals ───────────────────────────────────────────────────────────

  const totalCost = cost(totalInput, totalOutput);
  console.log('');
  console.log('# Totals');
  console.log(`# input_tokens: ${totalInput}`);
  console.log(`# output_tokens: ${totalOutput}`);
  console.log(`# estimated_cost: $${totalCost.toFixed(4)}`);
  console.log(`# ok: ${results.length - totalFailed}  failed: ${totalFailed}`);

  if (totalFailed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('FATAL:', err instanceof Error ? err.stack : err);
  process.exit(2);
});
