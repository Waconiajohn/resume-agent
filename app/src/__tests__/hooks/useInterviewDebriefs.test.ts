// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Mock supabase before importing the hook
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

import { useInterviewDebriefs } from '@/hooks/useInterviewDebriefs';
import type { InterviewDebrief } from '@/hooks/useInterviewDebriefs';

const MOCK_DEBRIEF: InterviewDebrief = {
  id: 'debrief-1',
  user_id: 'user-1',
  company_name: 'Acme Corp',
  role_title: 'VP Engineering',
  interview_date: '2026-03-07',
  interview_type: 'video',
  overall_impression: 'positive',
  what_went_well: 'Great rapport',
  what_went_poorly: 'Stumbled on metrics question',
  questions_asked: ['Tell me about yourself'],
  interviewer_notes: [{ name: 'Jane Smith', title: 'CTO' }],
  company_signals: 'Hiring freeze expected in Q3',
  follow_up_actions: 'Send thank you note by EOD',
  created_at: '2026-03-07T10:00:00Z',
  updated_at: '2026-03-07T10:00:00Z',
};

function makeFetchOk(response: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(response),
    text: () => Promise.resolve(JSON.stringify(response)),
  });
}

function makeFetchFail(status = 500, body = 'Internal Server Error') {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({ error: body }),
    text: () => Promise.resolve(body),
  });
}

beforeEach(() => {
  // Default: fetch returns empty array (safe baseline for all tests)
  vi.stubGlobal('fetch', makeFetchOk([]));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useInterviewDebriefs', () => {
  it('starts with empty debriefs and loading=true (refresh fires on mount)', async () => {
    const { result } = renderHook(() => useInterviewDebriefs());

    // The hook calls refresh() via useEffect on mount, so loading starts as true.
    expect(result.current.debriefs).toEqual([]);
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();

    // After the mount refresh completes (fetch returns []), loading settles to false.
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.debriefs).toEqual([]);
  });

  it('refresh fetches debriefs from the correct endpoint', async () => {
    const fetchMock = makeFetchOk([MOCK_DEBRIEF]);
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useInterviewDebriefs());

    await act(async () => {
      await result.current.refresh();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/interview-debriefs',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      }),
    );
    expect(result.current.debriefs).toHaveLength(1);
    expect(result.current.debriefs[0].id).toBe('debrief-1');
  });

  it('drops malformed fetched debriefs and sanitizes nested arrays', async () => {
    const fetchMock = makeFetchOk({
      debriefs: [
        MOCK_DEBRIEF,
        { id: 'broken-only' },
        {
          ...MOCK_DEBRIEF,
          id: 'debrief-2',
          interview_type: 'panel',
          overall_impression: 'great',
          questions_asked: ['Tell me about yourself', '', 42],
          interviewer_notes: [
            { name: ' Jane Smith ', title: ' CTO ', topics_discussed: ['Leadership', '', 1], rapport_notes: ' Strong rapport ' },
            { title: 'Missing name' },
          ],
          follow_up_actions: '  Send note tomorrow  ',
        },
      ],
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useInterviewDebriefs());

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.debriefs).toHaveLength(2);
    expect(result.current.debriefs[1].interview_type).toBeUndefined();
    expect(result.current.debriefs[1].overall_impression).toBeUndefined();
    expect(result.current.debriefs[1].questions_asked).toEqual(['Tell me about yourself']);
    expect(result.current.debriefs[1].interviewer_notes).toEqual([
      {
        name: 'Jane Smith',
        title: 'CTO',
        topics_discussed: ['Leadership'],
        rapport_notes: 'Strong rapport',
      },
    ]);
    expect(result.current.debriefs[1].follow_up_actions).toBe('Send note tomorrow');
  });

  it('sets loading=true during refresh and resets to false on completion', async () => {
    const fetchMock = makeFetchOk([MOCK_DEBRIEF]);
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useInterviewDebriefs());

    await act(async () => {
      await result.current.refresh();
    });

    // After refresh, loading is false and debriefs are populated
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.debriefs).toHaveLength(1);
    });
  });

  it('createDebrief sends POST to the correct endpoint and updates state', async () => {
    const fetchMock = makeFetchOk(MOCK_DEBRIEF);
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useInterviewDebriefs());

    const { id: _id, user_id: _uid, created_at: _ca, updated_at: _ua, ...payload } = MOCK_DEBRIEF;

    let created: InterviewDebrief | null = null;
    await act(async () => {
      created = await result.current.createDebrief(payload);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/interview-debriefs',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: expect.stringContaining('Acme Corp'),
      }),
    );
    expect(created).not.toBeNull();
    expect(created!.id).toBe('debrief-1');
    expect(result.current.debriefs).toHaveLength(1);
  });

  it('returns null and does not add a debrief when POST returns malformed data', async () => {
    const fetchMock = makeFetchOk({ id: 'broken-debrief' });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useInterviewDebriefs());

    const { id: _id, user_id: _uid, created_at: _ca, updated_at: _ua, ...payload } = MOCK_DEBRIEF;

    let created: InterviewDebrief | null = null;
    await act(async () => {
      created = await result.current.createDebrief(payload);
    });

    expect(created).toBeNull();
    expect(result.current.debriefs).toHaveLength(0);
  });

  it('updateDebrief sends PATCH to the correct endpoint and updates state', async () => {
    // First render with seed data already in state via refresh
    vi.stubGlobal('fetch', makeFetchOk([MOCK_DEBRIEF]));
    const { result } = renderHook(() => useInterviewDebriefs());

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.debriefs).toHaveLength(1);

    // Now stub PATCH response
    const updatedDebrief = { ...MOCK_DEBRIEF, what_went_well: 'Even better' };
    const patchMock = makeFetchOk(updatedDebrief);
    vi.stubGlobal('fetch', patchMock);

    await act(async () => {
      await result.current.updateDebrief('debrief-1', { what_went_well: 'Even better' });
    });

    expect(patchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/interview-debriefs/debrief-1',
      expect.objectContaining({
        method: 'PATCH',
        body: expect.stringContaining('Even better'),
      }),
    );
    expect(result.current.debriefs[0].what_went_well).toBe('Even better');
  });

  it('ignores malformed PATCH responses and preserves the previous debrief', async () => {
    vi.stubGlobal('fetch', makeFetchOk([MOCK_DEBRIEF]));
    const { result } = renderHook(() => useInterviewDebriefs());

    await act(async () => {
      await result.current.refresh();
    });

    const patchMock = makeFetchOk({ id: 'debrief-1' });
    vi.stubGlobal('fetch', patchMock);

    await act(async () => {
      await result.current.updateDebrief('debrief-1', { what_went_well: 'Even better' });
    });

    expect(result.current.debriefs[0].what_went_well).toBe('Great rapport');
  });

  it('deleteDebrief sends DELETE to the correct endpoint and removes from state', async () => {
    // Seed state via refresh
    vi.stubGlobal('fetch', makeFetchOk([MOCK_DEBRIEF]));
    const { result } = renderHook(() => useInterviewDebriefs());

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.debriefs).toHaveLength(1);

    // Now stub DELETE response
    const deleteMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(null) });
    vi.stubGlobal('fetch', deleteMock);

    await act(async () => {
      await result.current.deleteDebrief('debrief-1');
    });

    expect(deleteMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/interview-debriefs/debrief-1',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(result.current.debriefs).toHaveLength(0);
  });

  it('sets error state when refresh request fails', async () => {
    vi.stubGlobal('fetch', makeFetchFail(500, 'Internal Server Error'));

    const { result } = renderHook(() => useInterviewDebriefs());

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.error).toContain('500');
    expect(result.current.debriefs).toHaveLength(0);
  });

  it('returns null from createDebrief when request fails', async () => {
    vi.stubGlobal('fetch', makeFetchFail(400, 'Bad Request'));

    const { result } = renderHook(() => useInterviewDebriefs());

    const { id: _id, user_id: _uid, created_at: _ca, updated_at: _ua, ...payload } = MOCK_DEBRIEF;

    let created: InterviewDebrief | null = null;
    await act(async () => {
      created = await result.current.createDebrief(payload);
    });

    expect(created).toBeNull();
    expect(result.current.debriefs).toHaveLength(0);
  });

  it('sets error when not authenticated', async () => {
    const { supabase: mockSupabase } = await import('@/lib/supabase');
    vi.mocked(mockSupabase.auth.getSession).mockResolvedValueOnce({
      data: { session: null },
    } as never);

    const { result } = renderHook(() => useInterviewDebriefs());

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.error).toBe('Not authenticated');
  });
});
