import type { Context, Next } from 'hono';
import { supabaseAdmin } from '../lib/supabase.js';

export interface AuthUser {
  id: string;
  email: string;
  accessToken: string;
}

declare module 'hono' {
  interface ContextVariableMap {
    user: AuthUser;
  }
}

// Simple in-memory JWT verification cache — 5 minute TTL.
// Avoids a Supabase remote call on every request for the same token.
const TOKEN_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_TOKEN_CACHE_ENTRIES = 1000;
interface CacheEntry {
  user: AuthUser;
  expiresAt: number;
}
const tokenCache = new Map<string, CacheEntry>();

const tokenCacheCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of tokenCache.entries()) {
    if (now >= entry.expiresAt) {
      tokenCache.delete(token);
    }
  }
}, 60_000);
tokenCacheCleanupTimer.unref();

export function getAuthCacheStats() {
  return {
    active_tokens: tokenCache.size,
    max_tokens: MAX_TOKEN_CACHE_ENTRIES,
    ttl_ms: TOKEN_CACHE_TTL_MS,
  };
}

export function getCachedUser(token: string): AuthUser | null {
  const entry = tokenCache.get(token);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    tokenCache.delete(token);
    return null;
  }
  // Refresh LRU position to keep active users in cache under load.
  tokenCache.delete(token);
  tokenCache.set(token, entry);
  return entry.user;
}

export function cacheUser(token: string, user: AuthUser): void {
  // Limit cache size to prevent unbounded memory growth
  if (tokenCache.size >= MAX_TOKEN_CACHE_ENTRIES) {
    // Evict oldest entry
    const oldest = tokenCache.keys().next().value;
    if (oldest) tokenCache.delete(oldest);
  }
  tokenCache.set(token, { user, expiresAt: Date.now() + TOKEN_CACHE_TTL_MS });
}

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401);
  }

  const token = authHeader.slice(7);

  // Check cache first to avoid remote call
  const cached = getCachedUser(token);
  if (cached) {
    c.set('user', cached);
    await next();
    return;
  }

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  const authUser: AuthUser = {
    id: user.id,
    email: user.email ?? '',
    accessToken: token,
  };

  cacheUser(token, authUser);
  c.set('user', authUser);

  await next();
}
