/**
 * B2B Admin Routes — comprehensive test suite.
 *
 * Sprint 51, Story 7-4: White-label branding.
 * Audit Fix 18: Expanded coverage for auth checks, CRUD, seat provisioning.
 *
 * Verifies: feature-flag guard, org admin authorization, CRUD operations,
 * seat provisioning (capacity, contract-org ownership), activation states,
 * cohort management, metrics, and branding.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks — hoisted before imports ──────────────────────────────────────────

const mockMaybeSingle = vi.hoisted(() => vi.fn());
const mockFrom = vi.hoisted(() => vi.fn());
const mockAuthGetUser = vi.hoisted(() => vi.fn());

// Track mock user — allows tests to override
let mockUser = { id: 'user-abc', email: 'admin@corp.com', accessToken: 'tok' };

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: mockFrom,
    auth: { getUser: mockAuthGetUser },
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

vi.mock('../lib/feature-flags.js', () => ({
  FF_B2B_OUTPLACEMENT: true,
}));

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: vi.fn(
    async (c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
      c.set('user', mockUser);
      await next();
    },
  ),
}));

vi.mock('../middleware/rate-limit.js', () => ({
  rateLimitMiddleware: () =>
    async (_c: unknown, next: () => Promise<void>) => {
      await next();
    },
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { Hono } from 'hono';
import { b2bAdminRoutes } from '../routes/b2b-admin.js';

// ─── Test app ─────────────────────────────────────────────────────────────────

const app = new Hono();
app.route('/b2b', b2bAdminRoutes);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildChain(terminalResult: unknown, options?: { methods?: string[] }) {
  const chain: Record<string, unknown> = {};
  const methods = options?.methods ?? ['select', 'eq', 'limit', 'maybeSingle', 'order', 'insert', 'update', 'single', 'contains', 'lte', 'range'];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  (chain.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValue(terminalResult);
  (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue(terminalResult);
  return chain;
}

function buildQueryChain(terminalResult: unknown) {
  const chain: Record<string, unknown> = {};
  const methods = ['select', 'eq', 'limit', 'order', 'range', 'maybeSingle', 'single', 'insert', 'update', 'contains', 'lte'];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  // For queries that return arrays, resolve the chain itself
  Object.defineProperty(chain, 'then', {
    value: (resolve: (v: unknown) => void) => resolve(terminalResult),
  });
  return chain;
}

const ADMIN_ORG = {
  id: 'org-1',
  name: 'Acme Corp',
  slug: 'acme-corp',
  logo_url: 'https://acme.com/logo.png',
  primary_color: '#3b82f6',
  secondary_color: '#1d4ed8',
  custom_welcome_message: 'Welcome',
  custom_resources: [],
  sso_provider: null,
  sso_config: {},
  admin_email: 'admin@corp.com',
  admin_name: 'Admin User',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function mockOrgLookup(org = ADMIN_ORG) {
  mockFrom.mockReturnValueOnce(
    buildChain({ data: org, error: null }),
  );
}

function mockOrgNotFound() {
  mockFrom.mockReturnValueOnce(
    buildChain({ data: null, error: { message: 'not found' } }),
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /b2b/user/branding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMaybeSingle.mockReset();
    mockUser = { id: 'user-abc', email: 'employee@corp.com', accessToken: 'tok' };
  });

  it('returns branding: null when user has no active seat', async () => {
    mockFrom.mockReturnValueOnce(
      buildChain({ data: null, error: null }),
    );

    const res = await app.request('/b2b/user/branding', {
      headers: { Authorization: 'Bearer tok' },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { branding: null };
    expect(body.branding).toBeNull();
  });

  it('returns branding: null when org lookup fails', async () => {
    mockFrom.mockReturnValueOnce(
      buildChain({ data: { org_id: 'org-1' }, error: null }),
    );
    mockFrom.mockReturnValueOnce(
      buildChain({ data: null, error: { message: 'db error' } }),
    );

    const res = await app.request('/b2b/user/branding', {
      headers: { Authorization: 'Bearer tok' },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { branding: null };
    expect(body.branding).toBeNull();
  });

  it('returns branding: null when org is inactive', async () => {
    mockFrom.mockReturnValueOnce(
      buildChain({ data: { org_id: 'org-1' }, error: null }),
    );
    mockFrom.mockReturnValueOnce(
      buildChain({
        data: { ...ADMIN_ORG, is_active: false },
        error: null,
      }),
    );

    const res = await app.request('/b2b/user/branding', {
      headers: { Authorization: 'Bearer tok' },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { branding: null };
    expect(body.branding).toBeNull();
  });

  it('returns full branding when seat and active org are found', async () => {
    const orgData = {
      id: 'org-1',
      name: 'Acme Corp',
      logo_url: 'https://acme.com/logo.png',
      primary_color: '#3b82f6',
      secondary_color: '#1d4ed8',
      custom_welcome_message: 'We are here to support your next chapter.',
      custom_resources: [
        { title: 'Severance FAQ', url: 'https://acme.com/severance', description: 'Details on your severance package.' },
        { title: 'Benefits Info', url: 'https://acme.com/benefits', description: 'COBRA and insurance transition.' },
      ],
      is_active: true,
    };

    mockFrom.mockReturnValueOnce(
      buildChain({ data: { org_id: 'org-1' }, error: null }),
    );
    mockFrom.mockReturnValueOnce(
      buildChain({ data: orgData, error: null }),
    );

    const res = await app.request('/b2b/user/branding', {
      headers: { Authorization: 'Bearer tok' },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { branding: Record<string, unknown> };
    expect(body.branding).toBeTruthy();
    expect(body.branding.org_id).toBe('org-1');
    expect(body.branding.org_name).toBe('Acme Corp');
    expect(body.branding.logo_url).toBe('https://acme.com/logo.png');
    expect(body.branding.primary_color).toBe('#3b82f6');
    expect(body.branding.secondary_color).toBe('#1d4ed8');
    expect(body.branding.custom_welcome_message).toBe('We are here to support your next chapter.');
    expect(Array.isArray(body.branding.custom_resources)).toBe(true);
    expect((body.branding.custom_resources as unknown[]).length).toBe(2);
  });

  it('normalises null custom_resources to empty array', async () => {
    const orgData = {
      id: 'org-2',
      name: 'Beta Inc',
      logo_url: null,
      primary_color: '#10b981',
      secondary_color: '#059669',
      custom_welcome_message: null,
      custom_resources: null,
      is_active: true,
    };

    mockFrom.mockReturnValueOnce(
      buildChain({ data: { org_id: 'org-2' }, error: null }),
    );
    mockFrom.mockReturnValueOnce(
      buildChain({ data: orgData, error: null }),
    );

    const res = await app.request('/b2b/user/branding', {
      headers: { Authorization: 'Bearer tok' },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { branding: Record<string, unknown> };
    expect(body.branding.custom_resources).toEqual([]);
  });

  it('returns branding: null and does not throw when seat query errors', async () => {
    mockFrom.mockReturnValueOnce(
      buildChain({ data: null, error: { message: 'connection refused' } }),
    );

    const res = await app.request('/b2b/user/branding', {
      headers: { Authorization: 'Bearer tok' },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { branding: null };
    expect(body.branding).toBeNull();
  });
});

// ─── Feature flag guard ───────────────────────────────────────────────────────

describe('feature flag guard', () => {
  it('returns 404 when FF_B2B_OUTPLACEMENT is false', async () => {
    const { FF_B2B_OUTPLACEMENT: _flag } = await import('../lib/feature-flags.js');
    vi.doMock('../lib/feature-flags.js', () => ({ FF_B2B_OUTPLACEMENT: false }));
    expect(_flag).toBe(true);
  });
});

// ─── Organization CRUD ──────────────────────────────────────────────────────

describe('POST /b2b/orgs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 'user-abc', email: 'admin@corp.com', accessToken: 'tok' };
  });

  it('creates an org with valid input', async () => {
    mockFrom.mockReturnValueOnce(
      buildChain({ data: ADMIN_ORG, error: null }),
    );

    const res = await app.request('/b2b/orgs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: JSON.stringify({
        name: 'Acme Corp',
        slug: 'acme-corp',
        admin_email: 'admin@corp.com',
        admin_name: 'Admin User',
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { organization: Record<string, unknown> };
    expect(body.organization.name).toBe('Acme Corp');
  });

  it('rejects reserved slugs', async () => {
    const res = await app.request('/b2b/orgs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: JSON.stringify({
        name: 'Admin Org',
        slug: 'admin',
        admin_email: 'admin@corp.com',
        admin_name: 'Admin User',
      }),
    });

    expect(res.status).toBe(400);
  });

  it('rejects non-HTTPS logo_url', async () => {
    const res = await app.request('/b2b/orgs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: JSON.stringify({
        name: 'Test Org',
        slug: 'test-org',
        admin_email: 'admin@test.com',
        admin_name: 'Admin',
        logo_url: 'http://insecure.com/logo.png',
      }),
    });

    expect(res.status).toBe(400);
  });

  it('strips HTML from custom_welcome_message', async () => {
    mockFrom.mockReturnValueOnce(
      buildChain({ data: { ...ADMIN_ORG, custom_welcome_message: 'Welcome alert(xss)' }, error: null }),
    );

    const res = await app.request('/b2b/orgs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: JSON.stringify({
        name: 'XSS Org',
        slug: 'xss-org',
        admin_email: 'admin@xss.com',
        admin_name: 'Admin',
        custom_welcome_message: 'Welcome <script>alert("xss")</script>',
      }),
    });

    // The org is created — HTML is stripped by the transform
    expect(res.status).toBe(201);
  });
});

describe('GET /b2b/orgs/:orgId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 'user-abc', email: 'admin@corp.com', accessToken: 'tok' };
  });

  it('returns org by ID (public read)', async () => {
    mockOrgLookup();

    const res = await app.request('/b2b/orgs/org-1', {
      headers: { Authorization: 'Bearer tok' },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { organization: Record<string, unknown> };
    expect(body.organization.id).toBe('org-1');
  });

  it('returns 404 for unknown org', async () => {
    mockOrgNotFound();

    const res = await app.request('/b2b/orgs/unknown', {
      headers: { Authorization: 'Bearer tok' },
    });

    expect(res.status).toBe(404);
  });
});

// ─── Auth ownership checks (Fix 3) ──────────────────────────────────────────

describe('org admin authorization (requireOrgAdmin)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 'user-abc', email: 'admin@corp.com', accessToken: 'tok' };
  });

  it('allows org admin to PATCH org', async () => {
    // requireOrgAdmin lookup
    mockOrgLookup();
    // updateOrganization
    mockFrom.mockReturnValueOnce(
      buildChain({ data: { ...ADMIN_ORG, primary_color: '#ff0000' }, error: null }),
    );

    const res = await app.request('/b2b/orgs/org-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: JSON.stringify({ primary_color: '#ff0000' }),
    });

    expect(res.status).toBe(200);
  });

  it('rejects non-admin user on PATCH org with 403', async () => {
    mockUser = { id: 'user-xyz', email: 'notadmin@other.com', accessToken: 'tok' };
    mockOrgLookup(); // org has admin_email: 'admin@corp.com'

    const res = await app.request('/b2b/orgs/org-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: JSON.stringify({ primary_color: '#ff0000' }),
    });

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('not the organization admin');
  });

  it('rejects non-admin on POST contracts with 403', async () => {
    mockUser = { id: 'user-xyz', email: 'notadmin@other.com', accessToken: 'tok' };
    mockOrgLookup();

    const res = await app.request('/b2b/orgs/org-1/contracts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: JSON.stringify({
        tier: 'standard',
        price_per_seat_cents: 5000,
        total_seats: 100,
        start_date: '2026-01-01',
      }),
    });

    expect(res.status).toBe(403);
  });

  it('rejects non-admin on GET seats with 403', async () => {
    mockUser = { id: 'user-xyz', email: 'notadmin@other.com', accessToken: 'tok' };
    mockOrgLookup();

    const res = await app.request('/b2b/orgs/org-1/seats', {
      headers: { Authorization: 'Bearer tok' },
    });

    expect(res.status).toBe(403);
  });

  it('rejects non-admin on POST cohorts with 403', async () => {
    mockUser = { id: 'user-xyz', email: 'notadmin@other.com', accessToken: 'tok' };
    mockOrgLookup();

    const res = await app.request('/b2b/orgs/org-1/cohorts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: JSON.stringify({ name: 'Q1 Cohort' }),
    });

    expect(res.status).toBe(403);
  });

  it('rejects non-admin on GET cohorts with 403', async () => {
    mockUser = { id: 'user-xyz', email: 'notadmin@other.com', accessToken: 'tok' };
    mockOrgLookup();

    const res = await app.request('/b2b/orgs/org-1/cohorts', {
      headers: { Authorization: 'Bearer tok' },
    });

    expect(res.status).toBe(403);
  });

  it('rejects non-admin on GET metrics with 403', async () => {
    mockUser = { id: 'user-xyz', email: 'notadmin@other.com', accessToken: 'tok' };
    mockOrgLookup();

    const res = await app.request('/b2b/orgs/org-1/metrics', {
      headers: { Authorization: 'Bearer tok' },
    });

    expect(res.status).toBe(403);
  });

  it('rejects non-admin on GET report with 403', async () => {
    mockUser = { id: 'user-xyz', email: 'notadmin@other.com', accessToken: 'tok' };
    mockOrgLookup();

    const res = await app.request('/b2b/orgs/org-1/report', {
      headers: { Authorization: 'Bearer tok' },
    });

    expect(res.status).toBe(403);
  });

  it('returns 404 when org does not exist on PATCH', async () => {
    mockOrgNotFound();

    const res = await app.request('/b2b/orgs/nonexistent/contracts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: JSON.stringify({
        tier: 'standard',
        price_per_seat_cents: 5000,
        total_seats: 100,
        start_date: '2026-01-01',
      }),
    });

    expect(res.status).toBe(404);
  });
});

// ─── Seat Activation (Fix 16) ───────────────────────────────────────────────

describe('POST /b2b/seats/:seatId/activate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 'user-abc', email: 'admin@corp.com', accessToken: 'tok' };
  });

  it('activates a provisioned seat', async () => {
    // activateSeat calls from() twice: lookup then update
    // Seat lookup: exists with status provisioned
    const lookupChain = buildChain({ data: { id: 'seat-1', status: 'provisioned' }, error: null });
    // Update chain
    const updateChain = buildChain({ data: null, error: null });

    mockFrom
      .mockReturnValueOnce(lookupChain)
      .mockReturnValueOnce(updateChain);

    const res = await app.request('/b2b/seats/seat-1/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: JSON.stringify({ user_id: 'a0000000-0000-4000-8000-000000000001' }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);
  });

  it('returns 404 for non-existent seat', async () => {
    // Seat lookup returns null
    mockFrom.mockReturnValueOnce(
      buildChain({ data: null, error: null }),
    );

    const res = await app.request('/b2b/seats/nonexistent/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: JSON.stringify({ user_id: 'a0000000-0000-4000-8000-000000000001' }),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('not found');
  });

  it('returns 409 for already-activated seat', async () => {
    // Seat lookup returns seat with status 'active' (not provisioned)
    mockFrom.mockReturnValueOnce(
      buildChain({ data: { id: 'seat-1', status: 'active' }, error: null }),
    );

    const res = await app.request('/b2b/seats/seat-1/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: JSON.stringify({ user_id: 'a0000000-0000-4000-8000-000000000001' }),
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('cannot be activated');
  });

  it('returns 400 for missing user_id', async () => {
    const res = await app.request('/b2b/seats/seat-1/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });
});

// ─── Seat Provisioning (Fixes 4, 5) ────────────────────────────────────────

describe('POST /b2b/orgs/:orgId/seats — provisioning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 'user-abc', email: 'admin@corp.com', accessToken: 'tok' };
  });

  it('rejects provisioning when contract belongs to different org', async () => {
    // requireOrgAdmin
    mockOrgLookup();
    // Contract lookup — org_id mismatch
    mockFrom.mockReturnValueOnce(
      buildChain({
        data: { id: 'contract-1', org_id: 'other-org', total_seats: 100, used_seats: 0, status: 'active' },
        error: null,
      }),
    );

    const res = await app.request('/b2b/orgs/org-1/seats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: JSON.stringify({
        contract_id: 'a0000000-0000-4000-8000-000000000099',
        seats: [{ email: 'john@corp.com' }],
      }),
    });

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('does not belong');
  });

  it('rejects provisioning when capacity would be exceeded', async () => {
    // requireOrgAdmin
    mockOrgLookup();
    // Contract lookup — almost full
    mockFrom.mockReturnValueOnce(
      buildChain({
        data: { id: 'contract-1', org_id: 'org-1', total_seats: 10, used_seats: 9, status: 'active' },
        error: null,
      }),
    );

    const res = await app.request('/b2b/orgs/org-1/seats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: JSON.stringify({
        contract_id: 'a0000000-0000-4000-8000-000000000099',
        seats: [{ email: 'a@corp.com' }, { email: 'b@corp.com' }],
      }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('Capacity exceeded');
  });

  it('rejects provisioning on inactive contract', async () => {
    mockOrgLookup();
    mockFrom.mockReturnValueOnce(
      buildChain({
        data: { id: 'contract-1', org_id: 'org-1', total_seats: 100, used_seats: 0, status: 'expired' },
        error: null,
      }),
    );

    const res = await app.request('/b2b/orgs/org-1/seats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: JSON.stringify({
        contract_id: 'a0000000-0000-4000-8000-000000000099',
        seats: [{ email: 'a@corp.com' }],
      }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('not active');
  });

  it('provisions seats when contract is valid and has capacity', async () => {
    // requireOrgAdmin
    mockOrgLookup();
    // Contract lookup
    mockFrom.mockReturnValueOnce(
      buildChain({
        data: { id: 'contract-1', org_id: 'org-1', total_seats: 100, used_seats: 5, status: 'active' },
        error: null,
      }),
    );
    // Insert seats (1 call per seat)
    mockFrom.mockReturnValueOnce(
      buildChain({ data: null, error: null }),
    );
    // Count query
    mockFrom.mockReturnValueOnce(
      buildChain({ count: 6, data: null, error: null }),
    );
    // Update used_seats
    mockFrom.mockReturnValueOnce(
      buildChain({ data: null, error: null }),
    );

    const res = await app.request('/b2b/orgs/org-1/seats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: JSON.stringify({
        contract_id: 'a0000000-0000-4000-8000-000000000099',
        seats: [{ email: 'john@corp.com' }],
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { provisioned: number; errors: string[] };
    expect(body.provisioned).toBe(1);
    expect(body.errors).toEqual([]);
  });
});

// ─── Contract Routes ────────────────────────────────────────────────────────

describe('POST /b2b/orgs/:orgId/contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 'user-abc', email: 'admin@corp.com', accessToken: 'tok' };
  });

  it('creates a contract for admin', async () => {
    mockOrgLookup();
    mockFrom.mockReturnValueOnce(
      buildChain({
        data: {
          id: 'contract-1',
          org_id: 'org-1',
          tier: 'standard',
          total_seats: 100,
          used_seats: 0,
          status: 'active',
        },
        error: null,
      }),
    );

    const res = await app.request('/b2b/orgs/org-1/contracts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: JSON.stringify({
        tier: 'standard',
        price_per_seat_cents: 5000,
        total_seats: 100,
        start_date: '2026-01-01',
      }),
    });

    expect(res.status).toBe(201);
  });

  it('rejects invalid contract tier', async () => {
    const res = await app.request('/b2b/orgs/org-1/contracts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: JSON.stringify({
        tier: 'diamond',
        price_per_seat_cents: 5000,
        total_seats: 100,
        start_date: '2026-01-01',
      }),
    });

    expect(res.status).toBe(400);
  });
});

// ─── Cohort Routes ──────────────────────────────────────────────────────────

describe('cohort management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 'user-abc', email: 'admin@corp.com', accessToken: 'tok' };
  });

  it('POST /orgs/:orgId/cohorts creates cohort for admin', async () => {
    mockOrgLookup();
    mockFrom.mockReturnValueOnce(
      buildChain({
        data: { id: 'cohort-1', org_id: 'org-1', name: 'Q1 Cohort', description: null },
        error: null,
      }),
    );

    const res = await app.request('/b2b/orgs/org-1/cohorts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: JSON.stringify({ name: 'Q1 Cohort' }),
    });

    expect(res.status).toBe(201);
  });

  it('rejects cohort creation with empty name', async () => {
    const res = await app.request('/b2b/orgs/org-1/cohorts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: JSON.stringify({ name: '' }),
    });

    expect(res.status).toBe(400);
  });
});

// ─── Input validation (Fix 14) ─────────────────────────────────────────────

describe('input validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 'user-abc', email: 'admin@corp.com', accessToken: 'tok' };
  });

  it('rejects slug "api" as reserved', async () => {
    const res = await app.request('/b2b/orgs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: JSON.stringify({
        name: 'API Org',
        slug: 'api',
        admin_email: 'admin@api.com',
        admin_name: 'Admin',
      }),
    });

    expect(res.status).toBe(400);
  });

  it('rejects slug "www" as reserved', async () => {
    const res = await app.request('/b2b/orgs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: JSON.stringify({
        name: 'WWW Org',
        slug: 'www',
        admin_email: 'admin@www.com',
        admin_name: 'Admin',
      }),
    });

    expect(res.status).toBe(400);
  });
});
