// Fixture runner for v3.
// Discovers raw resume fixtures in server/test-fixtures/resumes/, runs the v3
// pipeline against each, writes per-stage snapshots to
// server/test-fixtures/snapshots/<fixture-name>/, and diffs subsequent runs
// against the stored snapshots.
//
// Implements: docs/v3-rebuild/kickoffs/phase-1-kickoff.md §5 (runner skeleton)
//             and docs/v3-rebuild/03-Prompt-Library-Structure.md §A/B testing
//             (via --prompt-variant).
//
// Phase 1: the runner is a clean skeleton. No fixtures exist yet, so the happy
// path is "0 fixtures found, 0 passed, 0 failed". Phase 2 fills in extraction;
// Phase 3+ wires in real snapshot diffing.

import { readdirSync, statSync, existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, join, extname, basename } from 'node:path';
import { createV3Logger } from '../observability/logger.js';
import { runPipeline } from '../pipeline.js';
import type { PipelineInput, PipelineResult } from '../types.js';

const logger = createV3Logger('fixtures');

// -----------------------------------------------------------------------------
// Paths
// -----------------------------------------------------------------------------

// runner.ts lives at server/src/v3/test-fixtures/runner.ts
// fixtures live at server/test-fixtures/resumes/
// snapshots live at server/test-fixtures/snapshots/
const HERE = new URL('.', import.meta.url).pathname;
const FIXTURES_ROOT = resolve(HERE, '../../../test-fixtures/resumes');
const SNAPSHOTS_ROOT = resolve(HERE, '../../../test-fixtures/snapshots');

const SUPPORTED_EXTS = new Set(['.txt', '.md', '.docx', '.pdf']);

// -----------------------------------------------------------------------------
// CLI parsing (mechanical, not semantic — OK per OPERATING-MANUAL.md)
// -----------------------------------------------------------------------------

interface CliOptions {
  only?: string;
  promptVariant?: string;
  fixturesRoot: string;
  snapshotsRoot: string;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    fixturesRoot: FIXTURES_ROOT,
    snapshotsRoot: SNAPSHOTS_ROOT,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--only') {
      options.only = requireValue(argv, ++i, '--only');
    } else if (arg.startsWith('--only=')) {
      options.only = arg.slice('--only='.length);
    } else if (arg === '--prompt-variant') {
      options.promptVariant = requireValue(argv, ++i, '--prompt-variant');
    } else if (arg.startsWith('--prompt-variant=')) {
      options.promptVariant = arg.slice('--prompt-variant='.length);
    } else if (arg === '--fixtures-root') {
      options.fixturesRoot = resolve(requireValue(argv, ++i, '--fixtures-root'));
    } else if (arg === '--snapshots-root') {
      options.snapshotsRoot = resolve(requireValue(argv, ++i, '--snapshots-root'));
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Unknown fixture-runner argument: ${arg}`);
    }
  }
  return options;
}

function requireValue(argv: string[], i: number, flag: string): string {
  const v = argv[i];
  if (!v) throw new Error(`Missing value for ${flag}`);
  return v;
}

function printUsage(): void {
  process.stdout.write(
    [
      'v3 fixture runner',
      '',
      'Usage: tsx src/v3/test-fixtures/runner.ts [options]',
      '',
      'Options:',
      '  --only <name>                run a single fixture by base name',
      '  --prompt-variant <suffix>    load prompts from the given variant (e.g. "v2-test")',
      '  --fixtures-root <path>       override fixture directory (default: server/test-fixtures/resumes)',
      '  --snapshots-root <path>      override snapshot directory (default: server/test-fixtures/snapshots)',
      '  -h, --help                   print this usage',
      '',
    ].join('\n'),
  );
}

// -----------------------------------------------------------------------------
// Fixture discovery
// -----------------------------------------------------------------------------

interface Fixture {
  name: string;        // basename without extension
  path: string;        // absolute path to raw file
  ext: string;         // ".docx", ".pdf", ".txt", ".md"
}

// Fixtures live in <root>/raw/. The `resumes/` README and any other
// sibling files are not fixtures — the runner never treats them as input.
function discoverFixtures(root: string): Fixture[] {
  const raw = join(root, 'raw');
  if (!existsSync(raw)) return [];
  if (!statSync(raw).isDirectory()) return [];

  const out: Fixture[] = [];
  for (const entry of readdirSync(raw)) {
    if (entry.startsWith('.')) continue;
    const abs = join(raw, entry);
    if (!statSync(abs).isFile()) continue;
    const ext = extname(entry).toLowerCase();
    if (!SUPPORTED_EXTS.has(ext)) continue;
    out.push({ name: basename(entry, ext), path: abs, ext });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

// -----------------------------------------------------------------------------
// Fixture execution
// -----------------------------------------------------------------------------

type Status = 'passed' | 'failed' | 'drifted' | 'new';

interface FixtureOutcome {
  fixture: Fixture;
  status: Status;
  error?: string;
  driftedFiles?: string[];
}

async function runFixture(fixture: Fixture, options: CliOptions): Promise<FixtureOutcome> {
  const snapshotDir = join(options.snapshotsRoot, fixture.name);
  mkdirSync(snapshotDir, { recursive: true });

  const input = buildPipelineInput(fixture);

  let result: PipelineResult;
  try {
    result = await runPipeline(input);
  } catch (err) {
    return {
      fixture,
      status: 'failed',
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    };
  }

  const artifacts: Record<string, unknown> = {
    extract: result.extract,
    classify: result.classify,
    strategy: result.strategy,
    written: result.written,
    verify: result.verify,
    timings: result.timings,
  };

  const drifted: string[] = [];
  let anyNew = false;

  for (const [name, value] of Object.entries(artifacts)) {
    const path = join(snapshotDir, `${name}.json`);
    const serialized = JSON.stringify(value, null, 2) + '\n';
    if (existsSync(path)) {
      const previous = readFileSync(path, 'utf8');
      if (previous !== serialized) {
        drifted.push(`${name}.json`);
        writeFileSync(path, serialized);
      }
    } else {
      anyNew = true;
      writeFileSync(path, serialized);
    }
  }

  if (drifted.length > 0) {
    return { fixture, status: 'drifted', driftedFiles: drifted };
  }
  if (anyNew) {
    return { fixture, status: 'new' };
  }
  return { fixture, status: 'passed' };
}

function buildPipelineInput(fixture: Fixture): PipelineInput {
  // Phase 1: we don't actually read the file here — the extract stage will
  // handle it in Phase 2. We pass through enough context for runPipeline to
  // dispatch to the extract stub, which throws NotImplementedError.
  return {
    resume: {
      filename: `${fixture.name}${fixture.ext}`,
    },
    jobDescription: {
      text: '',
    },
  };
}

// -----------------------------------------------------------------------------
// Entry point
// -----------------------------------------------------------------------------

export interface RunnerSummary {
  found: number;
  passed: number;
  failed: number;
  drifted: number;
  fresh: number;               // brand-new snapshots (no prior baseline)
  outcomes: FixtureOutcome[];
}

export async function runRunner(argv: string[] = process.argv.slice(2)): Promise<RunnerSummary> {
  const options = parseArgs(argv);
  if (options.promptVariant) {
    logger.info({ promptVariant: options.promptVariant }, 'prompt variant requested (not yet wired)');
  }

  const all = discoverFixtures(options.fixturesRoot);
  const fixtures = options.only ? all.filter((f) => f.name === options.only) : all;

  if (options.only && fixtures.length === 0) {
    throw new Error(`--only "${options.only}" matched no fixtures in ${options.fixturesRoot}`);
  }

  const outcomes: FixtureOutcome[] = [];
  for (const fixture of fixtures) {
    const outcome = await runFixture(fixture, options);
    outcomes.push(outcome);
  }

  const summary: RunnerSummary = {
    found: fixtures.length,
    passed: outcomes.filter((o) => o.status === 'passed').length,
    failed: outcomes.filter((o) => o.status === 'failed').length,
    drifted: outcomes.filter((o) => o.status === 'drifted').length,
    fresh: outcomes.filter((o) => o.status === 'new').length,
    outcomes,
  };

  printSummary(summary);
  return summary;
}

function printSummary(summary: RunnerSummary): void {
  const lines: string[] = [];
  lines.push(
    `${summary.found} fixtures found, ${summary.passed} passed, ${summary.failed} failed, ${summary.drifted} drifted, ${summary.fresh} new`,
  );
  for (const outcome of summary.outcomes) {
    switch (outcome.status) {
      case 'passed':
        lines.push(`  ✓ ${outcome.fixture.name}`);
        break;
      case 'new':
        lines.push(`  + ${outcome.fixture.name}  (new snapshot)`);
        break;
      case 'drifted':
        lines.push(
          `  ~ ${outcome.fixture.name}  (drifted: ${(outcome.driftedFiles ?? []).join(', ')})`,
        );
        break;
      case 'failed':
        lines.push(`  ✗ ${outcome.fixture.name}  (${outcome.error ?? 'unknown error'})`);
        break;
    }
  }
  process.stdout.write(lines.join('\n') + '\n');
}

// Direct-invocation guard. When launched via `tsx src/v3/test-fixtures/runner.ts`
// the module URL equals process.argv[1]'s URL, so we run the CLI.
const invokedDirectly = (() => {
  try {
    const entry = process.argv[1] ? new URL(`file://${process.argv[1]}`).href : '';
    return import.meta.url === entry;
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  runRunner().then(
    (summary) => {
      // Exit code: non-zero if any fixture failed or drifted. Phase 1 has no
      // fixtures, so the default path is exit 0.
      if (summary.failed > 0 || summary.drifted > 0) {
        process.exit(1);
      }
    },
    (err) => {
      logger.error({ err: err instanceof Error ? err.message : err }, 'fixture runner crashed');
      process.exit(2);
    },
  );
}
