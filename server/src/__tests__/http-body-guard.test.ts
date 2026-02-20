import { describe, it, expect } from 'vitest';
import { Hono, type Context } from 'hono';
import { parsePositiveInt, rejectOversizedJsonBody } from '../lib/http-body-guard.js';

describe('parsePositiveInt', () => {
  it('returns parsed positive values', () => {
    expect(parsePositiveInt('42', 5)).toBe(42);
  });

  it('falls back for invalid, empty, and non-positive values', () => {
    expect(parsePositiveInt(undefined, 5)).toBe(5);
    expect(parsePositiveInt('abc', 5)).toBe(5);
    expect(parsePositiveInt('0', 5)).toBe(5);
    expect(parsePositiveInt('-2', 5)).toBe(5);
  });
});

describe('rejectOversizedJsonBody', () => {
  function makeMockContext(contentLength: string | undefined): Context {
    return {
      req: {
        header: (name: string) => (name.toLowerCase() === 'content-length' ? contentLength : undefined),
      },
      json: (payload: unknown, status?: number) =>
        new Response(JSON.stringify(payload), {
          status,
          headers: { 'content-type': 'application/json' },
        }),
    } as unknown as Context;
  }

  it('returns 413 when content-length exceeds configured max', async () => {
    const res = rejectOversizedJsonBody(makeMockContext('200'), 50);

    expect(res).toBeTruthy();
    expect(res?.status).toBe(413);
    const json = await res!.json() as { error?: string };
    expect(json.error).toContain('Request too large');
  });

  it('allows requests within configured max', async () => {
    const blocked = rejectOversizedJsonBody(makeMockContext('48'), 1_000);
    expect(blocked).toBeNull();
  });

  it('allows requests when content-length is absent', () => {
    const blocked = rejectOversizedJsonBody(makeMockContext(undefined), 50);
    expect(blocked).toBeNull();
  });

  it('ignores malformed content-length values', () => {
    expect(rejectOversizedJsonBody(makeMockContext('abc'), 50)).toBeNull();
    expect(rejectOversizedJsonBody(makeMockContext('-7'), 50)).toBeNull();
  });
});
