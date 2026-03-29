// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup, waitFor } from '@testing-library/react';

type StreamEvent = { event: string; data: string };

const { mockGetSession, mockParseSSEStream, mockCreateProductSession, setStreamEvents } = vi.hoisted(() => {
  let streamEvents: StreamEvent[] = [];

  return {
    mockGetSession: vi.fn().mockResolvedValue({
      data: { session: { access_token: 'test-token' } },
      error: null,
    }),
    mockCreateProductSession: vi.fn().mockResolvedValue({
      accessToken: 'test-token',
      session: { id: 'session-123' },
    }),
    setStreamEvents: (events: StreamEvent[]) => {
      streamEvents = events;
    },
    mockParseSSEStream: vi.fn(async function* () {
      for (const event of streamEvents) {
        yield event;
      }
    }),
  };
});

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

vi.mock('@/lib/create-product-session', () => ({
  createProductSession: mockCreateProductSession,
}));

vi.mock('@/lib/sse-parser', () => ({
  parseSSEStream: mockParseSSEStream,
}));

import { useLinkedInEditor } from '../useLinkedInEditor';
import { useJobFinder } from '../useJobFinder';
import { useInterviewPrep } from '../useInterviewPrep';

function makeStreamResponse(): Response {
  return new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.close(); } }), {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

beforeEach(() => {
  setStreamEvents([]);
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: 'test-token' } },
    error: null,
  });
  mockCreateProductSession.mockResolvedValue({
    accessToken: 'test-token',
    session: { id: 'session-123' },
  });
  vi.stubGlobal('crypto', {
    randomUUID: vi.fn(() => 'session-123'),
  } as unknown as Crypto);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith('/linkedin-editor/start') || url.endsWith('/job-finder/start')) {
        return new Response('{}', { status: 200 });
      }
      if (url.includes('/stream')) {
        return makeStreamResponse();
      }
      return new Response('{}', { status: 200 });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('useLinkedInEditor', () => {
  it('sanitizes malformed streamed section payloads before storing them', async () => {
    setStreamEvents([
      {
        event: 'section_draft_ready',
        data: JSON.stringify({
          section: 'headline',
          content: 'Draft headline',
          quality_scores: {
            keyword_coverage: '91',
            readability: 80,
            positioning_alignment: 'bad',
          },
        }),
      },
      {
        event: 'section_approved',
        data: JSON.stringify({
          section: 'headline',
          content: 'Approved headline',
        }),
      },
      {
        event: 'editor_complete',
        data: JSON.stringify({
          sections: {
            headline: 'Approved headline',
            about: 42,
            '': 'ignore me',
          },
        }),
      },
    ]);

    const { result } = renderHook(() => useLinkedInEditor());

    let started = false;
    await act(async () => {
      started = await result.current.startEditor('Current profile');
    });

    expect(started).toBe(true);

    await waitFor(() => expect(result.current.status).toBe('complete'));
    expect(result.current.sectionDrafts).toEqual({ headline: 'Approved headline' });
    expect(result.current.sectionScores.headline).toEqual({
      keyword_coverage: 91,
      readability: 80,
      positioning_alignment: 0,
    });
    expect(result.current.sectionsCompleted).toContain('headline');
  });
});

describe('useJobFinder', () => {
  it('filters malformed searches and matches from streamed results', async () => {
    setStreamEvents([
      {
        event: 'search_progress',
        data: JSON.stringify({
          searches: [
            { platform: 'LinkedIn', query: 'site:linkedin.com VP Operations' },
            { platform: 123, query: null },
          ],
          message: 'Running search',
        }),
      },
      {
        event: 'results_ready',
        data: JSON.stringify({
          matches: [
            {
              id: 'job-1',
              title: 'VP Operations',
              company: 'Acme',
              fit_score: '88',
              why_match: 'Strong alignment with operating cadence work.',
              work_type: 'remote',
              salary_range: 250000,
            },
            { id: 'bad-job', title: null },
          ],
        }),
      },
      {
        event: 'job_finder_complete',
        data: JSON.stringify({}),
      },
    ]);

    const { result } = renderHook(() => useJobFinder());

    let started = false;
    await act(async () => {
      started = await result.current.startSearch();
    });

    expect(started).toBe(true);

    await waitFor(() => expect(result.current.status).toBe('complete'));
    expect(result.current.matches).toEqual([
      {
        id: 'job-1',
        title: 'VP Operations',
        company: 'Acme',
        location: undefined,
        fit_score: 88,
        why_match: 'Strong alignment with operating cadence work.',
        salary_range: undefined,
        posted_date: undefined,
        work_type: 'remote',
        url: undefined,
      },
    ]);
    expect(result.current.activityMessages.some((item) => /Found 1 matching roles/i.test(item.message))).toBe(true);
  });
});

describe('useInterviewPrep', () => {
  it('sanitizes malformed streamed prep payloads before storing them', async () => {
    setStreamEvents([
      {
        event: 'pipeline_gate',
        data: JSON.stringify({ gate: 'star_stories_review' }),
      },
      {
        event: 'star_stories_review_ready',
        data: JSON.stringify({
          report: 'Star story notes',
          quality_score: '87',
        }),
      },
      {
        event: 'section_progress',
        data: JSON.stringify({
          section: '',
          status: 'writing',
        }),
      },
      {
        event: 'report_complete',
        data: JSON.stringify({
          report: '',
          quality_score: '91',
        }),
      },
    ]);

    const { result } = renderHook(() => useInterviewPrep());

    let started = false;
    await act(async () => {
      started = await result.current.startPipeline({
        resumeText: 'A'.repeat(120),
        jobDescription: 'B'.repeat(120),
        companyName: 'Acme',
      });
    });

    expect(started).toBe(true);

    await waitFor(() => expect(result.current.status).toBe('complete'));
    expect(result.current.starStoriesReviewData).toEqual({
      report: 'Star story notes',
      quality_score: 87,
    });
    expect(result.current.report).toBeNull();
    expect(result.current.qualityScore).toBe(91);
    expect(result.current.activityMessages).toEqual([]);
  });
});
