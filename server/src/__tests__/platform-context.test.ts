/**
 * Tests for server/src/lib/platform-context.ts
 *
 * Story: Sprint 14 Story 8 — Shared Platform Context Model
 * Updated: Fix 6/7/8 — RPC-based upsert, deleteUserContext, getLatestUserContext
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks — hoisted before any module imports ────────────────────────────────

const mockFrom = vi.hoisted(() => vi.fn());
const mockRpc = vi.hoisted(() => vi.fn());

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: mockFrom,
    rpc: mockRpc,
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
  getUserContext,
  getLatestUserContext,
  upsertUserContext,
  deleteUserContext,
  listUserContextByType,
  type PlatformContextRow,
} from '../lib/platform-context.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Builds a chainable Supabase query mock that resolves to `resolvedValue`. */
function makeChain(resolvedValue: unknown) {
  const chain: Record<string, unknown> = {};
  const chainMethods = [
    'select', 'insert', 'update', 'upsert', 'delete',
    'eq', 'in', 'order', 'maybeSingle', 'single',
  ];
  for (const m of chainMethods) {
    chain[m] = vi.fn(() => chain);
  }
  (chain['maybeSingle'] as ReturnType<typeof vi.fn>).mockResolvedValue(resolvedValue);
  (chain['single'] as ReturnType<typeof vi.fn>).mockResolvedValue(resolvedValue);
  // Make chain awaitable for list queries and delete queries
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
    mockFrom.mockImplementation(() => {
      throw new Error('Connection refused');
    });

    const result = await getUserContext('user-001', 'target_role');

    expect(result).toEqual([]);
  });
});

// ─── getLatestUserContext ─────────────────────────────────────────────────────

describe('getLatestUserContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the first row (most recent) when rows exist', async () => {
    const rows = [
      makeSampleRow({ id: 'ctx-newest', updated_at: '2026-03-08T10:00:00Z' }),
      makeSampleRow({ id: 'ctx-older', updated_at: '2026-03-07T10:00:00Z' }),
    ];
    mockFrom.mockReturnValue(makeChain({ data: rows, error: null }));

    const result = await getLatestUserContext('user-001', 'positioning_strategy');

    expect(result).toEqual(rows[0]);
    expect(result?.id).toBe('ctx-newest');
  });

  it('returns null when no rows exist', async () => {
    mockFrom.mockReturnValue(makeChain({ data: [], error: null }));

    const result = await getLatestUserContext('user-001', 'evidence_item');

    expect(result).toBeNull();
  });

  it('returns null when getUserContext returns empty on error', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'DB error' } }));

    const result = await getLatestUserContext('user-001', 'target_role');

    expect(result).toBeNull();
  });

  it('delegates to getUserContext with correct arguments', async () => {
    mockFrom.mockReturnValue(makeChain({ data: [], error: null }));

    await getLatestUserContext('user-abc', 'client_profile');

    expect(mockFrom).toHaveBeenCalledWith('user_platform_context');
  });
});

// ─── upsertUserContext — insert path ─────────────────────────────────────────

describe('upsertUserContext — insert path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls upsert_platform_context RPC with correct parameters', async () => {
    const newRow = makeSampleRow({ version: 1 });
    mockRpc.mockResolvedValue({ data: [newRow], error: null });

    const result = await upsertUserContext(
      'user-001',
      'positioning_strategy',
      { angle: 'Digital transformation executive' },
      'resume',
      'session-001',
    );

    expect(result).toEqual(newRow);
    expect(mockRpc).toHaveBeenCalledWith('upsert_platform_context', {
      p_user_id: 'user-001',
      p_context_type: 'positioning_strategy',
      p_source_product: 'resume',
      p_content: { angle: 'Digital transformation executive' },
      p_source_session_id: 'session-001',
    });
  });

  it('returns null when RPC returns an error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Insert failed' } });

    const result = await upsertUserContext(
      'user-001',
      'evidence_item',
      { items: [] },
      'resume',
    );

    expect(result).toBeNull();
  });

  it('passes null source_session_id when sessionId is omitted', async () => {
    mockRpc.mockResolvedValue({ data: [makeSampleRow()], error: null });

    await upsertUserContext('user-001', 'positioning_strategy', {}, 'resume');

    expect(mockRpc).toHaveBeenCalledWith(
      'upsert_platform_context',
      expect.objectContaining({ p_source_session_id: null }),
    );
  });
});

// ─── upsertUserContext — update path ─────────────────────────────────────────

describe('upsertUserContext — update path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the row with incremented version from RPC', async () => {
    const updatedRow = makeSampleRow({ version: 3 });
    mockRpc.mockResolvedValue({ data: [updatedRow], error: null });

    const result = await upsertUserContext(
      'user-001',
      'positioning_strategy',
      { angle: 'Updated angle' },
      'resume',
      'session-002',
    );

    expect(result).toEqual(updatedRow);
    expect(result?.version).toBe(3);
  });

  it('returns null when RPC returns an error on update', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Update failed' } });

    const result = await upsertUserContext(
      'user-001',
      'career_narrative',
      { narrative: 'test' },
      'resume',
    );

    expect(result).toBeNull();
  });

  it('returns null on unexpected exception', async () => {
    mockRpc.mockRejectedValue(new Error('Network error'));

    const result = await upsertUserContext(
      'user-001',
      'target_role',
      { title: 'VP Engineering' },
      'resume',
    );

    expect(result).toBeNull();
  });

  it('handles RPC returning a single object instead of array', async () => {
    const row = makeSampleRow({ version: 2 });
    mockRpc.mockResolvedValue({ data: row, error: null });

    const result = await upsertUserContext('user-001', 'positioning_strategy', {}, 'resume');

    expect(result).toEqual(row);
  });

  it('returns null when RPC returns an empty array', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    const result = await upsertUserContext('user-001', 'positioning_strategy', {}, 'resume');

    expect(result).toBeNull();
  });
});

// ─── deleteUserContext ────────────────────────────────────────────────────────

describe('deleteUserContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves without error when delete succeeds', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }));

    await expect(deleteUserContext('user-001', 'positioning_strategy')).resolves.toBeUndefined();

    expect(mockFrom).toHaveBeenCalledWith('user_platform_context');
  });

  it('applies eq filters for user_id and context_type', async () => {
    const chain = makeChain({ data: null, error: null });
    const eqSpy = vi.fn(() => chain);
    chain['eq'] = eqSpy;
    chain['delete'] = vi.fn(() => chain);
    mockFrom.mockReturnValue(chain);

    await deleteUserContext('user-001', 'gap_analysis');

    expect(eqSpy).toHaveBeenCalledWith('user_id', 'user-001');
    expect(eqSpy).toHaveBeenCalledWith('context_type', 'gap_analysis');
  });

  it('adds source_product filter when provided', async () => {
    const chain = makeChain({ data: null, error: null });
    const eqSpy = vi.fn(() => chain);
    chain['eq'] = eqSpy;
    chain['delete'] = vi.fn(() => chain);
    mockFrom.mockReturnValue(chain);

    await deleteUserContext('user-001', 'positioning_strategy', 'resume');

    expect(eqSpy).toHaveBeenCalledWith('source_product', 'resume');
  });

  it('does not add source_product filter when not provided', async () => {
    const chain = makeChain({ data: null, error: null });
    const eqSpy = vi.fn(() => chain);
    chain['eq'] = eqSpy;
    chain['delete'] = vi.fn(() => chain);
    mockFrom.mockReturnValue(chain);

    await deleteUserContext('user-001', 'gap_analysis');

    const eqFields = (eqSpy.mock.calls as unknown[][]).map((c) => c[0]);
    expect(eqFields).not.toContain('source_product');
  });

  it('throws when the query returns an error', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'Permission denied' } }));

    await expect(deleteUserContext('user-001', 'positioning_strategy')).rejects.toThrow(
      'Failed to delete context: Permission denied',
    );
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

  it('returns empty array immediately when types is an empty array', async () => {
    const result = await listUserContextByType('user-001', []);

    expect(result).toEqual([]);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns empty array on Supabase error', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'Timeout' } }));

    const result = await listUserContextByType('user-001', ['evidence_item']);

    expect(result).toEqual([]);
  });

  it('returns empty array on unexpected exception', async () => {
    mockFrom.mockImplementation(() => {
      throw new Error('Unexpected');
    });

    const result = await listUserContextByType('user-001');

    expect(result).toEqual([]);
  });

  it('returns empty array when data is null without error', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }));

    const result = await listUserContextByType('user-999');

    expect(result).toEqual([]);
  });
});

// ─── upsertUserContext — Phase 2 context types ───────────────────────────────

describe('upsertUserContext — Phase 2 context types', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts benchmark_candidate as a valid context type', async () => {
    const row = makeSampleRow({ context_type: 'benchmark_candidate', version: 1 });
    mockRpc.mockResolvedValue({ data: [row], error: null });

    const result = await upsertUserContext(
      'user-1',
      'benchmark_candidate',
      { ideal_profile: 'CTO with cloud expertise' },
      'resume',
      'session-1',
    );

    expect(result).not.toBeNull();
    expect(result?.context_type).toBe('benchmark_candidate');
  });

  it('accepts gap_analysis as a valid context type', async () => {
    const row = makeSampleRow({ context_type: 'gap_analysis', version: 1 });
    mockRpc.mockResolvedValue({ data: [row], error: null });

    const result = await upsertUserContext(
      'user-1',
      'gap_analysis',
      { coverage_score: 85, why_me: [{ reason: 'P&L', evidence: '$50M budget' }], why_not_me: [] },
      'resume',
      'session-1',
    );

    expect(result).not.toBeNull();
    expect(result?.context_type).toBe('gap_analysis');
  });

  it('accepts industry_research as a valid context type', async () => {
    const row = makeSampleRow({ context_type: 'industry_research', version: 1 });
    mockRpc.mockResolvedValue({ data: [row], error: null });

    const result = await upsertUserContext(
      'user-1',
      'industry_research',
      { role_title: 'VP Engineering', company: 'TechCorp', must_haves: ['leadership'] },
      'resume',
      'session-1',
    );

    expect(result).not.toBeNull();
    expect(result?.context_type).toBe('industry_research');
  });
});

// ─── upsertUserContext — Phase 3 context types ───────────────────────────────

describe('upsertUserContext — Phase 3 context types', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts job_discovery_results as a valid context type', async () => {
    const row = makeSampleRow({ context_type: 'job_discovery_results', version: 1 });
    mockRpc.mockResolvedValue({ data: [row], error: null });

    const result = await upsertUserContext(
      'user-1',
      'job_discovery_results',
      { matches: [{ title: 'VP Eng', company: 'Acme', score: 92 }] },
      'job-finder',
      'session-1',
    );

    expect(result).not.toBeNull();
    expect(result?.context_type).toBe('job_discovery_results');
  });

  it('accepts content_post as a valid context type', async () => {
    const row = makeSampleRow({ context_type: 'content_post', version: 1 });
    mockRpc.mockResolvedValue({ data: [row], error: null });

    const result = await upsertUserContext(
      'user-1',
      'content_post',
      { topic: 'Leadership lessons from scaling teams', platform: 'linkedin' },
      'linkedin-content',
      'session-1',
    );

    expect(result).not.toBeNull();
    expect(result?.context_type).toBe('content_post');
  });
});

// ─── upsertUserContext — concurrent upsert safety ────────────────────────────

describe('upsertUserContext — concurrent upsert', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('concurrent upserts both resolve without error', async () => {
    const row1 = makeSampleRow({ version: 1 });
    const row2 = makeSampleRow({ version: 2 });

    mockRpc
      .mockResolvedValueOnce({ data: [row1], error: null })
      .mockResolvedValueOnce({ data: [row2], error: null });

    const [result1, result2] = await Promise.all([
      upsertUserContext('user-001', 'positioning_strategy', { v: 1 }, 'resume', 'sess-1'),
      upsertUserContext('user-001', 'positioning_strategy', { v: 2 }, 'resume', 'sess-2'),
    ]);

    expect(result1).not.toBeNull();
    expect(result2).not.toBeNull();
    expect(mockRpc).toHaveBeenCalledTimes(2);
  });
});
