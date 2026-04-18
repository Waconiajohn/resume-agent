// Stage-stub smoke tests.
// Phase 2: extract is real. Phase 3: classify is real.
// Stages 3–5 (strategize, write, verify) remain stubs until Phase 4.

import { describe, expect, it } from 'vitest';
import { NotImplementedError } from '../../v3/errors.js';
import { strategize } from '../../v3/strategize/index.js';
import { write } from '../../v3/write/index.js';
import { verify } from '../../v3/verify/index.js';

describe('v3 stage stubs (3–5) throw NotImplementedError', () => {
  it('strategize', async () => {
    await expect(
      strategize({} as never, { text: '' }),
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
