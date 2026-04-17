// Fixture runner smoke test.
// Verifies the Phase 1 invariant: with no fixtures present, the runner
// reports "0 fixtures found" and exits cleanly.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runRunner } from '../../v3/test-fixtures/runner.js';

let fixturesRoot: string;
let snapshotsRoot: string;

beforeAll(() => {
  fixturesRoot = mkdtempSync(join(tmpdir(), 'v3-fixtures-'));
  snapshotsRoot = mkdtempSync(join(tmpdir(), 'v3-snapshots-'));
});

afterAll(() => {
  rmSync(fixturesRoot, { recursive: true, force: true });
  rmSync(snapshotsRoot, { recursive: true, force: true });
});

describe('fixture runner', () => {
  it('reports 0 fixtures when the directory is empty', async () => {
    const summary = await runRunner([
      '--fixtures-root',
      fixturesRoot,
      '--snapshots-root',
      snapshotsRoot,
    ]);
    expect(summary.found).toBe(0);
    expect(summary.passed).toBe(0);
    expect(summary.failed).toBe(0);
    expect(summary.drifted).toBe(0);
    expect(summary.fresh).toBe(0);
  });
});
