/**
 * Tests for the Redis-backed rate-limit path in rateLimitMiddleware.
 *
 * Strategy: vi.mock() the two external modules so that no real Redis connection
 * is attempted. Each test controls the mock return values to cover the four
 * required scenarios: Redis increments, fallback to in-memory, feature flag
 * disabled, and TTL window expiry.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Hono } from 'hono';

// ─── module mocks ────────────────────────────────────────────────────────────
// These must be declared before any import of the modules under test so Vitest
// hoists them correctly.

const mockIncr = vi.fn<() => Promise<number>>();
const mockExpire = vi.fn<() => Promise<number>>();
const mockRedis = { incr: mockIncr, expire: mockExpire };

vi.mock('../lib/redis-client.js', () => ({
  getRedisClient: vi.fn(() => mockRedis),
  shutdownRedis: vi.fn(),
  resetRedisClientForTests: vi.fn(),
}));

// Feature-flag module — default to flag ON so Redis path is exercised.
// Individual tests flip it via vi.mocked() when needed.
let ffRedisRateLimit = true;
vi.mock('../lib/feature-flags.js', () => ({
  get FF_REDIS_RATE_LIMIT() {
    return ffRedisRateLimit;
  },
  FF_BLUEPRINT_APPROVAL: true,
  FF_REDIS_BUS: false,
  QUESTIONNAIRE_FLAGS: {},
  GUIDED_SUGGESTIONS_ENABLED: true,
  isQuestionnaireEnabled: vi.fn(() => false),
}));

// ─── imports (after mocks) ────────────────────────────────────────────────────
import {
  rateLimitMiddleware,
  resetRateLimitStateForTests,
  getRateLimitStats,
} from '../middleware/rate-limit.js';
import { getRedisClient } from '../lib/redis-client.js';

// ─── helpers ──────────────────────────────────────────────────────────────────

function buildApp(maxRequests: number, windowMs: number) {
  const app = new Hono();
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

// ─── tests ────────────────────────────────────────────────────────────────────

describe('Redis-backed rate limiting', () => {
  beforeEach(() => {
    resetRateLimitStateForTests();
    mockIncr.mockReset();
    mockExpire.mockReset();
    ffRedisRateLimit = true;
    vi.mocked(getRedisClient).mockReturnValue(mockRedis as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Test 1: Redis path increments correctly and allows/denies ──────────────

  it('increments the Redis counter and allows requests within the limit', async () => {
    // Simulate a fresh key: count goes 1, 2 (within limit of 3)
    mockIncr.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    mockExpire.mockResolvedValue(1);

    const app = buildApp(3, 60_000);

    const first = await app.request('http://test/limited', {
      headers: { 'x-user-id': 'redis-user' },
    });
    const second = await app.request('http://test/limited', {
      headers: { 'x-user-id': 'redis-user' },
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    // INCR was called twice — once per request
    expect(mockIncr).toHaveBeenCalledTimes(2);

    // EXPIRE was only called on the first increment (count === 1)
    expect(mockExpire).toHaveBeenCalledTimes(1);

    // Headers reflect the Redis counter
    expect(first.headers.get('X-RateLimit-Limit')).toBe('3');
    expect(first.headers.get('X-RateLimit-Remaining')).toBe('2');
    expect(second.headers.get('X-RateLimit-Remaining')).toBe('1');
  });

  it('returns 429 when Redis counter exceeds the limit', async () => {
    // count=4 on this request, limit=3
    mockIncr.mockResolvedValueOnce(4);
    mockExpire.mockResolvedValue(1);

    const app = buildApp(3, 60_000);

    const res = await app.request('http://test/limited', {
      headers: { 'x-user-id': 'redis-over-limit' },
    });

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeTruthy();
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('0');

    const stats = getRateLimitStats();
    expect(stats.denied_decisions).toBe(1);
  });

  // ── Test 2: Fallback to in-memory when Redis is unavailable ───────────────

  it('falls back to in-memory when getRedisClient returns null', async () => {
    // Redis is unreachable — client unavailable
    vi.mocked(getRedisClient).mockReturnValue(null as never);

    const app = buildApp(2, 60_000);

    const first = await app.request('http://test/limited', {
      headers: { 'x-user-id': 'fallback-user' },
    });
    const second = await app.request('http://test/limited', {
      headers: { 'x-user-id': 'fallback-user' },
    });
    const third = await app.request('http://test/limited', {
      headers: { 'x-user-id': 'fallback-user' },
    });

    // In-memory path should enforce the limit normally
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(429);

    // Redis INCR was never called
    expect(mockIncr).not.toHaveBeenCalled();
  });

  it('falls back to in-memory when the Redis INCR call throws', async () => {
    mockIncr.mockRejectedValue(new Error('ECONNREFUSED'));

    const app = buildApp(2, 60_000);

    const first = await app.request('http://test/limited', {
      headers: { 'x-user-id': 'redis-error-user' },
    });
    const second = await app.request('http://test/limited', {
      headers: { 'x-user-id': 'redis-error-user' },
    });
    const third = await app.request('http://test/limited', {
      headers: { 'x-user-id': 'redis-error-user' },
    });

    // In-memory limit still enforced despite Redis error
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(429);
  });

  // ── Test 3: Feature flag disabled → Redis is never consulted ──────────────

  it('bypasses Redis entirely when FF_REDIS_RATE_LIMIT is false', async () => {
    ffRedisRateLimit = false;

    const app = buildApp(2, 60_000);

    const first = await app.request('http://test/limited', {
      headers: { 'x-user-id': 'no-flag-user' },
    });
    const second = await app.request('http://test/limited', {
      headers: { 'x-user-id': 'no-flag-user' },
    });
    const third = await app.request('http://test/limited', {
      headers: { 'x-user-id': 'no-flag-user' },
    });

    // In-memory limit enforced normally
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(429);

    // Redis never touched
    expect(mockIncr).not.toHaveBeenCalled();
    expect(mockExpire).not.toHaveBeenCalled();
  });

  // ── Test 4: EXPIRE TTL window set correctly ────────────────────────────────

  it('sets TTL to ceil(windowMs/1000)+1 seconds on first increment', async () => {
    mockIncr.mockResolvedValueOnce(1);
    mockExpire.mockResolvedValue(1);

    const windowMs = 5_000; // 5-second window
    const expectedTtl = Math.ceil(windowMs / 1000) + 1; // 6

    const app = buildApp(10, windowMs);

    await app.request('http://test/limited', {
      headers: { 'x-user-id': 'ttl-user' },
    });

    expect(mockExpire).toHaveBeenCalledTimes(1);
    // First arg is the Redis key, second is the TTL in seconds
    const firstCall = mockExpire.mock.calls[0] as unknown as [string, number];
    const ttlArg = firstCall[1];
    expect(ttlArg).toBe(expectedTtl);
  });

  it('does not call EXPIRE when counter is already above 1 (not the first increment)', async () => {
    // Simulate a key that already has a count from a prior request
    mockIncr.mockResolvedValueOnce(3);
    mockExpire.mockResolvedValue(1);

    const app = buildApp(10, 5_000);

    await app.request('http://test/limited', {
      headers: { 'x-user-id': 'ttl-skip-user' },
    });

    // INCR was called but EXPIRE must not be called since count !== 1
    expect(mockIncr).toHaveBeenCalledTimes(1);
    expect(mockExpire).not.toHaveBeenCalled();
  });
});
