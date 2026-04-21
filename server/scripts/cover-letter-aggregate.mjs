// Cover-letter gpt-5.4-mini comparison aggregator.
//
// Reads the per-fixture JSON output from two variants under
// test-fixtures/cover-letters/results/ and prints a markdown summary
// showing per-fixture deltas plus aggregate win/loss/tie counts across
// the review criteria and cost/latency deltas.
//
// Usage:
//   node --import tsx --env-file=.env scripts/cover-letter-aggregate.mjs \
//     [--baseline=baseline] [--trial=trial] [--out=comparison.md]
//
// Defaults: baseline=baseline, trial=trial. Writes markdown to stdout if
// --out is not supplied.

import { readdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ─── Paths ─────────────────────────────────────────────────────────────

const HERE = resolve(fileURLToPath(import.meta.url), '..');
const RESULTS_DIR = resolve(HERE, '../test-fixtures/cover-letters/results');

// ─── CLI ───────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { baseline: 'baseline', trial: 'trial', out: null };
  for (const arg of args) {
    if (arg.startsWith('--baseline=')) out.baseline = arg.slice('--baseline='.length);
    else if (arg.startsWith('--trial=')) out.trial = arg.slice('--trial='.length);
    else if (arg.startsWith('--out=')) out.out = arg.slice('--out='.length);
    else if (arg === '-h' || arg === '--help') {
      console.log(`
Cover-letter gpt-5.4-mini aggregator.

Usage:
  node --import tsx scripts/cover-letter-aggregate.mjs [--baseline=NAME] [--trial=NAME] [--out=FILE]

Defaults: --baseline=baseline --trial=trial. Writes to stdout if --out is not supplied.
`);
      process.exit(0);
    } else {
      console.error(`Unknown arg: ${arg}`);
      process.exit(2);
    }
  }
  return out;
}

// ─── Loader ────────────────────────────────────────────────────────────

function loadVariant(name) {
  const dir = resolve(RESULTS_DIR, name);
  if (!existsSync(dir)) {
    throw new Error(`Variant directory not found: ${dir}. Run cover-letter-comparison.mjs first.`);
  }
  const files = readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
  const fixtures = {};
  for (const file of files) {
    if (file.endsWith('.error.json')) {
      const slug = file.replace(/\.error\.json$/, '');
      fixtures[slug] = { slug, error: JSON.parse(readFileSync(join(dir, file), 'utf-8')) };
      continue;
    }
    const raw = readFileSync(join(dir, file), 'utf-8');
    const data = JSON.parse(raw);
    fixtures[data.slug] = data;
  }
  return fixtures;
}

// ─── Aggregation ───────────────────────────────────────────────────────

const CRITERIA = [
  'voice_authenticity',
  'jd_alignment',
  'evidence_specificity',
  'executive_tone',
  'length_appropriateness',
];

function getCriterionScore(result, name) {
  const criteria = result?.review_result?.criteria;
  if (!criteria || typeof criteria !== 'object') return null;
  const entry = criteria[name];
  if (!entry || typeof entry !== 'object') return null;
  const score = entry.score;
  return typeof score === 'number' ? score : null;
}

function compareCriterion(base, trial) {
  if (base === null && trial === null) return 'both-missing';
  if (base === null) return 'trial-only';
  if (trial === null) return 'baseline-only';
  if (trial > base) return 'trial-win';
  if (base > trial) return 'baseline-win';
  return 'tie';
}

function formatDelta(base, trial) {
  if (base === null && trial === null) return 'n/a';
  if (base === null) return `→ ${trial}`;
  if (trial === null) return `${base} →`;
  const delta = trial - base;
  const sign = delta > 0 ? '+' : '';
  return `${base} → ${trial} (${sign}${delta})`;
}

// ─── Markdown rendering ────────────────────────────────────────────────

function render(baselineName, trialName, baseline, trial) {
  const lines = [];
  lines.push(`# Cover-letter comparison: ${baselineName} vs ${trialName}`);
  lines.push('');

  const baseSummary = readSummary(baselineName);
  const trialSummary = readSummary(trialName);
  if (baseSummary) {
    lines.push(`**Baseline run:** ${baseSummary.ran_at}`);
    lines.push(`**Baseline provider:** ${baseSummary.environment?.writer_provider ?? '(global llm)'}`);
    lines.push(`**Baseline writer model:** ${baseSummary.environment?.writer_model ?? '(default)'}`);
  }
  if (trialSummary) {
    lines.push(`**Trial run:** ${trialSummary.ran_at}`);
    lines.push(`**Trial provider:** ${trialSummary.environment?.writer_provider ?? '(global llm)'}`);
    lines.push(`**Trial writer model:** ${trialSummary.environment?.writer_model ?? '(default)'}`);
  }
  lines.push('');

  // Collect the union of all slugs across both variants.
  const slugs = new Set([...Object.keys(baseline), ...Object.keys(trial)]);
  if (slugs.size === 0) {
    lines.push('_No fixtures found in either variant. Did you run cover-letter-comparison.mjs?_');
    return lines.join('\n');
  }

  // Per-fixture detail table
  lines.push('## Per-fixture detail');
  lines.push('');
  lines.push('| Fixture | Score | Word count | Latency (ms) | Notes |');
  lines.push('|---|---|---|---|---|');
  const criteriaAgg = {};
  for (const c of CRITERIA) criteriaAgg[c] = { trialWin: 0, baselineWin: 0, tie: 0, missing: 0 };
  let baseTotalMs = 0;
  let trialTotalMs = 0;
  let baseScoreSum = 0;
  let trialScoreSum = 0;
  let baseScoreCount = 0;
  let trialScoreCount = 0;

  for (const slug of [...slugs].sort()) {
    const b = baseline[slug];
    const t = trial[slug];
    if (b?.error || t?.error) {
      lines.push(`| ${slug} | — | — | — | ${b?.error ? 'baseline FAILED' : ''}${t?.error ? ' trial FAILED' : ''} |`);
      continue;
    }

    const baseScore = b?.review_result?.score ?? null;
    const trialScore = t?.review_result?.score ?? null;
    const baseWords = b?.write_result?.word_count ?? null;
    const trialWords = t?.write_result?.word_count ?? null;
    const baseMs = b?.timings?.total_ms ?? null;
    const trialMs = t?.timings?.total_ms ?? null;

    lines.push(
      `| ${slug} | ${formatDelta(baseScore, trialScore)} | ${formatDelta(baseWords, trialWords)} | ${formatDelta(baseMs, trialMs)} |   |`,
    );

    if (typeof baseScore === 'number') {
      baseScoreSum += baseScore;
      baseScoreCount++;
    }
    if (typeof trialScore === 'number') {
      trialScoreSum += trialScore;
      trialScoreCount++;
    }
    if (typeof baseMs === 'number') baseTotalMs += baseMs;
    if (typeof trialMs === 'number') trialTotalMs += trialMs;

    for (const c of CRITERIA) {
      const outcome = compareCriterion(getCriterionScore(b, c), getCriterionScore(t, c));
      if (outcome === 'trial-win') criteriaAgg[c].trialWin++;
      else if (outcome === 'baseline-win') criteriaAgg[c].baselineWin++;
      else if (outcome === 'tie') criteriaAgg[c].tie++;
      else criteriaAgg[c].missing++;
    }
  }

  lines.push('');

  // Criteria win/loss table
  lines.push('## Review criteria — fixture-level win/loss/tie');
  lines.push('');
  lines.push('| Criterion | Trial wins | Baseline wins | Ties | Missing |');
  lines.push('|---|---|---|---|---|');
  for (const c of CRITERIA) {
    const a = criteriaAgg[c];
    lines.push(`| ${c} | ${a.trialWin} | ${a.baselineWin} | ${a.tie} | ${a.missing} |`);
  }
  lines.push('');

  // Aggregates
  lines.push('## Aggregates');
  lines.push('');
  const baseAvgScore = baseScoreCount > 0 ? (baseScoreSum / baseScoreCount).toFixed(1) : 'n/a';
  const trialAvgScore = trialScoreCount > 0 ? (trialScoreSum / trialScoreCount).toFixed(1) : 'n/a';
  lines.push(`- Average review score — baseline: ${baseAvgScore}, trial: ${trialAvgScore}`);
  lines.push(`- Total wall-clock — baseline: ${baseTotalMs}ms, trial: ${trialTotalMs}ms`);
  lines.push(`- Fixtures scored — baseline: ${baseScoreCount}, trial: ${trialScoreCount}`);
  lines.push(`- Fixtures total — ${slugs.size}`);
  lines.push('');

  lines.push('## Notes');
  lines.push('');
  lines.push("- Trial-win counts reflect per-criterion, per-fixture comparisons on the numeric scores the reviewer returned. A criterion with `missing` > 0 means the reviewer didn't return that criterion's score for at least one run of the fixture.");
  lines.push('- Review scores come from the review_letter tool running with whatever model each variant is configured to use. If baseline and trial use different reviewer models, the scores are NOT strictly comparable — they reflect each model judging its own writer output, not a shared judge. For a stricter A/B, run both variants through the same reviewer.');
  lines.push('- Cost deltas are not computed here; read token counts from the per-fixture JSON files under `results/<variant>/<slug>.json` if you need them.');

  return lines.join('\n');
}

function readSummary(variantName) {
  const path = resolve(RESULTS_DIR, variantName, '_summary.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

// ─── Main ──────────────────────────────────────────────────────────────

function main() {
  const args = parseArgs();
  const baseline = loadVariant(args.baseline);
  const trial = loadVariant(args.trial);
  const md = render(args.baseline, args.trial, baseline, trial);
  if (args.out) {
    writeFileSync(args.out, md);
    console.error(`Wrote ${args.out}`);
  } else {
    process.stdout.write(md + '\n');
  }
}

main();
