// Stage-stub smoke tests.
// Phase 2: extract is real. Stages 2–5 remain stubs until Phases 3–4.

import { describe, expect, it } from 'vitest';
import { NotImplementedError } from '../../v3/errors.js';
import { classify } from '../../v3/classify/index.js';
import { strategize } from '../../v3/strategize/index.js';
import { write } from '../../v3/write/index.js';
import { verify } from '../../v3/verify/index.js';

describe('v3 stage stubs (2–5) throw NotImplementedError', () => {
  it('classify', async () => {
    await expect(
      classify({ plaintext: '', format: 'text', warnings: [] }),
    ).rejects.toBeInstanceOf(NotImplementedError);
  });

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
