/**
 * Tests for server/src/lib/platform-context.ts
 *
 * Story: Sprint 14 Story 8 — Shared Platform Context Model
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks — hoisted before any module imports ────────────────────────────────

const mockFrom = vi.hoisted(() => vi.fn());

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: mockFrom,
  },
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

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import {
  getUserContext,
  upsertUserContext,
  listUserContextByType,
  type PlatformContextRow,
} from '../lib/platform-context.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Builds a chainable Supabase query mock that resolves to `resolvedValue`. */
function makeChain(resolvedValue: unknown) {
  const chain: Record<string, unknown> = {};
  const chainMethods = ['select', 'insert', 'update', 'eq', 'in', 'order', 'maybeSingle', 'single'];
  for (const m of chainMethods) {
    chain[m] = vi.fn(() => chain);
  }
  // Terminal resolution
  (chain['maybeSingle'] as ReturnType<typeof vi.fn>).mockResolvedValue(resolvedValue);
  (chain['single'] as ReturnType<typeof vi.fn>).mockResolvedValue(resolvedValue);
  // Make chain awaitable for list queries
  (chain as unknown as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(resolvedValue).then(resolve);
  return chain;
}

function makeSampleRow(overrides: Partial<PlatformContextRow> = {}): PlatformContextRow {
  return {
    id: 'ctx-001',
    user_id: 'user-001',
    context_type: 'positioning_strategy',
    content: { angle: 'Digital transformation executive' },
    source_product: 'resume',
    source_session_id: 'session-001',
    version: 1,
    created_at: '2026-03-02T00:00:00Z',
    updated_at: '2026-03-02T00:00:00Z',
    ...overrides,
  };
}

// ─── getUserContext ───────────────────────────────────────────────────────────

describe('getUserContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns rows when query succeeds', async () => {
    const rows = [makeSampleRow()];
    mockFrom.mockReturnValue(makeChain({ data: rows, error: null }));

    const result = await getUserContext('user-001', 'positioning_strategy');

    expect(result).toEqual(rows);
    expect(mockFrom).toHaveBeenCalledWith('user_platform_context');
  });

  it('returns empty array when no rows exist', async () => {
    mockFrom.mockReturnValue(makeChain({ data: [], error: null }));

    const result = await getUserContext('user-002', 'evidence_item');

    expect(result).toEqual([]);
  });

  it('returns empty array on Supabase error', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'DB error' } }));

    const result = await getUserContext('user-001', 'career_narrative');

    expect(result).toEqual([]);
  });

  it('returns empty array on unexpected exception', async () => {
    mockFrom.mockImplementation(() => { throw new Error('Connection refused'); });

    const result = await getUserContext('user-001', 'target_role');

    expect(result).toEqual([]);
  });
});

// ─── upsertUserContext — insert path ─────────────────────────────────────────

describe('upsertUserContext — insert path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts a new row when none exists', async () => {
    const newRow = makeSampleRow({ version: 1 });
    const chain = makeChain(null);
    // maybeSingle returns null (no existing row), single resolves to newRow
    (chain['maybeSingle'] as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: null });
    (chain['single'] as ReturnType<typeof vi.fn>).mockResolvedValue({ data: newRow, error: null });
    mockFrom.mockReturnValue(chain);

    const result = await upsertUserContext(
      'user-001',
      'positioning_strategy',
      { angle: 'Digital transformation executive' },
      'resume',
      'session-001',
    );

    expect(result).toEqual(newRow);
  });

  it('returns null when insert fails', async () => {
    const chain = makeChain(null);
    (chain['maybeSingle'] as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: null });
    (chain['single'] as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: { message: 'Insert failed' } });
    mockFrom.mockReturnValue(chain);

    const result = await upsertUserContext(
      'user-001',
      'evidence_item',
      { items: [] },
      'resume',
    );

    expect(result).toBeNull();
  });
});

// ─── upsertUserContext — update path ─────────────────────────────────────────

describe('upsertUserContext — update path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates an existing row and increments version', async () => {
    const existingRow = { id: 'ctx-001', version: 2 };
    const updatedRow = makeSampleRow({ version: 3 });
    const chain = makeChain(null);
    (chain['maybeSingle'] as ReturnType<typeof vi.fn>).mockResolvedValue({ data: existingRow, error: null });
    (chain['single'] as ReturnType<typeof vi.fn>).mockResolvedValue({ data: updatedRow, error: null });
    mockFrom.mockReturnValue(chain);

    const result = await upsertUserContext(
      'user-001',
      'positioning_strategy',
      { angle: 'Updated angle' },
      'resume',
      'session-002',
    );

    expect(result).toEqual(updatedRow);
  });

  it('returns null when update fails', async () => {
    const existingRow = { id: 'ctx-001', version: 1 };
    const chain = makeChain(null);
    (chain['maybeSingle'] as ReturnType<typeof vi.fn>).mockResolvedValue({ data: existingRow, error: null });
    (chain['single'] as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: { message: 'Update failed' } });
    mockFrom.mockReturnValue(chain);

    const result = await upsertUserContext(
      'user-001',
      'career_narrative',
      { narrative: 'test' },
      'resume',
    );

    expect(result).toBeNull();
  });

  it('returns null on unexpected exception', async () => {
    mockFrom.mockImplementation(() => { throw new Error('Network error'); });

    const result = await upsertUserContext(
      'user-001',
      'target_role',
      { title: 'VP Engineering' },
      'resume',
    );

    expect(result).toBeNull();
  });
});

// ─── listUserContextByType ────────────────────────────────────────────────────

describe('listUserContextByType', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns all rows for a user when no type filter is given', async () => {
    const rows = [
      makeSampleRow({ context_type: 'positioning_strategy' }),
      makeSampleRow({ id: 'ctx-002', context_type: 'evidence_item' }),
    ];
    mockFrom.mockReturnValue(makeChain({ data: rows, error: null }));

    const result = await listUserContextByType('user-001');

    expect(result).toHaveLength(2);
    expect(result[0].context_type).toBe('positioning_strategy');
    expect(result[1].context_type).toBe('evidence_item');
  });

  it('returns rows filtered by type list', async () => {
    const rows = [makeSampleRow({ context_type: 'positioning_strategy' })];
    mockFrom.mockReturnValue(makeChain({ data: rows, error: null }));

    const result = await listUserContextByType('user-001', ['positioning_strategy']);

    expect(result).toHaveLength(1);
    expect(result[0].context_type).toBe('positioning_strategy');
  });

  it('returns empty array on Supabase error', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'Timeout' } }));

    const result = await listUserContextByType('user-001', ['evidence_item']);

    expect(result).toEqual([]);
  });

  it('returns empty array on unexpected exception', async () => {
    mockFrom.mockImplementation(() => { throw new Error('Unexpected'); });

    const result = await listUserContextByType('user-001');

    expect(result).toEqual([]);
  });

  it('returns empty array when data is null without error', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }));

    const result = await listUserContextByType('user-999');

    expect(result).toEqual([]);
  });
});
