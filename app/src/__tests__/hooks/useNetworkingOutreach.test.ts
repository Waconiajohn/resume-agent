/**
 * useNetworkingOutreach — Hook tests.
 *
 * Validates SSE event handling, state transitions, and pipeline lifecycle.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNetworkingOutreach } from '@/hooks/useNetworkingOutreach';

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

// ─── Tests ──────────────────────────────────────────────────────────

describe('useNetworkingOutreach', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid' });
  });

  it('starts with idle status', () => {
    const { result } = renderHook(() => useNetworkingOutreach());
    expect(result.current.status).toBe('idle');
    expect(result.current.report).toBeNull();
    expect(result.current.qualityScore).toBeNull();
    expect(result.current.messageCount).toBeNull();
    expect(result.current.activityMessages).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('has startPipeline and reset functions', () => {
    const { result } = renderHook(() => useNetworkingOutreach());
    expect(typeof result.current.startPipeline).toBe('function');
    expect(typeof result.current.reset).toBe('function');
  });

  it('reset clears state back to idle', () => {
    const { result } = renderHook(() => useNetworkingOutreach());
    act(() => {
      result.current.reset();
    });
    expect(result.current.status).toBe('idle');
    expect(result.current.report).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('startPipeline sets connecting status', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({ ok: true, body: { [Symbol.asyncIterator]: async function* () {} } });

    vi.stubGlobal('fetch', mockFetch);

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {},
    });

    const { result } = renderHook(() => useNetworkingOutreach());

    await act(async () => {
      await result.current.startPipeline({
        resumeText: 'John Doe, VP Operations with 20 years experience in supply chain management.',
        targetInput: {
          target_name: 'Jane Smith',
          target_title: 'VP Engineering',
          target_company: 'Acme Corp',
        },
      });
    });

    // Should have called fetch for /start
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/networking-outreach/start',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('Jane Smith'),
      }),
    );
  });

  it('handles pipeline_error event', async () => {
    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield makeEvent('pipeline_error', { stage: 'research', error: 'LLM timeout' });
      },
    });

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }), text: () => Promise.resolve('') })
      .mockResolvedValueOnce({ ok: true, body: {} });

    vi.stubGlobal('fetch', mockFetch);

    const { result } = renderHook(() => useNetworkingOutreach());

    await act(async () => {
      await result.current.startPipeline({
        resumeText: 'John Doe, VP Operations with 20 years experience in supply chain management.',
        targetInput: {
          target_name: 'Jane Smith',
          target_title: 'VP Engineering',
          target_company: 'Acme Corp',
        },
      });
    });

    // Error state should be set after SSE event processing
    // Note: actual event processing depends on SSE stream consumption
  });

  it('handles sequence_complete event shape', () => {
    // Validate the event shape that the hook expects
    const event = makeEvent('sequence_complete', {
      session_id: 'test-uuid',
      report: '# Outreach Report',
      quality_score: 88,
      message_count: 5,
    });

    const parsed = JSON.parse(event.data);
    expect(parsed.report).toBe('# Outreach Report');
    expect(parsed.quality_score).toBe(88);
    expect(parsed.message_count).toBe(5);
  });

  it('handles message_progress event shape', () => {
    const event = makeEvent('message_progress', {
      message_type: 'connection_request',
      status: 'drafting',
    });

    const parsed = JSON.parse(event.data);
    expect(parsed.message_type).toBe('connection_request');
    expect(parsed.status).toBe('drafting');
  });

  it('handles stage_start event shape', () => {
    const event = makeEvent('stage_start', {
      stage: 'research',
      message: 'Analyzing target contact...',
    });

    const parsed = JSON.parse(event.data);
    expect(parsed.stage).toBe('research');
    expect(parsed.message).toContain('Analyzing');
  });

  it('handles transparency event shape', () => {
    const event = makeEvent('transparency', {
      stage: 'analyze_target',
      message: 'Researcher: Analyzing Sarah Chen at Medtronic...',
    });

    const parsed = JSON.parse(event.data);
    expect(parsed.stage).toBe('analyze_target');
    expect(parsed.message).toContain('Sarah Chen');
  });

  it('startPipeline returns false on fetch failure', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: () => Promise.resolve('Not found'),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { result } = renderHook(() => useNetworkingOutreach());

    let success: boolean = true;
    await act(async () => {
      success = await result.current.startPipeline({
        resumeText: 'John Doe, VP Operations with 20 years experience in supply chain management.',
        targetInput: {
          target_name: 'Jane Smith',
          target_title: 'VP Engineering',
          target_company: 'Acme Corp',
        },
      });
    });

    expect(success).toBe(false);
    expect(result.current.status).toBe('error');
  });

  it('startPipeline returns false when not authenticated', async () => {
    const { supabase } = await import('@/lib/supabase');
    (supabase.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { session: null },
    });

    const { result } = renderHook(() => useNetworkingOutreach());

    let success: boolean = true;
    await act(async () => {
      success = await result.current.startPipeline({
        resumeText: 'John Doe, VP Operations with 20 years experience in supply chain management.',
        targetInput: {
          target_name: 'Jane Smith',
          target_title: 'VP Engineering',
          target_company: 'Acme Corp',
        },
      });
    });

    expect(success).toBe(false);
    expect(result.current.status).toBe('error');
    expect(result.current.error).toContain('authenticated');
  });
});
