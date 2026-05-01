import type { Context, Next } from 'hono';
import { supabaseAdmin } from '../lib/supabase.js';
import { recordSupabaseIdentity } from '../lib/auth-context.js';
import logger from '../lib/logger.js';

export interface AuthUser {
  id: string;
  email: string;
  accessToken: string;
  /**
   * AAL extracted from the JWT. Optional so test fixtures that pre-date
   * the AAL2 enforcement work don't have to set it; production code paths
   * always populate it.
   */
  aal?: 'aal1' | 'aal2' | null;
  /**
   * True when the user has at least one verified MFA factor enrolled.
   * Optional for the same back-compat reason as `aal`.
   */
  requiresAal2?: boolean;
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

function decodeJwtClaims(token: string): { exp?: unknown; aal?: unknown } | null {
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
    return JSON.parse(decoded) as { exp?: unknown; aal?: unknown };
  } catch {
    return null;
  }
}

function decodeJwtExpiryMs(token: string): number | null {
  const claims = decodeJwtClaims(token);
  if (!claims || typeof claims.exp !== 'number' || !Number.isFinite(claims.exp)) return null;
  return Math.floor(claims.exp * 1000);
}

function decodeJwtAal(token: string): 'aal1' | 'aal2' | null {
  const claims = decodeJwtClaims(token);
  if (!claims) return null;
  if (claims.aal === 'aal1' || claims.aal === 'aal2') return claims.aal;
  return null;
}

// Per-user cache of "has verified MFA factor" — keyed by user_id rather
// than token because the answer is the same across every token for a
// given user. 5-min TTL matches the token cache. Staleness window: a
// user who enrolls a factor mid-session can still hit AAL1 endpoints
// for up to 5 min before the cache picks up; an attacker exploiting
// that window would need an already-active AAL1 session, which means
// they already have the password — the MFA fence is effectively a
// hardening upgrade rather than a primary control.
const FACTORS_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_FACTORS_CACHE_ENTRIES = 5_000;
interface FactorsCacheEntry {
  hasFactor: boolean;
  expiresAt: number;
}
const factorsCache = new Map<string, FactorsCacheEntry>();

const factorsCacheCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [userId, entry] of factorsCache.entries()) {
    if (now >= entry.expiresAt) factorsCache.delete(userId);
  }
}, 60_000);
factorsCacheCleanupTimer.unref();

async function userHasVerifiedFactor(userId: string): Promise<boolean> {
  const cached = factorsCache.get(userId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.hasFactor;
  }
  try {
    const { data, error } = await supabaseAdmin.rpc('rpc_user_has_verified_factor', {
      caller_user_id: userId,
    });
    if (error) {
      // Fail open on transient errors. The MFA fence is one layer; the
      // password is another. Logging so we notice if this becomes
      // chronic. Don't cache failure — retry on next call.
      logger.warn(
        { userId, code: error.code, message: error.message },
        'authMiddleware: rpc_user_has_verified_factor failed; treating user as no-MFA',
      );
      return false;
    }
    const value = data === true;
    if (factorsCache.size >= MAX_FACTORS_CACHE_ENTRIES) {
      const oldest = factorsCache.keys().next().value;
      if (oldest) factorsCache.delete(oldest);
    }
    factorsCache.set(userId, { hasFactor: value, expiresAt: Date.now() + FACTORS_CACHE_TTL_MS });
    return value;
  } catch (err) {
    logger.warn(
      { userId, err: err instanceof Error ? err.message : String(err) },
      'authMiddleware: rpc call threw; treating user as no-MFA',
    );
    return false;
  }
}

export function resetFactorsCacheForTests() {
  factorsCache.clear();
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
    // Mock auth is E2E only and bypasses the AAL2 check; treat as AAL2
    // so test fixtures don't have to think about MFA enforcement.
    aal: 'aal2',
    requiresAal2: false,
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

  const aal = decodeJwtAal(token);
  const requiresAal2 = await userHasVerifiedFactor(user.id);

  // AAL2 enforcement — close the gap where a phished password gives
  // backend access despite the UI's MfaChallengeGate. If the user has
  // verified MFA factors but the token is still at AAL1, the second
  // factor hasn't been presented and we refuse the request. The
  // frontend gate uses Supabase's mfa.* APIs directly (not via this
  // middleware), so it can still elevate the session.
  if (requiresAal2 && aal !== 'aal2') {
    return c.json(
      { error: 'MFA upgrade required', code: 'MFA_REQUIRED' },
      401,
    );
  }

  const authUser: AuthUser = {
    id: user.id,
    email: user.email ?? '',
    accessToken: token,
    aal,
    requiresAal2,
  };

  cacheUser(token, authUser);
  c.set('user', authUser);

  // Bridge the canonical user into platform_auth_identities. Only fires on
  // cache miss (~once per 5-min token lifetime per user), is idempotent
  // (upsert on auth_provider+provider_subject), and runs fire-and-forget
  // so it never blocks the request. The bridge migration only seeded
  // existing users at apply time; this keeps newly-created auth.users in
  // sync without a Supabase auth-schema trigger.
  void recordSupabaseIdentity(authUser);

  await next();
}
