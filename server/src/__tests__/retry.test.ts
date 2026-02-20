import { describe, it, expect } from 'vitest';
import { withRetry } from '../lib/retry.js';

describe('withRetry', () => {
  it('retries transient HTTP status errors', async () => {
    let attempts = 0;
    const result = await withRetry(async () => {
      attempts += 1;
      if (attempts < 3) {
        const err = new Error('temporary outage') as Error & { status?: number };
        err.status = 503;
        throw err;
      }
      return 'ok';
    }, { maxAttempts: 3, baseDelay: 1 });

    expect(result).toBe('ok');
    expect(attempts).toBe(3);
  });

  it('retries transient network error codes', async () => {
    let attempts = 0;
    const result = await withRetry(async () => {
      attempts += 1;
      if (attempts < 2) {
        const err = new Error('socket closed') as Error & { code?: string };
        err.code = 'ECONNRESET';
        throw err;
      }
      return 42;
    }, { maxAttempts: 2, baseDelay: 1 });

    expect(result).toBe(42);
    expect(attempts).toBe(2);
  });

  it('uses Retry-After header from response metadata', async () => {
    let attempts = 0;
    const result = await withRetry(async () => {
      attempts += 1;
      if (attempts === 1) {
        const err = new Error('rate limited') as Error & {
          response?: { status: number; headers: Headers };
        };
        err.response = {
          status: 429,
          headers: new Headers([['retry-after', '0.001']]),
        };
        throw err;
      }
      return 'done';
    }, { maxAttempts: 2, baseDelay: 1 });

    expect(result).toBe('done');
    expect(attempts).toBe(2);
  });

  it('does not retry non-transient errors', async () => {
    let attempts = 0;
    await expect(withRetry(async () => {
      attempts += 1;
      throw new Error('validation failed');
    }, { maxAttempts: 3, baseDelay: 1 })).rejects.toThrow('validation failed');
    expect(attempts).toBe(1);
  });
});
