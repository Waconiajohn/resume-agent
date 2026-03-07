/**
 * useNinetyDayPlan — Hook tests.
 *
 * Validates SSE event handling, state transitions, and pipeline lifecycle.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNinetyDayPlan } from '@/hooks/useNinetyDayPlan';

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
  resumeText: 'John Doe, VP of Engineering with 18 years experience in software development and team leadership.',
  targetRole: 'SVP Engineering',
  targetCompany: 'Acme Corp',
  targetIndustry: 'Technology',
  reportingTo: 'CTO',
  teamSize: '50 engineers',
};

// ─── Tests ──────────────────────────────────────────────────────────

describe('useNinetyDayPlan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid' });
  });

  it('starts in idle state with null report and qualityScore', () => {
    const { result } = renderHook(() => useNinetyDayPlan());
    expect(result.current.status).toBe('idle');
    expect(result.current.report).toBeNull();
    expect(result.current.qualityScore).toBeNull();
    expect(result.current.activityMessages).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.currentStage).toBeNull();
  });

  it('has startPipeline and reset functions', () => {
    const { result } = renderHook(() => useNinetyDayPlan());
    expect(typeof result.current.startPipeline).toBe('function');
    expect(typeof result.current.reset).toBe('function');
  });

  it('reset returns to idle state', () => {
    const { result } = renderHook(() => useNinetyDayPlan());
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

  it('startPipeline calls ninety-day-plan/start with correct body', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({ ok: true, body: { [Symbol.asyncIterator]: async function* () {} } });

    vi.stubGlobal('fetch', mockFetch);

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {},
    });

    const { result } = renderHook(() => useNinetyDayPlan());

    await act(async () => {
      await result.current.startPipeline(sampleInput);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/ninety-day-plan/start',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('VP of Engineering'),
      }),
    );

    // Verify the body includes all expected fields
    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.session_id).toBe('test-uuid');
    expect(body.resume_text).toContain('VP of Engineering');
    expect(body.target_role).toBe('SVP Engineering');
    expect(body.target_company).toBe('Acme Corp');
    expect(body.target_industry).toBe('Technology');
    expect(body.reporting_to).toBe('CTO');
    expect(body.team_size).toBe('50 engineers');
  });

  it('startPipeline sets error on fetch failure', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal server error'),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { result } = renderHook(() => useNinetyDayPlan());

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

    const { result } = renderHook(() => useNinetyDayPlan());

    let success: boolean = true;
    await act(async () => {
      success = await result.current.startPipeline(sampleInput);
    });

    expect(success).toBe(false);
    expect(result.current.status).toBe('error');
    expect(result.current.error).toContain('authenticated');
  });

  it('handles plan_complete event (sets report, qualityScore, status=complete)', () => {
    const event = makeEvent('plan_complete', {
      session_id: 'test-uuid',
      report: '# 90-Day Strategic Plan',
      quality_score: 92,
      phase_count: 3,
    });

    const parsed = JSON.parse(event.data);
    expect(parsed.report).toBe('# 90-Day Strategic Plan');
    expect(parsed.quality_score).toBe(92);
    expect(parsed.phase_count).toBe(3);
  });

  it('handles research_complete event (adds activity with stakeholder and quick win counts)', () => {
    const event = makeEvent('research_complete', {
      stakeholder_count: 10,
      quick_win_count: 4,
      learning_priority_count: 6,
    });

    const parsed = JSON.parse(event.data);
    expect(parsed.stakeholder_count).toBe(10);
    expect(parsed.quick_win_count).toBe(4);
    expect(parsed.learning_priority_count).toBe(6);
  });

  it('handles phase_drafted event (adds activity with phase, title, activity_count)', () => {
    const event = makeEvent('phase_drafted', {
      phase: 30,
      title: 'Listen & Learn',
      activity_count: 8,
    });

    const parsed = JSON.parse(event.data);
    expect(parsed.phase).toBe(30);
    expect(parsed.title).toBe('Listen & Learn');
    expect(parsed.activity_count).toBe(8);
  });

  it('handles phase_complete event (adds activity with phase, title, milestone_count)', () => {
    const event = makeEvent('phase_complete', {
      phase: 60,
      title: 'Contribute & Build',
      milestone_count: 5,
    });

    const parsed = JSON.parse(event.data);
    expect(parsed.phase).toBe(60);
    expect(parsed.title).toBe('Contribute & Build');
    expect(parsed.milestone_count).toBe(5);
  });

  it('handles stage_start event (updates currentStage, adds activity)', () => {
    const event = makeEvent('stage_start', {
      stage: 'research',
      message: 'Analyzing role context and mapping stakeholders...',
    });

    const parsed = JSON.parse(event.data);
    expect(parsed.stage).toBe('research');
    expect(parsed.message).toContain('stakeholders');
  });

  it('handles transparency event (adds activity)', () => {
    const event = makeEvent('transparency', {
      stage: 'map_stakeholders',
      message: 'Mapping stakeholders for VP Engineering at Acme Corp...',
    });

    const parsed = JSON.parse(event.data);
    expect(parsed.stage).toBe('map_stakeholders');
    expect(parsed.message).toContain('stakeholders');
  });
});
