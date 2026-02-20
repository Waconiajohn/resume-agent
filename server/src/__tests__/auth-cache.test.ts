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
});
