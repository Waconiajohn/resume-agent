// Phase 2.1 one-shot: insert candidate_name into each resume meta YAML.
// Idempotent — skips files that already have candidate_name.
// Gitignored meta files are mutated in place; raw/ is never touched.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = resolve(fileURLToPath(import.meta.url), '..');
const META_DIR = resolve(HERE, '../test-fixtures/resumes/meta');

// Mapping derived from my Phase 2 reads of each extracted file.
// Source of truth is the meta YAML after this script runs.
const NAMES = {
  'fixture-01-ben-wedewer-resume-trimmed': 'Ben Wedewer',
  'fixture-02-blas-ortiz-lhh-resume-clean-draft-4-fst-misty': 'Blas Ortiz',
  'fixture-03-brent-dullack-resume': 'Brent Dullack',
  'fixture-04-bshook-resume-dirpm-primary': 'Brian Shook',
  'fixture-05-casey-cockrill-base-resume-template': 'Casey Cockrill',
  'fixture-06-chris-coerber-resume': 'Chris Coerber',
  'fixture-07-diana-downs-fst-resume-template': 'Diana Downs',
  'fixture-08-j-vaughn-4-18-resume': 'Jason Vaughn',
  'fixture-09-jay-alger-sr-strat-and-bd-ldr': 'Jay Alger',
  'fixture-10-jessica-boquist-core-resume': 'Jessica Boquist',
  'fixture-11-jill-jordan-pm-resume': 'Jill Jordan',
  'fixture-12-joel-hough-resume': 'Joel Hough',
  'fixture-13-lisa-slagle-fst-base-resume-template': 'Lisa Slagle',
  'fixture-14-lj-2025-resume-v1-7-26': 'Lutz Johnson',
  'fixture-15-manzione-productdesigner-ux': 'Paul Manzione',
  'fixture-16-mark-delorenzo-disney-02-26-26': 'Mark DeLorenzo',
  'fixture-17-resume-davidchicks': 'R. David Chicks',
  'fixture-18-steve-alexander-resume-25': 'Steve Alexander',
  'fixture-19-stevegoodwinresume': 'Steve Goodwin',
};

const files = readdirSync(META_DIR)
  .filter((f) => f.endsWith('.yaml'))
  .sort();

let updated = 0;
let skipped = 0;
let missing = [];

for (const f of files) {
  const slug = f.replace(/\.yaml$/, '');
  const name = NAMES[slug];
  if (!name) {
    missing.push(slug);
    continue;
  }
  const path = join(META_DIR, f);
  const raw = readFileSync(path, 'utf8');

  if (raw.match(/^candidate_name:\s*/m)) {
    skipped++;
    continue;
  }

  // Insert after the "file:" line. If no "file:" line, prepend.
  let out;
  if (raw.match(/^file:.*$/m)) {
    out = raw.replace(/^(file:.*)$/m, `$1\ncandidate_name: "${name}"`);
  } else {
    out = `candidate_name: "${name}"\n${raw}`;
  }
  writeFileSync(path, out);
  updated++;
}

console.log(`meta YAMLs updated: ${updated}`);
console.log(`skipped (already had candidate_name): ${skipped}`);
if (missing.length > 0) {
  console.log('UNMAPPED slugs (add to NAMES in this script):');
  for (const s of missing) console.log(`  ${s}`);
  process.exit(1);
}
