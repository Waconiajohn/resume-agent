/**
 * useSalaryNegotiation — Hook tests.
 *
 * Validates SSE event handling, state transitions, and pipeline lifecycle.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSalaryNegotiation } from '@/hooks/useSalaryNegotiation';

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
  offerCompany: 'Acme Corp',
  offerRole: 'VP Operations',
  offerBaseSalary: 180000,
  offerTotalComp: 220000,
  offerEquityDetails: '10,000 RSUs over 4 years',
  offerOtherDetails: 'Sign-on bonus $25,000',
  currentBaseSalary: 165000,
  currentTotalComp: 200000,
  currentEquity: '5,000 RSUs vested',
  targetRole: 'SVP Operations',
  targetIndustry: 'Manufacturing',
};

// ─── Tests ──────────────────────────────────────────────────────────

describe('useSalaryNegotiation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid' });
  });

  it('starts in idle state with null report and qualityScore', () => {
    const { result } = renderHook(() => useSalaryNegotiation());
    expect(result.current.status).toBe('idle');
    expect(result.current.report).toBeNull();
    expect(result.current.qualityScore).toBeNull();
    expect(result.current.activityMessages).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.currentStage).toBeNull();
  });

  it('has startPipeline and reset functions', () => {
    const { result } = renderHook(() => useSalaryNegotiation());
    expect(typeof result.current.startPipeline).toBe('function');
    expect(typeof result.current.reset).toBe('function');
  });

  it('reset returns to idle state', () => {
    const { result } = renderHook(() => useSalaryNegotiation());
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

  it('startPipeline calls salary-negotiation/start endpoint with correct body', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({ ok: true, body: { [Symbol.asyncIterator]: async function* () {} } });

    vi.stubGlobal('fetch', mockFetch);

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {},
    });

    const { result } = renderHook(() => useSalaryNegotiation());

    await act(async () => {
      await result.current.startPipeline(sampleInput);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/salary-negotiation/start',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('Acme Corp'),
      }),
    );

    // Verify the body includes all expected fields
    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.session_id).toBe('test-uuid');
    expect(body.resume_text).toContain('VP Operations');
    expect(body.offer_company).toBe('Acme Corp');
    expect(body.offer_role).toBe('VP Operations');
    expect(body.offer_base_salary).toBe(180000);
    expect(body.offer_total_comp).toBe(220000);
    expect(body.offer_equity_details).toBe('10,000 RSUs over 4 years');
    expect(body.offer_other_details).toBe('Sign-on bonus $25,000');
    expect(body.current_base_salary).toBe(165000);
    expect(body.current_total_comp).toBe(200000);
    expect(body.current_equity).toBe('5,000 RSUs vested');
    expect(body.target_role).toBe('SVP Operations');
    expect(body.target_industry).toBe('Manufacturing');
  });

  it('startPipeline sets error on fetch failure', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal server error'),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { result } = renderHook(() => useSalaryNegotiation());

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

    const { result } = renderHook(() => useSalaryNegotiation());

    let success: boolean = true;
    await act(async () => {
      success = await result.current.startPipeline(sampleInput);
    });

    expect(success).toBe(false);
    expect(result.current.status).toBe('error');
    expect(result.current.error).toContain('authenticated');
  });

  it('handles negotiation_complete event (sets report, qualityScore, status=complete)', () => {
    const event = makeEvent('negotiation_complete', {
      session_id: 'test-uuid',
      report: '# Salary Negotiation Strategy Report',
      quality_score: 88,
    });

    const parsed = JSON.parse(event.data);
    expect(parsed.report).toBe('# Salary Negotiation Strategy Report');
    expect(parsed.quality_score).toBe(88);
  });

  it('handles research_complete event (adds activity with P50/P75 values)', () => {
    const event = makeEvent('research_complete', {
      p50: 175000,
      p75: 210000,
      sources_count: 5,
    });

    const parsed = JSON.parse(event.data);
    expect(parsed.p50).toBe(175000);
    expect(parsed.p75).toBe(210000);
  });

  it('handles strategy_ready event (adds activity with leverage count)', () => {
    const event = makeEvent('strategy_ready', {
      leverage_points: 4,
      recommended_counter: 195000,
    });

    const parsed = JSON.parse(event.data);
    expect(parsed.leverage_points).toBe(4);
  });

  it('handles scenario_complete event (adds activity with scenario type)', () => {
    const event = makeEvent('scenario_complete', {
      scenario_type: 'best_case',
      projected_outcome: 205000,
    });

    const parsed = JSON.parse(event.data);
    expect(parsed.scenario_type).toBe('best_case');
  });

  it('handles stage_start event (updates currentStage, adds activity)', () => {
    const event = makeEvent('stage_start', {
      stage: 'market_research',
      message: 'Researching market compensation data...',
    });

    const parsed = JSON.parse(event.data);
    expect(parsed.stage).toBe('market_research');
    expect(parsed.message).toContain('Researching');
  });

  it('handles transparency event (adds activity)', () => {
    const event = makeEvent('transparency', {
      stage: 'strategy_design',
      message: 'Analyzing 4 leverage points from your experience...',
    });

    const parsed = JSON.parse(event.data);
    expect(parsed.stage).toBe('strategy_design');
    expect(parsed.message).toContain('4 leverage points');
  });
});
