import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Hono } from 'hono';
import { rateLimitMiddleware, resetRateLimitStateForTests, getRateLimitStats } from '../middleware/rate-limit.js';

function buildApp(maxRequests: number, windowMs: number) {
  const app = new Hono();

  // Test shim: optional user identity for user-scoped rate limit keys.
  app.use('*', async (c, next) => {
    const userId = c.req.header('x-user-id');
    if (userId) {
      c.set('user', { id: userId, email: `${userId}@test.local`, accessToken: 'test-token' });
    }
    await next();
  });

  app.use('/limited', rateLimitMiddleware(maxRequests, windowMs));
  app.get('/limited', (c) => c.json({ ok: true }));
  return app;
}

describe('rateLimitMiddleware', () => {
  beforeEach(() => {
    resetRateLimitStateForTests();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('enforces limits per user key (isolated buckets)', async () => {
    const app = buildApp(1, 10_000);

    const userAFirst = await app.request('http://test/limited', {
      headers: { 'x-user-id': 'user-a' },
    });
    const userBFirst = await app.request('http://test/limited', {
      headers: { 'x-user-id': 'user-b' },
    });
    const userASecond = await app.request('http://test/limited', {
      headers: { 'x-user-id': 'user-a' },
    });

    expect(userAFirst.status).toBe(200);
    expect(userBFirst.status).toBe(200);
    expect(userASecond.status).toBe(429);
  });

  it('returns Retry-After and resets after fixed window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-20T21:00:00.000Z'));

    const app = buildApp(2, 1_000);

    const first = await app.request('http://test/limited', {
      headers: { 'x-user-id': 'window-user' },
    });
    const second = await app.request('http://test/limited', {
      headers: { 'x-user-id': 'window-user' },
    });
    const third = await app.request('http://test/limited', {
      headers: { 'x-user-id': 'window-user' },
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(429);
    expect(third.headers.get('Retry-After')).toBe('1');

    vi.advanceTimersByTime(1_001);

    const afterReset = await app.request('http://test/limited', {
      headers: { 'x-user-id': 'window-user' },
    });
    expect(afterReset.status).toBe(200);
  });

  it('tracks allowed and denied decisions in stats', async () => {
    const app = buildApp(1, 10_000);

    const first = await app.request('http://test/limited', {
      headers: { 'x-user-id': 'metrics-user' },
    });
    const second = await app.request('http://test/limited', {
      headers: { 'x-user-id': 'metrics-user' },
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);

    const stats = getRateLimitStats();
    expect(stats.allowed_decisions).toBe(1);
    expect(stats.denied_decisions).toBe(1);
    expect(stats.denied_by_scope.some((item) => item.scope === 'GET:/limited' && item.count === 1)).toBe(true);
  });
});
