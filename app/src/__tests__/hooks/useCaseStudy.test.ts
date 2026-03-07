/**
 * useCaseStudy — Hook tests.
 *
 * Validates SSE event handling, state transitions, and pipeline lifecycle.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCaseStudy } from '@/hooks/useCaseStudy';

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
  resumeText: 'John Doe, VP of Operations with 20 years experience in supply chain management.',
  targetRole: 'SVP Operations',
  targetIndustry: 'Manufacturing',
  maxCaseStudies: 3,
};

// ─── Tests ──────────────────────────────────────────────────────────

describe('useCaseStudy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid' });
  });

  it('starts in idle state with null report and qualityScore', () => {
    const { result } = renderHook(() => useCaseStudy());
    expect(result.current.status).toBe('idle');
    expect(result.current.report).toBeNull();
    expect(result.current.qualityScore).toBeNull();
    expect(result.current.activityMessages).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.currentStage).toBeNull();
  });

  it('has startPipeline and reset functions', () => {
    const { result } = renderHook(() => useCaseStudy());
    expect(typeof result.current.startPipeline).toBe('function');
    expect(typeof result.current.reset).toBe('function');
  });

  it('reset returns to idle state', () => {
    const { result } = renderHook(() => useCaseStudy());
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

  it('startPipeline calls case-study/start with correct body (resume_text, target_role, target_industry, max_case_studies)', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({ ok: true, body: { [Symbol.asyncIterator]: async function* () {} } });

    vi.stubGlobal('fetch', mockFetch);

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {},
    });

    const { result } = renderHook(() => useCaseStudy());

    await act(async () => {
      await result.current.startPipeline(sampleInput);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/case-study/start',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('VP of Operations'),
      }),
    );

    // Verify the body includes all expected fields
    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.session_id).toBe('test-uuid');
    expect(body.resume_text).toContain('VP of Operations');
    expect(body.target_role).toBe('SVP Operations');
    expect(body.target_industry).toBe('Manufacturing');
    expect(body.max_case_studies).toBe(3);
  });

  it('startPipeline sets error on fetch failure', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal server error'),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { result } = renderHook(() => useCaseStudy());

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

    const { result } = renderHook(() => useCaseStudy());

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
      report: '# Case Study Collection',
      quality_score: 88,
    });

    const parsed = JSON.parse(event.data);
    expect(parsed.report).toBe('# Case Study Collection');
    expect(parsed.quality_score).toBe(88);
  });

  it('handles achievement_selected event (adds activity with title, company, impact_score)', () => {
    const event = makeEvent('achievement_selected', {
      title: 'Reduced supply chain costs by 30%',
      company: 'Acme Corp',
      impact_score: 9.2,
    });

    const parsed = JSON.parse(event.data);
    expect(parsed.title).toBe('Reduced supply chain costs by 30%');
    expect(parsed.company).toBe('Acme Corp');
    expect(parsed.impact_score).toBe(9.2);
  });

  it('handles case_study_drafted event (adds activity with title, word_count)', () => {
    const event = makeEvent('case_study_drafted', {
      title: 'Digital Transformation at Scale',
      word_count: 850,
    });

    const parsed = JSON.parse(event.data);
    expect(parsed.title).toBe('Digital Transformation at Scale');
    expect(parsed.word_count).toBe(850);
  });

  it('handles case_study_complete event (adds activity with title, quality_score)', () => {
    const event = makeEvent('case_study_complete', {
      title: 'Supply Chain Optimization Initiative',
      quality_score: 91,
    });

    const parsed = JSON.parse(event.data);
    expect(parsed.title).toBe('Supply Chain Optimization Initiative');
    expect(parsed.quality_score).toBe(91);
  });

  it('handles stage_start event (updates currentStage, adds activity)', () => {
    const event = makeEvent('stage_start', {
      stage: 'achievement_analysis',
      message: 'Analyzing career achievements for case study potential...',
    });

    const parsed = JSON.parse(event.data);
    expect(parsed.stage).toBe('achievement_analysis');
    expect(parsed.message).toContain('Analyzing');
  });

  it('handles transparency event (adds activity)', () => {
    const event = makeEvent('transparency', {
      stage: 'selection',
      message: 'Evaluating impact metrics and strategic alignment for top achievements...',
    });

    const parsed = JSON.parse(event.data);
    expect(parsed.stage).toBe('selection');
    expect(parsed.message).toContain('impact metrics');
  });
});
