#!/usr/bin/env node
// check-migration-naming.mjs
// Validates that new migration files use timestamp naming convention.

import { readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(__dirname, '../../supabase/migrations');
const strict = process.argv.includes('--strict');

const LEGACY_PATTERN = /^\d{3}_/;
const TIMESTAMP_PATTERN = /^\d{14}_.*\.sql$/;

const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

const legacy = [];
const valid = [];
const invalid = [];

for (const file of files) {
  if (LEGACY_PATTERN.test(file)) {
    legacy.push(file);
  } else if (TIMESTAMP_PATTERN.test(file)) {
    valid.push(file);
  } else {
    invalid.push(file);
  }
}

console.log(`Migration naming check:`);
console.log(`  Legacy (grandfathered): ${legacy.length}`);
console.log(`  Valid (timestamp):      ${valid.length}`);
console.log(`  Invalid:                ${invalid.length}`);

if (invalid.length > 0) {
  console.log(`\n⚠ Invalid migration filenames:`);
  for (const f of invalid) {
    console.log(`  - ${f}`);
  }
  console.log(`\nNew migrations must use format: YYYYMMDDHHMMSS_description.sql`);
  if (strict) {
    process.exit(1);
  }
}
