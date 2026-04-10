import type { Context, Next } from 'hono';
import { supabaseAdmin } from '../lib/supabase.js';

export interface AuthUser {
  id: string;
  email: string;
  accessToken: string;
}

const E2E_MOCK_AUTH_ENABLED = process.env.E2E_MOCK_AUTH === 'true';
const E2E_MOCK_AUTH_TOKEN = process.env.E2E_MOCK_AUTH_TOKEN ?? 'mock-e2e-access-token';
const E2E_MOCK_AUTH_USER_ID = process.env.E2E_MOCK_AUTH_USER_ID ?? '5b756a7a-3e35-4465-bcf4-69d92f160f21';
const E2E_MOCK_AUTH_EMAIL = process.env.E2E_MOCK_AUTH_EMAIL ?? 'e2e@example.com';

// Block production startup with mock auth enabled — this would bypass all authentication
if (E2E_MOCK_AUTH_ENABLED && process.env.NODE_ENV === 'production') {
  console.error(
    '\n\n*** FATAL: E2E_MOCK_AUTH=true is set in a production environment. ***\n' +
    '*** This bypasses ALL authentication with a hardcoded token.     ***\n' +
    '*** Remove E2E_MOCK_AUTH from production environment variables.  ***\n\n',
  );
  process.exit(1);
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
let cacheHits = 0;
let cacheMisses = 0;
let remoteAuthChecks = 0;
let remoteAuthFailures = 0;

function decodeJwtExpiryMs(token: string): number | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const payloadPart = parts[1];
  if (!payloadPart) return null;
  const padded = payloadPart
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(payloadPart.length / 4) * 4, '=');
  try {
    const decoded = Buffer.from(padded, 'base64').toString('utf8');
    const parsed = JSON.parse(decoded) as { exp?: unknown };
    if (typeof parsed.exp !== 'number' || !Number.isFinite(parsed.exp)) return null;
    return Math.floor(parsed.exp * 1000);
  } catch {
    return null;
  }
}

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
  const totalLookups = cacheHits + cacheMisses;
  const hitRate = totalLookups > 0 ? Number((cacheHits / totalLookups).toFixed(4)) : 0;
  return {
    active_tokens: tokenCache.size,
    max_tokens: MAX_TOKEN_CACHE_ENTRIES,
    ttl_ms: TOKEN_CACHE_TTL_MS,
    cache_hits: cacheHits,
    cache_misses: cacheMisses,
    cache_hit_rate: hitRate,
    remote_auth_checks: remoteAuthChecks,
    remote_auth_failures: remoteAuthFailures,
  };
}

export function getCachedUser(token: string): AuthUser | null {
  const entry = tokenCache.get(token);
  if (!entry) {
    cacheMisses += 1;
    return null;
  }
  if (Date.now() >= entry.expiresAt) {
    tokenCache.delete(token);
    cacheMisses += 1;
    return null;
  }
  // Refresh LRU position to keep active users in cache under load.
  tokenCache.delete(token);
  tokenCache.set(token, entry);
  cacheHits += 1;
  return entry.user;
}

export function cacheUser(token: string, user: AuthUser): void {
  // Limit cache size to prevent unbounded memory growth
  if (tokenCache.size >= MAX_TOKEN_CACHE_ENTRIES) {
    // Evict oldest entry
    const oldest = tokenCache.keys().next().value;
    if (oldest) tokenCache.delete(oldest);
  }
  const now = Date.now();
  const tokenExpMs = decodeJwtExpiryMs(token);
  let expiresAt = now + TOKEN_CACHE_TTL_MS;
  if (tokenExpMs != null) {
    if (tokenExpMs <= now) {
      // Token already expired — do not cache.
      return;
    }
    // Never cache beyond token expiry (with a 1s skew cushion).
    // Math.max(1000, ...) floors the TTL so a near-expiry token never
    // produces a zero or negative cache duration.
    expiresAt = now + Math.max(1_000, Math.min(TOKEN_CACHE_TTL_MS, tokenExpMs - now - 1_000));
  }
  tokenCache.set(token, { user, expiresAt });
}

// Test-only helper to avoid cross-test leakage from module-level state.
export function resetAuthCacheForTests() {
  tokenCache.clear();
  cacheHits = 0;
  cacheMisses = 0;
  remoteAuthChecks = 0;
  remoteAuthFailures = 0;
}

export function resolveE2EMockUser(token: string): AuthUser | null {
  if (!E2E_MOCK_AUTH_ENABLED || token !== E2E_MOCK_AUTH_TOKEN) {
    return null;
  }

  return {
    id: E2E_MOCK_AUTH_USER_ID,
    email: E2E_MOCK_AUTH_EMAIL,
    accessToken: token,
  };
}

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401);
  }

  const token = authHeader.slice(7);

  const mockUser = resolveE2EMockUser(token);
  if (mockUser) {
    cacheUser(token, mockUser);
    c.set('user', mockUser);
    await next();
    return;
  }

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
  remoteAuthChecks += 1;

  if (error || !user) {
    remoteAuthFailures += 1;
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
