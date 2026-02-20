import type { Context, Next } from 'hono';
import logger from '../lib/logger.js';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateLimitEntry>();
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
  return {
    active_buckets: buckets.size,
    max_buckets: MAX_RATE_LIMIT_BUCKETS,
  };
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
    let key: string;
    if (user?.id) {
      key = `user:${trimKeySegment(user.id, 64)}:${scope}`;
    } else if (process.env.TRUST_PROXY === 'true') {
      const forwarded = trimKeySegment(c.req.header('x-forwarded-for')?.split(',')[0] ?? 'anonymous');
      key = `ip:${forwarded}:${scope}`;
    } else {
      key = `anonymous:${scope}`;
    }

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

    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      c.header('Retry-After', String(retryAfter));
      logger.warn({
        key,
        scope,
        count: entry.count,
        max: maxRequests,
      }, 'Rate limit exceeded');
      return c.json({ error: 'Too many requests. Please try again later.' }, 429);
    }

    await next();
  };
}
