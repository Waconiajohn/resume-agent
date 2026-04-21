// Cover-letter gpt-5.4-mini comparison harness.
//
// For each fixture in test-fixtures/cover-letters/fixtures/, runs the
// cover-letter writer + reviewer tools against the currently-configured
// provider and writes per-fixture JSON results to
// test-fixtures/cover-letters/results/<variant>/<slug>.json.
//
// One invocation per variant (the feature-scoped provider is cached at
// module load, so to compare providers you run this script twice with
// different env vars — see test-fixtures/cover-letters/README.md).
//
// Usage:
//   node --import tsx --env-file=.env scripts/cover-letter-comparison.mjs \
//     --variant=baseline
//
//   COVER_LETTER_WRITER_PROVIDER=openai \
//   COVER_LETTER_WRITER_MODEL=gpt-5.4-mini \
//   COVER_LETTER_REVIEWER_MODEL=gpt-5.4-mini \
//     node --import tsx --env-file=.env scripts/cover-letter-comparison.mjs \
//       --variant=trial
//
// Flags:
//   --variant=<name>   required. Writes to results/<name>/.
//   --only=<slug>      run one fixture only.
//   --skip-review      run write_letter only; skip review_letter. Useful
//                      when the reviewer model is unstable and blocking
//                      writer-side measurement.
//   --dry-run          list the fixtures that would run; no LLM calls.
//   -h, --help         print usage.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writerTools } from '../src/agents/cover-letter/writer/tools.ts';

// ─── Paths ─────────────────────────────────────────────────────────────

const HERE = resolve(fileURLToPath(import.meta.url), '..');
const FIXTURES_DIR = resolve(HERE, '../test-fixtures/cover-letters/fixtures');
const RESULTS_DIR = resolve(HERE, '../test-fixtures/cover-letters/results');

// ─── CLI args ──────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { variant: null, only: null, skipReview: false, dryRun: false, help: false };
  for (const arg of args) {
    if (arg === '-h' || arg === '--help') out.help = true;
    else if (arg === '--skip-review') out.skipReview = true;
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg.startsWith('--variant=')) out.variant = arg.slice('--variant='.length);
    else if (arg.startsWith('--only=')) out.only = arg.slice('--only='.length);
    else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  return out;
}

function printHelp() {
  // Usage block lives at the top of this file as a comment — mirror it here
  // so `--help` stands on its own without requiring the reader to grep.
  console.log(`
Cover-letter gpt-5.4-mini comparison harness.

Usage:
  node --import tsx --env-file=.env scripts/cover-letter-comparison.mjs --variant=<name>

Required:
  --variant=<name>   Writes results to test-fixtures/cover-letters/results/<name>/.

Optional:
  --only=<slug>      Run one fixture only.
  --skip-review      Skip review_letter (writer-only comparison).
  --dry-run          List fixtures that would run; no LLM calls.
  -h, --help         Print this help.

Environment:
  COVER_LETTER_WRITER_PROVIDER    openai | groq | deepseek | ... (unset = global llm)
  COVER_LETTER_WRITER_MODEL       Model ID for write_letter. Defaults to MODEL_PRIMARY.
  COVER_LETTER_REVIEWER_MODEL     Model ID for review_letter. Defaults to MODEL_MID.
  OPENAI_API_KEY                  Required when provider=openai.
`);
}

// ─── Fixture loading ───────────────────────────────────────────────────

function loadFixtures() {
  if (!existsSync(FIXTURES_DIR)) {
    throw new Error(`Fixtures dir not found: ${FIXTURES_DIR}`);
  }
  const files = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.json'));
  return files.map((file) => {
    const full = join(FIXTURES_DIR, file);
    const raw = readFileSync(full, 'utf-8');
    const data = JSON.parse(raw);
    return { slug: data.name ?? file.replace(/\.json$/, ''), path: full, data };
  });
}

// ─── Context construction (minimal, no runtime) ────────────────────────

function makeContext(state) {
  const scratchpad = {};
  let s = { ...state };
  return {
    sessionId: `harness-${state.name ?? 'fixture'}`,
    userId: 'harness',
    scratchpad,
    signal: new AbortController().signal,
    emit: () => {},
    waitForUser: async () => true,
    getState: () => s,
    updateState: (patch) => { s = { ...s, ...patch }; },
    sendMessage: () => {},
  };
}

function buildInitialState(fixture) {
  return {
    session_id: `harness-${fixture.slug}`,
    user_id: 'harness',
    current_stage: 'writing',
    resume_data: fixture.data.resume_data,
    jd_analysis: fixture.data.jd_analysis,
    letter_plan: fixture.data.letter_plan,
  };
}

// ─── Runner ────────────────────────────────────────────────────────────

async function runFixture(fixture, { skipReview }) {
  const writeLetterTool = writerTools.find((t) => t.name === 'write_letter');
  const reviewLetterTool = writerTools.find((t) => t.name === 'review_letter');
  if (!writeLetterTool || !reviewLetterTool) {
    throw new Error('write_letter / review_letter tools missing from writerTools');
  }

  const state = buildInitialState(fixture);
  const ctx = makeContext(state);
  const started = Date.now();

  const writeStart = Date.now();
  const writeResult = await writeLetterTool.execute({ tone: 'formal' }, ctx);
  const writeMs = Date.now() - writeStart;

  const letter = ctx.getState().letter_draft ?? null;
  let reviewResult = null;
  let reviewMs = null;
  if (!skipReview && letter) {
    const reviewStart = Date.now();
    reviewResult = await reviewLetterTool.execute({}, ctx);
    reviewMs = Date.now() - reviewStart;
  }

  return {
    slug: fixture.slug,
    letter,
    write_result: writeResult,
    review_result: reviewResult,
    timings: {
      write_ms: writeMs,
      review_ms: reviewMs,
      total_ms: Date.now() - started,
    },
    environment: {
      writer_provider: process.env.COVER_LETTER_WRITER_PROVIDER ?? '(global llm)',
      writer_model: process.env.COVER_LETTER_WRITER_MODEL ?? '(MODEL_PRIMARY default)',
      reviewer_model: process.env.COVER_LETTER_REVIEWER_MODEL ?? '(MODEL_MID default)',
    },
  };
}

// ─── Main ──────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  if (!args.variant) {
    console.error('Error: --variant=<name> is required.');
    printHelp();
    process.exit(2);
  }
  // Sanitize variant so it's safe as a directory name.
  if (!/^[a-zA-Z0-9._-]+$/.test(args.variant)) {
    console.error('Error: --variant must match [a-zA-Z0-9._-]+');
    process.exit(2);
  }

  let fixtures = loadFixtures();
  if (args.only) {
    fixtures = fixtures.filter((f) => f.slug === args.only);
    if (fixtures.length === 0) {
      console.error(`No fixture matches --only=${args.only}`);
      process.exit(2);
    }
  }

  console.log(`Variant: ${args.variant}`);
  console.log(`Fixtures: ${fixtures.length} (${fixtures.map((f) => f.slug).join(', ')})`);
  console.log(`Provider: ${process.env.COVER_LETTER_WRITER_PROVIDER ?? '(global llm — unset)'}`);
  console.log(`Writer model: ${process.env.COVER_LETTER_WRITER_MODEL ?? '(MODEL_PRIMARY default)'}`);
  console.log(`Reviewer model: ${process.env.COVER_LETTER_REVIEWER_MODEL ?? '(MODEL_MID default)'}`);

  if (args.dryRun) {
    console.log('\n(dry run — no LLM calls made)');
    process.exit(0);
  }

  const outDir = resolve(RESULTS_DIR, args.variant);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  let succeeded = 0;
  let failed = 0;
  const summary = [];
  for (const fixture of fixtures) {
    process.stdout.write(`  ${fixture.slug}... `);
    try {
      const result = await runFixture(fixture, { skipReview: args.skipReview });
      writeFileSync(join(outDir, `${fixture.slug}.json`), JSON.stringify(result, null, 2));
      const score = result.review_result?.score ?? null;
      const wordCount = result.write_result?.word_count ?? null;
      console.log(
        `ok (${result.timings.total_ms}ms, ${wordCount ?? '?'} words, score=${score ?? 'skipped'})`,
      );
      summary.push({ slug: fixture.slug, ok: true, ms: result.timings.total_ms, score, wordCount });
      succeeded++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`FAIL: ${msg}`);
      writeFileSync(
        join(outDir, `${fixture.slug}.error.json`),
        JSON.stringify({ slug: fixture.slug, error: msg, stack: err?.stack ?? null }, null, 2),
      );
      summary.push({ slug: fixture.slug, ok: false, error: msg });
      failed++;
    }
  }

  const summaryPath = join(outDir, '_summary.json');
  writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        variant: args.variant,
        ran_at: new Date().toISOString(),
        environment: {
          writer_provider: process.env.COVER_LETTER_WRITER_PROVIDER ?? null,
          writer_model: process.env.COVER_LETTER_WRITER_MODEL ?? null,
          reviewer_model: process.env.COVER_LETTER_REVIEWER_MODEL ?? null,
        },
        fixtures: summary,
      },
      null,
      2,
    ),
  );
  console.log(`\n${succeeded} ok, ${failed} failed`);
  console.log(`Results: ${outDir}`);
  console.log(`Summary: ${summaryPath}`);

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
