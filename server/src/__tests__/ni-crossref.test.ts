/**
 * NI Cross-Reference Tests — crossReferenceWithNetwork
 *
 * Sprint 59, Story: Job Command Center — Network Intelligence enrichment.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks — hoisted before imports ──────────────────────────────────────────

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

import { crossReferenceWithNetwork } from '../lib/job-search/ni-crossref.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildConnectionsChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  chain['select'] = vi.fn().mockReturnValue(chain);
  chain['eq'] = vi.fn().mockReturnValue(chain);
  // Supabase resolves at the end of the chain via thenable
  Object.defineProperty(chain, 'then', {
    value: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject),
  });
  return chain;
}

function makeJob(externalId: string, company: string) {
  return { external_id: externalId, company };
}

function makeConnection(overrides: Partial<{
  id: string;
  first_name: string;
  last_name: string;
  position: string | null;
  company_raw: string;
}> = {}) {
  return {
    id: 'conn-001',
    first_name: 'Jane',
    last_name: 'Smith',
    position: 'VP of Engineering',
    company_raw: 'Acme Corp',
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe('crossReferenceWithNetwork — empty inputs', () => {
  it('returns empty map when jobs array is empty', async () => {
    const result = await crossReferenceWithNetwork('user-1', []);
    expect(result.size).toBe(0);
    // Should not query DB at all
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns empty map when no connections found for user', async () => {
    mockFrom.mockReturnValueOnce(
      buildConnectionsChain({ data: [], error: null }),
    );

    const result = await crossReferenceWithNetwork('user-1', [
      makeJob('ext-1', 'Acme Corp'),
    ]);

    expect(result.size).toBe(0);
  });

  it('returns empty map when connections is null', async () => {
    mockFrom.mockReturnValueOnce(
      buildConnectionsChain({ data: null, error: null }),
    );

    const result = await crossReferenceWithNetwork('user-1', [
      makeJob('ext-1', 'Acme Corp'),
    ]);

    expect(result.size).toBe(0);
  });
});

describe('crossReferenceWithNetwork — matching', () => {
  it('matches jobs to contacts by company name (case-insensitive)', async () => {
    mockFrom.mockReturnValueOnce(
      buildConnectionsChain({
        data: [makeConnection({ company_raw: 'ACME CORP' })],
        error: null,
      }),
    );

    const result = await crossReferenceWithNetwork('user-1', [
      makeJob('ext-1', 'acme corp'),
    ]);

    expect(result.size).toBe(1);
    expect(result.get('ext-1')).toHaveLength(1);
    expect(result.get('ext-1')![0].name).toBe('Jane Smith');
    expect(result.get('ext-1')![0].title).toBe('VP of Engineering');
    expect(result.get('ext-1')![0].company).toBe('ACME CORP');
  });

  it('maps multiple jobs at the same company to the same contacts', async () => {
    mockFrom.mockReturnValueOnce(
      buildConnectionsChain({
        data: [makeConnection({ company_raw: 'Acme Corp' })],
        error: null,
      }),
    );

    const result = await crossReferenceWithNetwork('user-1', [
      makeJob('ext-1', 'Acme Corp'),
      makeJob('ext-2', 'Acme Corp'),
    ]);

    expect(result.size).toBe(2);
    expect(result.get('ext-1')).toHaveLength(1);
    expect(result.get('ext-2')).toHaveLength(1);
    expect(result.get('ext-1')![0].id).toBe(result.get('ext-2')![0].id);
  });

  it('does not include jobs whose company has no matching contact', async () => {
    mockFrom.mockReturnValueOnce(
      buildConnectionsChain({
        data: [makeConnection({ company_raw: 'Acme Corp' })],
        error: null,
      }),
    );

    const result = await crossReferenceWithNetwork('user-1', [
      makeJob('ext-1', 'Acme Corp'),
      makeJob('ext-2', 'Other Corp'),
    ]);

    expect(result.has('ext-1')).toBe(true);
    expect(result.has('ext-2')).toBe(false);
  });

  it('builds contact name from first_name and last_name', async () => {
    mockFrom.mockReturnValueOnce(
      buildConnectionsChain({
        data: [makeConnection({ first_name: 'John', last_name: 'Doe', company_raw: 'Acme Corp' })],
        error: null,
      }),
    );

    const result = await crossReferenceWithNetwork('user-1', [makeJob('ext-1', 'Acme Corp')]);

    expect(result.get('ext-1')![0].name).toBe('John Doe');
  });

  it('uses "Unknown" as name when first and last name are empty', async () => {
    mockFrom.mockReturnValueOnce(
      buildConnectionsChain({
        data: [makeConnection({ first_name: '', last_name: '', company_raw: 'Acme Corp' })],
        error: null,
      }),
    );

    const result = await crossReferenceWithNetwork('user-1', [makeJob('ext-1', 'Acme Corp')]);

    expect(result.get('ext-1')![0].name).toBe('Unknown');
  });

  it('sets title to null when position is null', async () => {
    mockFrom.mockReturnValueOnce(
      buildConnectionsChain({
        data: [makeConnection({ position: null, company_raw: 'Acme Corp' })],
        error: null,
      }),
    );

    const result = await crossReferenceWithNetwork('user-1', [makeJob('ext-1', 'Acme Corp')]);

    expect(result.get('ext-1')![0].title).toBeNull();
  });
});

describe('crossReferenceWithNetwork — edge cases and error handling', () => {
  it('handles DB error gracefully by returning empty map', async () => {
    mockFrom.mockReturnValueOnce(
      buildConnectionsChain({ data: null, error: { message: 'connection refused' } }),
    );

    const result = await crossReferenceWithNetwork('user-1', [
      makeJob('ext-1', 'Acme Corp'),
    ]);

    expect(result.size).toBe(0);
  });

  it('ignores connections with empty company_raw', async () => {
    mockFrom.mockReturnValueOnce(
      buildConnectionsChain({
        data: [
          makeConnection({ company_raw: '', id: 'conn-no-company' }),
          makeConnection({ company_raw: 'Acme Corp', id: 'conn-valid' }),
        ],
        error: null,
      }),
    );

    const result = await crossReferenceWithNetwork('user-1', [
      makeJob('ext-1', 'Acme Corp'),
    ]);

    // Only the valid connection should match
    expect(result.get('ext-1')).toHaveLength(1);
    expect(result.get('ext-1')![0].id).toBe('conn-valid');
  });

  it('returns empty map when all jobs have empty company string', async () => {
    const result = await crossReferenceWithNetwork('user-1', [
      makeJob('ext-1', ''),
      makeJob('ext-2', '   '),
    ]);

    // companyMap will be empty after normalization, so DB never queried
    expect(result.size).toBe(0);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('handles unexpected thrown error gracefully', async () => {
    mockFrom.mockImplementationOnce(() => {
      throw new Error('unexpected crash');
    });

    const result = await crossReferenceWithNetwork('user-1', [
      makeJob('ext-1', 'Acme Corp'),
    ]);

    expect(result.size).toBe(0);
  });
});
