/**
 * Unit tests for server/src/lib/ni/connections-store.ts
 *
 * Covers the three enriched-query functions introduced for the Network
 * Intelligence feature:
 *   - getEnrichedConnectionsByUser  — joins company_directory.name_display
 *   - getConnectionCount            — head-only count query
 *   - getCompanySummary             — in-memory grouping by company_raw
 *
 * Strategy: mock supabaseAdmin via vi.hoisted() + vi.mock() so tests never
 * touch a real database. Each query chain terminates in a vi.fn() whose
 * resolved value is set per-test.
 *
 * Chain topology per function:
 *   getEnrichedConnectionsByUser → from().select().eq().order().range()
 *   getConnectionCount           → from().select().eq()
 *   getCompanySummary            → from().select().eq()
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mock factories ────────────────────────────────────────────────────
// vi.hoisted() guarantees these run before vi.mock() factory functions so the
// variables are initialised when the mock factories capture them.

const mockSupabaseAdmin = vi.hoisted(() => {
  /**
   * Single shared chainable object.
   *
   * Because the functions under test call .from() once and chain from there,
   * we can return the same chain object from every method. Tests control the
   * terminal resolution by calling mockResolvedValueOnce on the last method
   * in the chain for that function.
   *
   * Terminal methods per function:
   *   getEnrichedConnectionsByUser → range  (awaited after .range())
   *   getConnectionCount           → eq     (awaited after second .eq())
   *   getCompanySummary            → eq     (awaited after .eq())
   */
  const chainable: Record<string, ReturnType<typeof vi.fn>> = {
    from:   vi.fn(),
    select: vi.fn(),
    eq:     vi.fn(),
    order:  vi.fn(),
    range:  vi.fn(),
  };

  // Wire every method to return the chain so callers can continue chaining.
  // Default resolutions return empty success — individual tests override as
  // needed with mockResolvedValueOnce().
  chainable.from.mockReturnValue(chainable);
  chainable.select.mockReturnValue(chainable);
  chainable.eq.mockResolvedValue({ data: [], error: null });
  chainable.order.mockReturnValue(chainable);
  chainable.range.mockResolvedValue({ data: [], error: null });

  return { from: chainable.from, _chain: chainable };
});

// ─── Module mocks ──────────────────────────────────────────────────────────────
// Must appear before any application imports (Vitest hoists these calls).

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: mockSupabaseAdmin,
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

// ─── Imports (must follow vi.mock() calls) ────────────────────────────────────

import {
  getEnrichedConnectionsByUser,
  getConnectionCount,
  getCompanySummary,
} from '../lib/ni/connections-store.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convenience reference to the shared mock chain. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const chain = (mockSupabaseAdmin as any)._chain as Record<string, ReturnType<typeof vi.fn>>;

/** Minimal ClientConnectionRow fields shared across fixtures. */
const BASE_ROW = {
  id: 'conn-1',
  user_id: 'user-abc',
  first_name: 'Jane',
  last_name: 'Smith',
  email: 'jane@example.com',
  company_raw: 'Acme Corp',
  company_id: 'co-1',
  position: 'VP Engineering',
  connected_on: '2023-01-15T00:00:00.000Z',
  import_batch: 'batch-1',
  metadata: {},
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('getEnrichedConnectionsByUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore default chain wiring after clearAllMocks() resets mockReturnValue.
    chain.from.mockReturnValue(chain);
    chain.select.mockReturnValue(chain);
    // eq must return the chain (not resolve) so .order().range() can follow.
    chain.eq.mockReturnValue(chain);
    chain.order.mockReturnValue(chain);
    // range() is the terminal method for getEnrichedConnectionsByUser.
    chain.range.mockResolvedValue({ data: [], error: null });
  });

  // ── 1. Returns enriched rows with company_display_name mapped ───────────────

  it('maps company_directory.name_display to company_display_name on each row', async () => {
    const rawRow = {
      ...BASE_ROW,
      company_directory: { name_display: 'Acme Corporation' },
    };
    chain.range.mockResolvedValueOnce({ data: [rawRow], error: null });

    const result = await getEnrichedConnectionsByUser('user-abc');

    expect(result).toHaveLength(1);
    expect(result[0].company_display_name).toBe('Acme Corporation');
    // The nested join key must be stripped from the returned row.
    expect(result[0]).not.toHaveProperty('company_directory');
    // Core fields must be preserved.
    expect(result[0].id).toBe('conn-1');
    expect(result[0].company_raw).toBe('Acme Corp');
  });

  // ── 2. Null company_directory leaves company_display_name as null ────────────

  it('sets company_display_name to null when company_directory is null (no company_id)', async () => {
    const rawRow = {
      ...BASE_ROW,
      company_id: null,
      company_directory: null,
    };
    chain.range.mockResolvedValueOnce({ data: [rawRow], error: null });

    const result = await getEnrichedConnectionsByUser('user-abc');

    expect(result).toHaveLength(1);
    expect(result[0].company_display_name).toBeNull();
    expect(result[0].company_id).toBeNull();
  });

  // ── 3. Returns empty array on empty result set ───────────────────────────────

  it('returns an empty array when the query returns no rows', async () => {
    chain.range.mockResolvedValueOnce({ data: [], error: null });

    const result = await getEnrichedConnectionsByUser('user-abc');

    expect(result).toEqual([]);
  });

  // ── 4. Returns empty array on DB error ──────────────────────────────────────

  it('returns an empty array when the query returns an error', async () => {
    chain.range.mockResolvedValueOnce({
      data: null,
      error: { message: 'relation "client_connections" does not exist' },
    });

    const result = await getEnrichedConnectionsByUser('user-abc');

    expect(result).toEqual([]);
  });

  // ── 5. Passes correct limit and offset to range() ───────────────────────────

  it('passes the correct range window to .range() for default limit/offset', async () => {
    chain.range.mockResolvedValueOnce({ data: [], error: null });

    await getEnrichedConnectionsByUser('user-abc');

    // Default: limit=100, offset=0 → range(0, 99)
    expect(chain.range).toHaveBeenCalledWith(0, 99);
  });

  it('passes the correct range window to .range() for custom limit and offset', async () => {
    chain.range.mockResolvedValueOnce({ data: [], error: null });

    await getEnrichedConnectionsByUser('user-abc', 25, 50);

    // limit=25, offset=50 → range(50, 74)
    expect(chain.range).toHaveBeenCalledWith(50, 74);
  });
});

// ─── getConnectionCount ───────────────────────────────────────────────────────

describe('getConnectionCount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chain.from.mockReturnValue(chain);
    chain.select.mockReturnValue(chain);
    chain.order.mockReturnValue(chain);
    chain.eq.mockResolvedValue({ count: 0, error: null });
    chain.range.mockResolvedValue({ data: [], error: null });
  });

  // ── 1. Returns count from head-only query ────────────────────────────────────

  it('returns the count value from the head-only query', async () => {
    chain.eq.mockResolvedValueOnce({ count: 42, error: null });

    const result = await getConnectionCount('user-abc');

    expect(result).toBe(42);
  });

  // ── 2. Returns 0 on DB error ─────────────────────────────────────────────────

  it('returns 0 when the query returns an error', async () => {
    chain.eq.mockResolvedValueOnce({
      count: null,
      error: { message: 'permission denied' },
    });

    const result = await getConnectionCount('user-abc');

    expect(result).toBe(0);
  });

  // ── 3. Returns 0 when count is null ─────────────────────────────────────────

  it('returns 0 when the query succeeds but count is null', async () => {
    chain.eq.mockResolvedValueOnce({ count: null, error: null });

    const result = await getConnectionCount('user-abc');

    expect(result).toBe(0);
  });
});

// ─── getCompanySummary ────────────────────────────────────────────────────────

describe('getCompanySummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chain.from.mockReturnValue(chain);
    chain.select.mockReturnValue(chain);
    chain.order.mockReturnValue(chain);
    chain.eq.mockResolvedValue({ data: [], error: null });
    chain.range.mockResolvedValue({ data: [], error: null });
  });

  // ── 1. Groups connections by company_raw, sorted by count desc ───────────────

  it('groups rows by company_raw and sorts by connection count descending', async () => {
    const rows = [
      { company_raw: 'Acme', company_id: 'co-1', position: 'Engineer', company_directory: null },
      { company_raw: 'Beta Co', company_id: 'co-2', position: 'Manager', company_directory: null },
      { company_raw: 'Acme', company_id: 'co-1', position: 'Engineer', company_directory: null },
      { company_raw: 'Acme', company_id: 'co-1', position: 'Director', company_directory: null },
    ];
    chain.eq.mockResolvedValueOnce({ data: rows, error: null });

    const result = await getCompanySummary('user-abc');

    expect(result).toHaveLength(2);
    // Acme has 3 connections — must sort first.
    expect(result[0].companyRaw).toBe('Acme');
    expect(result[0].connectionCount).toBe(3);
    // Beta Co has 1 connection — must sort second.
    expect(result[1].companyRaw).toBe('Beta Co');
    expect(result[1].connectionCount).toBe(1);
  });

  // ── 2. Maps company_display_name from nested join ────────────────────────────

  it('populates companyDisplayName from the company_directory join', async () => {
    const rows = [
      {
        company_raw: 'Acme',
        company_id: 'co-1',
        position: 'Engineer',
        company_directory: { name_display: 'Acme Corporation' },
      },
      {
        company_raw: 'Beta Co',
        company_id: null,
        position: 'Manager',
        company_directory: null,
      },
    ];
    chain.eq.mockResolvedValueOnce({ data: rows, error: null });

    const result = await getCompanySummary('user-abc');

    const acme = result.find((r) => r.companyRaw === 'Acme');
    expect(acme?.companyDisplayName).toBe('Acme Corporation');

    const beta = result.find((r) => r.companyRaw === 'Beta Co');
    expect(beta?.companyDisplayName).toBeNull();
  });

  // ── 3. Extracts top positions (max 5, sorted by frequency) ──────────────────

  it('returns up to 5 top positions sorted by frequency descending', async () => {
    // 6 distinct positions — only top 5 by frequency should appear.
    const rows = [
      // 'Engineer' x3
      { company_raw: 'Acme', company_id: 'co-1', position: 'Engineer',       company_directory: null },
      { company_raw: 'Acme', company_id: 'co-1', position: 'Engineer',       company_directory: null },
      { company_raw: 'Acme', company_id: 'co-1', position: 'Engineer',       company_directory: null },
      // 'Director' x2
      { company_raw: 'Acme', company_id: 'co-1', position: 'Director',       company_directory: null },
      { company_raw: 'Acme', company_id: 'co-1', position: 'Director',       company_directory: null },
      // 'VP' x2
      { company_raw: 'Acme', company_id: 'co-1', position: 'VP',             company_directory: null },
      { company_raw: 'Acme', company_id: 'co-1', position: 'VP',             company_directory: null },
      // 'Manager' x1
      { company_raw: 'Acme', company_id: 'co-1', position: 'Manager',        company_directory: null },
      // 'Analyst' x1
      { company_raw: 'Acme', company_id: 'co-1', position: 'Analyst',        company_directory: null },
      // 'Consultant' x1 — 6th position, must be excluded from top 5
      { company_raw: 'Acme', company_id: 'co-1', position: 'Consultant',     company_directory: null },
    ];
    chain.eq.mockResolvedValueOnce({ data: rows, error: null });

    const result = await getCompanySummary('user-abc');

    expect(result).toHaveLength(1);
    const acme = result[0];
    expect(acme.connectionCount).toBe(10);
    // Must contain at most 5 positions.
    expect(acme.topPositions.length).toBeLessThanOrEqual(5);
    // Highest-frequency position must be first.
    expect(acme.topPositions[0]).toBe('Engineer');
    // 'Consultant' (lowest frequency) must be excluded.
    expect(acme.topPositions).not.toContain('Consultant');
  });

  // ── 4. Returns empty array on DB error ──────────────────────────────────────

  it('returns an empty array when the query returns an error', async () => {
    chain.eq.mockResolvedValueOnce({
      data: null,
      error: { message: 'query timeout' },
    });

    const result = await getCompanySummary('user-abc');

    expect(result).toEqual([]);
  });
});

// ─── getCompanySummary — company name filtering ───────────────────────────────

describe('getCompanySummary — company name filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chain.from.mockReturnValue(chain);
    chain.select.mockReturnValue(chain);
    chain.order.mockReturnValue(chain);
    chain.eq.mockResolvedValue({ data: [], error: null });
    chain.range.mockResolvedValue({ data: [], error: null });
  });

  // ── Helper: build a minimal summary row ────────────────────────────────────
  /** Returns a raw DB row with no directory match and an arbitrary position. */
  function makeRow(companyRaw: string, companyDirectory: { name_display: string } | null = null) {
    return {
      company_raw: companyRaw,
      company_id: companyDirectory ? 'co-matched' : null,
      position: 'Employee',
      company_directory: companyDirectory,
    };
  }

  // ── 1. Exact invalid entries are filtered out ────────────────────────────────

  it('filters out "Retired" (exact match)', async () => {
    chain.eq.mockResolvedValueOnce({ data: [makeRow('Retired')], error: null });
    const result = await getCompanySummary('user-abc');
    expect(result).toHaveLength(0);
  });

  it('filters out "Self-Employed" (exact match, hyphenated form)', async () => {
    chain.eq.mockResolvedValueOnce({ data: [makeRow('Self-Employed')], error: null });
    const result = await getCompanySummary('user-abc');
    expect(result).toHaveLength(0);
  });

  it('filters out "Self Employed" (exact match, space form)', async () => {
    chain.eq.mockResolvedValueOnce({ data: [makeRow('Self Employed')], error: null });
    const result = await getCompanySummary('user-abc');
    expect(result).toHaveLength(0);
  });

  it('filters out "Freelance" (exact match)', async () => {
    chain.eq.mockResolvedValueOnce({ data: [makeRow('Freelance')], error: null });
    const result = await getCompanySummary('user-abc');
    expect(result).toHaveLength(0);
  });

  it('filters out "N/A" (exact match)', async () => {
    chain.eq.mockResolvedValueOnce({ data: [makeRow('N/A')], error: null });
    const result = await getCompanySummary('user-abc');
    expect(result).toHaveLength(0);
  });

  it('filters out "--" (exact match)', async () => {
    chain.eq.mockResolvedValueOnce({ data: [makeRow('--')], error: null });
    const result = await getCompanySummary('user-abc');
    expect(result).toHaveLength(0);
  });

  // ── 2. Real companies whose names START with a filter keyword are preserved ──

  it('preserves "Seeking Alpha" — starts with "Seeking" but is a real company', async () => {
    chain.eq.mockResolvedValueOnce({ data: [makeRow('Seeking Alpha')], error: null });
    const result = await getCompanySummary('user-abc');
    expect(result).toHaveLength(1);
    expect(result[0].companyRaw).toBe('Seeking Alpha');
  });

  it('preserves "Confidential Computing Inc" — starts with "Confidential" but is a real company', async () => {
    chain.eq.mockResolvedValueOnce({ data: [makeRow('Confidential Computing Inc')], error: null });
    const result = await getCompanySummary('user-abc');
    expect(result).toHaveLength(1);
    expect(result[0].companyRaw).toBe('Confidential Computing Inc');
  });

  // ── 3. companyDisplayName bypasses the filter ────────────────────────────────
  // If a connection's company was matched in the company_directory, we trust that
  // match regardless of what the raw string says.

  it('preserves an entry when companyDisplayName exists, even if raw matches an invalid pattern', async () => {
    // "Retired" would normally be filtered, but a directory match overrides that.
    const row = makeRow('Retired', { name_display: 'Retired Financial Services LLC' });
    chain.eq.mockResolvedValueOnce({ data: [row], error: null });

    const result = await getCompanySummary('user-abc');

    expect(result).toHaveLength(1);
    expect(result[0].companyRaw).toBe('Retired');
    expect(result[0].companyDisplayName).toBe('Retired Financial Services LLC');
  });

  it('preserves "Freelancer" when directory match exists', async () => {
    const row = makeRow('Freelancer', { name_display: 'Freelancer.com' });
    chain.eq.mockResolvedValueOnce({ data: [row], error: null });

    const result = await getCompanySummary('user-abc');

    expect(result).toHaveLength(1);
    expect(result[0].companyDisplayName).toBe('Freelancer.com');
  });

  // ── 4. Case-insensitive filtering ───────────────────────────────────────────

  it('filters "RETIRED" (all-caps)', async () => {
    chain.eq.mockResolvedValueOnce({ data: [makeRow('RETIRED')], error: null });
    const result = await getCompanySummary('user-abc');
    expect(result).toHaveLength(0);
  });

  it('filters "retired" (all-lowercase)', async () => {
    chain.eq.mockResolvedValueOnce({ data: [makeRow('retired')], error: null });
    const result = await getCompanySummary('user-abc');
    expect(result).toHaveLength(0);
  });

  it('filters "Retired" (title-case)', async () => {
    chain.eq.mockResolvedValueOnce({ data: [makeRow('Retired')], error: null });
    const result = await getCompanySummary('user-abc');
    expect(result).toHaveLength(0);
  });

  it('filters "FREELANCE" (all-caps)', async () => {
    chain.eq.mockResolvedValueOnce({ data: [makeRow('FREELANCE')], error: null });
    const result = await getCompanySummary('user-abc');
    expect(result).toHaveLength(0);
  });

  // ── 5. Trailing whitespace does not defeat the filter ───────────────────────

  it('filters "Retired  " (trailing spaces)', async () => {
    chain.eq.mockResolvedValueOnce({ data: [makeRow('Retired  ')], error: null });
    const result = await getCompanySummary('user-abc');
    expect(result).toHaveLength(0);
  });

  it('filters "N/A\\t" (trailing tab)', async () => {
    chain.eq.mockResolvedValueOnce({ data: [makeRow('N/A\t')], error: null });
    const result = await getCompanySummary('user-abc');
    expect(result).toHaveLength(0);
  });

  // ── 6. Real-data example: verbose LinkedIn status line ──────────────────────

  it('filters "Currently seeking exciting new opportunities" (real LinkedIn data pattern)', async () => {
    chain.eq.mockResolvedValueOnce({
      data: [makeRow('Currently seeking exciting new opportunities')],
      error: null,
    });
    const result = await getCompanySummary('user-abc');
    expect(result).toHaveLength(0);
  });

  it('filters "Currently Seeking" (minimal currently-seeking form)', async () => {
    chain.eq.mockResolvedValueOnce({ data: [makeRow('Currently Seeking')], error: null });
    const result = await getCompanySummary('user-abc');
    expect(result).toHaveLength(0);
  });

  // ── 7. Single-character company names filtered by length check ──────────────

  it('filters a single-character company name "A" (below 2-character minimum)', async () => {
    chain.eq.mockResolvedValueOnce({ data: [makeRow('A')], error: null });
    const result = await getCompanySummary('user-abc');
    expect(result).toHaveLength(0);
  });

  it('filters an empty string company name (below 2-character minimum)', async () => {
    chain.eq.mockResolvedValueOnce({ data: [makeRow('')], error: null });
    const result = await getCompanySummary('user-abc');
    expect(result).toHaveLength(0);
  });

  it('preserves a two-character company name "3M" (meets minimum length)', async () => {
    chain.eq.mockResolvedValueOnce({ data: [makeRow('3M')], error: null });
    const result = await getCompanySummary('user-abc');
    expect(result).toHaveLength(1);
    expect(result[0].companyRaw).toBe('3M');
  });

  // ── 8. Mixed batch: invalid and valid entries together ───────────────────────
  // Verifies that the filter is selective — real companies survive alongside
  // filtered entries in the same result set.

  it('filters only invalid entries when mixed with real companies in a single batch', async () => {
    const rows = [
      makeRow('Acme Corp'),
      makeRow('Retired'),
      makeRow('Google'),
      makeRow('Freelance'),
      makeRow('Self-Employed'),
      makeRow('Beta Industries'),
      makeRow('N/A'),
    ];
    chain.eq.mockResolvedValueOnce({ data: rows, error: null });

    const result = await getCompanySummary('user-abc');

    const companyNames = result.map((r) => r.companyRaw);
    expect(companyNames).toContain('Acme Corp');
    expect(companyNames).toContain('Google');
    expect(companyNames).toContain('Beta Industries');
    expect(companyNames).not.toContain('Retired');
    expect(companyNames).not.toContain('Freelance');
    expect(companyNames).not.toContain('Self-Employed');
    expect(companyNames).not.toContain('N/A');
    expect(result).toHaveLength(3);
  });
});
