// Phase 2 / 2.1 one-shot: extract every raw resume fixture, redact the
// candidate's contact PII per the meta YAML's candidate_name field, and
// write the redacted plaintext to server/test-fixtures/resumes/extracted/<slug>.txt.
//
// Run via: node --import tsx scripts/extract-fixtures.mjs
//
// Phase 2 behavior was extract-only; Phase 2.1 composes extract + redact so
// the canonical "extracted" output for every fixture is the post-redaction
// text that Phase 3+ consumes. Production code does NOT redact — this is a
// fixture-corpus defense-in-depth step (see docs/v3-rebuild/fixture-provenance.md).

import {
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  statSync,
} from 'node:fs';
import { resolve, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { extract } from '../src/v3/extract/index.ts';
import { redactFixture } from '../src/v3/test-fixtures/redact.ts';
import { slugifyFilename } from '../src/v3/test-fixtures/slug.ts';

const HERE = resolve(fileURLToPath(import.meta.url), '..');
const RAW_DIR = resolve(HERE, '../test-fixtures/resumes/raw');
const META_DIR = resolve(HERE, '../test-fixtures/resumes/meta');
const OUT_DIR = resolve(HERE, '../test-fixtures/resumes/extracted');
const MAP_PATH = resolve(HERE, '../test-fixtures/resumes/fixture-map.json');

if (!existsSync(RAW_DIR) || !statSync(RAW_DIR).isDirectory()) {
  console.error(`No raw fixtures directory at ${RAW_DIR}`);
  process.exit(2);
}
mkdirSync(OUT_DIR, { recursive: true });

const entries = readdirSync(RAW_DIR)
  .filter((name) => !name.startsWith('.'))
  .sort((a, b) => a.localeCompare(b));

const SUPPORTED = new Set(['.docx', '.pdf', '.txt', '.md']);
const results = [];
let idx = 0;

for (const name of entries) {
  const ext = extname(name).toLowerCase();
  if (!SUPPORTED.has(ext)) {
    results.push({ name, skipped: true, reason: `unsupported extension ${ext}` });
    continue;
  }
  idx++;
  const n = String(idx).padStart(2, '0');
  const slug = `fixture-${n}-${slugifyFilename(name)}`;
  const path = join(RAW_DIR, name);
  const buffer = readFileSync(path);

  const start = Date.now();
  let extractResult;
  try {
    extractResult = await extract({ buffer, filename: name });
  } catch (err) {
    results.push({
      name,
      slug,
      failed: true,
      stage: 'extract',
      error: err instanceof Error ? err.message : String(err),
    });
    continue;
  }

  // Meta must exist and carry candidate_name to redact. Fail loud.
  const metaPath = join(META_DIR, `${slug}.yaml`);
  if (!existsSync(metaPath)) {
    results.push({
      name,
      slug,
      failed: true,
      stage: 'meta',
      error: `meta file missing: ${metaPath}. Run scripts/add-candidate-names.mjs or create it manually.`,
    });
    continue;
  }

  let meta;
  try {
    meta = yaml.load(readFileSync(metaPath, 'utf8'));
  } catch (err) {
    results.push({
      name,
      slug,
      failed: true,
      stage: 'meta',
      error: `failed to parse meta ${metaPath}: ${err instanceof Error ? err.message : String(err)}`,
    });
    continue;
  }

  if (!meta || typeof meta !== 'object' || typeof meta.candidate_name !== 'string') {
    results.push({
      name,
      slug,
      failed: true,
      stage: 'meta',
      error: `meta ${metaPath} is missing candidate_name (string).`,
    });
    continue;
  }

  const redaction = redactFixture(extractResult.plaintext, {
    candidateName: meta.candidate_name,
    additionalNameForms: Array.isArray(meta.additional_name_forms)
      ? meta.additional_name_forms
      : undefined,
    redactSkipTokens: Array.isArray(meta.redact_skip_tokens)
      ? meta.redact_skip_tokens
      : undefined,
  });

  const ms = Date.now() - start;
  const outPath = join(OUT_DIR, `${slug}.txt`);
  writeFileSync(outPath, redaction.redacted + '\n');

  results.push({
    name,
    slug,
    format: extractResult.format,
    bytes: redaction.redacted.length,
    lines: redaction.redacted.split('\n').length,
    extractWarnings: extractResult.warnings.length,
    redactions: redaction.redactions,
    residualWarnings: redaction.residualWarnings,
    ms,
  });
}

// Persist filename → slug mapping.
const map = {};
for (const r of results) {
  if (r.slug) map[r.name] = r.slug;
}
writeFileSync(MAP_PATH, JSON.stringify(map, null, 2) + '\n');

// Summary
const header = [
  'idx',
  'slug',
  'format',
  'lines',
  'bytes',
  'ms',
  'extract-warn',
  'redactions (kind:count)',
  'residuals',
];
console.log(header.join('\t'));

let i = 0;
let residualTotal = 0;
for (const r of results) {
  if (r.skipped) {
    console.log(`-\t(skipped) ${r.name}\t-\t-\t-\t-\t-\t-\t${r.reason}`);
    continue;
  }
  if (r.failed) {
    console.log(`-\t(failed ${r.stage}) ${r.slug}\t-\t-\t-\t-\t-\t-\t${r.error}`);
    continue;
  }
  i++;
  const summary = r.redactions
    .map((x) => `${x.kind}:${x.count}${x.detail ? `(${x.detail})` : ''}`)
    .join(' ');
  residualTotal += r.residualWarnings.length;
  console.log(
    [
      String(i).padStart(2, '0'),
      r.slug,
      r.format,
      r.lines,
      r.bytes,
      r.ms,
      r.extractWarnings,
      summary || '(none)',
      r.residualWarnings.length > 0
        ? r.residualWarnings.join('; ')
        : '(clean)',
    ].join('\t'),
  );
}
console.log('---');
console.log(`extracted+redacted: ${results.filter((r) => !r.failed && !r.skipped).length}`);
console.log(`failed: ${results.filter((r) => r.failed).length}`);
console.log(`skipped: ${results.filter((r) => r.skipped).length}`);
console.log(`fixtures with residual PII warnings: ${results.filter((r) => (r.residualWarnings ?? []).length > 0).length}`);
console.log(`total residual warnings: ${residualTotal}`);
if (results.some((r) => r.failed)) process.exit(1);
