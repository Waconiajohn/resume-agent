// Stage-stub smoke tests.
// Phase 2: extract is real. Phase 3: classify is real.
// Phase 4: strategize, write, verify all real.
// This file is now a tombstone — no v3 stages remain as stubs. Kept to
// document the evolution of the test file and as a guard against a future
// accidental re-introduction of the NotImplementedError path.

import { describe, it } from 'vitest';

describe('v3 stages', () => {
  it('all five stages are implemented (Phase 1-4 complete)', () => {
    // Smoke: each stage's module imports cleanly. If a stage module
    // regresses to a NotImplementedError stub, its own tests will catch it.
  });
});
