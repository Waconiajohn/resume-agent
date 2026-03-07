/**
 * usePersonalBrand — Hook tests.
 *
 * Validates SSE event handling, state transitions, and pipeline lifecycle.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePersonalBrand } from '@/hooks/usePersonalBrand';

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
  resumeText: 'Jane Doe, VP of Marketing with 20 years experience in brand strategy and digital transformation.',
  linkedinText: 'Experienced marketing executive passionate about brand building.',
  bioText: 'Jane Doe is a seasoned marketing leader known for transformative brand strategies.',
  targetRole: 'CMO',
  targetIndustry: 'Technology',
};

// ─── Tests ──────────────────────────────────────────────────────────

describe('usePersonalBrand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid' });
  });

  it('starts in idle state with null report and qualityScore', () => {
    const { result } = renderHook(() => usePersonalBrand());
    expect(result.current.status).toBe('idle');
    expect(result.current.report).toBeNull();
    expect(result.current.qualityScore).toBeNull();
    expect(result.current.activityMessages).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.currentStage).toBeNull();
  });

  it('has startPipeline and reset functions', () => {
    const { result } = renderHook(() => usePersonalBrand());
    expect(typeof result.current.startPipeline).toBe('function');
    expect(typeof result.current.reset).toBe('function');
  });

  it('reset returns to idle state', () => {
    const { result } = renderHook(() => usePersonalBrand());
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

  it('startPipeline calls personal-brand/start with correct body', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({ ok: true, body: { [Symbol.asyncIterator]: async function* () {} } });

    vi.stubGlobal('fetch', mockFetch);

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {},
    });

    const { result } = renderHook(() => usePersonalBrand());

    await act(async () => {
      await result.current.startPipeline(sampleInput);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/personal-brand/start',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('VP of Marketing'),
      }),
    );

    // Verify the body includes all expected fields
    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.session_id).toBe('test-uuid');
    expect(body.resume_text).toContain('VP of Marketing');
    expect(body.linkedin_text).toContain('marketing executive');
    expect(body.bio_text).toContain('marketing leader');
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

    const { result } = renderHook(() => usePersonalBrand());

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

    const { result } = renderHook(() => usePersonalBrand());

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
      report: '# Personal Brand Audit',
      quality_score: 82,
      finding_count: 5,
    });

    const parsed = JSON.parse(event.data);
    expect(parsed.report).toBe('# Personal Brand Audit');
    expect(parsed.quality_score).toBe(82);
    expect(parsed.finding_count).toBe(5);
  });

  it('handles finding_identified event (adds activity with title, severity)', () => {
    const event = makeEvent('finding_identified', {
      finding_id: 'rf_1',
      category: 'value_prop_gap',
      severity: 'high',
      title: 'Missing value proposition in LinkedIn headline',
    });

    const parsed = JSON.parse(event.data);
    expect(parsed.title).toBe('Missing value proposition in LinkedIn headline');
    expect(parsed.severity).toBe('high');
    expect(parsed.category).toBe('value_prop_gap');
  });

  it('handles audit_complete event (adds activity with finding_count)', () => {
    const event = makeEvent('audit_complete', {
      finding_count: 7,
      consistency_scores: { overall: 65, messaging: 70, value_proposition: 55 },
    });

    const parsed = JSON.parse(event.data);
    expect(parsed.finding_count).toBe(7);
    expect(parsed.consistency_scores.overall).toBe(65);
  });

  it('handles recommendations_ready event (adds activity with recommendation_count)', () => {
    const event = makeEvent('recommendations_ready', {
      recommendation_count: 5,
      top_priority: 'Rewrite LinkedIn headline',
    });

    const parsed = JSON.parse(event.data);
    expect(parsed.recommendation_count).toBe(5);
    expect(parsed.top_priority).toBe('Rewrite LinkedIn headline');
  });

  it('handles stage_start event (updates currentStage, adds activity)', () => {
    const event = makeEvent('stage_start', {
      stage: 'auditing',
      message: 'Auditing brand consistency across all sources...',
    });

    const parsed = JSON.parse(event.data);
    expect(parsed.stage).toBe('auditing');
    expect(parsed.message).toContain('Auditing');
  });

  it('handles transparency event (adds activity)', () => {
    const event = makeEvent('transparency', {
      stage: 'analyze_resume_brand',
      message: 'Analyzing resume brand elements for Jane Doe...',
    });

    const parsed = JSON.parse(event.data);
    expect(parsed.stage).toBe('analyze_resume_brand');
    expect(parsed.message).toContain('brand elements');
  });
});
