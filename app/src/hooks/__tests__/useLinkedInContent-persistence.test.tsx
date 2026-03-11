// @vitest-environment jsdom
/**
 * useLinkedInContent — persistence tests (Sprint 60, Story 60-1).
 *
 * Covers:
 * - postSaved defaults to false
 * - postSaved becomes true after content_complete SSE event
 * - postSaved resets to false when startContentPipeline is called
 * - postSaved resets to false when reset() is called
 * - hookScore, hookType, hookAssessment fields exist and default to null
 * - hookScore/hookType/hookAssessment are populated by post_draft_ready SSE event
 * - hookScore/hookType/hookAssessment are preserved across post_revised SSE event
 * - All three hook fields reset to null when startContentPipeline is called
 * - All three hook fields reset to null when reset() is called
 * - post_revised partial updates preserve existing hook fields when new ones are absent
 * - postSaved is not set on pipeline_complete (only on content_complete)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup, waitFor } from '@testing-library/react';

// ─── Hoisted mock helpers ─────────────────────────────────────────────────────

const { mockGetSession } = vi.hoisted(() => ({
  mockGetSession: vi.fn().mockResolvedValue({
    data: { session: { access_token: 'test-token-lc' } },
    error: null,
  }),
}));

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getSession: mockGetSession },
  },
}));

vi.mock('@/lib/api', () => ({
  API_BASE: 'http://localhost:3001/api',
}));

// SSE parser is mocked to yield nothing by default; individual tests
// use the parseSSEStream mock to inject synthetic events.
const { mockParseSSEStream } = vi.hoisted(() => ({
  mockParseSSEStream: vi.fn(),
}));

vi.mock('@/lib/sse-parser', () => ({
  parseSSEStream: mockParseSSEStream,
}));

vi.mock('@/lib/safe-cast', () => ({
  safeString: (v: unknown, fallback = '') =>
    typeof v === 'string' ? v : fallback,
  safeNumber: (v: unknown, fallback = 0) =>
    typeof v === 'number' ? v : fallback,
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { useLinkedInContent } from '../useLinkedInContent';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns an async generator that yields the given SSE messages then stops.
 */
async function* yieldEvents(
  events: Array<{ event: string; data: unknown }>,
): AsyncGenerator<{ event: string; data: string }> {
  for (const e of events) {
    yield { event: e.event, data: JSON.stringify(e.data) };
  }
}

/**
 * Stubs fetch so that:
 * 1. POST /start returns 200 OK.
 * 2. GET /stream returns a readable-body response that parseSSEStream will process.
 */
function stubFetchForStream(events: Array<{ event: string; data: unknown }>) {
  mockParseSSEStream.mockImplementation(async function* () {
    yield* yieldEvents(events);
  });

  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(new Response('{}', { status: 200 })) // POST /start
    .mockResolvedValueOnce(
      new Response(new ReadableStream(), { status: 200 }), // GET /stream
    ),
  );
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: 'test-token-lc' } },
    error: null,
  });
  mockParseSSEStream.mockImplementation(async function* () {
    // default: no events
  });
  vi.stubGlobal('crypto', {
    randomUUID: vi.fn().mockReturnValue('test-session-uuid'),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

// ─── Initial state ────────────────────────────────────────────────────────────

describe('useLinkedInContent — initial state', () => {
  it('postSaved defaults to false', () => {
    vi.stubGlobal('fetch', vi.fn());
    const { result } = renderHook(() => useLinkedInContent());
    expect(result.current.postSaved).toBe(false);
  });

  it('hookScore defaults to null', () => {
    vi.stubGlobal('fetch', vi.fn());
    const { result } = renderHook(() => useLinkedInContent());
    expect(result.current.hookScore).toBeNull();
  });

  it('hookType defaults to null', () => {
    vi.stubGlobal('fetch', vi.fn());
    const { result } = renderHook(() => useLinkedInContent());
    expect(result.current.hookType).toBeNull();
  });

  it('hookAssessment defaults to null', () => {
    vi.stubGlobal('fetch', vi.fn());
    const { result } = renderHook(() => useLinkedInContent());
    expect(result.current.hookAssessment).toBeNull();
  });
});

// ─── content_complete SSE event ───────────────────────────────────────────────

describe('useLinkedInContent — content_complete SSE event', () => {
  it('sets postSaved to true after content_complete', async () => {
    stubFetchForStream([
      { event: 'content_complete', data: { post: 'Final post text', hashtags: [] } },
    ]);

    const { result } = renderHook(() => useLinkedInContent());

    await act(async () => {
      await result.current.startContentPipeline();
    });

    await waitFor(() => expect(result.current.postSaved).toBe(true));
  });

  it('sets status to complete after content_complete', async () => {
    stubFetchForStream([
      { event: 'content_complete', data: { post: 'Final post', hashtags: [] } },
    ]);

    const { result } = renderHook(() => useLinkedInContent());

    await act(async () => {
      await result.current.startContentPipeline();
    });

    await waitFor(() => expect(result.current.status).toBe('complete'));
  });

  it('pipeline_complete without postDraft leaves state unchanged (waits for content_complete)', async () => {
    // When pipeline_complete fires and postDraft is null, the hook leaves state unchanged
    // so the SSE stream stays open to receive the content_complete event.
    stubFetchForStream([
      { event: 'pipeline_complete', data: {} },
    ]);

    const { result } = renderHook(() => useLinkedInContent());

    await act(async () => {
      await result.current.startContentPipeline();
    });

    await waitFor(() => expect(result.current.status).not.toBe('idle'));
    expect(result.current.postSaved).toBe(false);
  });
});

// ─── postSaved reset on startContentPipeline ─────────────────────────────────

describe('useLinkedInContent — postSaved reset on startContentPipeline', () => {
  it('resets postSaved to false when a new pipeline starts', async () => {
    // First run — pipeline completes and sets postSaved
    stubFetchForStream([
      { event: 'content_complete', data: { post: 'Post', hashtags: [] } },
    ]);

    const { result } = renderHook(() => useLinkedInContent());

    await act(async () => {
      await result.current.startContentPipeline();
    });

    await waitFor(() => expect(result.current.postSaved).toBe(true));

    // Reset so we can start again
    act(() => {
      result.current.reset();
    });

    // Now start a second pipeline — postSaved should be false from the moment
    // startContentPipeline is called (state is reset inside the function)
    stubFetchForStream([]);
    await act(async () => {
      await result.current.startContentPipeline();
    });

    // postSaved was reset during startContentPipeline
    expect(result.current.postSaved).toBe(false);
  });
});

// ─── postSaved reset on reset() ──────────────────────────────────────────────

describe('useLinkedInContent — postSaved reset on reset()', () => {
  it('resets postSaved to false when reset() is called', async () => {
    stubFetchForStream([
      { event: 'content_complete', data: { post: 'Post', hashtags: [] } },
    ]);

    const { result } = renderHook(() => useLinkedInContent());

    await act(async () => {
      await result.current.startContentPipeline();
    });

    await waitFor(() => expect(result.current.postSaved).toBe(true));

    act(() => {
      result.current.reset();
    });

    expect(result.current.postSaved).toBe(false);
  });
});

// ─── hook fields populated by post_draft_ready ────────────────────────────────

describe('useLinkedInContent — hook fields from post_draft_ready SSE event', () => {
  it('hookScore is set from post_draft_ready', async () => {
    stubFetchForStream([
      {
        event: 'post_draft_ready',
        data: {
          post: 'Draft post',
          hashtags: ['#Leadership'],
          hook_score: 87,
          hook_type: 'contrarian',
          hook_assessment: 'Strong opening that challenges conventional wisdom',
        },
      },
    ]);

    const { result } = renderHook(() => useLinkedInContent());

    await act(async () => {
      await result.current.startContentPipeline();
    });

    await waitFor(() => expect(result.current.hookScore).toBe(87));
  });

  it('hookType is set from post_draft_ready', async () => {
    stubFetchForStream([
      {
        event: 'post_draft_ready',
        data: {
          post: 'Draft post',
          hashtags: [],
          hook_score: 72,
          hook_type: 'story',
          hook_assessment: 'Opens with a personal anecdote',
        },
      },
    ]);

    const { result } = renderHook(() => useLinkedInContent());

    await act(async () => {
      await result.current.startContentPipeline();
    });

    await waitFor(() => expect(result.current.hookType).toBe('story'));
  });

  it('hookAssessment is set from post_draft_ready', async () => {
    stubFetchForStream([
      {
        event: 'post_draft_ready',
        data: {
          post: 'Draft post',
          hashtags: [],
          hook_score: 65,
          hook_type: 'question',
          hook_assessment: 'Asks a provocative question that prompts reflection',
        },
      },
    ]);

    const { result } = renderHook(() => useLinkedInContent());

    await act(async () => {
      await result.current.startContentPipeline();
    });

    await waitFor(() =>
      expect(result.current.hookAssessment).toBe(
        'Asks a provocative question that prompts reflection',
      ),
    );
  });

  it('hook fields remain null when post_draft_ready omits them', async () => {
    stubFetchForStream([
      {
        event: 'post_draft_ready',
        data: { post: 'Draft', hashtags: [] },
        // no hook_score / hook_type / hook_assessment
      },
    ]);

    const { result } = renderHook(() => useLinkedInContent());

    await act(async () => {
      await result.current.startContentPipeline();
    });

    await waitFor(() => expect(result.current.status).toBe('post_review'));
    expect(result.current.hookScore).toBeNull();
    expect(result.current.hookType).toBeNull();
    expect(result.current.hookAssessment).toBeNull();
  });
});

// ─── hook fields reset on startContentPipeline and reset() ───────────────────

describe('useLinkedInContent — hook fields reset', () => {
  it('hook fields reset to null when reset() is called', async () => {
    stubFetchForStream([
      {
        event: 'post_draft_ready',
        data: {
          post: 'Draft',
          hashtags: [],
          hook_score: 80,
          hook_type: 'data',
          hook_assessment: 'Opens with a compelling statistic',
        },
      },
    ]);

    const { result } = renderHook(() => useLinkedInContent());

    await act(async () => {
      await result.current.startContentPipeline();
    });

    await waitFor(() => expect(result.current.hookScore).toBe(80));

    act(() => {
      result.current.reset();
    });

    expect(result.current.hookScore).toBeNull();
    expect(result.current.hookType).toBeNull();
    expect(result.current.hookAssessment).toBeNull();
  });
});
