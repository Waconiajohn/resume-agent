/**
 * useThankYouNote — Hook tests.
 *
 * Validates SSE event handling, state transitions, and pipeline lifecycle.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useThankYouNote } from '@/hooks/useThankYouNote';

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

vi.mock('@/lib/sse-parser', () => ({
  parseSSEStream: vi.fn(),
}));

vi.mock('@/lib/create-product-session', () => ({
  createProductSession: vi.fn().mockResolvedValue({
    accessToken: 'test-token',
    session: { id: 'test-uuid' },
  }),
}));

// ─── Helpers ────────────────────────────────────────────────────────

function makeEvent(type: string, data: Record<string, unknown>) {
  return { event: type, data: JSON.stringify(data) };
}

const sampleInput = {
  applicationId: '11111111-1111-1111-1111-111111111111',
  resumeText: 'Jane Smith, SVP Marketing with 15 years experience in brand strategy.',
  company: 'Acme Corp',
  role: 'VP Marketing',
  interviewDate: '2026-03-01',
  interviewType: 'panel',
  recipients: [
    {
      role: 'hiring_manager' as const,
      name: 'Bob Jones',
      title: 'CEO',
      topics_discussed: ['company vision', 'growth strategy'],
      rapport_notes: 'Shared interest in sustainability',
    },
  ],
};

// ─── Tests ──────────────────────────────────────────────────────────

describe('useThankYouNote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid' });
  });

  it('starts in idle state with null report and qualityScore', () => {
    const { result } = renderHook(() => useThankYouNote());
    expect(result.current.status).toBe('idle');
    expect(result.current.report).toBeNull();
    expect(result.current.qualityScore).toBeNull();
    expect(result.current.activityMessages).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.currentStage).toBeNull();
  });

  it('has startPipeline and reset functions', () => {
    const { result } = renderHook(() => useThankYouNote());
    expect(typeof result.current.startPipeline).toBe('function');
    expect(typeof result.current.reset).toBe('function');
  });

  it('reset returns to idle state', () => {
    const { result } = renderHook(() => useThankYouNote());
    act(() => {
      result.current.reset();
    });
    expect(result.current.status).toBe('idle');
    expect(result.current.report).toBeNull();
    expect(result.current.qualityScore).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.activityMessages).toEqual([]);
    expect(result.current.currentStage).toBeNull();
  });

  it('startPipeline calls thank-you-note/start endpoint with correct body', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({ ok: true, body: { [Symbol.asyncIterator]: async function* () {} } });

    vi.stubGlobal('fetch', mockFetch);

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {},
    });

    const { result } = renderHook(() => useThankYouNote());

    await act(async () => {
      await result.current.startPipeline(sampleInput);
    });

    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3001/api/thank-you-note/start',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('SVP Marketing'),
      }),
    );

    // Verify the body includes all expected fields
    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.session_id).toBe('test-uuid');
    expect(body.resume_text).toContain('SVP Marketing');
    expect(body.company).toBe('Acme Corp');
    expect(body.role).toBe('VP Marketing');
    expect(body.interview_date).toBe('2026-03-01');
    expect(body.interview_type).toBe('panel');
    expect(body.recipients).toHaveLength(1);
    expect(body.recipients[0].name).toBe('Bob Jones');
    expect(body.recipients[0].role).toBe('hiring_manager');
    expect(body.job_application_id).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('startPipeline sets error on fetch failure', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal server error'),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { result } = renderHook(() => useThankYouNote());

    let success: boolean = true;
    await act(async () => {
      success = await result.current.startPipeline(sampleInput);
    });

    expect(success).toBe(false);
    expect(result.current.status).toBe('error');
  });

  it('startPipeline sets error when not authenticated', async () => {
    const { createProductSession } = await import('@/lib/create-product-session');
    (createProductSession as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Not authenticated'));

    const { result } = renderHook(() => useThankYouNote());

    let success: boolean = true;
    await act(async () => {
      success = await result.current.startPipeline(sampleInput);
    });

    expect(success).toBe(false);
    expect(result.current.status).toBe('error');
    expect(result.current.error).toContain('authenticated');
  });

  it('handles collection_complete event (sets report, qualityScore, status=complete)', () => {
    const event = makeEvent('collection_complete', {
      session_id: 'test-uuid',
      report: '# Thank You Note Collection',
      quality_score: 90,
      note_count: 2,
    });

    const parsed = JSON.parse(event.data);
    expect(parsed.report).toBe('# Thank You Note Collection');
    expect(parsed.quality_score).toBe(90);
    expect(parsed.note_count).toBe(2);
  });

  it('handles note_drafted event (adds activity with interviewer_name, format)', () => {
    const event = makeEvent('note_drafted', {
      interviewer_name: 'Bob Jones',
      format: 'email',
    });

    const parsed = JSON.parse(event.data);
    expect(parsed.interviewer_name).toBe('Bob Jones');
    expect(parsed.format).toBe('email');
  });

  it('handles note_complete event (adds activity with interviewer_name and quality_score)', () => {
    const event = makeEvent('note_complete', {
      interviewer_name: 'Bob Jones',
      format: 'email',
      quality_score: 88,
    });

    const parsed = JSON.parse(event.data);
    expect(parsed.interviewer_name).toBe('Bob Jones');
    expect(parsed.quality_score).toBe(88);
  });

  it('handles stage_start event (updates currentStage, adds activity)', () => {
    const event = makeEvent('stage_start', {
      stage: 'writing',
      message: 'Writing personalized thank-you notes...',
    });

    const parsed = JSON.parse(event.data);
    expect(parsed.stage).toBe('writing');
    expect(parsed.message).toContain('Writing');
  });

  it('handles transparency event (adds activity)', () => {
    const event = makeEvent('transparency', {
      stage: 'analysis',
      message: 'Analyzing interview context for personalization opportunities...',
    });

    const parsed = JSON.parse(event.data);
    expect(parsed.stage).toBe('analysis');
    expect(parsed.message).toContain('personalization');
  });

  it('handles pipeline_error event (sets error and status=error)', () => {
    const event = makeEvent('pipeline_error', {
      stage: 'writing',
      error: 'LLM provider timeout after 3 retries',
    });

    const parsed = JSON.parse(event.data);
    expect(parsed.error).toBe('LLM provider timeout after 3 retries');
  });

  it('normalizes note_review_ready payloads and numeric-string quality scores', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({ ok: true, body: { [Symbol.asyncIterator]: async function* () {} } });
    vi.stubGlobal('fetch', mockFetch);

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield makeEvent('note_review_ready', {
          notes: [
            {
              recipient_role: 'hiring_manager',
              recipient_name: 'Bob Jones',
              recipient_title: 'CEO',
              format: 'email',
              content: 'Thanks for the time',
              personalization_notes: 'strategy reference',
              quality_score: 90,
            },
            'bad-note',
            null,
          ],
          quality_score: '87',
        });
      },
    });

    const { result } = renderHook(() => useThankYouNote());

    await act(async () => {
      await result.current.startPipeline(sampleInput);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.noteReviewData).toEqual({
      notes: [
        {
          recipient_role: 'hiring_manager',
          recipient_name: 'Bob Jones',
          recipient_title: 'CEO',
          format: 'email',
          content: 'Thanks for the time',
          subject_line: undefined,
          personalization_notes: 'strategy reference',
          quality_score: 90,
        },
      ],
      quality_score: 87,
    });
  });

  it('unwraps JSON-shaped note content before showing review notes', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({ ok: true, body: { [Symbol.asyncIterator]: async function* () {} } });
    vi.stubGlobal('fetch', mockFetch);

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield makeEvent('note_review_ready', {
          notes: [
            {
              recipient_role: 'hiring_manager',
              recipient_name: 'Maria Alvarez',
              recipient_title: 'Chief People Officer',
              format: 'email',
              content: JSON.stringify({
                content: 'Maria, thank you for the thoughtful conversation about the COO role.',
                subject_line: 'Thank you for today',
                personalization_notes: 'References the COO discussion.',
                quality_score: 92,
              }),
            },
          ],
          quality_score: 92,
        });
      },
    });

    const { result } = renderHook(() => useThankYouNote());

    await act(async () => {
      await result.current.startPipeline(sampleInput);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.noteReviewData?.notes[0]).toMatchObject({
      recipient_name: 'Maria Alvarez',
      content: 'Maria, thank you for the thoughtful conversation about the COO role.',
      subject_line: 'Thank you for today',
      personalization_notes: 'References the COO discussion.',
      quality_score: 92,
    });
  });

  it('preserves a good prior report when collection_complete arrives with an empty final report', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({ ok: true, body: { [Symbol.asyncIterator]: async function* () {} } });
    vi.stubGlobal('fetch', mockFetch);

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield makeEvent('collection_complete', {
          report: '# Thank You Note Collection',
          quality_score: 90,
        });
        yield makeEvent('collection_complete', {
          report: '',
          quality_score: 'bad-score',
        });
      },
    });

    const { result } = renderHook(() => useThankYouNote());

    await act(async () => {
      await result.current.startPipeline(sampleInput);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.report).toBe('# Thank You Note Collection');
    expect(result.current.qualityScore).toBe(90);
  });
});
