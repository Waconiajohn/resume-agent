/**
 * Unit tests for server/src/lib/ni/job-matches-store.ts
 *
 * Tests the three exported CRUD functions:
 *   1. insertJobMatch       — insert a row into job_matches, return JobMatchRow | null
 *   2. getJobMatchesByUser  — paginated, filterable query
 *   3. updateJobMatchStatus — update status column, return boolean
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mock factories ────────────────────────────────────────────────────
// vi.hoisted() ensures these variables are initialised before vi.mock() factory
// functions execute — prevents temporal dead zone crashes.

const mockSupabase = vi.hoisted(() => {
  /**
   * Returns a fresh chainable query object each time .from() is called.
   *
   * Every method returns the same chain so tests can write:
   *   supabaseAdmin.from('job_matches').insert({...}).select('*').single()
   * and override the terminal resolution by replacing the relevant method.
   */
  const chainable = () => {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.insert = vi.fn().mockReturnValue(chain);
    chain.update = vi.fn().mockReturnValue(chain);
    chain.delete = vi.fn().mockReturnValue(chain);
    chain.eq     = vi.fn().mockReturnValue(chain);
    chain.neq    = vi.fn().mockReturnValue(chain);
    chain.or     = vi.fn().mockReturnValue(chain);
    chain.order  = vi.fn().mockReturnValue(chain);
    chain.in     = vi.fn().mockReturnValue(chain);
    chain.range  = vi.fn().mockResolvedValue({ data: [], error: null });
    chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
    // Prevent accidental auto-await of the chain object itself.
    chain.then   = undefined;
    return chain;
  };

  return {
    from: vi.fn().mockImplementation(() => chainable()),
  };
});

// ─── Module mocks (must appear before any application imports) ─────────────────

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: mockSupabase,
}));

vi.mock('../lib/logger.js', () => ({
  default: {
    info:  vi.fn(),
    warn:  vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
}));

// ─── Imports (must come AFTER vi.mock() calls) ─────────────────────────────────

import {
  insertJobMatch,
  getJobMatchesByUser,
  updateJobMatchStatus,
} from '../lib/ni/job-matches-store.js';
import type { JobMatchRow } from '../lib/ni/types.js';
import type { InsertJobMatch } from '../lib/ni/job-matches-store.js';

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function makeJobMatchRow(overrides: Partial<JobMatchRow> = {}): JobMatchRow {
  return {
    id: 'match-001',
    user_id: 'user-001',
    company_id: 'company-001',
    title: 'Senior Software Engineer',
    url: null,
    location: null,
    salary_range: null,
    description_snippet: null,
    match_score: null,
    referral_available: false,
    connection_count: 0,
    status: 'new',
    scraped_at: null,
    posted_on: null,
    metadata: {},
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeInsertJobMatch(overrides: Partial<InsertJobMatch> = {}): InsertJobMatch {
  return {
    company_id: 'company-001',
    title: 'Senior Software Engineer',
    ...overrides,
  };
}

// ─── insertJobMatch ────────────────────────────────────────────────────────────

describe('insertJobMatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the inserted row on success', async () => {
    const row = makeJobMatchRow({ id: 'match-new', title: 'VP Engineering' });

    mockSupabase.from.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.insert = vi.fn().mockReturnValue(chain);
      chain.select = vi.fn().mockReturnValue(chain);
      chain.single = vi.fn().mockResolvedValue({ data: row, error: null });
      chain.then   = undefined;
      return chain;
    });

    const result = await insertJobMatch('user-001', makeInsertJobMatch({ title: 'VP Engineering' }));

    expect(result).toEqual(row);
    expect(mockSupabase.from).toHaveBeenCalledWith('job_matches');
  });

  it('applies defaults for optional fields (referral_available=false, connection_count=0, status="new")', async () => {
    const row = makeJobMatchRow();
    let capturedInsertPayload: Record<string, unknown> | null = null;

    mockSupabase.from.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.insert = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
        capturedInsertPayload = payload;
        return chain;
      });
      chain.select = vi.fn().mockReturnValue(chain);
      chain.single = vi.fn().mockResolvedValue({ data: row, error: null });
      chain.then   = undefined;
      return chain;
    });

    // Pass only required fields — all optional fields omitted
    await insertJobMatch('user-001', { company_id: 'company-001', title: 'Engineer' });

    expect(capturedInsertPayload).not.toBeNull();
    expect(capturedInsertPayload!.referral_available).toBe(false);
    expect(capturedInsertPayload!.connection_count).toBe(0);
    expect(capturedInsertPayload!.status).toBe('new');
  });

  it('returns null on DB error', async () => {
    mockSupabase.from.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.insert = vi.fn().mockReturnValue(chain);
      chain.select = vi.fn().mockReturnValue(chain);
      chain.single = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'unique constraint violation' },
      });
      chain.then = undefined;
      return chain;
    });

    const result = await insertJobMatch('user-001', makeInsertJobMatch());

    expect(result).toBeNull();
  });
});

// ─── getJobMatchesByUser ───────────────────────────────────────────────────────

describe('getJobMatchesByUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an array of matches for the given user', async () => {
    const rows = [
      makeJobMatchRow({ id: 'match-001', title: 'Engineer' }),
      makeJobMatchRow({ id: 'match-002', title: 'Manager' }),
    ];

    mockSupabase.from.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq     = vi.fn().mockReturnValue(chain);
      chain.neq    = vi.fn().mockReturnValue(chain);
      chain.or     = vi.fn().mockReturnValue(chain);
      chain.in     = vi.fn().mockReturnValue(chain);
      chain.update = vi.fn().mockReturnValue(chain);
      chain.order  = vi.fn().mockReturnValue(chain);
      chain.range  = vi.fn().mockResolvedValue({ data: rows, error: null });
      chain.then   = undefined;
      return chain;
    });

    const result = await getJobMatchesByUser('user-001');

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('match-001');
    expect(result[1].id).toBe('match-002');
  });

  it('applies status filter when provided', async () => {
    const rows = [makeJobMatchRow({ id: 'match-003', status: 'applied' })];
    const eqArgs: Array<[string, unknown]> = [];

    mockSupabase.from.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq     = vi.fn().mockImplementation((col: string, val: unknown) => {
        eqArgs.push([col, val]);
        return chain;
      });
      chain.neq    = vi.fn().mockReturnValue(chain);
      chain.or     = vi.fn().mockReturnValue(chain);
      chain.in     = vi.fn().mockReturnValue(chain);
      chain.update = vi.fn().mockReturnValue(chain);
      chain.order  = vi.fn().mockReturnValue(chain);
      chain.range  = vi.fn().mockReturnValue(chain);
      // The chain is awaited after the optional status .eq() call
      chain.then   = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: rows, error: null }).then(resolve);
      return chain;
    });

    const result = await getJobMatchesByUser('user-001', { status: 'applied' });

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('applied');
    // Should have called .eq('status', 'applied')
    const statusCall = eqArgs.find(([col]) => col === 'status');
    expect(statusCall).toBeDefined();
    expect(statusCall![1]).toBe('applied');
  });

  it('returns an empty array when the query returns no rows', async () => {
    mockSupabase.from.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq     = vi.fn().mockReturnValue(chain);
      chain.neq    = vi.fn().mockReturnValue(chain);
      chain.or     = vi.fn().mockReturnValue(chain);
      chain.in     = vi.fn().mockReturnValue(chain);
      chain.order  = vi.fn().mockReturnValue(chain);
      chain.range  = vi.fn().mockResolvedValue({ data: [], error: null });
      chain.then   = undefined;
      return chain;
    });

    const result = await getJobMatchesByUser('user-001');

    expect(result).toEqual([]);
  });

  it('returns an empty array on DB error', async () => {
    mockSupabase.from.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq     = vi.fn().mockReturnValue(chain);
      chain.neq    = vi.fn().mockReturnValue(chain);
      chain.or     = vi.fn().mockReturnValue(chain);
      chain.in     = vi.fn().mockReturnValue(chain);
      chain.order  = vi.fn().mockReturnValue(chain);
      chain.range  = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'connection timeout' },
      });
      chain.then = undefined;
      return chain;
    });

    const result = await getJobMatchesByUser('user-001');

    expect(result).toEqual([]);
  });

  it('clamps limit to 200 when a larger value is supplied', async () => {
    let capturedRangeArgs: [number, number] | null = null;

    mockSupabase.from.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq     = vi.fn().mockReturnValue(chain);
      chain.neq    = vi.fn().mockReturnValue(chain);
      chain.or     = vi.fn().mockReturnValue(chain);
      chain.in     = vi.fn().mockReturnValue(chain);
      chain.order  = vi.fn().mockReturnValue(chain);
      chain.range  = vi.fn().mockImplementation((from: number, to: number) => {
        capturedRangeArgs = [from, to];
        return Promise.resolve({ data: [], error: null });
      });
      chain.then = undefined;
      return chain;
    });

    await getJobMatchesByUser('user-001', { limit: 9999 });

    // With limit clamped to 200 and offset=0: range(0, 199)
    expect(capturedRangeArgs).not.toBeNull();
    expect(capturedRangeArgs![0]).toBe(0);
    expect(capturedRangeArgs![1]).toBe(199);
  });
});

// ─── updateJobMatchStatus ──────────────────────────────────────────────────────

describe('updateJobMatchStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when a row was updated (data has 1 item)', async () => {
    mockSupabase.from.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.update = vi.fn().mockReturnValue(chain);
      chain.eq     = vi.fn().mockReturnValue(chain);
      chain.select = vi.fn().mockResolvedValue({ data: [{ id: 'match-001' }], error: null });
      chain.then   = undefined;
      return chain;
    });

    const result = await updateJobMatchStatus('user-001', 'match-001', 'applied');

    expect(result).toBe(true);
    expect(mockSupabase.from).toHaveBeenCalledWith('job_matches');
  });

  it('returns false when no matching row was found (empty data array)', async () => {
    mockSupabase.from.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.update = vi.fn().mockReturnValue(chain);
      chain.eq     = vi.fn().mockReturnValue(chain);
      chain.select = vi.fn().mockResolvedValue({ data: [], error: null });
      chain.then   = undefined;
      return chain;
    });

    const result = await updateJobMatchStatus('user-001', 'wrong-match-id', 'applied');

    expect(result).toBe(false);
  });

  it('returns false on DB error', async () => {
    mockSupabase.from.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.update = vi.fn().mockReturnValue(chain);
      chain.eq     = vi.fn().mockReturnValue(chain);
      chain.select = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'relation does not exist' },
      });
      chain.then = undefined;
      return chain;
    });

    const result = await updateJobMatchStatus('user-001', 'match-001', 'rejected');

    expect(result).toBe(false);
  });
});
