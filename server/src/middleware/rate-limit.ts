import type { Context, Next } from 'hono';
import logger from '../lib/logger.js';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateLimitEntry>();

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
      key = `user:${user.id}:${scope}`;
    } else if (process.env.TRUST_PROXY === 'true') {
      const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anonymous';
      key = `ip:${forwarded}:${scope}`;
    } else {
      key = `anonymous:${scope}`;
    }

    const now = Date.now();
    let entry = buckets.get(key);

    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
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
