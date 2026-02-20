import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    auth: {
      getUser: vi.fn(),
    },
  },
}));

import {
  cacheUser,
  getCachedUser,
  getAuthCacheStats,
  resetAuthCacheForTests,
  type AuthUser,
} from '../middleware/auth.js';

describe('auth cache', () => {
  const user: AuthUser = {
    id: 'user-1',
    email: 'user-1@test.local',
    accessToken: 'token-1',
  };

  beforeEach(() => {
    resetAuthCacheForTests();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('records cache hits and misses', () => {
    expect(getCachedUser('missing-token')).toBeNull();
    cacheUser('token-1', user);
    expect(getCachedUser('token-1')).toEqual(user);

    const stats = getAuthCacheStats();
    expect(stats.cache_hits).toBe(1);
    expect(stats.cache_misses).toBe(1);
    expect(stats.cache_hit_rate).toBe(0.5);
  });

  it('expires cached tokens after TTL', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-20T21:00:00.000Z'));

    cacheUser('token-1', user);
    expect(getCachedUser('token-1')).toEqual(user); // hit

    // TTL is 5 minutes in middleware/auth.ts
    vi.advanceTimersByTime((5 * 60 * 1000) + 1);
    expect(getCachedUser('token-1')).toBeNull(); // miss after expiry

    const stats = getAuthCacheStats();
    expect(stats.cache_hits).toBe(1);
    expect(stats.cache_misses).toBe(1);
    expect(stats.active_tokens).toBe(0);
  });

  it('limits cache lifetime to JWT expiry when token expires sooner than TTL', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-20T21:00:00.000Z'));

    const nowSeconds = Math.floor(Date.now() / 1000);
    const token = makeJwtWithExp(nowSeconds + 60); // 1 minute expiry
    cacheUser(token, { ...user, accessToken: token });

    expect(getCachedUser(token)).not.toBeNull();
    vi.advanceTimersByTime(61_000);
    expect(getCachedUser(token)).toBeNull();
  });

  it('does not cache already expired JWT tokens', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-20T21:00:00.000Z'));

    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiredToken = makeJwtWithExp(nowSeconds - 30);
    cacheUser(expiredToken, { ...user, accessToken: expiredToken });

    expect(getCachedUser(expiredToken)).toBeNull();
    expect(getAuthCacheStats().active_tokens).toBe(0);
  });
});

function makeJwtWithExp(expSeconds: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: 'user-1', exp: expSeconds })).toString('base64url');
  return `${header}.${payload}.signature`;
}
