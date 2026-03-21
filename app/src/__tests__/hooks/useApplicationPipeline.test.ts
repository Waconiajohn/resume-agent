/**
 * useApplicationPipeline — Hook tests.
 *
 * Validates CRUD operations, optimistic updates, and error handling.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useApplicationPipeline } from '@/hooks/useApplicationPipeline';
import type { Application, PipelineStage } from '@/hooks/useApplicationPipeline';

// ─── Mocks ──────────────────────────────────────────────────────────

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

// ─── Helpers ────────────────────────────────────────────────────────

function makeApplication(overrides: Partial<Application> = {}): Application {
  return {
    id: 'app-1',
    role_title: 'VP Operations',
    company_name: 'Acme Corp',
    stage: 'applied',
    source: 'linkedin',
    stage_history: [{ stage: 'saved', at: '2026-03-01T00:00:00Z' }],
    created_at: '2026-03-01T00:00:00Z',
    updated_at: '2026-03-01T00:00:00Z',
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('useApplicationPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('starts with correct initial state', () => {
    const { result } = renderHook(() => useApplicationPipeline());
    expect(result.current.applications).toEqual([]);
    expect(result.current.dueActions).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('exposes all required methods', () => {
    const { result } = renderHook(() => useApplicationPipeline());
    expect(typeof result.current.fetchApplications).toBe('function');
    expect(typeof result.current.fetchDueActions).toBe('function');
    expect(typeof result.current.createApplication).toBe('function');
    expect(typeof result.current.updateApplication).toBe('function');
    expect(typeof result.current.moveToStage).toBe('function');
    expect(typeof result.current.deleteApplication).toBe('function');
    expect(typeof result.current.refresh).toBe('function');
  });

  it('fetchApplications sets loading then resolves with data', async () => {
    const apps = [makeApplication()];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ applications: apps }),
      }),
    );

    const { result } = renderHook(() => useApplicationPipeline());

    await act(async () => {
      await result.current.fetchApplications();
    });

    expect(result.current.applications).toEqual(apps);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('fetchApplications passes stage query param when provided', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ applications: [] }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { result } = renderHook(() => useApplicationPipeline());

    await act(async () => {
      await result.current.fetchApplications('applied');
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/applications?stage=applied',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer test-token' }) }),
    );
  });

  it('fetchApplications sets error on non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      }),
    );

    const { result } = renderHook(() => useApplicationPipeline());

    await act(async () => {
      await result.current.fetchApplications();
    });

    expect(result.current.error).toContain('500');
    expect(result.current.loading).toBe(false);
  });

  it('fetchApplications sets error when not authenticated', async () => {
    const { supabase } = await import('@/lib/supabase');
    (supabase.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { session: null },
    });

    const { result } = renderHook(() => useApplicationPipeline());

    await act(async () => {
      await result.current.fetchApplications();
    });

    expect(result.current.error).toContain('authenticated');
  });

  it('fetchApplications sanitizes malformed application payloads', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            applications: [
              {
                id: 'app-1',
                role_title: 'VP Operations',
                company_name: 'Acme Corp',
                stage: 'applied',
                source: 'linkedin',
                stage_history: [{ stage: 'saved', at: '2026-03-01T00:00:00Z' }, { stage: '', at: '' }],
                score: '91',
                created_at: '2026-03-01T00:00:00Z',
                updated_at: '2026-03-02T00:00:00Z',
              },
              {
                id: '',
                role_title: 'Broken',
                company_name: 'Missing Id',
                stage: 'applied',
                source: 'linkedin',
                stage_history: [],
                created_at: '2026-03-01T00:00:00Z',
                updated_at: '2026-03-01T00:00:00Z',
              },
            ],
          }),
      }),
    );

    const { result } = renderHook(() => useApplicationPipeline());

    await act(async () => {
      await result.current.fetchApplications();
    });

    expect(result.current.applications).toHaveLength(1);
    expect(result.current.applications[0]).toMatchObject({
      id: 'app-1',
      score: 91,
      stage: 'applied',
    });
    expect(result.current.applications[0].stage_history).toEqual([
      { stage: 'saved', at: '2026-03-01T00:00:00Z' },
    ]);
  });

  it('moveToStage applies optimistic update immediately', async () => {
    const app = makeApplication({ id: 'app-1', stage: 'saved' });
    vi.stubGlobal(
      'fetch',
      vi.fn()
        // First call: fetchApplications to seed state
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ applications: [app] }) })
        // Second call: moveToStage PATCH
        .mockResolvedValueOnce({ ok: true }),
    );

    const { result } = renderHook(() => useApplicationPipeline());

    // Seed applications
    await act(async () => {
      await result.current.fetchApplications();
    });
    expect(result.current.applications[0].stage).toBe('saved');

    // Move to 'applied' — optimistic update should fire before await resolves
    await act(async () => {
      await result.current.moveToStage('app-1', 'applied');
    });

    expect(result.current.applications[0].stage).toBe('applied');
  });

  it('moveToStage reverts optimistic update on API failure', async () => {
    const app = makeApplication({ id: 'app-1', stage: 'saved' });
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ applications: [app] }) })
        .mockResolvedValueOnce({ ok: false, status: 500 }),
    );

    const { result } = renderHook(() => useApplicationPipeline());

    await act(async () => {
      await result.current.fetchApplications();
    });

    let success = true;
    await act(async () => {
      success = await result.current.moveToStage('app-1', 'applied');
    });

    expect(success).toBe(false);
    expect(result.current.applications[0].stage).toBe('saved');
  });

  it('moveToStage returns false and reverts when not authenticated', async () => {
    const app = makeApplication({ id: 'app-1', stage: 'saved' });
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ applications: [app] }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { supabase } = await import('@/lib/supabase');

    const { result } = renderHook(() => useApplicationPipeline());

    await act(async () => {
      await result.current.fetchApplications();
    });

    // Make getSession return null token for the moveToStage call
    (supabase.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { session: null },
    });

    let success = true;
    await act(async () => {
      success = await result.current.moveToStage('app-1', 'interviewing');
    });

    expect(success).toBe(false);
    expect(result.current.applications[0].stage).toBe('saved');
  });

  it('createApplication appends new application to list', async () => {
    const created = makeApplication({ id: 'new-app', role_title: 'COO', stage: 'saved' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(created),
      }),
    );

    const { result } = renderHook(() => useApplicationPipeline());

    let returned: Application | null = null;
    await act(async () => {
      returned = await result.current.createApplication({ role_title: 'COO', stage: 'saved' });
    });

    expect(returned).toEqual(created);
    expect(result.current.applications).toHaveLength(1);
    expect(result.current.applications[0].id).toBe('new-app');
  });

  it('createApplication returns null when the API payload is malformed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'broken-app', role_title: 'COO' }),
      }),
    );

    const { result } = renderHook(() => useApplicationPipeline());

    let returned: Application | null = makeApplication();
    await act(async () => {
      returned = await result.current.createApplication({ role_title: 'COO' });
    });

    expect(returned).toBeNull();
    expect(result.current.applications).toEqual([]);
  });

  it('createApplication returns null on API failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({ ok: false, status: 400 }),
    );

    const { result } = renderHook(() => useApplicationPipeline());

    let returned: Application | null = makeApplication();
    await act(async () => {
      returned = await result.current.createApplication({ role_title: 'COO' });
    });

    expect(returned).toBeNull();
  });

  it('deleteApplication removes application from list', async () => {
    const app = makeApplication({ id: 'app-1' });
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ applications: [app] }) })
        .mockResolvedValueOnce({ ok: true }),
    );

    const { result } = renderHook(() => useApplicationPipeline());

    await act(async () => {
      await result.current.fetchApplications();
    });

    let success = false;
    await act(async () => {
      success = await result.current.deleteApplication('app-1');
    });

    expect(success).toBe(true);
    expect(result.current.applications).toHaveLength(0);
  });

  it('deleteApplication returns false on API failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({ ok: false, status: 500 }),
    );

    const { result } = renderHook(() => useApplicationPipeline());

    let success = true;
    await act(async () => {
      success = await result.current.deleteApplication('app-1');
    });

    expect(success).toBe(false);
  });

  it('updateApplication replaces the matching application in list', async () => {
    const original = makeApplication({ id: 'app-1', role_title: 'VP Operations' });
    const updated = makeApplication({ id: 'app-1', role_title: 'SVP Operations' });

    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ applications: [original] }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(updated) }),
    );

    const { result } = renderHook(() => useApplicationPipeline());

    await act(async () => {
      await result.current.fetchApplications();
    });

    await act(async () => {
      await result.current.updateApplication('app-1', { role_title: 'SVP Operations' });
    });

    expect(result.current.applications[0].role_title).toBe('SVP Operations');
  });

  it('fetchDueActions sanitizes malformed action payloads', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            actions: [
              {
                id: 'due-1',
                role_title: 'VP Operations',
                company_name: 'Acme Corp',
                next_action: 'Send follow-up',
                next_action_due: '2026-03-25',
                stage: 'interviewing',
              },
              {
                id: 'due-2',
                role_title: '',
                company_name: 'Broken Corp',
                next_action: 'Call recruiter',
                next_action_due: '2026-03-26',
                stage: 'interviewing',
              },
            ],
          }),
      }),
    );

    const { result } = renderHook(() => useApplicationPipeline());

    await act(async () => {
      await result.current.fetchDueActions();
    });

    expect(result.current.dueActions).toEqual([
      {
        id: 'due-1',
        role_title: 'VP Operations',
        company_name: 'Acme Corp',
        next_action: 'Send follow-up',
        next_action_due: '2026-03-25',
        stage: 'interviewing',
      },
    ]);
  });

  it('all PipelineStage values are valid', () => {
    const stages: PipelineStage[] = [
      'saved',
      'researching',
      'applied',
      'screening',
      'interviewing',
      'offer',
      'closed_won',
      'closed_lost',
    ];
    expect(stages).toHaveLength(8);
  });
});
