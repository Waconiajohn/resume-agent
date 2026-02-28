import { describe, it, expect, vi } from 'vitest';
import { withRetry } from '../lib/retry.js';

describe('withRetry — abort behavior', () => {
  it('does not retry when the thrown error is an AbortError', async () => {
    const onRetry = vi.fn();
    let callCount = 0;

    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';

    await expect(
      withRetry(
        async () => {
          callCount += 1;
          throw abortError;
        },
        { maxAttempts: 3, baseDelay: 1, onRetry },
      ),
    ).rejects.toThrow('The operation was aborted');

    // Must have been called exactly once — no retries
    expect(callCount).toBe(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('does not retry when the thrown error is a DOMException with name AbortError', async () => {
    const onRetry = vi.fn();
    let callCount = 0;

    // DOMException is available in Node 18+ via the global scope
    const domAbort = new DOMException('Aborted via DOMException', 'AbortError');

    await expect(
      withRetry(
        async () => {
          callCount += 1;
          throw domAbort;
        },
        { maxAttempts: 3, baseDelay: 1, onRetry },
      ),
    ).rejects.toThrow('Aborted via DOMException');

    expect(callCount).toBe(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('retries a transient 429 error and succeeds on second attempt', async () => {
    const onRetry = vi.fn();
    let callCount = 0;

    const result = await withRetry(
      async () => {
        callCount += 1;
        if (callCount === 1) {
          const err = new Error('rate limited') as Error & { status?: number };
          err.status = 429;
          throw err;
        }
        return 'success';
      },
      { maxAttempts: 3, baseDelay: 1, onRetry },
    );

    expect(result).toBe('success');
    expect(callCount).toBe(2);
    expect(onRetry).toHaveBeenCalledOnce();
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error));
  });
});
