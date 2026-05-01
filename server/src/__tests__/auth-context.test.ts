import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFrom = vi.hoisted(() => vi.fn());

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
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

import {
  buildSupabaseIdentity,
  getB2BOrgMembershipForUser,
  membershipAllowsRole,
  recordSupabaseIdentity,
} from '../lib/auth-context.js';

function createMembershipChain(resolveValue: { data: unknown; error: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['select', 'eq']) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  chain.maybeSingle = vi.fn().mockResolvedValue(resolveValue);
  return chain;
}

describe('auth-context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds a normalized Supabase identity', () => {
    const identity = buildSupabaseIdentity({
      id: 'user-1',
      email: ' Admin@Example.COM ',
      accessToken: 'token',
    });

    expect(identity).toEqual({
      canonical_user_id: 'user-1',
      auth_provider: 'supabase',
      provider_subject: 'user-1',
      email: 'admin@example.com',
    });
  });

  it('records the current Supabase user in the provider bridge', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValueOnce({ upsert });

    await recordSupabaseIdentity({
      id: 'user-1',
      email: 'admin@example.com',
      accessToken: 'token',
    });

    expect(mockFrom).toHaveBeenCalledWith('platform_auth_identities');
    expect(upsert).toHaveBeenCalledWith(
      {
        canonical_user_id: 'user-1',
        auth_provider: 'supabase',
        provider_subject: 'user-1',
        email: 'admin@example.com',
      },
      { onConflict: 'auth_provider,provider_subject' },
    );
  });

  it('falls back from user id to normalized email when resolving B2B membership', async () => {
    mockFrom.mockReturnValueOnce(createMembershipChain({ data: null, error: null }));
    mockFrom.mockReturnValueOnce(
      createMembershipChain({
        data: {
          id: 'member-1',
          org_id: 'org-1',
          user_id: null,
          email: 'admin@example.com',
          role: 'admin',
          status: 'active',
          auth_provider: 'manual',
          provider_subject: null,
          seat_id: null,
        },
        error: null,
      }),
    );

    const membership = await getB2BOrgMembershipForUser(
      { id: 'user-1', email: 'Admin@Example.COM' },
      'org-1',
    );

    expect(membership?.role).toBe('admin');
    expect(membership?.status).toBe('active');
  });

  it('only allows active memberships with an allowed role', () => {
    expect(
      membershipAllowsRole(
        {
          id: 'member-1',
          org_id: 'org-1',
          user_id: 'user-1',
          email: 'owner@example.com',
          role: 'owner',
          status: 'active',
          auth_provider: 'supabase',
          provider_subject: 'user-1',
          seat_id: null,
        },
        ['owner', 'admin'],
      ),
    ).toBe(true);

    expect(
      membershipAllowsRole(
        {
          id: 'member-2',
          org_id: 'org-1',
          user_id: 'user-2',
          email: 'employee@example.com',
          role: 'employee',
          status: 'active',
          auth_provider: 'supabase',
          provider_subject: 'user-2',
          seat_id: null,
        },
        ['owner', 'admin'],
      ),
    ).toBe(false);
  });
});
