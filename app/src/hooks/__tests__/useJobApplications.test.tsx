// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useJobApplications, type JobApplication } from '../useJobApplications';

vi.mock('@/lib/api', () => ({
  API_BASE: 'http://localhost:3001/api',
}));

const mockUseAuth = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

function makeApplication(overrides: Partial<JobApplication> = {}): JobApplication {
  return {
    id: 'app-1',
    role_title: 'VP Operations',
    company_name: 'Acme Corp',
    stage: 'saved',
    archived_at: null,
    created_at: '2026-04-29T12:00:00Z',
    updated_at: '2026-04-29T12:00:00Z',
    ...overrides,
  };
}

describe('useJobApplications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    mockUseAuth.mockReturnValue({
      session: { access_token: 'test-token' },
    });
  });

  it('surfaces list failures instead of treating applications as empty', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Could not load applications.' }), { status: 500 }),
    );

    const { result } = renderHook(() => useJobApplications());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.applications).toEqual([]);
    expect(result.current.error).toBe('Could not load applications.');
    expect(result.current.getLastError()).toBe('Could not load applications.');
  });

  it('reverts optimistic stage moves and surfaces the API error', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ applications: [makeApplication()], count: 1 }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Could not update stage.' }), { status: 500 }),
      );

    const { result } = renderHook(() => useJobApplications());

    await waitFor(() => expect(result.current.applications).toHaveLength(1));

    let moved = true;
    await act(async () => {
      moved = await result.current.moveToStage('app-1', 'applied');
    });

    expect(moved).toBe(false);
    expect(result.current.applications[0].stage).toBe('saved');
    expect(result.current.error).toBe('Could not update stage.');
    expect(result.current.getLastError()).toBe('Could not update stage.');
  });
});
