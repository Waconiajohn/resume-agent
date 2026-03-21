/**
 * useJobTracker — Hook tests.
 *
 * Validates SSE event handling, state transitions, and pipeline lifecycle.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useJobTracker } from '@/hooks/useJobTracker';

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

// ─── Helpers ────────────────────────────────────────────────────────

function makeEvent(type: string, data: Record<string, unknown>) {
  return { event: type, data: JSON.stringify(data) };
}

const sampleInput = {
  resumeText: 'John Doe, VP Operations with 20 years experience in supply chain management.',
  applications: [
    {
      company: 'Acme Corp',
      role: 'VP Operations',
      date_applied: '2026-03-01',
      jd_text: 'Looking for a VP of Operations to lead global supply chain...',
      status: 'applied' as const,
    },
  ],
};

// ─── Tests ──────────────────────────────────────────────────────────

describe('useJobTracker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid' });
  });

  it('starts with idle status', () => {
    const { result } = renderHook(() => useJobTracker());
    expect(result.current.status).toBe('idle');
    expect(result.current.report).toBeNull();
    expect(result.current.qualityScore).toBeNull();
    expect(result.current.applicationCount).toBeNull();
    expect(result.current.followUpCount).toBeNull();
    expect(result.current.activityMessages).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.currentStage).toBeNull();
  });

  it('has startPipeline and reset functions', () => {
    const { result } = renderHook(() => useJobTracker());
    expect(typeof result.current.startPipeline).toBe('function');
    expect(typeof result.current.reset).toBe('function');
  });

  it('reset clears state back to idle', () => {
    const { result } = renderHook(() => useJobTracker());
    act(() => {
      result.current.reset();
    });
    expect(result.current.status).toBe('idle');
    expect(result.current.report).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.qualityScore).toBeNull();
    expect(result.current.applicationCount).toBeNull();
    expect(result.current.followUpCount).toBeNull();
  });

  it('startPipeline calls /job-tracker/start endpoint', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({ ok: true, body: { [Symbol.asyncIterator]: async function* () {} } });

    vi.stubGlobal('fetch', mockFetch);

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {},
    });

    const { result } = renderHook(() => useJobTracker());

    await act(async () => {
      await result.current.startPipeline(sampleInput);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/job-tracker/start',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('Acme Corp'),
      }),
    );
  });

  it('startPipeline returns false on fetch failure', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal server error'),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { result } = renderHook(() => useJobTracker());

    let success: boolean = true;
    await act(async () => {
      success = await result.current.startPipeline(sampleInput);
    });

    expect(success).toBe(false);
    expect(result.current.status).toBe('error');
  });

  it('startPipeline returns false when not authenticated', async () => {
    const { supabase } = await import('@/lib/supabase');
    (supabase.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { session: null },
    });

    const { result } = renderHook(() => useJobTracker());

    let success: boolean = true;
    await act(async () => {
      success = await result.current.startPipeline(sampleInput);
    });

    expect(success).toBe(false);
    expect(result.current.status).toBe('error');
    expect(result.current.error).toContain('authenticated');
  });

  it('handles tracker_complete event shape', () => {
    const event = makeEvent('tracker_complete', {
      session_id: 'test-uuid',
      report: '# Tracker Report',
      quality_score: 82,
      application_count: 3,
      follow_up_count: 2,
    });

    const parsed = JSON.parse(event.data);
    expect(parsed.report).toBe('# Tracker Report');
    expect(parsed.quality_score).toBe(82);
    expect(parsed.application_count).toBe(3);
    expect(parsed.follow_up_count).toBe(2);
  });

  it('handles application_analyzed event shape', () => {
    const event = makeEvent('application_analyzed', {
      company: 'Acme Corp',
      role: 'VP Operations',
      fit_score: 78,
    });

    const parsed = JSON.parse(event.data);
    expect(parsed.company).toBe('Acme Corp');
    expect(parsed.role).toBe('VP Operations');
    expect(parsed.fit_score).toBe(78);
  });

  it('handles follow_up_generated event shape', () => {
    const event = makeEvent('follow_up_generated', {
      company: 'Acme Corp',
      role: 'VP Operations',
      follow_up_type: 'initial_follow_up',
    });

    const parsed = JSON.parse(event.data);
    expect(parsed.company).toBe('Acme Corp');
    expect(parsed.follow_up_type).toBe('initial_follow_up');
  });

  it('handles analytics_updated event shape', () => {
    const event = makeEvent('analytics_updated', {
      total: 5,
      average_fit: 72,
    });

    const parsed = JSON.parse(event.data);
    expect(parsed.total).toBe(5);
    expect(parsed.average_fit).toBe(72);
  });

  it('handles stage_start event shape', () => {
    const event = makeEvent('stage_start', {
      stage: 'analysis',
      message: 'Analyzing applications...',
    });

    const parsed = JSON.parse(event.data);
    expect(parsed.stage).toBe('analysis');
    expect(parsed.message).toContain('Analyzing');
  });

  it('handles transparency event shape', () => {
    const event = makeEvent('transparency', {
      stage: 'analyze_application',
      message: 'Analyzing 3 application(s)...',
    });

    const parsed = JSON.parse(event.data);
    expect(parsed.stage).toBe('analyze_application');
    expect(parsed.message).toContain('3 application(s)');
  });

  it('sanitizes streamed tracker_complete payloads before storing them', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({ ok: true, body: { [Symbol.asyncIterator]: async function* () {} } });

    vi.stubGlobal('fetch', mockFetch);

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockImplementation(async function* () {
      yield {
        event: 'application_analyzed',
        data: JSON.stringify({ company: 'Acme Corp', role: 'VP Operations', fit_score: '88' }),
      };
      yield {
        event: 'application_analyzed',
        data: JSON.stringify({ company: '', role: '', fit_score: 'bad' }),
      };
      yield {
        event: 'tracker_complete',
        data: JSON.stringify({
          report: '# Tracker Report',
          quality_score: '82',
          application_count: '3',
          follow_up_count: '2',
        }),
      };
    });

    const { result } = renderHook(() => useJobTracker());

    await act(async () => {
      await result.current.startPipeline(sampleInput);
    });

    await waitFor(() => expect(result.current.status).toBe('complete'));
    expect(result.current.report).toBe('# Tracker Report');
    expect(result.current.qualityScore).toBe(82);
    expect(result.current.applicationCount).toBe(3);
    expect(result.current.followUpCount).toBe(2);
    expect(result.current.activityMessages).toHaveLength(1);
    expect(result.current.activityMessages[0]?.message).toContain('Acme Corp');
  });

  it('does not populate a blank tracker report while still normalizing numeric summary fields', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({ ok: true, body: { [Symbol.asyncIterator]: async function* () {} } });

    vi.stubGlobal('fetch', mockFetch);

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockImplementation(async function* () {
      yield {
        event: 'tracker_complete',
        data: JSON.stringify({
          report: '',
          quality_score: '90',
          application_count: '4',
          follow_up_count: '3',
        }),
      };
    });

    const { result } = renderHook(() => useJobTracker());

    await act(async () => {
      await result.current.startPipeline(sampleInput);
    });

    await waitFor(() => expect(result.current.status).toBe('complete'));
    expect(result.current.report).toBeNull();
    expect(result.current.qualityScore).toBe(90);
    expect(result.current.applicationCount).toBe(4);
    expect(result.current.followUpCount).toBe(3);
  });
});
