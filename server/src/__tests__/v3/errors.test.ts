// v3 error-class smoke tests.
import { describe, expect, it } from 'vitest';
import { NotImplementedError, PromptLoadError } from '../../v3/errors.js';

describe('v3 errors', () => {
  it('NotImplementedError carries the stage name in its message', () => {
    const err = new NotImplementedError('classify');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('NotImplementedError');
    expect(err.message).toContain('classify');
  });

  it('PromptLoadError preserves the underlying cause', () => {
    const cause = new Error('disk full');
    const err = new PromptLoadError('prompt disappeared', cause);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('PromptLoadError');
    expect(err.cause).toBe(cause);
  });
});
