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

import {
  readdirSync,
  statSync,
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
} from 'node:fs';
import { resolve, join, extname, basename } from 'node:path';
import yaml from 'js-yaml';
import { createV3Logger } from '../observability/logger.js';
import { runPipeline } from '../pipeline.js';
import { slugifyFilename } from './slug.js';
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
  filters: Record<string, string>;        // --filter category=executive -> { category: "executive" }
  fixturesRoot: string;
  snapshotsRoot: string;
}

interface FixtureMeta {
  name: string;
  file: string;
  category?: string;
  characteristics?: Record<string, unknown>;
  notes?: string;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    fixturesRoot: FIXTURES_ROOT,
    snapshotsRoot: SNAPSHOTS_ROOT,
    filters: {},
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
    } else if (arg === '--filter') {
      addFilter(options.filters, requireValue(argv, ++i, '--filter'));
    } else if (arg.startsWith('--filter=')) {
      addFilter(options.filters, arg.slice('--filter='.length));
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

// --filter takes "key=value" (mechanical split — not semantic).
function addFilter(filters: Record<string, string>, spec: string): void {
  const eq = spec.indexOf('=');
  if (eq < 1) {
    throw new Error(`--filter expected key=value, got "${spec}"`);
  }
  const key = spec.slice(0, eq).trim();
  const value = spec.slice(eq + 1).trim();
  if (!key || !value) {
    throw new Error(`--filter expected key=value with non-empty sides, got "${spec}"`);
  }
  filters[key] = value;
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
      '  --only <name>                run a single fixture by slug',
      '  --filter <key=value>         run only fixtures whose meta matches (repeatable)',
      '                                 e.g. --filter category=executive',
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
  slug: string;        // stable kebab-case identifier (fixture-01-<surname>...)
  rawName: string;     // original filename on disk
  path: string;        // absolute path to raw file
  ext: string;         // ".docx", ".pdf", ".txt", ".md"
  meta: FixtureMeta | null;
  extractedPath: string | null;  // path to server/test-fixtures/resumes/extracted/<slug>.txt if present
}

// Fixtures live in <root>/raw/. The `resumes/` README and any other
// sibling files are not fixtures — the runner never treats them as input.
// If <root>/raw/ does not exist, we create it and tell the user where to
// drop files. A .gitkeep would be masked by the PII gitignore rule for
// raw/, so the filesystem itself is the source of truth.
function discoverFixtures(root: string): Fixture[] {
  const raw = join(root, 'raw');
  if (!existsSync(raw)) {
    mkdirSync(raw, { recursive: true });
    process.stderr.write(
      `Created ${raw}. Drop resume files here.\n`,
    );
    return [];
  }
  if (!statSync(raw).isDirectory()) {
    throw new Error(`${raw} exists but is not a directory`);
  }

  // Build "fixture-NN-<slug>" base names in sort order. Slugs match the ones
  // produced by scripts/extract-fixtures.mjs, so meta/ and extracted/ paths
  // line up.
  const rawNames = readdirSync(raw)
    .filter((n) => !n.startsWith('.'))
    .filter((n) => {
      try {
        return statSync(join(raw, n)).isFile();
      } catch {
        return false;
      }
    })
    .filter((n) => SUPPORTED_EXTS.has(extname(n).toLowerCase()))
    .sort((a, b) => a.localeCompare(b));

  const metaDir = join(root, 'meta');
  const extractedDir = join(root, 'extracted');
  const out: Fixture[] = [];

  rawNames.forEach((rawName, idx) => {
    const n = String(idx + 1).padStart(2, '0');
    const slug = `fixture-${n}-${slugifyFilename(rawName)}`;
    const path = join(raw, rawName);
    const ext = extname(rawName).toLowerCase();
    const metaPath = join(metaDir, `${slug}.yaml`);
    const extractedPath = join(extractedDir, `${slug}.txt`);
    out.push({
      slug,
      rawName,
      path,
      ext,
      meta: loadMeta(metaPath),
      extractedPath: existsSync(extractedPath) ? extractedPath : null,
    });
  });

  return out;
}

function loadMeta(metaPath: string): FixtureMeta | null {
  if (!existsSync(metaPath)) return null;
  try {
    const raw = readFileSync(metaPath, 'utf8');
    const parsed = yaml.load(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`meta file did not parse as an object: ${metaPath}`);
    }
    return parsed as FixtureMeta;
  } catch (err) {
    // Fail loud — silent parse errors would mask drift in the corpus metadata.
    throw new Error(
      `failed to load meta file ${metaPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// Returns true if the fixture's meta satisfies every filter key=value pair.
// Mechanical: we look up `filter[key]` in meta.characteristics[key] OR
// meta.category, and compare string-equal.
function matchesFilters(fixture: Fixture, filters: Record<string, string>): boolean {
  if (Object.keys(filters).length === 0) return true;
  const meta = fixture.meta;
  for (const [key, value] of Object.entries(filters)) {
    let actual: unknown;
    if (key === 'category') {
      actual = meta?.category;
    } else if (meta?.characteristics && key in meta.characteristics) {
      actual = meta.characteristics[key];
    } else {
      actual = undefined;
    }
    if (String(actual) !== value) return false;
  }
  return true;
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
  const snapshotDir = join(options.snapshotsRoot, fixture.slug);
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
  // Phase 2: read the raw file into a Buffer so Stage 1 can extract it
  // properly. The job description stays empty — Phase 4 wires in paired JDs.
  const buffer = readFileSync(fixture.path);
  return {
    resume: {
      buffer,
      filename: fixture.rawName,
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
    // TODO(phase-3): once the classify prompt lands, resolve `--prompt-variant`
    // to a real prompt file suffix (e.g. `classify.v2-test`) and pass it into
    // the classify stage. Switch this from a warning to a hard error at that
    // point — a variant that doesn't resolve to a file should fail loudly.
    process.stderr.write(
      `--prompt-variant '${options.promptVariant}' specified but no prompts are loaded in Phase 1; flag will be honored starting Phase 3.\n`,
    );
    logger.warn(
      { promptVariant: options.promptVariant },
      'prompt variant flag received but no prompts are wired yet (Phase 1)',
    );
  }

  const all = discoverFixtures(options.fixturesRoot);

  // Apply --only (slug match), then --filter (meta match). Both optional.
  let fixtures = options.only
    ? all.filter((f) => f.slug === options.only)
    : all;
  if (options.only && fixtures.length === 0) {
    throw new Error(`--only "${options.only}" matched no fixtures in ${options.fixturesRoot}`);
  }

  fixtures = fixtures.filter((f) => matchesFilters(f, options.filters));
  if (Object.keys(options.filters).length > 0 && fixtures.length === 0) {
    throw new Error(
      `--filter ${JSON.stringify(options.filters)} matched no fixtures in ${options.fixturesRoot}`,
    );
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

  if (summary.outcomes.length > 0) {
    // Fixed-width summary table: slug | category | status
    const rows = summary.outcomes.map((o) => ({
      slug: o.fixture.slug,
      category: o.fixture.meta?.category ?? '(no meta)',
      status: o.status,
      extra:
        o.status === 'failed'
          ? o.error ?? 'unknown error'
          : o.status === 'drifted'
            ? `drifted: ${(o.driftedFiles ?? []).join(', ')}`
            : '',
    }));
    const slugW = Math.max(4, ...rows.map((r) => r.slug.length));
    const catW = Math.max(8, ...rows.map((r) => r.category.length));
    const statW = Math.max(6, ...rows.map((r) => r.status.length));
    lines.push('');
    lines.push(
      `  ${pad('slug', slugW)}  ${pad('category', catW)}  ${pad('status', statW)}  notes`,
    );
    lines.push(
      `  ${'-'.repeat(slugW)}  ${'-'.repeat(catW)}  ${'-'.repeat(statW)}  -----`,
    );
    for (const r of rows) {
      lines.push(
        `  ${pad(r.slug, slugW)}  ${pad(r.category, catW)}  ${pad(r.status, statW)}  ${r.extra}`,
      );
    }
  }

  process.stdout.write(lines.join('\n') + '\n');
}

function pad(s: string, width: number): string {
  return s.length >= width ? s : s + ' '.repeat(width - s.length);
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
