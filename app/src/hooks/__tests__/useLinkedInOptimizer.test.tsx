// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useLinkedInOptimizer } from '../useLinkedInOptimizer';
import type { ExperienceEntry } from '../useLinkedInOptimizer';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// vi.hoisted ensures the fn is available when vi.mock's factory is called
// (vi.mock is hoisted to the top of the file by Vitest's transform).
const { mockGetSession } = vi.hoisted(() => ({
  mockGetSession: vi.fn().mockResolvedValue({
    data: { session: { access_token: 'test-token' } },
    error: null,
  }),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
    },
  },
}));

vi.mock('@/lib/api', () => ({
  API_BASE: 'http://localhost:3001/api',
}));

vi.mock('@/lib/sse-parser', () => ({
  parseSSEStream: vi.fn().mockImplementation(async function* () {
    // Default: yields nothing — stream closes immediately
  }),
}));

// ─── Factories ────────────────────────────────────────────────────────────────

function makeExperienceEntry(overrides?: Partial<ExperienceEntry>): ExperienceEntry {
  return {
    role_id: 'role-1',
    title: 'VP of Engineering',
    company: 'Acme Corp',
    duration: 'Jan 2020 – Present',
    original: 'Led a team of engineers.',
    optimized: 'Scaled engineering org from 8 to 45 engineers, reducing deploy time by 60%.',
    quality_scores: { impact: 85, metrics: 90, context: 78, keywords: 72 },
    ...overrides,
  };
}

function makeReportCompletePayload(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    report: '# LinkedIn Optimization Report\n\nYour profile is strong.',
    quality_score: 82,
    experience_entries: [makeExperienceEntry()],
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  // Re-apply the session mock before each test because vi.clearAllMocks()
  // in afterEach wipes mock implementations set by mockResolvedValue.
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: 'test-token' } },
    error: null,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe('useLinkedInOptimizer — initial state', () => {
  it('status is "idle" on mount', () => {
    const { result } = renderHook(() => useLinkedInOptimizer());
    expect(result.current.status).toBe('idle');
  });

  it('report is null on mount', () => {
    const { result } = renderHook(() => useLinkedInOptimizer());
    expect(result.current.report).toBeNull();
  });

  it('qualityScore is null on mount', () => {
    const { result } = renderHook(() => useLinkedInOptimizer());
    expect(result.current.qualityScore).toBeNull();
  });

  it('experienceEntries is an empty array on mount', () => {
    const { result } = renderHook(() => useLinkedInOptimizer());
    expect(result.current.experienceEntries).toEqual([]);
  });

  it('activityMessages is an empty array on mount', () => {
    const { result } = renderHook(() => useLinkedInOptimizer());
    expect(result.current.activityMessages).toEqual([]);
  });

  it('error is null on mount', () => {
    const { result } = renderHook(() => useLinkedInOptimizer());
    expect(result.current.error).toBeNull();
  });

  it('currentStage is null on mount', () => {
    const { result } = renderHook(() => useLinkedInOptimizer());
    expect(result.current.currentStage).toBeNull();
  });

  it('exposes startPipeline as a function', () => {
    const { result } = renderHook(() => useLinkedInOptimizer());
    expect(typeof result.current.startPipeline).toBe('function');
  });

  it('exposes reset as a function', () => {
    const { result } = renderHook(() => useLinkedInOptimizer());
    expect(typeof result.current.reset).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// reset()
// ---------------------------------------------------------------------------

describe('useLinkedInOptimizer — reset()', () => {
  it('reset() restores status to idle', () => {
    const { result } = renderHook(() => useLinkedInOptimizer());

    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe('idle');
  });

  it('reset() clears report', () => {
    const { result } = renderHook(() => useLinkedInOptimizer());

    act(() => {
      result.current.reset();
    });

    expect(result.current.report).toBeNull();
  });

  it('reset() clears qualityScore', () => {
    const { result } = renderHook(() => useLinkedInOptimizer());

    act(() => {
      result.current.reset();
    });

    expect(result.current.qualityScore).toBeNull();
  });

  it('reset() clears experienceEntries', () => {
    const { result } = renderHook(() => useLinkedInOptimizer());

    act(() => {
      result.current.reset();
    });

    expect(result.current.experienceEntries).toEqual([]);
  });

  it('reset() clears activityMessages', () => {
    const { result } = renderHook(() => useLinkedInOptimizer());

    act(() => {
      result.current.reset();
    });

    expect(result.current.activityMessages).toEqual([]);
  });

  it('reset() clears error', () => {
    const { result } = renderHook(() => useLinkedInOptimizer());

    act(() => {
      result.current.reset();
    });

    expect(result.current.error).toBeNull();
  });

  it('reset() clears currentStage', () => {
    const { result } = renderHook(() => useLinkedInOptimizer());

    act(() => {
      result.current.reset();
    });

    expect(result.current.currentStage).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// handleSSEEvent — extracted via a minimal SSE simulation
//
// We test SSE event handling by reaching into the hook's internal
// handleSSEEvent via the parseSSEStream mock. The mock yields messages
// that simulate server-sent events, and we verify the resulting state.
// ---------------------------------------------------------------------------

/**
 * Helper that configures parseSSEStream to yield a single SSE message,
 * then starts the pipeline so the hook processes it.
 *
 * fetch is also mocked to return a stub response so connectSSE proceeds
 * past the response.ok / response.body check.
 */
async function simulateSSEEvent(
  hook: ReturnType<typeof useLinkedInOptimizer>,
  eventType: string,
  data: Record<string, unknown>,
) {
  const { parseSSEStream } = await import('@/lib/sse-parser');
  (parseSSEStream as ReturnType<typeof vi.fn>).mockImplementationOnce(
    async function* () {
      yield { event: eventType, data: JSON.stringify(data) };
    },
  );

  const mockBody = new ReadableStream();
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    body: mockBody,
    status: 200,
  }) as unknown as typeof fetch;

  await act(async () => {
    await hook.startPipeline({ resumeText: 'Test resume content for the optimizer pipeline.' });
    // Small delay to let async SSE processing complete
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

describe('useLinkedInOptimizer — report_complete event', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream(),
      status: 200,
    }) as unknown as typeof fetch;
  });

  it('report_complete with experience_entries populates experienceEntries', async () => {
    const { result } = renderHook(() => useLinkedInOptimizer());
    const entries = [makeExperienceEntry(), makeExperienceEntry({ role_id: 'role-2', title: 'Director of Eng' })];

    await simulateSSEEvent(result.current, 'report_complete', makeReportCompletePayload({
      experience_entries: entries,
    }));

    expect(result.current.experienceEntries).toHaveLength(2);
    expect(result.current.experienceEntries[0].role_id).toBe('role-1');
    expect(result.current.experienceEntries[1].role_id).toBe('role-2');
  });

  it('report_complete sets status to "complete"', async () => {
    const { result } = renderHook(() => useLinkedInOptimizer());

    await simulateSSEEvent(result.current, 'report_complete', makeReportCompletePayload());

    expect(result.current.status).toBe('complete');
  });

  it('report_complete populates report text', async () => {
    const { result } = renderHook(() => useLinkedInOptimizer());

    await simulateSSEEvent(result.current, 'report_complete', makeReportCompletePayload({
      report: 'My linkedin report',
    }));

    expect(result.current.report).toBe('My linkedin report');
  });

  it('report_complete populates qualityScore when provided', async () => {
    const { result } = renderHook(() => useLinkedInOptimizer());

    await simulateSSEEvent(result.current, 'report_complete', makeReportCompletePayload({
      quality_score: 76,
    }));

    expect(result.current.qualityScore).toBe(76);
  });

  it('report_complete without experience_entries keeps experienceEntries as empty array', async () => {
    const { result } = renderHook(() => useLinkedInOptimizer());

    await simulateSSEEvent(result.current, 'report_complete', {
      report: 'Report text',
      quality_score: 80,
      // no experience_entries field
    });

    expect(result.current.experienceEntries).toEqual([]);
  });

  it('report_complete with null experience_entries keeps experienceEntries as empty array', async () => {
    const { result } = renderHook(() => useLinkedInOptimizer());

    await simulateSSEEvent(result.current, 'report_complete', {
      report: 'Report text',
      quality_score: 80,
      experience_entries: null,
    });

    expect(result.current.experienceEntries).toEqual([]);
  });

  it('report_complete with empty experience_entries array yields empty array', async () => {
    const { result } = renderHook(() => useLinkedInOptimizer());

    await simulateSSEEvent(result.current, 'report_complete', makeReportCompletePayload({
      experience_entries: [],
    }));

    expect(result.current.experienceEntries).toEqual([]);
  });

  it('report_complete preserves all ExperienceEntry fields', async () => {
    const { result } = renderHook(() => useLinkedInOptimizer());
    const entry = makeExperienceEntry({
      role_id: 'role-99',
      title: 'CTO',
      company: 'BigCo',
      duration: '2018 – 2023',
      original: 'Built things.',
      optimized: 'Built a platform serving 10M users.',
      quality_scores: { impact: 95, metrics: 88, context: 77, keywords: 65 },
    });

    await simulateSSEEvent(result.current, 'report_complete', makeReportCompletePayload({
      experience_entries: [entry],
    }));

    const stored = result.current.experienceEntries[0];
    expect(stored.role_id).toBe('role-99');
    expect(stored.title).toBe('CTO');
    expect(stored.company).toBe('BigCo');
    expect(stored.duration).toBe('2018 – 2023');
    expect(stored.original).toBe('Built things.');
    expect(stored.optimized).toBe('Built a platform serving 10M users.');
    expect(stored.quality_scores).toEqual({ impact: 95, metrics: 88, context: 77, keywords: 65 });
  });
});

describe('useLinkedInOptimizer — stage_start event', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream(),
      status: 200,
    }) as unknown as typeof fetch;
  });

  it('stage_start updates currentStage', async () => {
    const { result } = renderHook(() => useLinkedInOptimizer());

    await simulateSSEEvent(result.current, 'stage_start', {
      stage: 'analyzing',
      message: 'Analyzing your LinkedIn profile...',
    });

    expect(result.current.currentStage).toBe('analyzing');
  });

  it('stage_start adds an activity message', async () => {
    const { result } = renderHook(() => useLinkedInOptimizer());

    await simulateSSEEvent(result.current, 'stage_start', {
      stage: 'analyzing',
      message: 'Analyzing your LinkedIn profile...',
    });

    expect(result.current.activityMessages.length).toBeGreaterThan(0);
    const last = result.current.activityMessages[result.current.activityMessages.length - 1];
    expect(last.message).toBe('Analyzing your LinkedIn profile...');
    expect(last.stage).toBe('analyzing');
  });
});

describe('useLinkedInOptimizer — pipeline_error event', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream(),
      status: 200,
    }) as unknown as typeof fetch;
  });

  it('pipeline_error sets status to "error"', async () => {
    const { result } = renderHook(() => useLinkedInOptimizer());

    await simulateSSEEvent(result.current, 'pipeline_error', {
      error: 'Something went wrong',
    });

    expect(result.current.status).toBe('error');
  });

  it('pipeline_error stores the error message', async () => {
    const { result } = renderHook(() => useLinkedInOptimizer());

    await simulateSSEEvent(result.current, 'pipeline_error', {
      error: 'LLM timeout after 60s',
    });

    expect(result.current.error).toBe('LLM timeout after 60s');
  });
});

describe('useLinkedInOptimizer — startPipeline guards', () => {
  it('startPipeline returns false when called while status is not idle', async () => {
    // Use a fetch that resolves immediately to a non-ok response so the POST
    // settles quickly, but track how many times startPipeline returns false.
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'Service unavailable',
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useLinkedInOptimizer());

    // First call from idle — supabase mock resolves, fetch resolves to 503
    let firstResult: boolean;
    await act(async () => {
      firstResult = await result.current.startPipeline({ resumeText: 'Resume text long enough.' });
    });
    // 503 → startPipeline returns false (failed to start)
    expect(firstResult!).toBe(false);

    // Status is now 'error', not 'idle'
    expect(result.current.status).toBe('error');

    // Second call while not idle — should also return false immediately
    let secondResult: boolean;
    await act(async () => {
      secondResult = await result.current.startPipeline({ resumeText: 'Another resume text.' });
    });
    expect(secondResult!).toBe(false);
  });

  it('reset() returns status to idle regardless of previous state', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'Service unavailable',
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useLinkedInOptimizer());

    // Drive into error state
    await act(async () => {
      await result.current.startPipeline({ resumeText: 'Test resume content.' });
    });
    expect(result.current.status).toBe('error');

    // Reset
    act(() => {
      result.current.reset();
    });
    expect(result.current.status).toBe('idle');
  });

  it('startPipeline succeeds after reset() clears error state', async () => {
    // Use a fetch that hangs forever for the SSE stream so connectSSE doesn't
    // interfere with the startPipeline return value.
    let postCallCount = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      postCallCount += 1;
      if (postCallCount === 1) {
        // First POST → 503 so startPipeline returns false and status → error
        return { ok: false, status: 503, text: async () => 'Service unavailable' };
      }
      if (postCallCount === 2) {
        // Second POST → 200 so startPipeline returns true
        return { ok: true, body: new ReadableStream(), status: 200 };
      }
      // SSE GET stream — hang forever to avoid async interference
      return new Promise(() => {});
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useLinkedInOptimizer());

    // First call → error (503)
    await act(async () => {
      await result.current.startPipeline({ resumeText: 'Test resume content.' });
    });
    expect(result.current.status).toBe('error');

    // Reset → idle
    act(() => {
      result.current.reset();
    });
    expect(result.current.status).toBe('idle');

    // Second call from idle → should succeed (returns true)
    let restarted: boolean;
    await act(async () => {
      restarted = await result.current.startPipeline({ resumeText: 'Test resume content again.' });
    });
    expect(restarted!).toBe(true);
  });
});
