/**
 * Unit tests for server/src/lib/ni/target-titles-store.ts
 *
 * Tests the three exported CRUD functions:
 *   - insertTargetTitle  — insert({user_id, title, priority}).select('*').single()
 *   - getTargetTitlesByUser — select('*').eq('user_id').order('priority', ascending)
 *   - deleteTargetTitle  — delete().eq('id').eq('user_id').select('id')
 *
 * Follows the vi.hoisted() + vi.mock() pattern used throughout this test suite
 * (see ni-company-normalizer.test.ts, ni-routes.test.ts).
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
   *   supabaseAdmin.from('t').insert({...}).select('*').single()
   * and override the terminal resolution by replacing the relevant method.
   *
   * chain.then = undefined prevents accidental auto-await of the chain itself.
   */
  const chainable = () => {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.insert = vi.fn().mockReturnValue(chain);
    chain.delete = vi.fn().mockReturnValue(chain);
    chain.eq     = vi.fn().mockReturnValue(chain);
    chain.order  = vi.fn().mockReturnValue(chain);
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
  insertTargetTitle,
  getTargetTitlesByUser,
  deleteTargetTitle,
} from '../lib/ni/target-titles-store.js';
import type { ClientTargetTitleRow } from '../lib/ni/types.js';

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function makeTargetTitleRow(overrides: Partial<ClientTargetTitleRow> = {}): ClientTargetTitleRow {
  return {
    id: 'title-001',
    user_id: 'user-001',
    title: 'VP Engineering',
    priority: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ─── insertTargetTitle ─────────────────────────────────────────────────────────

describe('insertTargetTitle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the inserted row on success', async () => {
    const expectedRow = makeTargetTitleRow({ title: 'CTO', priority: 2 });

    mockSupabase.from.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.insert = vi.fn().mockReturnValue(chain);
      chain.select = vi.fn().mockReturnValue(chain);
      chain.single = vi.fn().mockResolvedValue({ data: expectedRow, error: null });
      chain.then   = undefined;
      return chain;
    });

    const result = await insertTargetTitle('user-001', 'CTO', 2);

    expect(result).toEqual(expectedRow);
    expect(mockSupabase.from).toHaveBeenCalledWith('client_target_titles');
  });

  it('uses priority 1 as default when priority argument is not provided', async () => {
    const expectedRow = makeTargetTitleRow({ title: 'Director of Engineering', priority: 1 });

    let capturedInsertArg: Record<string, unknown> | null = null;

    mockSupabase.from.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.insert = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
        capturedInsertArg = payload;
        return chain;
      });
      chain.select = vi.fn().mockReturnValue(chain);
      chain.single = vi.fn().mockResolvedValue({ data: expectedRow, error: null });
      chain.then   = undefined;
      return chain;
    });

    const result = await insertTargetTitle('user-001', 'Director of Engineering');

    expect(result).toEqual(expectedRow);
    expect(capturedInsertArg).not.toBeNull();
    expect((capturedInsertArg as unknown as Record<string, unknown>).priority).toBe(1);
  });

  it('returns null when the DB returns an error', async () => {
    mockSupabase.from.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.insert = vi.fn().mockReturnValue(chain);
      chain.select = vi.fn().mockReturnValue(chain);
      chain.single = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'unique constraint violated' },
      });
      chain.then = undefined;
      return chain;
    });

    const result = await insertTargetTitle('user-001', 'VP Engineering');

    expect(result).toBeNull();
  });
});

// ─── getTargetTitlesByUser ─────────────────────────────────────────────────────

describe('getTargetTitlesByUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an array of rows ordered by priority', async () => {
    const rows: ClientTargetTitleRow[] = [
      makeTargetTitleRow({ id: 'title-001', title: 'CTO', priority: 1 }),
      makeTargetTitleRow({ id: 'title-002', title: 'VP Engineering', priority: 2 }),
      makeTargetTitleRow({ id: 'title-003', title: 'Director of Engineering', priority: 3 }),
    ];

    mockSupabase.from.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq     = vi.fn().mockReturnValue(chain);
      chain.order  = vi.fn().mockResolvedValue({ data: rows, error: null });
      chain.then   = undefined;
      return chain;
    });

    const result = await getTargetTitlesByUser('user-001');

    expect(result).toHaveLength(3);
    expect(result[0].priority).toBe(1);
    expect(result[1].priority).toBe(2);
    expect(result[2].priority).toBe(3);
    expect(mockSupabase.from).toHaveBeenCalledWith('client_target_titles');
  });

  it('returns an empty array when the user has no target titles', async () => {
    mockSupabase.from.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq     = vi.fn().mockReturnValue(chain);
      chain.order  = vi.fn().mockResolvedValue({ data: [], error: null });
      chain.then   = undefined;
      return chain;
    });

    const result = await getTargetTitlesByUser('user-no-titles');

    expect(result).toEqual([]);
  });

  it('returns an empty array when the DB returns an error', async () => {
    mockSupabase.from.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq     = vi.fn().mockReturnValue(chain);
      chain.order  = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'connection refused' },
      });
      chain.then = undefined;
      return chain;
    });

    const result = await getTargetTitlesByUser('user-001');

    expect(result).toEqual([]);
  });
});

// ─── deleteTargetTitle ─────────────────────────────────────────────────────────

describe('deleteTargetTitle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when a row was successfully deleted', async () => {
    // data has 1 item — the deleted row's id was returned
    mockSupabase.from.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.delete = vi.fn().mockReturnValue(chain);
      chain.eq     = vi.fn().mockReturnValue(chain);
      chain.select = vi.fn().mockResolvedValue({ data: [{ id: 'title-001' }], error: null });
      chain.then   = undefined;
      return chain;
    });

    const result = await deleteTargetTitle('user-001', 'title-001');

    expect(result).toBe(true);
    expect(mockSupabase.from).toHaveBeenCalledWith('client_target_titles');
  });

  it('returns false when no row was deleted (title does not exist or belongs to a different user)', async () => {
    // data is an empty array — no matching row was deleted
    mockSupabase.from.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.delete = vi.fn().mockReturnValue(chain);
      chain.eq     = vi.fn().mockReturnValue(chain);
      chain.select = vi.fn().mockResolvedValue({ data: [], error: null });
      chain.then   = undefined;
      return chain;
    });

    const result = await deleteTargetTitle('user-001', 'title-does-not-exist');

    expect(result).toBe(false);
  });

  it('returns false when the DB returns an error', async () => {
    mockSupabase.from.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.delete = vi.fn().mockReturnValue(chain);
      chain.eq     = vi.fn().mockReturnValue(chain);
      chain.select = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'permission denied' },
      });
      chain.then = undefined;
      return chain;
    });

    const result = await deleteTargetTitle('user-001', 'title-001');

    expect(result).toBe(false);
  });
});
