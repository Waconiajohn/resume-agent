// Phase 2 one-shot: extract every raw fixture to
// server/test-fixtures/resumes/extracted/<slug>.txt and print a summary.
// Run via: node --import tsx scripts/extract-fixtures.mjs

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extract } from '../src/v3/extract/index.ts';
import { slugifyFilename } from '../src/v3/test-fixtures/slug.ts';

const HERE = resolve(fileURLToPath(import.meta.url), '..');
const RAW_DIR = resolve(HERE, '../test-fixtures/resumes/raw');
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
  let res;
  try {
    res = await extract({ buffer, filename: name });
  } catch (err) {
    results.push({
      name,
      slug,
      failed: true,
      error: err instanceof Error ? err.message : String(err),
    });
    continue;
  }
  const ms = Date.now() - start;

  const outPath = join(OUT_DIR, `${slug}.txt`);
  writeFileSync(outPath, res.plaintext + '\n');

  results.push({
    name,
    slug,
    format: res.format,
    bytes: res.plaintext.length,
    lines: res.plaintext.split('\n').length,
    warnings: res.warnings,
    ms,
  });
}

// Persist the filename → slug mapping so downstream scripts can reference it
// without re-deriving slugs.
const map = {};
for (const r of results) {
  if (r.slug) map[r.name] = r.slug;
}
writeFileSync(MAP_PATH, JSON.stringify(map, null, 2) + '\n');

// Summary
const header = ['idx', 'slug', 'format', 'lines', 'bytes', 'ms', 'warnings'];
console.log(header.join('\t'));
let i = 0;
for (const r of results) {
  if (r.skipped) {
    console.log(`-\t(skipped) ${r.name}\t-\t-\t-\t-\t${r.reason}`);
    continue;
  }
  if (r.failed) {
    console.log(`-\t(failed) ${r.slug}\t-\t-\t-\t-\t${r.error}`);
    continue;
  }
  i++;
  console.log(
    [String(i).padStart(2, '0'), r.slug, r.format, r.lines, r.bytes, r.ms, r.warnings.length].join(
      '\t',
    ),
  );
}
console.log('---');
console.log(`extracted: ${results.filter((r) => !r.failed && !r.skipped).length}`);
console.log(`failed: ${results.filter((r) => r.failed).length}`);
console.log(`skipped: ${results.filter((r) => r.skipped).length}`);
