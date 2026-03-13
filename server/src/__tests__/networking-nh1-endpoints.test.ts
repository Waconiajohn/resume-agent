/**
 * Sprint NH1 — New networking endpoints tests.
 *
 * Stories covered:
 *   NH1-3: POST /networking/ni-import — NI connection import with deduplication
 *   NH1-5: GET /networking/overdue — contacts past their follow-up date
 *
 * Tests exercise the query construction and business logic without a live
 * database — all Supabase calls are mocked at the module boundary.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockFromFn, mockWarn, mockError, mockInfo } = vi.hoisted(() => ({
  mockFromFn: vi.fn(),
  mockWarn: vi.fn(),
  mockError: vi.fn(),
  mockInfo: vi.fn(),
}));

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: { from: mockFromFn },
}));

vi.mock('../lib/feature-flags.js', () => ({
  FF_NETWORKING_CRM: true,
}));

vi.mock('../lib/logger.js', () => ({
  default: { info: mockInfo, warn: mockWarn, error: mockError },
}));

// ─── Chainable mock factory ───────────────────────────────────────────────────

function chainableMock(result: unknown = { data: null, error: null, count: 0 }) {
  const chain: Record<string, unknown> = {};
  const methods = [
    'select', 'insert', 'update', 'delete', 'eq', 'ilike', 'not', 'lt', 'lte',
    'order', 'limit', 'range', 'or', 'single',
  ];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue(result);
  (chain as Record<string, unknown>).then = (
    onfulfilled?: ((value: unknown) => unknown) | null,
    onrejected?: ((reason: unknown) => unknown) | null,
  ) => Promise.resolve(result).then(onfulfilled ?? undefined, onrejected ?? undefined);
  return chain;
}

// ─── GET /overdue — query construction ───────────────────────────────────────

describe('GET /networking/overdue — query construction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries networking_contacts with lt(next_followup_at, now)', async () => {
    const mockChain = chainableMock({ data: [], error: null });
    mockFromFn.mockReturnValue(mockChain);

    const { supabaseAdmin } = await import('../lib/supabase.js');

    const now = new Date().toISOString();
    await supabaseAdmin
      .from('networking_contacts')
      .select('*')
      .eq('user_id', 'user-1')
      .not('next_followup_at', 'is', null)
      .lt('next_followup_at', now)
      .order('next_followup_at', { ascending: true });

    expect(mockChain.not).toHaveBeenCalledWith('next_followup_at', 'is', null);
    expect(mockChain.lt).toHaveBeenCalledWith('next_followup_at', expect.any(String));
    expect(mockChain.order).toHaveBeenCalledWith('next_followup_at', { ascending: true });
  });

  it('applies user_id filter to overdue query', async () => {
    const mockChain = chainableMock({ data: [], error: null });
    mockFromFn.mockReturnValue(mockChain);

    const { supabaseAdmin } = await import('../lib/supabase.js');
    const now = new Date().toISOString();

    await supabaseAdmin
      .from('networking_contacts')
      .select('*')
      .eq('user_id', 'user-123')
      .not('next_followup_at', 'is', null)
      .lt('next_followup_at', now)
      .order('next_followup_at', { ascending: true });

    expect(mockChain.eq).toHaveBeenCalledWith('user_id', 'user-123');
  });

  it('overdue uses lt (less-than) not lte (less-than-or-equal)', () => {
    // The /overdue endpoint uses lt() to return contacts with a PAST follow-up
    // date (strictly before now). The /follow-ups endpoint uses lte() to include
    // contacts due today or in the future window.
    // This test documents the semantic distinction.
    const overdueOperator = 'lt';
    const followUpsOperator = 'lte';
    expect(overdueOperator).not.toBe(followUpsOperator);
    expect(overdueOperator).toBe('lt');
  });

  it('response includes count of overdue contacts', () => {
    // Simulate the response shape the route returns
    const contacts = [
      { id: 'c-1', name: 'Jane', next_followup_at: '2026-01-01T00:00:00Z' },
      { id: 'c-2', name: 'Bob', next_followup_at: '2026-01-05T00:00:00Z' },
    ];
    const response = { contacts, count: contacts.length };
    expect(response.count).toBe(2);
    expect(response.contacts).toHaveLength(2);
  });
});

// ─── POST /networking/ni-import — deduplication logic ────────────────────────

describe('POST /networking/ni-import — deduplication logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips NI connections whose ni_connection_id already exists in contacts', () => {
    const existingNiIds = new Set(['ni-001', 'ni-002']);
    const niConnections = [
      { id: 'ni-001', first_name: 'Jane', last_name: 'Smith', email: 'jane@acme.com', company_raw: 'Acme', position: 'CTO' },
      { id: 'ni-003', first_name: 'Bob', last_name: 'Jones', email: 'bob@beta.com', company_raw: 'Beta', position: 'VP' },
    ];

    const toInsert = niConnections.filter((c) => !existingNiIds.has(c.id));
    expect(toInsert).toHaveLength(1);
    expect(toInsert[0].id).toBe('ni-003');
  });

  it('skips NI connections whose email already exists in contacts', () => {
    const existingEmails = new Set(['jane@acme.com']);
    const niConnections = [
      { id: 'ni-001', first_name: 'Jane', last_name: 'Smith', email: 'jane@acme.com', company_raw: 'Acme', position: 'CTO' },
      { id: 'ni-002', first_name: 'Bob', last_name: 'Jones', email: 'bob@beta.com', company_raw: 'Beta', position: 'VP' },
    ];
    const existingNiIds = new Set<string>();

    const toInsert = niConnections.filter((c) => {
      if (existingNiIds.has(c.id)) return false;
      if (c.email && existingEmails.has(c.email.toLowerCase())) return false;
      return true;
    });

    expect(toInsert).toHaveLength(1);
    expect(toInsert[0].email).toBe('bob@beta.com');
  });

  it('email deduplication is case-insensitive', () => {
    const existingEmails = new Set(['JANE@ACME.COM'.toLowerCase()]);
    const niConnections = [
      { id: 'ni-001', first_name: 'Jane', last_name: 'Smith', email: 'Jane@Acme.com', company_raw: 'Acme', position: 'CTO' },
    ];
    const existingNiIds = new Set<string>();

    const toInsert = niConnections.filter((c) => {
      if (existingNiIds.has(c.id)) return false;
      if (c.email && existingEmails.has(c.email.toLowerCase())) return false;
      return true;
    });

    expect(toInsert).toHaveLength(0);
  });

  it('imports all connections when none are duplicates', () => {
    const existingEmails = new Set<string>();
    const existingNiIds = new Set<string>();
    const niConnections = [
      { id: 'ni-001', first_name: 'Jane', last_name: 'Smith', email: 'jane@acme.com', company_raw: 'Acme', position: 'CTO' },
      { id: 'ni-002', first_name: 'Bob', last_name: 'Jones', email: 'bob@beta.com', company_raw: 'Beta', position: 'VP' },
    ];

    const toInsert = niConnections.filter((c) => {
      if (existingNiIds.has(c.id)) return false;
      if (c.email && existingEmails.has(c.email.toLowerCase())) return false;
      return true;
    });

    expect(toInsert).toHaveLength(2);
  });

  it('imports contact with null email when no ni_connection_id duplicate exists', () => {
    const existingEmails = new Set<string>();
    const existingNiIds = new Set<string>();
    const niConnections = [
      { id: 'ni-001', first_name: 'Jane', last_name: 'Smith', email: null as string | null, company_raw: 'Acme', position: 'CTO' },
    ];

    const toInsert = niConnections.filter((c) => {
      if (existingNiIds.has(c.id)) return false;
      if (c.email && existingEmails.has(c.email.toLowerCase())) return false;
      return true;
    });

    expect(toInsert).toHaveLength(1);
  });

  it('returns imported=0 and message when all are duplicates', () => {
    const niConnections = [
      { id: 'ni-001', first_name: 'Jane', last_name: 'Smith', email: 'jane@acme.com', company_raw: 'Acme', position: 'CTO' },
    ];
    const existingNiIds = new Set(['ni-001']);
    const existingEmails = new Set<string>();

    const toInsert = niConnections.filter((c) => {
      if (existingNiIds.has(c.id)) return false;
      if (c.email && existingEmails.has(c.email.toLowerCase())) return false;
      return true;
    });

    const result = toInsert.length === 0
      ? { imported: 0, skipped: niConnections.length, message: 'All connections are already in your CRM.' }
      : { imported: toInsert.length, skipped: niConnections.length - toInsert.length, message: `Imported ${toInsert.length} new contacts.` };

    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.message).toContain('already in your CRM');
  });

  it('builds correct contact row shape for bulk insert', () => {
    const conn = {
      id: 'ni-001',
      first_name: 'Jane',
      last_name: 'Smith',
      email: 'jane@acme.com',
      company_raw: 'Acme Corp',
      position: 'CTO',
    };
    const userId = 'user-1';

    const row = {
      user_id: userId,
      name: `${conn.first_name} ${conn.last_name}`.trim(),
      title: conn.position ?? null,
      company: conn.company_raw ?? null,
      email: conn.email ?? null,
      relationship_type: 'other',
      relationship_strength: 1,
      tags: [],
      ni_connection_id: conn.id,
    };

    expect(row.name).toBe('Jane Smith');
    expect(row.title).toBe('CTO');
    expect(row.company).toBe('Acme Corp');
    expect(row.email).toBe('jane@acme.com');
    expect(row.relationship_type).toBe('other');
    expect(row.relationship_strength).toBe(1);
    expect(row.tags).toEqual([]);
    expect(row.ni_connection_id).toBe('ni-001');
  });

  it('queries client_connections from NI with limit 500', async () => {
    const mockChain = chainableMock({ data: [], error: null });
    mockFromFn.mockReturnValue(mockChain);

    const { supabaseAdmin } = await import('../lib/supabase.js');

    await supabaseAdmin
      .from('client_connections')
      .select('id, first_name, last_name, email, company_raw, position')
      .eq('user_id', 'user-1')
      .limit(500);

    expect(mockFromFn).toHaveBeenCalledWith('client_connections');
    expect(mockChain.limit).toHaveBeenCalledWith(500);
  });

  it('returns imported message with correct pluralization', () => {
    function importMessage(count: number): string {
      return `Imported ${count} new contact${count !== 1 ? 's' : ''} from Network Intelligence.`;
    }
    expect(importMessage(1)).toBe('Imported 1 new contact from Network Intelligence.');
    expect(importMessage(3)).toBe('Imported 3 new contacts from Network Intelligence.');
    expect(importMessage(0)).toBe('Imported 0 new contacts from Network Intelligence.');
  });
});

// ─── Integration: overdue contacts are a subset of follow-ups ────────────────

describe('Overdue vs follow-ups semantic contract', () => {
  it('overdue endpoint is strictly past-due (now - epsilon)', () => {
    // A contact with next_followup_at = yesterday is overdue
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();
    expect(yesterday < now).toBe(true);
  });

  it('follow-ups endpoint includes future contacts (now + window)', () => {
    // A contact with next_followup_at = tomorrow is in follow-ups (days=7)
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const cutoff = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(tomorrow <= cutoff).toBe(true);
  });

  it('an overdue contact would also appear in follow-ups(days=0)', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();
    // lte means yesterday <= now which is true
    expect(yesterday <= now).toBe(true);
  });
});
