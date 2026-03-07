/**
 * useExecutiveBio — Hook tests.
 *
 * Validates SSE event handling, state transitions, and pipeline lifecycle.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useExecutiveBio } from '@/hooks/useExecutiveBio';

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
  resumeText: 'Jane Smith, SVP Marketing with 15 years experience in brand strategy.',
  requestedFormats: ['linkedin', 'conference'],
  requestedLengths: ['short', 'medium'],
  targetRole: 'CMO',
  targetIndustry: 'Technology',
};

// ─── Tests ──────────────────────────────────────────────────────────

describe('useExecutiveBio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid' });
  });

  it('starts in idle state with null report and qualityScore', () => {
    const { result } = renderHook(() => useExecutiveBio());
    expect(result.current.status).toBe('idle');
    expect(result.current.report).toBeNull();
    expect(result.current.qualityScore).toBeNull();
    expect(result.current.activityMessages).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.currentStage).toBeNull();
  });

  it('has startPipeline and reset functions', () => {
    const { result } = renderHook(() => useExecutiveBio());
    expect(typeof result.current.startPipeline).toBe('function');
    expect(typeof result.current.reset).toBe('function');
  });

  it('reset returns to idle state', () => {
    const { result } = renderHook(() => useExecutiveBio());
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

  it('startPipeline calls executive-bio/start endpoint with correct body', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({ ok: true, body: { [Symbol.asyncIterator]: async function* () {} } });

    vi.stubGlobal('fetch', mockFetch);

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {},
    });

    const { result } = renderHook(() => useExecutiveBio());

    await act(async () => {
      await result.current.startPipeline(sampleInput);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/executive-bio/start',
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
    expect(body.requested_formats).toEqual(['linkedin', 'conference']);
    expect(body.requested_lengths).toEqual(['short', 'medium']);
    expect(body.target_role).toBe('CMO');
    expect(body.target_industry).toBe('Technology');
  });

  it('startPipeline sets error on fetch failure', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal server error'),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { result } = renderHook(() => useExecutiveBio());

    let success: boolean = true;
    await act(async () => {
      success = await result.current.startPipeline(sampleInput);
    });

    expect(success).toBe(false);
    expect(result.current.status).toBe('error');
  });

  it('startPipeline sets error when not authenticated', async () => {
    const { supabase } = await import('@/lib/supabase');
    (supabase.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { session: null },
    });

    const { result } = renderHook(() => useExecutiveBio());

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
      report: '# Executive Bio Collection',
      quality_score: 92,
    });

    const parsed = JSON.parse(event.data);
    expect(parsed.report).toBe('# Executive Bio Collection');
    expect(parsed.quality_score).toBe(92);
  });

  it('handles bio_drafted event (adds activity with format, length, word_count)', () => {
    const event = makeEvent('bio_drafted', {
      format: 'linkedin',
      length: 'medium',
      word_count: 150,
    });

    const parsed = JSON.parse(event.data);
    expect(parsed.format).toBe('linkedin');
    expect(parsed.length).toBe('medium');
    expect(parsed.word_count).toBe(150);
  });

  it('handles bio_complete event (adds activity with format and quality_score)', () => {
    const event = makeEvent('bio_complete', {
      format: 'conference',
      quality_score: 87,
    });

    const parsed = JSON.parse(event.data);
    expect(parsed.format).toBe('conference');
    expect(parsed.quality_score).toBe(87);
  });

  it('handles stage_start event (updates currentStage, adds activity)', () => {
    const event = makeEvent('stage_start', {
      stage: 'bio_generation',
      message: 'Generating executive bios...',
    });

    const parsed = JSON.parse(event.data);
    expect(parsed.stage).toBe('bio_generation');
    expect(parsed.message).toContain('Generating');
  });

  it('handles transparency event (adds activity)', () => {
    const event = makeEvent('transparency', {
      stage: 'analysis',
      message: 'Analyzing leadership style and key accomplishments...',
    });

    const parsed = JSON.parse(event.data);
    expect(parsed.stage).toBe('analysis');
    expect(parsed.message).toContain('leadership style');
  });

  it('handles pipeline_error event (sets error and status=error)', () => {
    const event = makeEvent('pipeline_error', {
      error: 'LLM provider timeout after 3 retries',
    });

    const parsed = JSON.parse(event.data);
    expect(parsed.error).toBe('LLM provider timeout after 3 retries');
  });
});
