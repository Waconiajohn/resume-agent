// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Hoist mock handles so they are available before vi.mock() factories run
// ---------------------------------------------------------------------------
const { mockGetUser, mockMaybeSingle } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockMaybeSingle: vi.fn(),
}));

// The hook calls:
//   supabase.from('coach_sessions')
//     .select('tailored_sections')
//     .eq('user_id', user.id)
//     .eq('pipeline_status', 'complete')
//     .order('created_at', { ascending: false })
//     .limit(1)
//     .maybeSingle()
//
// Every intermediate method must return `this` (the same chainable object)
// so the final .maybeSingle() call resolves.
vi.mock('@/lib/supabase', () => {
  const chainable: Record<string, unknown> = {};
  const methods = ['select', 'eq', 'order', 'limit'];
  for (const m of methods) {
    chainable[m] = vi.fn().mockReturnValue(chainable);
  }
  chainable['maybeSingle'] = mockMaybeSingle;

  return {
    supabase: {
      auth: { getUser: mockGetUser },
      from: vi.fn().mockReturnValue(chainable),
    },
  };
});

import { useNarrativeSnapshot } from '../useNarrativeSnapshot';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const USER = { id: 'user-test-123' };

const V2_TAILORED_SECTIONS = {
  pipeline_data: {
    narrativeStrategy: {
      branded_title: 'Transformation Architect',
      why_me_concise: 'I turn ambiguous mandates into measurable outcomes.',
      why_me_best_line: 'The person executives call when the program is already behind.',
      why_me_story: 'Long-form story here.',
      unique_differentiators: ['Cross-functional coordination', 'Stakeholder alignment'],
    },
  },
};

const LEGACY_TAILORED_SECTIONS = {
  narrative_strategy: {
    branded_title: 'Legacy VP of Engineering',
    why_me_concise: 'I ship at scale.',
    why_me_best_line: 'Best line from legacy session.',
    why_me_story: '',
    unique_differentiators: ['Technical depth'],
  },
};

const SNAKE_CASE_PIPELINE_DATA_SECTIONS = {
  pipeline_data: {
    narrative_strategy: {
      branded_title: 'Snake Case Leader',
      why_me_concise: 'Concise from snake_case path.',
      why_me_best_line: '',
      why_me_story: '',
      unique_differentiators: [],
    },
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function resolvedUser() {
  mockGetUser.mockResolvedValue({ data: { user: USER } });
}

function resolvedNoUser() {
  mockGetUser.mockResolvedValue({ data: { user: null } });
}

function resolvedSession(tailoredSections: unknown) {
  mockMaybeSingle.mockResolvedValue({
    data: { tailored_sections: tailoredSections },
    error: null,
  });
}

function resolvedNoSession() {
  mockMaybySingleReturnsNone();
}

function resolvedError() {
  mockMaybySingleReturnsError();
}

function mockMaybySingleReturnsNone() {
  mockMaybeSingle.mockResolvedValue({ data: null, error: null });
}

function mockMaybySingleReturnsError() {
  mockMaybeSingle.mockResolvedValue({
    data: null,
    error: { message: 'DB error', code: '500' },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('useNarrativeSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  // -------------------------------------------------------------------------
  // Case 1 — v2 format: pipeline_data.narrativeStrategy
  // -------------------------------------------------------------------------
  it('returns ready + snapshot when v2 session has narrativeStrategy in pipeline_data', async () => {
    resolvedUser();
    resolvedSession(V2_TAILORED_SECTIONS);

    const { result } = renderHook(() => useNarrativeSnapshot());

    // Initial state is loading
    expect(result.current.status).toBe('loading');

    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(result.current.snapshot).toEqual({
      branded_title: 'Transformation Architect',
      why_me_concise: 'I turn ambiguous mandates into measurable outcomes.',
      why_me_best_line: 'The person executives call when the program is already behind.',
      why_me_story: 'Long-form story here.',
      unique_differentiators: ['Cross-functional coordination', 'Stakeholder alignment'],
    });
  });

  // -------------------------------------------------------------------------
  // Case 2 — legacy format: tailored_sections.narrative_strategy at root
  // -------------------------------------------------------------------------
  it('returns ready + snapshot when legacy session has narrative_strategy at root of tailored_sections', async () => {
    resolvedUser();
    resolvedSession(LEGACY_TAILORED_SECTIONS);

    const { result } = renderHook(() => useNarrativeSnapshot());

    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(result.current.snapshot).not.toBeNull();
    expect(result.current.snapshot?.branded_title).toBe('Legacy VP of Engineering');
    expect(result.current.snapshot?.why_me_concise).toBe('I ship at scale.');
    expect(result.current.snapshot?.unique_differentiators).toEqual(['Technical depth']);
  });

  // -------------------------------------------------------------------------
  // Snake_case variant inside pipeline_data
  // -------------------------------------------------------------------------
  it('falls back to pipeline_data.narrative_strategy (snake_case) when narrativeStrategy key is absent', async () => {
    resolvedUser();
    resolvedSession(SNAKE_CASE_PIPELINE_DATA_SECTIONS);

    const { result } = renderHook(() => useNarrativeSnapshot());

    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(result.current.snapshot?.branded_title).toBe('Snake Case Leader');
    expect(result.current.snapshot?.why_me_concise).toBe('Concise from snake_case path.');
  });

  // -------------------------------------------------------------------------
  // Case 3 — no completed sessions
  // -------------------------------------------------------------------------
  it('returns none when no completed sessions exist (maybeSingle returns null data)', async () => {
    resolvedUser();
    resolvedNoSession();

    const { result } = renderHook(() => useNarrativeSnapshot());

    await waitFor(() => expect(result.current.status).toBe('none'));

    expect(result.current.snapshot).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Case 4 — tailored_sections is null
  // -------------------------------------------------------------------------
  it('returns none when tailored_sections is null on the returned row', async () => {
    resolvedUser();
    resolvedSession(null);

    const { result } = renderHook(() => useNarrativeSnapshot());

    await waitFor(() => expect(result.current.status).toBe('none'));

    expect(result.current.snapshot).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Case 5a — pipeline_data exists but narrativeStrategy is empty object
  // -------------------------------------------------------------------------
  it('returns none when pipeline_data.narrativeStrategy has no branded_title or why_me_concise', async () => {
    resolvedUser();
    resolvedSession({
      pipeline_data: {
        narrativeStrategy: {
          branded_title: '',
          why_me_concise: '',
          why_me_best_line: '',
          why_me_story: '',
          unique_differentiators: [],
        },
      },
    });

    const { result } = renderHook(() => useNarrativeSnapshot());

    await waitFor(() => expect(result.current.status).toBe('none'));

    expect(result.current.snapshot).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Case 5b — pipeline_data exists but narrativeStrategy key is missing entirely
  // -------------------------------------------------------------------------
  it('returns none when pipeline_data is present but has no narrative keys', async () => {
    resolvedUser();
    resolvedSession({
      pipeline_data: {
        someOtherKey: 'value',
      },
    });

    const { result } = renderHook(() => useNarrativeSnapshot());

    await waitFor(() => expect(result.current.status).toBe('none'));

    expect(result.current.snapshot).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Case 5c — branded_title absent but why_me_concise present (partial data)
  // -------------------------------------------------------------------------
  it('returns ready when only why_me_concise is present (branded_title is empty)', async () => {
    resolvedUser();
    resolvedSession({
      pipeline_data: {
        narrativeStrategy: {
          branded_title: '',
          why_me_concise: 'At least this field has content.',
          why_me_best_line: '',
          why_me_story: '',
          unique_differentiators: [],
        },
      },
    });

    const { result } = renderHook(() => useNarrativeSnapshot());

    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(result.current.snapshot?.branded_title).toBe('');
    expect(result.current.snapshot?.why_me_concise).toBe('At least this field has content.');
  });

  // -------------------------------------------------------------------------
  // Case 6 — pipeline_status filter: non-complete sessions must not appear
  //
  // The query includes .eq('pipeline_status', 'complete'). The filter is
  // enforced by Supabase server-side, so the hook never sees 'running' or
  // 'error' rows. We verify the hook passes the correct argument to the .eq()
  // chain by inspecting the mock call args.
  // -------------------------------------------------------------------------
  it('queries with pipeline_status = complete (not running or error)', async () => {
    resolvedUser();
    resolvedNoSession();

    const { supabase } = await import('@/lib/supabase');

    renderHook(() => useNarrativeSnapshot());

    // Wait for the async fetch to complete
    await waitFor(() => {
      // At least one eq call must have been made with pipeline_status=complete
      const fromMock = supabase.from as ReturnType<typeof vi.fn>;
      expect(fromMock).toHaveBeenCalledWith('coach_sessions');
    });

    // Retrieve the chainable object returned by from()
    const { supabase: sb } = await import('@/lib/supabase');
    const chainable = (sb.from as ReturnType<typeof vi.fn>).mock.results[0]?.value as Record<string, ReturnType<typeof vi.fn>>;

    // Confirm that one of the .eq() calls was for pipeline_status = 'complete'
    const eqCalls = chainable['eq'].mock.calls as [string, string][];
    const statusCall = eqCalls.find(([field, value]) => field === 'pipeline_status' && value === 'complete');
    expect(statusCall).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Case 6b — a 'running' session row would never appear because the query
  // filters it out. Simulate the Supabase layer correctly returning null
  // for a user who only has running/error sessions.
  // -------------------------------------------------------------------------
  it('returns none for a user whose only session has pipeline_status = running (filtered server-side)', async () => {
    resolvedUser();
    // Supabase returns null because the WHERE clause excluded running rows
    resolvedNoSession();

    const { result } = renderHook(() => useNarrativeSnapshot());

    await waitFor(() => expect(result.current.status).toBe('none'));
    expect(result.current.snapshot).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Case 7 — refresh() triggers a re-fetch
  // -------------------------------------------------------------------------
  it('refresh() triggers a second Supabase query and updates snapshot', async () => {
    resolvedUser();

    // First fetch: no data
    mockMaybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      // Second fetch (after refresh): completed session with data
      .mockResolvedValueOnce({
        data: { tailored_sections: V2_TAILORED_SECTIONS },
        error: null,
      });

    const { result } = renderHook(() => useNarrativeSnapshot());

    await waitFor(() => expect(result.current.status).toBe('none'));
    expect(result.current.snapshot).toBeNull();

    // Trigger refresh
    act(() => {
      result.current.refresh();
    });

    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(result.current.snapshot?.branded_title).toBe('Transformation Architect');
    // maybeSingle must have been called twice (initial + refresh)
    expect(mockMaybeSingle).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------------
  // Window focus triggers a re-fetch (same mechanism as refresh)
  // -------------------------------------------------------------------------
  it('re-fetches when the window regains focus', async () => {
    resolvedUser();

    mockMaybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({
        data: { tailored_sections: V2_TAILORED_SECTIONS },
        error: null,
      });

    const { result } = renderHook(() => useNarrativeSnapshot());

    await waitFor(() => expect(result.current.status).toBe('none'));

    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.snapshot?.branded_title).toBe('Transformation Architect');
  });

  // -------------------------------------------------------------------------
  // Auth boundary — no authenticated user
  // -------------------------------------------------------------------------
  it('returns none immediately when getUser returns no user', async () => {
    resolvedNoUser();

    const { result } = renderHook(() => useNarrativeSnapshot());

    await waitFor(() => expect(result.current.status).toBe('none'));

    expect(result.current.snapshot).toBeNull();
    // The Supabase query must not have been issued
    expect(mockMaybeSingle).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Supabase error path
  // -------------------------------------------------------------------------
  it('returns none when Supabase returns an error', async () => {
    resolvedUser();
    resolvedError();

    const { result } = renderHook(() => useNarrativeSnapshot());

    await waitFor(() => expect(result.current.status).toBe('none'));

    expect(result.current.snapshot).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Snapshot stability — unique_differentiators non-string values are filtered
  // -------------------------------------------------------------------------
  it('filters non-string values from unique_differentiators', async () => {
    resolvedUser();
    resolvedSession({
      pipeline_data: {
        narrativeStrategy: {
          branded_title: 'Mixed Array Leader',
          why_me_concise: 'Filters bad data.',
          why_me_best_line: '',
          why_me_story: '',
          unique_differentiators: ['Valid string', 42, null, true, 'Another valid'],
        },
      },
    });

    const { result } = renderHook(() => useNarrativeSnapshot());

    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(result.current.snapshot?.unique_differentiators).toEqual([
      'Valid string',
      'Another valid',
    ]);
  });

  // -------------------------------------------------------------------------
  // Whitespace trimming
  // -------------------------------------------------------------------------
  it('trims whitespace from all string fields in the snapshot', async () => {
    resolvedUser();
    resolvedSession({
      pipeline_data: {
        narrativeStrategy: {
          branded_title: '  Whitespace Title  ',
          why_me_concise: '  Padded concise  ',
          why_me_best_line: '  Padded best line  ',
          why_me_story: '  Padded story  ',
          unique_differentiators: ['  Padded differentiator  '],
        },
      },
    });

    const { result } = renderHook(() => useNarrativeSnapshot());

    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(result.current.snapshot).toEqual({
      branded_title: 'Whitespace Title',
      why_me_concise: 'Padded concise',
      why_me_best_line: 'Padded best line',
      why_me_story: 'Padded story',
      unique_differentiators: ['  Padded differentiator  '], // array items not trimmed by extractSnapshot
    });
  });
});
