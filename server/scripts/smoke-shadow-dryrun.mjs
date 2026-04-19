// Phase 5 Week 0 smoke test — DRY RUN variant.
//
// Invokes runShadow() against 2 real fixture inputs and inspects the returned
// result shape. Does NOT insert into Supabase (runShadow itself doesn't; the
// caller enqueueShadow is what persists, and this script skips that step).
//
// The full end-to-end smoke test (FF_V3_SHADOW_ENABLED=true + real v2 requests +
// verify Supabase rows) waits on John applying the migration to the Supabase
// project. See docs/v3-rebuild/reports/phase-5-week0-report.md for the full
// test plan.
//
// Usage:
//   node --import tsx --env-file=.env scripts/smoke-shadow-dryrun.mjs

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runShadow } from '../src/v3/shadow/run.ts';
import { extract } from '../src/v3/extract/index.ts';

const FIXTURE_DIR = 'test-fixtures/resumes/extracted';
const JD_BUFFER_PATH = 'test-fixtures/job-descriptions/raw/UA Account Manager, Wholesale - Mall.docx';

const TEST_FIXTURES = [
  'fixture-01-ben-wedewer-resume-trimmed',
  'fixture-09-jay-alger-sr-strat-and-bd-ldr',
];

// Extract the JD via v3 extract (handles the .docx).
const jdBuffer = readFileSync(JD_BUFFER_PATH);
const jdExtract = await extract({ buffer: jdBuffer, filename: 'UA Account Manager, Wholesale - Mall.docx' });
const jdText = jdExtract.plaintext;

async function main() {
  console.log('# Phase 5 Week 0 — shadow dry-run smoke test');
  console.log(`# ${new Date().toISOString()}`);
  console.log();

  let allOk = true;

  for (const slug of TEST_FIXTURES) {
    console.log(`→ ${slug}`);
    const resumeText = readFileSync(join(FIXTURE_DIR, `${slug}.txt`), 'utf8');

    const result = await runShadow({
      sessionId: `smoke-${slug}`,
      userId: null,
      resumeText,
      jdText,
      jdTitle: 'Account Manager - Wholesale',
      jdCompany: 'Under Armour',
    });

    const passed = result.verify?.passed;
    const errCount = (result.verify?.issues ?? []).filter((i) => i.severity === 'error').length;
    const warnCount = (result.verify?.issues ?? []).filter((i) => i.severity === 'warning').length;

    console.log(`  timings: total=${result.timings.totalMs}ms  classify=${result.timings.classifyMs ?? '—'}ms  strategize=${result.timings.strategizeMs ?? '—'}ms  write=${result.timings.writeMs ?? '—'}ms  verify=${result.timings.verifyMs ?? '—'}ms`);
    console.log(`  costs:   total=$${result.costs.total.toFixed(4)}  strat=$${result.costs.strategize.toFixed(4)}  write=$${result.costs.write.toFixed(4)}  verify=$${result.costs.verify.toFixed(4)}`);
    console.log(`  verify:  passed=${passed}  errors=${errCount}  warnings=${warnCount}`);
    if (result.errorMessage) {
      console.log(`  ✗ error at stage=${result.errorStage}: ${result.errorMessage}`);
      allOk = false;
    }
    if (!result.written) {
      console.log(`  ✗ no written output`);
      allOk = false;
    }
    if (result.costs.total < 0.05 || result.costs.total > 0.20) {
      console.log(`  ⚠ cost outside expected $0.05-$0.20 window — inspect`);
    }
    console.log();
  }

  console.log('## Smoke test result');
  if (allOk) {
    console.log('✓ All dry-run shadow invocations produced a complete result.');
    console.log('  Next step: John applies the Supabase migration and flips FF_V3_SHADOW_ENABLED=true.');
    console.log('  Then fire 5 real v2 requests and verify rows appear in resume_v3_shadow_runs.');
  } else {
    console.log('✗ Dry-run smoke surfaced errors. Inspect output above. Do not flip FF_V3_SHADOW_ENABLED.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(2);
});
