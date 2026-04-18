// Phase 4 runner: full 5-stage pipeline against every resume fixture paired
// with a JD. Writes per-stage snapshots to snapshots/<slug>/<stage>.json.
//
// Usage:
//   node --import tsx --env-file=.env scripts/pipeline-fixtures.mjs [options]
//
// Options:
//   --only <slug>              run a single fixture
//   --subset                   run the 3 pilot fixtures for Phase 4 iteration
//   --jd <slug>                pair against a specific JD slug from
//                              server/test-fixtures/job-descriptions/meta/
//                              (default: jd-01-under-armour-account-manager-wholesale)
//   --variant <suffix>         prompt variant suffix (default: v1)
//   --skip-classify            read classify.json snapshot instead of re-running
//                              classify (saves time + cost when iterating on
//                              downstream prompts)
//   --dry-run                  list fixtures; do not call LLM
//   -h, --help                 usage
//
// Cost model per fixture on DeepSeek-on-Vertex (Phase 3.5 default):
//   Classify:     ~$0.003
//   Strategize:   ~$0.002
//   Write (6 sections, parallel): ~$0.008
//   Verify:       ~$0.003
//   Total per fixture:   ~$0.015-$0.020   (~$0.30 for full 19)
//
// With --skip-classify the fixture's classify.json is reused; without it,
// classify runs fresh.
// Opus/Sonnet pricing kept in PRICING table for the dev-override scenario
// (RESUME_V3_PROVIDER=anthropic); the script reads telemetry.model to select
// the right pricing row.

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
import { extract } from '../src/v3/extract/index.ts';
import { classifyWithTelemetry } from '../src/v3/classify/index.ts';
import { strategizeWithTelemetry } from '../src/v3/strategize/index.ts';
import { writeWithTelemetry } from '../src/v3/write/index.ts';
import { verifyWithTelemetry } from '../src/v3/verify/index.ts';

// ─── Paths ─────────────────────────────────────────────────────────────

const HERE = resolve(fileURLToPath(import.meta.url), '..');
const EXTRACTED_DIR = resolve(HERE, '../test-fixtures/resumes/extracted');
const META_DIR = resolve(HERE, '../test-fixtures/resumes/meta');
const SNAPSHOTS_DIR = resolve(HERE, '../test-fixtures/snapshots');
const JD_RAW_DIR = resolve(HERE, '../test-fixtures/job-descriptions/raw');
const JD_META_DIR = resolve(HERE, '../test-fixtures/job-descriptions/meta');

// Phase 4 pilot subset — 3 fixtures that exercise distinct strategy surfaces.
const PILOT_SUBSET = new Set([
  'fixture-01-ben-wedewer-resume-trimmed',     // clean, rich cross-role highlight + strategy alignment
  'fixture-09-jay-alger-sr-strat-and-bd-ldr',  // dense umbrella, many sub-roles for positionEmphasis
  'fixture-18-steve-alexander-resume-25',      // career gap triggers objection handling
]);

// Pricing ($ per million tokens). Vertex-hosted DeepSeek is the default
// production model and the Phase 3.5 rate target.
const PRICING = {
  'deepseek-ai/deepseek-v3.2-maas': { input: 0.14, output: 0.28 },
  'deepseek-ai/DeepSeek-V3.2': { input: 0.14, output: 0.28 },
  'deepseek-chat': { input: 0.14, output: 0.28 },
  'claude-opus-4-7': { input: 15.0, output: 75.0 },
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
};

function costOf(model, inTokens, outTokens) {
  const p = PRICING[model];
  if (!p) {
    // Fall back to DeepSeek rates — safer default than zero.
    return (inTokens / 1_000_000) * 0.14 + (outTokens / 1_000_000) * 0.28;
  }
  return (inTokens / 1_000_000) * p.input + (outTokens / 1_000_000) * p.output;
}

// ─── CLI ───────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = {
    only: null,
    subset: false,
    jd: 'jd-01-under-armour-account-manager-wholesale',
    variant: 'v1',
    skipClassify: false,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--only') opts.only = argv[++i];
    else if (a === '--subset') opts.subset = true;
    else if (a === '--jd') opts.jd = argv[++i];
    else if (a === '--variant') opts.variant = argv[++i];
    else if (a === '--skip-classify') opts.skipClassify = true;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '-h' || a === '--help') { printUsage(); process.exit(0); }
    else throw new Error(`Unknown argument: ${a}`);
  }
  return opts;
}

function printUsage() {
  process.stdout.write(
    [
      'v3 pipeline fixture runner (Phase 4)',
      '',
      'Usage: node --import tsx --env-file=.env scripts/pipeline-fixtures.mjs [options]',
      '',
      'Options:',
      '  --only <slug>            single fixture',
      '  --subset                 3 pilot fixtures (fixture-01, fixture-09, fixture-18)',
      '  --jd <slug>              JD to pair against (default: jd-01-under-armour-account-manager-wholesale)',
      '  --variant <suffix>       prompt variant (default: v1)',
      '  --skip-classify          reuse existing classify.json (saves ~$0.50/fixture)',
      '  --dry-run                list fixtures without LLM calls',
      '  -h, --help               usage',
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

function loadJd(slug) {
  const metaPath = join(JD_META_DIR, `${slug}.yaml`);
  if (!existsSync(metaPath)) {
    throw new Error(`JD meta not found: ${metaPath}`);
  }
  const meta = yaml.load(readFileSync(metaPath, 'utf8'));
  const rawPath = join(JD_RAW_DIR, meta.file.replace(/^raw\//, ''));
  if (!existsSync(rawPath)) {
    throw new Error(`JD raw file not found: ${rawPath}`);
  }
  return { slug, meta, rawPath };
}

async function extractJd(jd) {
  // Re-use Stage 1 on the raw JD file. Phase 4's strategize() expects a
  // JobDescription { text, title?, company? }.
  const buffer = readFileSync(jd.rawPath);
  const result = await extract({ buffer, filename: jd.meta.file.replace(/^raw\//, '') });
  return {
    text: result.plaintext,
    title: jd.meta.role,
    company: jd.meta.employer,
  };
}

// ─── Main ──────────────────────────────────────────────────────────────

async function runFixture(fixture, jd, opts) {
  const snapshotDir = join(SNAPSHOTS_DIR, fixture.slug);
  mkdirSync(snapshotDir, { recursive: true });

  const stageTelemetry = {};
  let fixtureCost = 0;

  // Stage 1 + 2: classify. Either read snapshot or run fresh.
  let structuredResume;
  if (opts.skipClassify && existsSync(join(snapshotDir, 'classify.json'))) {
    structuredResume = JSON.parse(readFileSync(join(snapshotDir, 'classify.json'), 'utf8'));
    stageTelemetry.classify = { cached: true };
    process.stdout.write(`   classify: [cached]\n`);
  } else {
    const extractResult = { plaintext: readFileSync(fixture.extractedPath, 'utf8'), format: 'text', warnings: [] };
    const c = await classifyWithTelemetry(extractResult, { variant: opts.variant });
    structuredResume = c.resume;
    stageTelemetry.classify = c.telemetry;
    writeFileSync(join(snapshotDir, 'classify.json'), JSON.stringify(c.resume, null, 2) + '\n');
    writeFileSync(join(snapshotDir, 'classify.telemetry.json'), JSON.stringify(c.telemetry, null, 2) + '\n');
    const cost = costOf(c.telemetry.model, c.telemetry.inputTokens, c.telemetry.outputTokens);
    fixtureCost += cost;
    process.stdout.write(
      `   classify:   ${c.telemetry.durationMs}ms  in=${c.telemetry.inputTokens}tok out=${c.telemetry.outputTokens}tok $${cost.toFixed(4)}\n`,
    );
  }

  // Stage 3: strategize.
  const s = await strategizeWithTelemetry(structuredResume, jd, { variant: opts.variant });
  stageTelemetry.strategize = s.telemetry;
  writeFileSync(join(snapshotDir, 'strategy.json'), JSON.stringify(s.strategy, null, 2) + '\n');
  writeFileSync(join(snapshotDir, 'strategy.telemetry.json'), JSON.stringify(s.telemetry, null, 2) + '\n');
  const sCost = costOf(s.telemetry.model, s.telemetry.inputTokens, s.telemetry.outputTokens);
  fixtureCost += sCost;
  process.stdout.write(
    `   strategize: ${s.telemetry.durationMs}ms  in=${s.telemetry.inputTokens}tok out=${s.telemetry.outputTokens}tok $${sCost.toFixed(4)}  frame="${s.strategy.positioningFrame}"\n`,
  );

  // Stage 4: write (four parallel Sonnet calls).
  const w = await writeWithTelemetry(structuredResume, s.strategy, { variant: opts.variant });
  stageTelemetry.write = w.telemetry;
  writeFileSync(join(snapshotDir, 'written.json'), JSON.stringify(w.written, null, 2) + '\n');
  writeFileSync(join(snapshotDir, 'write.telemetry.json'), JSON.stringify(w.telemetry, null, 2) + '\n');
  // Write telemetry carries per-section model info; the summary telemetry
  // uses the same model as the rest (all 'fast-writer' capability), so
  // pick any section's model for the cost calc.
  const writeModel = w.telemetry.sections.summary.model;
  const wCost = costOf(writeModel, w.telemetry.totalInputTokens, w.telemetry.totalOutputTokens);
  fixtureCost += wCost;
  process.stdout.write(
    `   write:      ${w.telemetry.durationMs}ms  in=${w.telemetry.totalInputTokens}tok out=${w.telemetry.totalOutputTokens}tok $${wCost.toFixed(4)}  sections=${3 + w.telemetry.sections.positions.length}\n`,
  );

  // Stage 5: verify.
  const v = await verifyWithTelemetry(w.written, structuredResume, s.strategy, { variant: opts.variant });
  stageTelemetry.verify = v.telemetry;
  writeFileSync(join(snapshotDir, 'verify.json'), JSON.stringify(v.result, null, 2) + '\n');
  writeFileSync(join(snapshotDir, 'verify.telemetry.json'), JSON.stringify(v.telemetry, null, 2) + '\n');
  const vCost = costOf(v.telemetry.model, v.telemetry.inputTokens, v.telemetry.outputTokens);
  fixtureCost += vCost;
  const errCount = v.result.issues.filter((i) => i.severity === 'error').length;
  const warnCount = v.result.issues.filter((i) => i.severity === 'warning').length;
  process.stdout.write(
    `   verify:     ${v.telemetry.durationMs}ms  in=${v.telemetry.inputTokens}tok out=${v.telemetry.outputTokens}tok $${vCost.toFixed(4)}  passed=${v.result.passed}  errors=${errCount}  warnings=${warnCount}\n`,
  );

  return { fixture, fixtureCost, stageTelemetry, verify: v.result };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const all = discoverFixtures();
  let fixtures = all;
  if (opts.only) {
    fixtures = all.filter((f) => f.slug === opts.only);
    if (fixtures.length === 0) throw new Error(`--only "${opts.only}" matched no fixtures`);
  } else if (opts.subset) {
    fixtures = all.filter((f) => PILOT_SUBSET.has(f.slug));
  }

  const jdFile = loadJd(opts.jd);

  console.log(`# Pipeline run (variant: ${opts.variant})`);
  console.log(`# Fixtures: ${fixtures.length}`);
  console.log(`# JD: ${opts.jd} (${jdFile.meta.employer} / ${jdFile.meta.role})`);
  console.log(`# skip-classify: ${opts.skipClassify}`);
  console.log('');

  if (opts.dryRun) {
    for (const f of fixtures) console.log(`[dry] ${f.slug}`);
    return;
  }

  const jd = await extractJd(jdFile);
  const results = [];
  let totalCost = 0;
  let totalFailed = 0;

  for (const fixture of fixtures) {
    console.log(`→ ${fixture.slug}`);
    try {
      const r = await runFixture(fixture, jd, opts);
      totalCost += r.fixtureCost;
      results.push(r);
      console.log(`   total:      $${r.fixtureCost.toFixed(4)}  verify.passed=${r.verify.passed}\n`);
    } catch (err) {
      totalFailed++;
      console.log(`   ✗ FAILED: ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }

  console.log('# Totals');
  console.log(`# fixtures: ${fixtures.length}`);
  console.log(`# ok:       ${results.length - totalFailed}`);
  console.log(`# failed:   ${totalFailed}`);
  console.log(`# verify-pass: ${results.filter((r) => r.verify.passed).length}`);
  console.log(`# estimated_cost: $${totalCost.toFixed(4)}`);

  if (totalFailed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('FATAL:', err instanceof Error ? err.stack : err);
  process.exit(2);
});
