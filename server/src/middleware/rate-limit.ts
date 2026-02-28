import type { Context, Next } from 'hono';
import logger from '../lib/logger.js';
import { getRedisClient } from '../lib/redis-client.js';
import { FF_REDIS_RATE_LIMIT } from '../lib/feature-flags.js';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateLimitEntry>();
let allowedDecisions = 0;
let deniedDecisions = 0;
const deniedByScope = new Map<string, number>();
const MAX_DENIED_SCOPE_ENTRIES = 200;
const MAX_RATE_LIMIT_BUCKETS = (() => {
  const parsed = Number.parseInt(process.env.MAX_RATE_LIMIT_BUCKETS ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 50_000;
})();

function trimKeySegment(value: string, maxLen = 128): string {
  const trimmed = value.trim();
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

// Cleanup expired entries every 60 seconds
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (now >= entry.resetAt) {
      buckets.delete(key);
    }
  }
}, 60_000);
cleanupTimer.unref();

export function getRateLimitStats() {
  const topDeniedScopes = Array.from(deniedByScope.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([scope, count]) => ({ scope, count }));
  return {
    active_buckets: buckets.size,
    max_buckets: MAX_RATE_LIMIT_BUCKETS,
    allowed_decisions: allowedDecisions,
    denied_decisions: deniedDecisions,
    denied_by_scope: topDeniedScopes,
  };
}

// Test-only helper to avoid cross-test leakage from module-level state.
export function resetRateLimitStateForTests() {
  buckets.clear();
  allowedDecisions = 0;
  deniedDecisions = 0;
  deniedByScope.clear();
}

/**
 * Attempts a Redis-backed rate limit check using a fixed-window counter.
 *
 * Returns { allowed, remaining } on success, or null if Redis is unavailable
 * or the feature flag is disabled — callers must fall back to in-memory in
 * the null case.
 *
 * The Redis key encodes the identifier and the current time-window index so
 * that each window gets its own counter that auto-expires slightly after the
 * window closes.
 */
async function checkRedisRateLimit(
  identifier: string,
  windowMs: number,
  maxRequests: number,
): Promise<{ allowed: boolean; remaining: number } | null> {
  if (!FF_REDIS_RATE_LIMIT) return null;

  const redis = getRedisClient();
  if (!redis) return null;

  const windowKey = Math.floor(Date.now() / windowMs);
  const redisKey = `rl:${identifier}:${windowKey}`;

  try {
    const count = await redis.incr(redisKey);
    if (count === 1) {
      // Set TTL only on the first increment to avoid resetting the expiry on
      // every request. Add one second of buffer so the key doesn't vanish
      // fractionally before the next window starts.
      await redis.expire(redisKey, Math.ceil(windowMs / 1000) + 1);
    }
    return { allowed: count <= maxRequests, remaining: Math.max(0, maxRequests - count) };
  } catch {
    // Any Redis error (timeout, connection refused, etc.) falls through to
    // in-memory so availability of the rate limiter is never Redis-dependent.
    return null;
  }
}

/**
 * Simple fixed-window rate limiter keyed by user ID (from auth) or IP.
 * @param maxRequests - Max requests allowed in the window
 * @param windowMs - Window duration in milliseconds
 */
export function rateLimitMiddleware(maxRequests: number, windowMs: number) {
  return async (c: Context, next: Next) => {
    const user = c.get('user') as { id: string } | undefined;
    const scope = `${c.req.method}:${c.req.path}`;
    let identifier: string;
    if (user?.id) {
      identifier = `user:${trimKeySegment(user.id, 64)}:${scope}`;
    } else if (process.env.TRUST_PROXY === 'true') {
      const forwarded = trimKeySegment(c.req.header('x-forwarded-for')?.split(',')[0] ?? 'anonymous');
      identifier = `ip:${forwarded}:${scope}`;
    } else {
      identifier = `anonymous:${scope}`;
    }

    // --- Redis path (when FF_REDIS_RATE_LIMIT is enabled and Redis is reachable) ---
    const redisResult = await checkRedisRateLimit(identifier, windowMs, maxRequests);
    if (redisResult !== null) {
      // Window reset time is not tracked in Redis — expose the window length as
      // the reset horizon so clients have a meaningful Retry-After value.
      const resetSeconds = Math.ceil(windowMs / 1000);
      c.header('X-RateLimit-Limit', String(maxRequests));
      c.header('X-RateLimit-Remaining', String(redisResult.remaining));
      c.header('X-RateLimit-Reset', String(resetSeconds));

      if (!redisResult.allowed) {
        deniedDecisions += 1;
        deniedByScope.set(scope, (deniedByScope.get(scope) ?? 0) + 1);
        while (deniedByScope.size > MAX_DENIED_SCOPE_ENTRIES) {
          const oldest = deniedByScope.keys().next().value;
          if (!oldest) break;
          deniedByScope.delete(oldest);
        }
        c.header('Retry-After', String(resetSeconds));
        logger.warn({
          key: identifier,
          scope,
          remaining: redisResult.remaining,
          max: maxRequests,
          backend: 'redis',
        }, 'Rate limit exceeded');
        return c.json({ error: 'Too many requests. Please try again later.' }, 429);
      }

      allowedDecisions += 1;
      await next();
      return;
    }

    // --- In-memory fallback (default path when FF_REDIS_RATE_LIMIT is false or Redis is down) ---
    const key = identifier;
    const now = Date.now();
    let entry = buckets.get(key);

    if (!entry || now >= entry.resetAt) {
      // Keep memory bounded under key-space abuse.
      while (buckets.size >= MAX_RATE_LIMIT_BUCKETS) {
        const oldest = buckets.keys().next().value;
        if (!oldest) break;
        buckets.delete(oldest);
      }
      entry = { count: 0, resetAt: now + windowMs };
      buckets.set(key, entry);
    } else {
      // Refresh insertion order so oldest buckets are evicted first.
      buckets.delete(key);
      buckets.set(key, entry);
    }

    entry.count++;
    const resetSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    c.header('X-RateLimit-Limit', String(maxRequests));
    c.header('X-RateLimit-Remaining', String(Math.max(0, maxRequests - entry.count)));
    c.header('X-RateLimit-Reset', String(resetSeconds));

    if (entry.count > maxRequests) {
      deniedDecisions += 1;
      deniedByScope.set(scope, (deniedByScope.get(scope) ?? 0) + 1);
      while (deniedByScope.size > MAX_DENIED_SCOPE_ENTRIES) {
        const oldest = deniedByScope.keys().next().value;
        if (!oldest) break;
        deniedByScope.delete(oldest);
      }
      c.header('Retry-After', String(resetSeconds));
      logger.warn({
        key,
        scope,
        count: entry.count,
        max: maxRequests,
      }, 'Rate limit exceeded');
      return c.json({ error: 'Too many requests. Please try again later.' }, 429);
    }

    allowedDecisions += 1;
    await next();
  };
}
