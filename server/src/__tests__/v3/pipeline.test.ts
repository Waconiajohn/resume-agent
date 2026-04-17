// Pipeline orchestrator smoke test.
// With Phase 1 stubs, runPipeline must surface the first stage's failure
// (extract's NotImplementedError) rather than swallowing it.
// See OPERATING-MANUAL.md "No silent fallbacks".

import { describe, expect, it } from 'vitest';
import { runPipeline } from '../../v3/pipeline.js';
import { NotImplementedError } from '../../v3/errors.js';

describe('v3 pipeline', () => {
  it('surfaces the first unimplemented stage', async () => {
    await expect(
      runPipeline({
        resume: { text: 'placeholder resume text' },
        jobDescription: { text: 'placeholder JD text' },
      }),
    ).rejects.toBeInstanceOf(NotImplementedError);
  });
});
