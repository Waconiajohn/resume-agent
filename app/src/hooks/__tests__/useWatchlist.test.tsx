// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWatchlist } from '../useWatchlist';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      }),
    },
  },
}));

vi.mock('@/lib/api', () => ({
  API_BASE: 'http://localhost:3001/api',
}));

describe('useWatchlist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('fetchCompanies sanitizes malformed company payloads', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            companies: [
              {
                id: 'c-1',
                name: 'Acme Corp',
                industry: 'Software',
                website: 'https://acme.test',
                careers_url: '',
                priority: '7',
                source: 'manual',
                notes: 42,
                created_at: '2026-03-01T00:00:00Z',
                updated_at: '2026-03-02T00:00:00Z',
              },
              {
                id: '',
                name: 'Broken Corp',
                priority: 2,
                source: 'manual',
                created_at: '2026-03-01T00:00:00Z',
                updated_at: '2026-03-02T00:00:00Z',
              },
            ],
          }),
      }),
    );

    const { result } = renderHook(() => useWatchlist());

    await act(async () => {
      await result.current.fetchCompanies();
    });

    expect(result.current.companies).toEqual([
      {
        id: 'c-1',
        name: 'Acme Corp',
        industry: 'Software',
        website: 'https://acme.test',
        careers_url: null,
        priority: 5,
        source: 'manual',
        notes: '42',
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-02T00:00:00Z',
      },
    ]);
  });

  it('addCompany removes the optimistic company when the API payload is malformed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'broken' }),
      }),
    );

    const { result } = renderHook(() => useWatchlist());

    let created = null;
    await act(async () => {
      created = await result.current.addCompany({ name: 'Acme Corp', priority: 3 });
    });

    expect(created).toBeNull();
    expect(result.current.companies).toEqual([]);
  });

  it('updateCompany returns null when the API payload is malformed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'c-1' }),
      }),
    );

    const { result } = renderHook(() => useWatchlist());

    let updated = {} as unknown;
    await act(async () => {
      updated = await result.current.updateCompany('c-1', { priority: 4 });
    });

    expect(updated).toBeNull();
    expect(result.current.companies).toEqual([]);
  });
});
