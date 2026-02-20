import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { requestIdMiddleware } from '../middleware/request-id.js';

function createApp() {
  const app = new Hono();
  app.use('*', requestIdMiddleware);
  app.get('/id', (c) => c.json({ requestId: c.get('requestId') }));
  return app;
}

describe('requestIdMiddleware', () => {
  it('uses valid caller-provided request id', async () => {
    const app = createApp();
    const res = await app.request('http://test/id', {
      headers: { 'X-Request-ID': 'req-123_ABC' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Request-ID')).toBe('req-123_ABC');
    const body = await res.json() as { requestId: string };
    expect(body.requestId).toBe('req-123_ABC');
  });

  it('falls back to generated id for invalid characters', async () => {
    const app = createApp();
    const res = await app.request('http://test/id', {
      headers: { 'X-Request-ID': 'bad id' },
    });
    expect(res.status).toBe(200);
    const echoed = res.headers.get('X-Request-ID') ?? '';
    expect(echoed).not.toBe('bad id');
    expect(/^[A-Za-z0-9._:-]+$/.test(echoed)).toBe(true);
  });

  it('caps very long request ids to 64 chars', async () => {
    const app = createApp();
    const longId = 'a'.repeat(200);
    const res = await app.request('http://test/id', {
      headers: { 'X-Request-ID': longId },
    });
    expect(res.status).toBe(200);
    const echoed = res.headers.get('X-Request-ID') ?? '';
    expect(echoed.length).toBe(64);
  });
});
