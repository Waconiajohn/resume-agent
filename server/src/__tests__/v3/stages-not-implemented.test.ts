// Stage-stub smoke tests.
// Each Phase 1 stage stub must throw NotImplementedError when invoked.
// Real behavior lands in later phases (see phase-1-kickoff §"Goal of this phase").

import { describe, expect, it } from 'vitest';
import { NotImplementedError } from '../../v3/errors.js';
import { extract } from '../../v3/extract/index.js';
import { classify } from '../../v3/classify/index.js';
import { strategize } from '../../v3/strategize/index.js';
import { write } from '../../v3/write/index.js';
import { verify } from '../../v3/verify/index.js';

describe('v3 stage stubs throw NotImplementedError', () => {
  it('extract', async () => {
    await expect(extract({ text: 'anything' })).rejects.toBeInstanceOf(NotImplementedError);
  });

  it('classify', async () => {
    await expect(
      classify({ plaintext: '', format: 'text', warnings: [] }),
    ).rejects.toBeInstanceOf(NotImplementedError);
  });

  it('strategize', async () => {
    await expect(
      // minimally-shaped args — stubs don't read them
      strategize(
        {} as never,
        { text: '' },
      ),
    ).rejects.toBeInstanceOf(NotImplementedError);
  });

  it('write', async () => {
    await expect(
      write({} as never, {} as never),
    ).rejects.toBeInstanceOf(NotImplementedError);
  });

  it('verify', async () => {
    await expect(
      verify({} as never, {} as never, {} as never),
    ).rejects.toBeInstanceOf(NotImplementedError);
  });
});
