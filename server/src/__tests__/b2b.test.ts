/**
 * Tests for server/src/lib/b2b.ts
 *
 * Story 7-5: Phase 7 B2B Outplacement — Library Tests
 * Covers: createOrganization, getOrganization, getOrganizationBySlug,
 *         updateOrganization, createContract, getActiveContract,
 *         provisionSeats, getOrgSeats, activateSeat,
 *         createCohort, getOrgCohorts, getOrgEngagementMetrics
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks — hoisted before any module imports ────────────────────────────────

const mockFrom = vi.hoisted(() => vi.fn());
const mockRpc = vi.hoisted(() => vi.fn());

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
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
  createOrganization,
  getOrganization,
  getOrganizationBySlug,
  updateOrganization,
  createContract,
  getActiveContract,
  provisionSeats,
  getOrgSeats,
  activateSeat,
  createCohort,
  getOrgCohorts,
  getOrgEngagementMetrics,
  type B2BOrganization,
  type B2BContract,
  type B2BSeat,
  type B2BCohort,
} from '../lib/b2b.js';

// ─── Chain mock helper ────────────────────────────────────────────────────────

/**
 * Builds a chainable Supabase query mock that resolves to `resolveValue`
 * via `.single()`, `.maybeSingle()`, or direct await (`.then`).
 */
function createChainMock(resolveValue: { data: unknown; error: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const methods = [
    'select', 'insert', 'update', 'delete',
    'eq', 'lte', 'contains', 'order', 'limit',
  ];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.single = vi.fn().mockResolvedValue(resolveValue);
  chain.maybeSingle = vi.fn().mockResolvedValue(resolveValue);
  // Make chain directly awaitable for queries without a terminal method
  (chain as unknown as { then: unknown }).then = (
    resolve: (v: unknown) => unknown,
    reject: (e: unknown) => unknown,
  ) => Promise.resolve(resolveValue).then(resolve, reject);
  return chain;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeOrg(overrides: Partial<B2BOrganization> = {}): B2BOrganization {
  return {
    id: 'org-001',
    name: 'Acme Corp',
    slug: 'acme-corp',
    logo_url: null,
    primary_color: '#3b82f6',
    secondary_color: '#1d4ed8',
    custom_welcome_message: null,
    custom_resources: [],
    sso_provider: null,
    sso_config: {},
    admin_email: 'admin@acme.com',
    admin_name: 'Jane Admin',
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeContract(overrides: Partial<B2BContract> = {}): B2BContract {
  return {
    id: 'contract-001',
    org_id: 'org-001',
    tier: 'standard',
    price_per_seat_cents: 50000,
    total_seats: 100,
    used_seats: 0,
    start_date: '2026-01-01',
    end_date: null,
    sla_response_hours: 48,
    includes_human_coach: false,
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeSeat(overrides: Partial<B2BSeat> = {}): B2BSeat {
  return {
    id: 'seat-001',
    org_id: 'org-001',
    contract_id: 'contract-001',
    user_id: null,
    employee_email: 'employee@acme.com',
    employee_name: 'Alice Employee',
    cohort_id: null,
    status: 'provisioned',
    provisioned_at: '2026-01-01T00:00:00Z',
    activated_at: null,
    completed_at: null,
    last_login_at: null,
    total_sessions: 0,
    agents_used: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeCohort(overrides: Partial<B2BCohort> = {}): B2BCohort {
  return {
    id: 'cohort-001',
    org_id: 'org-001',
    name: 'Q1 2026 Cohort',
    description: 'First cohort of the year',
    total_employees: 25,
    active_employees: 20,
    placed_employees: 5,
    avg_days_to_placement: 45,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ─── createOrganization ───────────────────────────────────────────────────────

describe('createOrganization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns org on success', async () => {
    const org = makeOrg();
    mockFrom.mockReturnValueOnce(createChainMock({ data: org, error: null }));

    const result = await createOrganization({
      name: 'Acme Corp',
      slug: 'acme-corp',
      admin_email: 'admin@acme.com',
      admin_name: 'Jane Admin',
    });

    expect(result).toEqual(org);
  });

  it('returns null on insert error', async () => {
    mockFrom.mockReturnValueOnce(
      createChainMock({ data: null, error: { message: 'duplicate key value' } }),
    );

    const result = await createOrganization({
      name: 'Acme Corp',
      slug: 'acme-corp',
      admin_email: 'admin@acme.com',
      admin_name: 'Jane Admin',
    });

    expect(result).toBeNull();
  });

  it('passes correct fields to insert', async () => {
    const org = makeOrg({ logo_url: 'https://acme.com/logo.png', primary_color: '#ff0000' });
    const chain = createChainMock({ data: org, error: null });
    mockFrom.mockReturnValueOnce(chain);

    await createOrganization({
      name: 'Acme Corp',
      slug: 'acme-corp',
      admin_email: 'admin@acme.com',
      admin_name: 'Jane Admin',
      logo_url: 'https://acme.com/logo.png',
      primary_color: '#ff0000',
    });

    expect(mockFrom).toHaveBeenCalledWith('b2b_organizations');
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Acme Corp',
        slug: 'acme-corp',
        admin_email: 'admin@acme.com',
        admin_name: 'Jane Admin',
        logo_url: 'https://acme.com/logo.png',
        primary_color: '#ff0000',
      }),
    );
  });
});

// ─── getOrganization ──────────────────────────────────────────────────────────

describe('getOrganization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns org when found', async () => {
    const org = makeOrg();
    mockFrom.mockReturnValueOnce(createChainMock({ data: org, error: null }));

    const result = await getOrganization('org-001');

    expect(result).toEqual(org);
    expect(mockFrom).toHaveBeenCalledWith('b2b_organizations');
  });

  it('returns null when not found', async () => {
    mockFrom.mockReturnValueOnce(
      createChainMock({ data: null, error: { message: 'row not found' } }),
    );

    const result = await getOrganization('org-missing');

    expect(result).toBeNull();
  });
});

// ─── getOrganizationBySlug ────────────────────────────────────────────────────

describe('getOrganizationBySlug', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns org when slug matches', async () => {
    const org = makeOrg({ slug: 'acme-corp' });
    const chain = createChainMock({ data: org, error: null });
    mockFrom.mockReturnValueOnce(chain);

    const result = await getOrganizationBySlug('acme-corp');

    expect(result).toEqual(org);
    expect(chain.eq).toHaveBeenCalledWith('slug', 'acme-corp');
  });

  it('returns null when slug not found', async () => {
    mockFrom.mockReturnValueOnce(
      createChainMock({ data: null, error: { message: 'no rows returned' } }),
    );

    const result = await getOrganizationBySlug('unknown-slug');

    expect(result).toBeNull();
  });
});

// ─── updateOrganization ───────────────────────────────────────────────────────

describe('updateOrganization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns updated org on success', async () => {
    const updated = makeOrg({ name: 'Acme Corp Renamed', primary_color: '#00ff00' });
    mockFrom.mockReturnValueOnce(createChainMock({ data: updated, error: null }));

    const result = await updateOrganization('org-001', {
      name: 'Acme Corp Renamed',
      primary_color: '#00ff00',
    });

    expect(result).toEqual(updated);
    expect(result?.name).toBe('Acme Corp Renamed');
  });

  it('returns null on update error', async () => {
    mockFrom.mockReturnValueOnce(
      createChainMock({ data: null, error: { message: 'permission denied' } }),
    );

    const result = await updateOrganization('org-001', { is_active: false });

    expect(result).toBeNull();
  });
});

// ─── createContract ───────────────────────────────────────────────────────────

describe('createContract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns contract on success', async () => {
    const contract = makeContract();
    mockFrom.mockReturnValueOnce(createChainMock({ data: contract, error: null }));

    const result = await createContract({
      org_id: 'org-001',
      tier: 'standard',
      price_per_seat_cents: 50000,
      total_seats: 100,
      start_date: '2026-01-01',
    });

    expect(result).toEqual(contract);
    expect(result?.tier).toBe('standard');
    expect(result?.total_seats).toBe(100);
  });

  it('returns null on insert error', async () => {
    mockFrom.mockReturnValueOnce(
      createChainMock({ data: null, error: { message: 'foreign key constraint' } }),
    );

    const result = await createContract({
      org_id: 'org-nonexistent',
      tier: 'plus',
      price_per_seat_cents: 75000,
      total_seats: 50,
      start_date: '2026-01-01',
    });

    expect(result).toBeNull();
  });
});

// ─── getActiveContract ────────────────────────────────────────────────────────

describe('getActiveContract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns active contract', async () => {
    const contract = makeContract({ status: 'active' });
    const chain = createChainMock({ data: contract, error: null });
    mockFrom.mockReturnValueOnce(chain);

    const result = await getActiveContract('org-001');

    expect(result).toEqual(contract);
    expect(chain.eq).toHaveBeenCalledWith('status', 'active');
  });

  it('returns null when no active contract', async () => {
    mockFrom.mockReturnValueOnce(
      createChainMock({ data: null, error: null }),
    );

    const result = await getActiveContract('org-001');

    expect(result).toBeNull();
  });
});

// ─── provisionSeats ───────────────────────────────────────────────────────────

describe('provisionSeats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Helper: mock a valid contract lookup for provisionSeats
  function mockValidContract(overrides?: Record<string, unknown>) {
    const contractData = {
      id: 'contract-001',
      org_id: 'org-001',
      total_seats: 100,
      used_seats: 0,
      status: 'active',
      ...overrides,
    };
    mockFrom.mockReturnValueOnce(
      createChainMock({ data: contractData, error: null }),
    );
  }

  it('provisions multiple seats and returns count', async () => {
    // Contract lookup
    mockValidContract();
    // Each seat insert succeeds; count query returns 2; used_seats update succeeds
    const insertChain = createChainMock({ data: null, error: null });
    const countChain = { ...createChainMock({ data: null, error: null }) };
    (countChain as unknown as { count: number }).count = 2;
    // Resolve the then to include count
    (countChain as unknown as { then: unknown }).then = (
      resolve: (v: unknown) => unknown,
    ) => Promise.resolve({ data: null, error: null, count: 2 }).then(resolve);

    const updateChain = createChainMock({ data: null, error: null });

    mockFrom
      .mockReturnValueOnce(insertChain)  // seat 1 insert
      .mockReturnValueOnce(insertChain)  // seat 2 insert
      .mockReturnValueOnce(countChain)   // count query
      .mockReturnValueOnce(updateChain); // update used_seats

    const result = await provisionSeats('org-001', 'contract-001', [
      { email: 'alice@acme.com', name: 'Alice' },
      { email: 'bob@acme.com', name: 'Bob' },
    ]);

    if ('error' in result) throw new Error('Expected success');
    expect(result.provisioned).toBe(2);
    expect(result.errors).toHaveLength(0);
  });

  it('returns errors for failed insertions', async () => {
    mockValidContract();
    const errorChain = createChainMock({ data: null, error: { message: 'duplicate email' } });

    mockFrom.mockReturnValueOnce(errorChain);

    const result = await provisionSeats('org-001', 'contract-001', [
      { email: 'existing@acme.com' },
    ]);

    if ('error' in result) throw new Error('Expected success');
    expect(result.provisioned).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('existing@acme.com');
    expect(result.errors[0]).toContain('duplicate email');
  });

  it('handles mix of success and failure', async () => {
    mockValidContract();
    const successChain = createChainMock({ data: null, error: null });
    const errorChain = createChainMock({ data: null, error: { message: 'duplicate key' } });
    const countChain = createChainMock({ data: null, error: null });
    (countChain as unknown as { then: unknown }).then = (
      resolve: (v: unknown) => unknown,
    ) => Promise.resolve({ data: null, error: null, count: 1 }).then(resolve);
    const updateChain = createChainMock({ data: null, error: null });

    mockFrom
      .mockReturnValueOnce(successChain) // seat 1 — OK
      .mockReturnValueOnce(errorChain)   // seat 2 — fail
      .mockReturnValueOnce(countChain)   // count query
      .mockReturnValueOnce(updateChain); // update used_seats

    const result = await provisionSeats('org-001', 'contract-001', [
      { email: 'new@acme.com' },
      { email: 'existing@acme.com' },
    ]);

    if ('error' in result) throw new Error('Expected success');
    expect(result.provisioned).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('existing@acme.com');
  });

  it('rejects when contract does not belong to org', async () => {
    mockValidContract({ org_id: 'other-org' });

    const result = await provisionSeats('org-001', 'contract-001', [
      { email: 'alice@acme.com' },
    ]);

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toContain('does not belong');
    }
  });

  it('rejects when capacity would be exceeded', async () => {
    mockValidContract({ total_seats: 5, used_seats: 4 });

    const result = await provisionSeats('org-001', 'contract-001', [
      { email: 'a@acme.com' },
      { email: 'b@acme.com' },
    ]);

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toContain('Capacity exceeded');
    }
  });
});

// ─── getOrgSeats ──────────────────────────────────────────────────────────────

describe('getOrgSeats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns all seats for org', async () => {
    const seats = [
      makeSeat({ id: 'seat-001', status: 'active' }),
      makeSeat({ id: 'seat-002', status: 'provisioned' }),
      makeSeat({ id: 'seat-003', status: 'completed' }),
    ];
    const chain = createChainMock({ data: seats, error: null });
    mockFrom.mockReturnValueOnce(chain);

    const result = await getOrgSeats('org-001');

    expect(result).toHaveLength(3);
    expect(result[0].id).toBe('seat-001');
    expect(mockFrom).toHaveBeenCalledWith('b2b_seats');
  });

  it('filters by status when provided', async () => {
    const activeSeats = [makeSeat({ id: 'seat-001', status: 'active' })];
    const chain = createChainMock({ data: activeSeats, error: null });
    mockFrom.mockReturnValueOnce(chain);

    const result = await getOrgSeats('org-001', 'active');

    expect(result).toHaveLength(1);
    // eq should have been called with status filter
    expect(chain.eq).toHaveBeenCalledWith('status', 'active');
  });

  it('returns empty array on error', async () => {
    mockFrom.mockReturnValueOnce(
      createChainMock({ data: null, error: { message: 'connection timeout' } }),
    );

    const result = await getOrgSeats('org-001');

    expect(result).toEqual([]);
  });
});

// ─── activateSeat ─────────────────────────────────────────────────────────────

describe('activateSeat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns "ok" on successful activation', async () => {
    // First call: seat lookup (exists, provisioned)
    mockFrom.mockReturnValueOnce(
      createChainMock({ data: { id: 'seat-001', status: 'provisioned' }, error: null }),
    );
    // Second call: update
    const updateChain = createChainMock({ data: null, error: null });
    mockFrom.mockReturnValueOnce(updateChain);

    const result = await activateSeat('seat-001', 'user-abc');

    expect(result).toBe('ok');
  });

  it('returns "not_found" when seat does not exist', async () => {
    mockFrom.mockReturnValueOnce(
      createChainMock({ data: null, error: null }),
    );

    const result = await activateSeat('seat-missing', 'user-abc');

    expect(result).toBe('not_found');
  });

  it('returns "wrong_status" when seat is already active', async () => {
    mockFrom.mockReturnValueOnce(
      createChainMock({ data: { id: 'seat-001', status: 'active' }, error: null }),
    );

    const result = await activateSeat('seat-001', 'user-abc');

    expect(result).toBe('wrong_status');
  });
});

// ─── createCohort ─────────────────────────────────────────────────────────────

describe('createCohort', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns cohort on success', async () => {
    const cohort = makeCohort();
    mockFrom.mockReturnValueOnce(createChainMock({ data: cohort, error: null }));

    const result = await createCohort({
      org_id: 'org-001',
      name: 'Q1 2026 Cohort',
      description: 'First cohort of the year',
    });

    expect(result).toEqual(cohort);
    expect(result?.name).toBe('Q1 2026 Cohort');
    expect(mockFrom).toHaveBeenCalledWith('b2b_employee_cohorts');
  });

  it('returns null on error', async () => {
    mockFrom.mockReturnValueOnce(
      createChainMock({ data: null, error: { message: 'not null violation' } }),
    );

    const result = await createCohort({
      org_id: 'org-001',
      name: 'Bad Cohort',
    });

    expect(result).toBeNull();
  });
});

// ─── getOrgCohorts ────────────────────────────────────────────────────────────

describe('getOrgCohorts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns cohorts for org', async () => {
    const cohorts = [
      makeCohort({ id: 'cohort-001', name: 'Q1 2026' }),
      makeCohort({ id: 'cohort-002', name: 'Q4 2025' }),
    ];
    mockFrom.mockReturnValueOnce(createChainMock({ data: cohorts, error: null }));

    const result = await getOrgCohorts('org-001');

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Q1 2026');
    expect(mockFrom).toHaveBeenCalledWith('b2b_employee_cohorts');
  });

  it('returns empty array on error', async () => {
    mockFrom.mockReturnValueOnce(
      createChainMock({ data: null, error: { message: 'query error' } }),
    );

    const result = await getOrgCohorts('org-001');

    expect(result).toEqual([]);
  });
});

// ─── getOrgEngagementMetrics ──────────────────────────────────────────────────

describe('getOrgEngagementMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('computes correct aggregate metrics', async () => {
    const now = new Date();
    const recentLogin = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(); // 2 days ago
    const oldLogin = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();   // 10 days ago

    const seats: B2BSeat[] = [
      makeSeat({ id: 'seat-001', status: 'active', total_sessions: 8, agents_used: ['resume', 'strategist'], last_login_at: recentLogin }),
      makeSeat({ id: 'seat-002', status: 'active', total_sessions: 4, agents_used: ['resume'], last_login_at: oldLogin }),
      makeSeat({ id: 'seat-003', status: 'completed', total_sessions: 12, agents_used: ['resume', 'producer'] }),
      makeSeat({ id: 'seat-004', status: 'provisioned', total_sessions: 0, agents_used: [] }),
    ];
    mockFrom.mockReturnValueOnce(createChainMock({ data: seats, error: null }));

    const metrics = await getOrgEngagementMetrics('org-001');

    expect(metrics.total_seats).toBe(4);
    expect(metrics.active_seats).toBe(2);
    expect(metrics.completed_seats).toBe(1);
    // avg_sessions_per_user: (8 + 4) / 2 = 6
    expect(metrics.avg_sessions_per_user).toBe(6);
    // agents_used_distribution: resume=3, strategist=1, producer=1
    expect(metrics.agents_used_distribution['resume']).toBe(3);
    expect(metrics.agents_used_distribution['strategist']).toBe(1);
    expect(metrics.agents_used_distribution['producer']).toBe(1);
    // inactive_7_days: seat-002 last logged in 10 days ago
    expect(metrics.inactive_7_days).toBe(1);
  });

  it('handles empty seats list', async () => {
    mockFrom.mockReturnValueOnce(createChainMock({ data: [], error: null }));

    const metrics = await getOrgEngagementMetrics('org-001');

    expect(metrics.total_seats).toBe(0);
    expect(metrics.active_seats).toBe(0);
    expect(metrics.completed_seats).toBe(0);
    expect(metrics.avg_sessions_per_user).toBe(0);
    expect(metrics.agents_used_distribution).toEqual({});
    expect(metrics.inactive_7_days).toBe(0);
  });

  it('correctly counts inactive seats — no login counts as inactive', async () => {
    const seats: B2BSeat[] = [
      makeSeat({ id: 'seat-001', status: 'active', last_login_at: null }),
      makeSeat({ id: 'seat-002', status: 'active', last_login_at: null }),
      makeSeat({
        id: 'seat-003',
        status: 'active',
        last_login_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago — active
      }),
    ];
    mockFrom.mockReturnValueOnce(createChainMock({ data: seats, error: null }));

    const metrics = await getOrgEngagementMetrics('org-001');

    // Seats with no login at all are counted as inactive
    expect(metrics.inactive_7_days).toBe(2);
    expect(metrics.active_seats).toBe(3);
  });
});
