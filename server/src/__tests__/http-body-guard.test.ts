import { describe, it, expect } from 'vitest';
import { Hono, type Context } from 'hono';
import { parsePositiveInt, rejectOversizedJsonBody, parseJsonBodyWithLimit } from '../lib/http-body-guard.js';

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

describe('parseJsonBodyWithLimit', () => {
  it('blocks oversized bodies even when content-length is absent or unreliable', async () => {
    const app = new Hono();
    app.post('/parse', async (c) => {
      const parsed = await parseJsonBodyWithLimit(c, 20);
      if (!parsed.ok) return parsed.response;
      return c.json({ ok: true, data: parsed.data });
    });

    const res = await app.request('http://test/parse', {
      method: 'POST',
      body: JSON.stringify({ payload: 'x'.repeat(200) }),
      headers: { 'Content-Type': 'application/json' },
    });

    expect(res.status).toBe(413);
  });

  it('returns 400 for invalid JSON', async () => {
    const app = new Hono();
    app.post('/parse', async (c) => {
      const parsed = await parseJsonBodyWithLimit(c, 200);
      if (!parsed.ok) return parsed.response;
      return c.json({ data: parsed.data });
    });

    const res = await app.request('http://test/parse', {
      method: 'POST',
      body: '{invalid-json',
      headers: { 'Content-Type': 'application/json' },
    });

    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Invalid JSON in request body');
  });

  it('rejects non-JSON content types with 415', async () => {
    const app = new Hono();
    app.post('/parse', async (c) => {
      const parsed = await parseJsonBodyWithLimit(c, 200);
      if (!parsed.ok) return parsed.response;
      return c.json({ data: parsed.data });
    });

    const res = await app.request('http://test/parse', {
      method: 'POST',
      body: 'name=alice',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    expect(res.status).toBe(415);
    const body = await res.json() as { error?: string };
    expect(body.error).toContain('application/json');
  });

  it('blocks oversized streamed JSON bodies without relying on content-length', async () => {
    const app = new Hono();
    app.post('/parse', async (c) => {
      const parsed = await parseJsonBodyWithLimit(c, 30);
      if (!parsed.ok) return parsed.response;
      return c.json({ data: parsed.data });
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{"payload":"'));
        controller.enqueue(encoder.encode('x'.repeat(120)));
        controller.enqueue(encoder.encode('"}'));
        controller.close();
      },
    });

    const init: RequestInit & { duplex: 'half' } = {
      method: 'POST',
      body: stream,
      headers: { 'Content-Type': 'application/json' },
      duplex: 'half',
    };
    const req = new Request('http://test/parse', init);
    const res = await app.request(req);

    expect(res.status).toBe(413);
    const body = await res.json() as { error?: string };
    expect(body.error).toContain('Request too large');
  });
});
