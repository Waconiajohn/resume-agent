/**
 * Tests for server/src/lib/entitlements.ts
 *
 * Story: Sprint 7 Story 13 — Billing & Entitlements Tests
 *
 * Covers:
 *   1.  getUserEntitlements returns correct features for free plan
 *   2.  getUserEntitlements returns correct features for starter plan
 *   3.  getUserEntitlements returns correct features for pro plan
 *   4.  getUserEntitlements with no subscription defaults to free
 *   5.  User override merges with plan features (override wins)
 *   6.  Expired override is ignored
 *   7.  hasFeature returns true when feature is enabled
 *   8.  hasFeature returns false when feature is disabled
 *   9.  getFeatureLimit returns numeric limit
 *   10. getFeatureLimit returns -1 for unlimited
 *   11. getFeatureLimit returns 0 for unknown feature key
 *   12. Error handling: subscription DB failure returns free defaults
 *   13. Error handling: plan_features DB failure returns free defaults
 *   14. Error handling: overrides DB failure still returns plan features
 *   15. Unexpected thrown error returns free defaults
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Supabase mock — must be hoisted before any module imports ────────────────

const mockMaybeSingle = vi.hoisted(() => vi.fn());
const mockSelect = vi.hoisted(() => vi.fn());
const mockEq = vi.hoisted(() => vi.fn());
const mockFrom = vi.hoisted(() => vi.fn());

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: mockFrom,
  },
}));

vi.mock('../lib/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import {
  getUserEntitlements,
  hasFeature,
  getFeatureLimit,
} from '../lib/entitlements.js';

// ─── Helper: build a query chain ─────────────────────────────────────────────

/**
 * Build a mock supabase query chain that resolves to `resolvedValue` on
 * `.maybeSingle()` or `.select()` (for list queries that return an array).
 *
 * The chain supports: .from().select().eq().eq().maybeSingle()
 *                and: .from().select().eq()  (returns array via Promise)
 */
function makeChain(resolvedValue: unknown, listResult?: unknown) {
  // For list queries (.select().eq() -> array), we need the eq chain itself to
  // be awaitable. The maybeSingle() resolves to resolvedValue.
  const chain: Record<string, unknown> = {};

  chain['maybeSingle'] = vi.fn().mockResolvedValue(resolvedValue);
  chain['single'] = vi.fn().mockResolvedValue(resolvedValue);

  // eq() returns chain so further .eq() calls work
  chain['eq'] = vi.fn().mockReturnValue(chain);

  // The chain itself can be awaited for list queries (no terminal method needed)
  chain['then'] = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(listResult ?? resolvedValue).then(resolve);
  chain['catch'] = (reject: (e: unknown) => unknown) =>
    Promise.resolve(listResult ?? resolvedValue).catch(reject);

  chain['select'] = vi.fn().mockReturnValue(chain);

  return chain;
}

// ─── Helper: build a feature_value JSON string ───────────────────────────────

/**
 * The source reads `feature_value` as a JSON-parseable string or object.
 * Build a plan_features row with `feature_key` and `feature_value`.
 */
function planFeatureRow(key: string, value: object) {
  return { feature_key: key, feature_value: JSON.stringify(value) };
}

// ─── Tests: getUserEntitlements ───────────────────────────────────────────────

describe('getUserEntitlements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns free plan with empty features when user has no subscription row', async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) {
        // user_subscriptions query — no row
        return makeChain({ data: null, error: null });
      }
      if (callCount === 2) {
        // plan_features for 'free' plan — empty list (no rows configured in DB)
        return makeChain({ data: null, error: null }, { data: [], error: null });
      }
      // user_feature_overrides — empty list
      return makeChain({ data: null, error: null }, { data: [], error: null });
    });

    const result = await getUserEntitlements('user-no-sub');
    // UserEntitlements shape: { plan_id, features }
    // No subscription row → plan_id defaults to 'free'
    // plan_features returns empty → features = {}
    // FREE_PLAN_DEFAULTS only returned on DB error, not on empty plan rows
    expect(result).toHaveProperty('plan_id', 'free');
    expect(result).toHaveProperty('features');
    expect(Object.keys(result.features)).toHaveLength(0);
  });

  it('returns hardcoded FREE_PLAN_DEFAULTS when subscription DB query errors', async () => {
    // This is the true "free defaults" path — only triggered on DB error
    mockFrom.mockReturnValue(
      makeChain({ data: null, error: { message: 'connection refused' } }),
    );

    const result = await getUserEntitlements('user-sub-db-error');
    // FREE_PLAN_DEFAULTS: { plan_id: 'free', features: { sessions_per_month: { limit: 3 }, export_docx: { enabled: false }, ... } }
    expect(result).toHaveProperty('plan_id', 'free');
    expect(result.features['sessions_per_month']?.limit).toBe(3);
    expect(result.features['export_docx']?.enabled).toBe(false);
  });

  it('returns plan features merged with free defaults for starter plan', async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) {
        // user_subscriptions — starter plan
        return makeChain({ data: { plan_id: 'starter', status: 'active' }, error: null });
      }
      if (callCount === 2) {
        // plan_features for 'starter' — override export_docx to enabled
        return makeChain(
          { data: null, error: null },
          {
            data: [
              planFeatureRow('export_docx', { enabled: true }),
              planFeatureRow('sessions_per_month', { limit: 20 }),
            ],
            error: null,
          },
        );
      }
      // user_feature_overrides — none
      return makeChain({ data: null, error: null }, { data: [], error: null });
    });

    const result = await getUserEntitlements('user-starter');
    expect(result.features['export_docx']?.enabled).toBe(true);
    expect(result.features['sessions_per_month']?.limit).toBe(20);
  });

  it('returns unlimited (-1) limit for pro plan features', async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) {
        return makeChain({ data: { plan_id: 'pro', status: 'active' }, error: null });
      }
      if (callCount === 2) {
        return makeChain(
          { data: null, error: null },
          {
            data: [
              planFeatureRow('sessions_per_month', { limit: -1 }),
              planFeatureRow('export_docx', { enabled: true }),
              planFeatureRow('advanced_templates', { enabled: true }),
              planFeatureRow('priority_support', { enabled: true }),
            ],
            error: null,
          },
        );
      }
      return makeChain({ data: null, error: null }, { data: [], error: null });
    });

    const result = await getUserEntitlements('user-pro');
    expect(result.features['sessions_per_month']?.limit).toBe(-1);
    expect(result.features['advanced_templates']?.enabled).toBe(true);
    expect(result.features['priority_support']?.enabled).toBe(true);
  });

  it('merges user overrides on top of plan features (override wins)', async () => {
    const futureDate = new Date(Date.now() + 86400_000).toISOString();
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) {
        return makeChain({ data: { plan_id: 'starter', status: 'active' }, error: null });
      }
      if (callCount === 2) {
        // plan says export_docx is disabled
        return makeChain(
          { data: null, error: null },
          {
            data: [planFeatureRow('export_docx', { enabled: false })],
            error: null,
          },
        );
      }
      // override says export_docx is enabled (non-expired)
      return makeChain(
        { data: null, error: null },
        {
          data: [
            {
              feature_key: 'export_docx',
              feature_value: JSON.stringify({ enabled: true }),
              expires_at: futureDate,
            },
          ],
          error: null,
        },
      );
    });

    const result = await getUserEntitlements('user-with-override');
    // Override should win
    expect(result.features['export_docx']?.enabled).toBe(true);
  });

  it('ignores expired user overrides', async () => {
    const pastDate = new Date(Date.now() - 86400_000).toISOString();
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) {
        return makeChain({ data: { plan_id: 'starter', status: 'active' }, error: null });
      }
      if (callCount === 2) {
        // plan says export_docx is false
        return makeChain(
          { data: null, error: null },
          {
            data: [planFeatureRow('export_docx', { enabled: false })],
            error: null,
          },
        );
      }
      // expired override that would enable export_docx — must be ignored
      return makeChain(
        { data: null, error: null },
        {
          data: [
            {
              feature_key: 'export_docx',
              feature_value: JSON.stringify({ enabled: true }),
              expires_at: pastDate,
            },
          ],
          error: null,
        },
      );
    });

    const result = await getUserEntitlements('user-expired-override');
    // Expired override ignored — plan feature (false) stays
    expect(result.features['export_docx']?.enabled).toBe(false);
  });

  it('returns free defaults when plan_features DB query errors', async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) {
        return makeChain({ data: { plan_id: 'pro', status: 'active' }, error: null });
      }
      // plan_features error
      return makeChain(
        { data: null, error: null },
        { data: null, error: { message: 'table not found' } },
      );
    });

    const result = await getUserEntitlements('user-features-error');
    // Falls back to free defaults
    expect(result).toHaveProperty('plan_id', 'free');
    expect(result.features['sessions_per_month']?.limit).toBe(3);
  });

  it('returns plan features even when overrides DB query errors', async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) {
        return makeChain({ data: { plan_id: 'pro', status: 'active' }, error: null });
      }
      if (callCount === 2) {
        return makeChain(
          { data: null, error: null },
          {
            data: [planFeatureRow('sessions_per_month', { limit: -1 })],
            error: null,
          },
        );
      }
      // overrides error
      return makeChain(
        { data: null, error: null },
        { data: null, error: { message: 'overrides table missing' } },
      );
    });

    const result = await getUserEntitlements('user-overrides-error');
    // Plan feature still applied despite override error
    expect(result.features['sessions_per_month']?.limit).toBe(-1);
  });

  it('returns free defaults when an unexpected error is thrown', async () => {
    mockFrom.mockImplementation(() => {
      throw new Error('unexpected crash');
    });

    const result = await getUserEntitlements('user-crash');
    expect(result).toHaveProperty('plan_id', 'free');
    expect(result.features['sessions_per_month']?.limit).toBe(3);
  });
});

// ─── Tests: hasFeature ────────────────────────────────────────────────────────

describe('hasFeature', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when the feature is enabled for the user', async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) {
        return makeChain({ data: { plan_id: 'pro', status: 'active' }, error: null });
      }
      if (callCount === 2) {
        return makeChain(
          { data: null, error: null },
          {
            data: [planFeatureRow('advanced_templates', { enabled: true })],
            error: null,
          },
        );
      }
      return makeChain({ data: null, error: null }, { data: [], error: null });
    });

    const result = await hasFeature('user-pro', 'advanced_templates');
    expect(result).toBe(true);
  });

  it('returns false when the feature is explicitly disabled', async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) {
        return makeChain({ data: { plan_id: 'free', status: 'active' }, error: null });
      }
      if (callCount === 2) {
        return makeChain(
          { data: null, error: null },
          {
            data: [planFeatureRow('export_docx', { enabled: false })],
            error: null,
          },
        );
      }
      return makeChain({ data: null, error: null }, { data: [], error: null });
    });

    const result = await hasFeature('user-free', 'export_docx');
    expect(result).toBe(false);
  });

  it('returns false when the feature key does not exist in entitlements', async () => {
    mockFrom.mockImplementation(() =>
      makeChain({ data: null, error: null }, { data: [], error: null }),
    );

    const result = await hasFeature('user-any', 'nonexistent_feature');
    expect(result).toBe(false);
  });
});

// ─── Tests: getFeatureLimit ────────────────────────────────────────────────────

describe('getFeatureLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the numeric limit for a feature', async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) {
        return makeChain({ data: { plan_id: 'starter', status: 'active' }, error: null });
      }
      if (callCount === 2) {
        return makeChain(
          { data: null, error: null },
          {
            data: [planFeatureRow('sessions_per_month', { limit: 20 })],
            error: null,
          },
        );
      }
      return makeChain({ data: null, error: null }, { data: [], error: null });
    });

    const limit = await getFeatureLimit('user-starter', 'sessions_per_month');
    expect(limit).toBe(20);
  });

  it('returns -1 for unlimited features', async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) {
        return makeChain({ data: { plan_id: 'pro', status: 'active' }, error: null });
      }
      if (callCount === 2) {
        return makeChain(
          { data: null, error: null },
          {
            data: [planFeatureRow('sessions_per_month', { limit: -1 })],
            error: null,
          },
        );
      }
      return makeChain({ data: null, error: null }, { data: [], error: null });
    });

    const limit = await getFeatureLimit('user-pro', 'sessions_per_month');
    expect(limit).toBe(-1);
  });

  it('returns 0 for a feature with no numeric limit defined', async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) {
        return makeChain({ data: { plan_id: 'pro', status: 'active' }, error: null });
      }
      if (callCount === 2) {
        return makeChain(
          { data: null, error: null },
          {
            data: [planFeatureRow('priority_support', { enabled: true })],
            error: null,
          },
        );
      }
      return makeChain({ data: null, error: null }, { data: [], error: null });
    });

    const limit = await getFeatureLimit('user-pro', 'priority_support');
    // No limit field set — function returns 0 (feature.limit ?? 0)
    expect(limit).toBe(0);
  });

  it('returns 0 for an unknown feature key', async () => {
    mockFrom.mockImplementation(() =>
      makeChain({ data: null, error: null }, { data: [], error: null }),
    );

    const limit = await getFeatureLimit('user-any', 'completely_unknown_feature');
    // Unknown feature returns 0 per getFeatureLimit contract
    expect(limit).toBe(0);
  });
});
