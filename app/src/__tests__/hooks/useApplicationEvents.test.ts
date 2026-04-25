/**
 * useApplicationEvents — Phase 1 hook tests.
 *
 * Covers:
 *  - Auto-fetch on applicationId change
 *  - skip option suppresses auto-fetch
 *  - recordApplied posts the right body
 *  - recordInterviewHappened posts the right body
 *  - hasEvent / latestEvent helpers
 *  - State updates locally on successful record
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useApplicationEvents } from '@/hooks/useApplicationEvents';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      }),
    },
  },
}));

vi.mock('@/lib/api', () => ({ API_BASE: 'http://localhost:3001/api' }));

const APP_ID = '11111111-1111-4111-8111-111111111111';

function eventRow(type: 'applied' | 'interview_happened' | 'offer_received', overrides: Record<string, unknown> = {}) {
  const occurredAt = (overrides.occurred_at as string | undefined) ?? new Date().toISOString();
  const metadata =
    type === 'applied'
      ? { type, applied_via: 'manual' }
      : type === 'interview_happened'
        ? { type, interview_date: '2026-04-22', interview_type: 'video' }
        : { type };
  return {
    id: `evt-${Math.random().toString(36).slice(2, 8)}`,
    user_id: 'user-abc',
    job_application_id: APP_ID,
    type,
    occurred_at: occurredAt,
    metadata,
    created_at: occurredAt,
    ...overrides,
  };
}

describe('useApplicationEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('starts empty and not loading when applicationId is undefined', () => {
    const { result } = renderHook(() => useApplicationEvents({}));
    expect(result.current.events).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('auto-fetches events on mount when applicationId is provided', async () => {
    const events = [eventRow('applied'), eventRow('interview_happened')];
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ events, count: events.length }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { result } = renderHook(() => useApplicationEvents({ applicationId: APP_ID }));
    await waitFor(() => expect(result.current.events).toHaveLength(2));

    expect(mockFetch).toHaveBeenCalledWith(
      `http://localhost:3001/api/job-applications/${encodeURIComponent(APP_ID)}/events`,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      }),
    );
  });

  it('skip suppresses auto-fetch', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ events: [], count: 0 }),
    });
    vi.stubGlobal('fetch', mockFetch);

    renderHook(() => useApplicationEvents({ applicationId: APP_ID, skip: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('hasEvent and latestEvent reflect loaded events', async () => {
    const applied = eventRow('applied');
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ events: [applied], count: 1 }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { result } = renderHook(() => useApplicationEvents({ applicationId: APP_ID }));
    await waitFor(() => expect(result.current.events).toHaveLength(1));

    expect(result.current.hasEvent('applied')).toBe(true);
    expect(result.current.hasEvent('interview_happened')).toBe(false);
    expect(result.current.latestEvent('applied')?.id).toBe(applied.id);
  });

  it('recordApplied POSTs the right body and updates local state', async () => {
    const newEvent = eventRow('applied', { id: 'evt-new' });
    const mockFetch = vi.fn()
      // initial GET
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ events: [], count: 0 }) })
      // POST
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ event: newEvent, deduplicated: false }) });
    vi.stubGlobal('fetch', mockFetch);

    const { result } = renderHook(() => useApplicationEvents({ applicationId: APP_ID }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.recordApplied({
        applicationId: APP_ID,
        resumeSessionId: '22222222-2222-4222-8222-222222222222',
      });
    });

    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      `http://localhost:3001/api/job-applications/${encodeURIComponent(APP_ID)}/events`,
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"applied_via":"manual"'),
      }),
    );
    const postCall = mockFetch.mock.calls[1];
    const body = JSON.parse(postCall[1].body);
    expect(body.type).toBe('applied');
    expect(body.metadata).toEqual(
      expect.objectContaining({
        type: 'applied',
        applied_via: 'manual',
        resume_session_id: '22222222-2222-4222-8222-222222222222',
      }),
    );
    await waitFor(() => expect(result.current.events).toHaveLength(1));
    expect(result.current.hasEvent('applied')).toBe(true);
  });

  it('recordInterviewHappened POSTs the right body', async () => {
    const newEvent = eventRow('interview_happened', { id: 'evt-int' });
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ events: [], count: 0 }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ event: newEvent, deduplicated: false }) });
    vi.stubGlobal('fetch', mockFetch);

    const { result } = renderHook(() => useApplicationEvents({ applicationId: APP_ID }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.recordInterviewHappened({
        applicationId: APP_ID,
        interviewDate: '2026-04-22',
        interviewType: 'onsite',
      });
    });

    const postCall = mockFetch.mock.calls[1];
    const body = JSON.parse(postCall[1].body);
    expect(body.type).toBe('interview_happened');
    expect(body.metadata).toEqual(
      expect.objectContaining({
        type: 'interview_happened',
        interview_date: '2026-04-22',
        interview_type: 'onsite',
      }),
    );
  });

  it('sets error on failed POST and does not throw', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ events: [], count: 0 }) })
      .mockResolvedValueOnce({ ok: false, status: 400 });
    vi.stubGlobal('fetch', mockFetch);

    const { result } = renderHook(() => useApplicationEvents({ applicationId: APP_ID }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    let outcome: unknown = 'unset';
    await act(async () => {
      outcome = await result.current.recordApplied({ applicationId: APP_ID });
    });

    expect(outcome).toBeNull();
    await waitFor(() => expect(result.current.error).toContain('400'));
  });
});
