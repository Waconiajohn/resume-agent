/**
 * useSession — respondToGate auto-retry on 429.
 *
 * The respondToGate function retries once when the server returns 429,
 * using the Retry-After header to determine the delay. This handles the
 * timing race where:
 *   - pipeline_status is not yet 'running' (429 with Retry-After: 2)
 *   - pipeline IS running but no pending_gate set yet (429 with Retry-After: 1)
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSession } from '@/hooks/useSession';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/api', () => ({
  API_BASE: 'http://localhost:3001/api',
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeResponse(
  status: number,
  body: unknown,
  extraHeaders: Record<string, string> = {},
): Response {
  const headers = new Headers({ 'Content-Type': 'application/json', ...extraHeaders });
  return new Response(JSON.stringify(body), { status, headers });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('useSession — respondToGate auto-retry on 429', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('succeeds on first attempt when server returns 200', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse(200, { status: 'ok', gate: 'section_review' }),
    );

    const { result } = renderHook(() => useSession('test-access-token'));

    let success = false;
    await act(async () => {
      success = await result.current.respondToGate('session-1', 'section_review', { approved: true });
    });

    expect(success).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
  });

  it('retries once on 429 and succeeds on second attempt', async () => {
    // Use vi.useFakeTimers to control the retry delay
    vi.useFakeTimers();

    mockFetch
      .mockResolvedValueOnce(
        makeResponse(429, { error: 'Pipeline is not running for this session' }, { 'Retry-After': '1' }),
      )
      .mockResolvedValueOnce(
        makeResponse(200, { status: 'ok', gate: 'section_review' }),
      );

    const { result } = renderHook(() => useSession('test-access-token'));

    let success = false;
    // Start the request without awaiting — it will pause at the setTimeout
    let respondPromise!: Promise<boolean>;
    act(() => {
      respondPromise = result.current.respondToGate('session-1', 'section_review', { approved: true });
    });

    // Let the first fetch resolve (429)
    await act(async () => {
      await Promise.resolve();
    });

    // Advance time past the 1-second Retry-After delay (clamped to 1000ms)
    await act(async () => {
      vi.advanceTimersByTime(1100);
    });

    // Now the retry fetch should complete
    await act(async () => {
      success = await respondPromise;
    });

    vi.useRealTimers();

    expect(success).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeNull();
  });

  it('returns false and sets error when second attempt also returns 429', async () => {
    vi.useFakeTimers();

    mockFetch
      .mockResolvedValueOnce(
        makeResponse(429, { error: 'Pipeline is not running for this session' }, { 'Retry-After': '2' }),
      )
      .mockResolvedValueOnce(
        makeResponse(429, { error: 'Pipeline is not running for this session' }, { 'Retry-After': '2' }),
      );

    const { result } = renderHook(() => useSession('test-access-token'));

    let success = true;
    let respondPromise!: Promise<boolean>;
    act(() => {
      respondPromise = result.current.respondToGate('session-1', 'section_review', { approved: true });
    });

    // Let first fetch resolve
    await act(async () => {
      await Promise.resolve();
    });

    // Advance past the 2-second Retry-After delay
    await act(async () => {
      vi.advanceTimersByTime(2100);
    });

    await act(async () => {
      success = await respondPromise;
    });

    vi.useRealTimers();

    expect(success).toBe(false);
    // Maximum 1 retry — two total fetch calls
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeTruthy();
  });

  it('does not retry on 409 STALE_PIPELINE — sets specific stale error message', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse(409, {
        error: 'Pipeline state became stale after a server restart.',
        code: 'STALE_PIPELINE',
      }),
    );

    const { result } = renderHook(() => useSession('test-access-token'));
    let success = true;

    await act(async () => {
      success = await result.current.respondToGate('session-1', 'section_review', { approved: true });
    });

    expect(success).toBe(false);
    // No retry — only one fetch call
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.current.error).toMatch(/stale/i);
  });

  it('does not retry on plain 400 errors', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse(400, { error: 'Invalid request' }),
    );

    const { result } = renderHook(() => useSession('test-access-token'));
    let success = true;

    await act(async () => {
      success = await result.current.respondToGate('session-1', 'section_review', { approved: true });
    });

    expect(success).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe('useSession — resume payload normalization', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('drops malformed resume list items when loading resumes', async () => {
    const mockFetch = vi.fn<typeof fetch>();
    mockFetch.mockResolvedValueOnce(
      makeResponse(200, {
        resumes: [
          {
            id: 'resume-1',
            summary: 'Good resume',
            version: '3',
            is_default: true,
            created_at: '2026-03-01T00:00:00Z',
            updated_at: '2026-03-02T00:00:00Z',
          },
          { id: 'broken-resume' },
        ],
      }),
    );
    vi.stubGlobal('fetch', mockFetch);

    const { result } = renderHook(() => useSession('test-access-token'));

    await act(async () => {
      await result.current.listResumes();
    });

    expect(result.current.resumes).toEqual([
      {
        id: 'resume-1',
        summary: 'Good resume',
        version: 3,
        is_default: true,
        source_session_id: null,
        company_name: null,
        job_title: null,
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-02T00:00:00Z',
      },
    ]);
  });

  it('returns null when the default resume payload is malformed', async () => {
    const mockFetch = vi.fn<typeof fetch>();
    mockFetch.mockResolvedValueOnce(
      makeResponse(200, {
        resume: { id: 'broken-resume' },
      }),
    );
    vi.stubGlobal('fetch', mockFetch);

    const { result } = renderHook(() => useSession('test-access-token'));

    let resume = null;
    await act(async () => {
      resume = await result.current.getDefaultResume();
    });

    expect(resume).toBeNull();
  });

  it('sanitizes the loaded default resume instead of trusting malformed nested fields', async () => {
    const mockFetch = vi.fn<typeof fetch>();
    mockFetch.mockResolvedValueOnce(
      makeResponse(200, {
        resume: {
          id: 'resume-1',
          user_id: 'user-1',
          summary: 'Leadership operator',
          raw_text: 'Resume text',
          version: '4',
          is_default: 1,
          source_session_id: null,
          experience: [
            {
              company: 'Acme Corp',
              title: 'VP Operations',
              start_date: '2020',
              end_date: 'Present',
              location: 'Chicago',
              bullets: [{ text: 'Built the operating cadence', source: 'crafted' }, { text: '', source: 'crafted' }],
            },
          ],
          skills: {
            Leadership: ['Coaching', '', 42],
          },
          education: [
            { institution: 'Northwestern', degree: 'MBA', field: 'Strategy', year: '2010' },
          ],
          certifications: [
            { name: 'PMP', issuer: 'PMI', year: '2014' },
            { issuer: 'Broken' },
          ],
          contact_info: {
            name: 'Jane Doe',
            email: 'jane@example.com',
          },
          evidence_items: [
            {
              text: 'Improved forecast accuracy',
              source: 'crafted',
              source_session_id: 'session-1',
              created_at: '2026-03-02T00:00:00Z',
            },
            {
              text: 'Broken evidence',
              source: 'unknown',
              source_session_id: 'session-2',
              created_at: '2026-03-02T00:00:00Z',
            },
          ],
          created_at: '2026-03-01T00:00:00Z',
          updated_at: '2026-03-02T00:00:00Z',
        },
      }),
    );
    vi.stubGlobal('fetch', mockFetch);

    const { result } = renderHook(() => useSession('test-access-token'));

    let resume = null;
    await act(async () => {
      resume = await result.current.getDefaultResume();
    });

    expect(resume).toEqual({
      id: 'resume-1',
      user_id: 'user-1',
      summary: 'Leadership operator',
      raw_text: 'Resume text',
      version: 4,
      is_default: true,
      source_session_id: null,
      experience: [
        {
          company: 'Acme Corp',
          title: 'VP Operations',
          start_date: '2020',
          end_date: 'Present',
          location: 'Chicago',
          bullets: [{ text: 'Built the operating cadence', source: 'crafted' }],
        },
      ],
      skills: {
        Leadership: ['Coaching'],
      },
      education: [
        { institution: 'Northwestern', degree: 'MBA', field: 'Strategy', year: '2010' },
      ],
      certifications: [
        { name: 'PMP', issuer: 'PMI', year: '2014' },
      ],
      contact_info: {
        name: 'Jane Doe',
        email: 'jane@example.com',
        phone: undefined,
        linkedin: undefined,
        location: undefined,
      },
      evidence_items: [
        {
          text: 'Improved forecast accuracy',
          source: 'crafted',
          category: undefined,
          source_session_id: 'session-1',
          created_at: '2026-03-02T00:00:00Z',
        },
      ],
      created_at: '2026-03-01T00:00:00Z',
      updated_at: '2026-03-02T00:00:00Z',
    });
  });
});
