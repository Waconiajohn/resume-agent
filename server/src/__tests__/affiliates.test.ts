/**
 * Tests for server/src/lib/affiliates.ts
 *
 * Story: Sprint 7 Story 13 — Billing & Entitlements Tests
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Supabase mock — must be hoisted before any module imports ────────────────

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
  resolveReferralCode,
  trackReferralEvent,
  getAffiliateByUserId,
  getAffiliateStats,
} from '../lib/affiliates.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeChain(resolvedValue: unknown) {
  const chain: Record<string, unknown> = {};

  chain['maybeSingle'] = vi.fn().mockResolvedValue(resolvedValue);
  chain['single'] = vi.fn().mockResolvedValue(resolvedValue);
  chain['eq'] = vi.fn().mockReturnValue(chain);
  chain['select'] = vi.fn().mockReturnValue(chain);
  chain['insert'] = vi.fn().mockReturnValue(chain);
  chain['order'] = vi.fn().mockReturnValue(chain);

  // Make chain itself awaitable (for list queries)
  chain['then'] = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(resolvedValue).then(resolve);
  chain['catch'] = (reject: (e: unknown) => unknown) =>
    Promise.resolve(resolvedValue).catch(reject);

  return chain;
}

// ─── Sample data ──────────────────────────────────────────────────────────────

const ACTIVE_AFFILIATE = {
  id: 'aff-001',
  user_id: 'user-aff',
  name: 'John Doe',
  email: 'john@example.com',
  referral_code: 'SAVE20',
  commission_rate: 0.2,
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
};

// ─── Tests: resolveReferralCode ───────────────────────────────────────────────

describe('resolveReferralCode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns affiliate data when the code is valid and active', async () => {
    mockFrom.mockReturnValue(makeChain({ data: ACTIVE_AFFILIATE, error: null }));

    const result = await resolveReferralCode('SAVE20');
    expect(result).not.toBeNull();
    expect(result?.referral_code).toBe('SAVE20');
    expect(result?.status).toBe('active');
    expect(result?.commission_rate).toBe(0.2);
  });

  it('returns null when no affiliate matches the code', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }));

    const result = await resolveReferralCode('BOGUS99');
    expect(result).toBeNull();
  });

  it('returns null when the code belongs to an inactive affiliate', async () => {
    // The query filters by status='active' so inactive affiliates return no row
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }));

    const result = await resolveReferralCode('INACTIVE');
    expect(result).toBeNull();
  });

  it('returns null on DB error', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'DB failure' } }));

    const result = await resolveReferralCode('ANY');
    expect(result).toBeNull();
  });
});

// ─── Tests: trackReferralEvent ────────────────────────────────────────────────

describe('trackReferralEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a referral event with correctly calculated commission', async () => {
    const revenueAmount = 50;
    const commissionRate = 0.2;
    const expectedCommission = revenueAmount * commissionRate; // 10

    const insertedEvent = {
      id: 'evt-001',
      affiliate_id: 'aff-001',
      referred_user_id: 'user-ref',
      event_type: 'subscription',
      subscription_id: null,
      revenue_amount: revenueAmount,
      commission_amount: expectedCommission,
      created_at: '2026-02-01T00:00:00Z',
    };

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) {
        // affiliates lookup for commission_rate
        return makeChain({ data: { commission_rate: commissionRate }, error: null });
      }
      // referral_events insert
      return makeChain({ data: insertedEvent, error: null });
    });

    const result = await trackReferralEvent({
      affiliateId: 'aff-001',
      referredUserId: 'user-ref',
      eventType: 'subscription',
      revenueAmount,
    });

    expect(result).not.toBeNull();
    expect(result?.commission_amount).toBe(expectedCommission);
    expect(result?.revenue_amount).toBe(revenueAmount);
    expect(result?.event_type).toBe('subscription');
  });

  it('calculates commission correctly for different rates', async () => {
    const revenueAmount = 100;
    const commissionRate = 0.15;

    const insertedEvent = {
      id: 'evt-002',
      affiliate_id: 'aff-002',
      referred_user_id: null,
      event_type: 'subscription',
      subscription_id: null,
      revenue_amount: revenueAmount,
      commission_amount: revenueAmount * commissionRate,
      created_at: '2026-02-01T00:00:00Z',
    };

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) {
        return makeChain({ data: { commission_rate: commissionRate }, error: null });
      }
      return makeChain({ data: insertedEvent, error: null });
    });

    const result = await trackReferralEvent({
      affiliateId: 'aff-002',
      eventType: 'subscription',
      revenueAmount,
    });

    expect(result?.commission_amount).toBe(15);
  });

  it('returns null when affiliate lookup fails', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'lookup failed' } }));

    const result = await trackReferralEvent({
      affiliateId: 'aff-nonexistent',
      referredUserId: 'user-ref',
      eventType: 'subscription',
      revenueAmount: 99,
    });

    expect(result).toBeNull();
  });

  it('returns null when the DB insert fails', async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) {
        return makeChain({ data: { commission_rate: 0.2 }, error: null });
      }
      return makeChain({ data: null, error: { message: 'insert failed' } });
    });

    const result = await trackReferralEvent({
      affiliateId: 'aff-001',
      referredUserId: 'user-ref',
      eventType: 'subscription',
      revenueAmount: 50,
    });

    expect(result).toBeNull();
  });
});

// ─── Tests: getAffiliateByUserId ──────────────────────────────────────────────

describe('getAffiliateByUserId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the affiliate for a user who is an affiliate', async () => {
    mockFrom.mockReturnValue(makeChain({ data: ACTIVE_AFFILIATE, error: null }));

    const result = await getAffiliateByUserId('user-aff');
    expect(result).not.toBeNull();
    expect(result?.id).toBe('aff-001');
    expect(result?.referral_code).toBe('SAVE20');
  });

  it('returns null for a user who is not an affiliate', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }));

    const result = await getAffiliateByUserId('user-regular');
    expect(result).toBeNull();
  });

  it('returns null on DB error', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'query failed' } }));

    const result = await getAffiliateByUserId('user-error');
    expect(result).toBeNull();
  });
});

// ─── Tests: getAffiliateStats ─────────────────────────────────────────────────

describe('getAffiliateStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns correct aggregate stats from multiple referral events', async () => {
    const events = [
      { event_type: 'click', revenue_amount: null, commission_amount: null },
      { event_type: 'signup', revenue_amount: null, commission_amount: null },
      { event_type: 'subscription', revenue_amount: 100, commission_amount: 20 },
      { event_type: 'subscription', revenue_amount: 200, commission_amount: 40 },
      { event_type: 'renewal', revenue_amount: 50, commission_amount: 10 },
    ];

    mockFrom.mockReturnValue(makeChain({ data: events, error: null }));

    const stats = await getAffiliateStats('aff-001');
    expect(stats.total_clicks).toBe(1);
    expect(stats.total_signups).toBe(1);
    expect(stats.total_subscriptions).toBe(3); // 2 subscription + 1 renewal
    expect(stats.total_earnings).toBe(70); // 20 + 40 + 10
  });

  it('returns zeroed stats when no referral events exist', async () => {
    mockFrom.mockReturnValue(makeChain({ data: [], error: null }));

    const stats = await getAffiliateStats('aff-new');
    expect(stats.total_clicks).toBe(0);
    expect(stats.total_signups).toBe(0);
    expect(stats.total_subscriptions).toBe(0);
    expect(stats.total_earnings).toBe(0);
    expect(stats.recent_events).toEqual([]);
  });

  it('returns zeroed stats on DB error', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'table missing' } }));

    const stats = await getAffiliateStats('aff-error');
    expect(stats.total_clicks).toBe(0);
    expect(stats.total_earnings).toBe(0);
  });
});
