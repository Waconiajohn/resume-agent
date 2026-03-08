/**
 * useCounterOfferSim — Hook tests.
 *
 * Validates SSE event handling, state transitions, and pipeline lifecycle.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCounterOfferSim } from '@/hooks/useCounterOfferSim';
import type { EmployerPushback, UserResponseEvaluation, SimulationSummary } from '@/hooks/useCounterOfferSim';

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
  resumeText: 'Jane Smith, VP Operations with 12 years of supply chain experience.',
  offerCompany: 'Acme Corp',
  offerRole: 'VP of Operations',
  offerBaseSalary: 185000,
  offerTotalComp: 225000,
  targetSalary: 200000,
  mode: 'full' as const,
};

const samplePushback: EmployerPushback = {
  round: 1,
  round_type: 'initial_response',
  employer_statement: "We appreciate your interest, but our budget for this role is firmly set at $185,000. This is the maximum we can offer.",
  employer_tactic: 'Budget Constraints',
  coaching_hint: 'They are testing your resolve. Acknowledge their position, then pivot to your market data and total value.',
};

const sampleEvaluation: UserResponseEvaluation = {
  round: 1,
  user_response: 'I understand the budget constraints. However, based on market data for VP Operations roles in this region, the median compensation is $195,000-$210,000.',
  scores: {
    confidence: 82,
    value_anchoring: 88,
    specificity: 75,
    collaboration: 80,
  },
  overall_score: 81,
  what_worked: ['Led with market data — strong anchoring', 'Maintained collaborative tone'],
  what_to_improve: ['Add a specific value statement tied to your past results', 'Be more explicit about your walk-away point'],
  coach_note: 'Good start. Next time, open with your most compelling accomplishment before introducing market data.',
};

const sampleSummary: SimulationSummary = {
  overall_score: 79,
  total_rounds: 3,
  best_round: 2,
  strengths: ['Consistent market data anchoring', 'Maintained collaborative posture throughout'],
  areas_for_improvement: ['Specificity in value statements', 'Confidence on final ask'],
  recommendation: 'Strong foundation. Practice making your ROI case more concrete — tie your past results to dollar figures.',
};

// ─── Tests ──────────────────────────────────────────────────────────

describe('useCounterOfferSim', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {},
    });
  });

  it('initial state is idle with empty evaluations', () => {
    const { result } = renderHook(() => useCounterOfferSim());
    expect(result.current.status).toBe('idle');
    expect(result.current.currentPushback).toBeNull();
    expect(result.current.evaluations).toEqual([]);
    expect(result.current.summary).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.activityMessages).toEqual([]);
  });

  it('startSimulation POSTs to /api/counter-offer-sim/start with correct payload', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({ ok: true, body: { [Symbol.asyncIterator]: async function* () {} } });

    vi.stubGlobal('fetch', mockFetch);

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {},
    });

    const { result } = renderHook(() => useCounterOfferSim());

    await act(async () => {
      await result.current.startSimulation(sampleInput);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/counter-offer-sim/start',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-token',
        }),
      }),
    );

    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body as string) as Record<string, unknown>;
    expect(body.resume_text).toBe(sampleInput.resumeText);
    expect(body.offer_company).toBe('Acme Corp');
    expect(body.offer_role).toBe('VP of Operations');
    expect(body.offer_base_salary).toBe(185000);
    expect(body.mode).toBe('full');
  });

  it('SSE: pushback_presented event sets currentPushback and status to waiting_for_response', async () => {
    const event = makeEvent('pushback_presented', { pushback: samplePushback } as unknown as Record<string, unknown>);

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({ ok: true, body: { [Symbol.asyncIterator]: async function* () {} } });

    vi.stubGlobal('fetch', mockFetch);

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield { event: event.event, data: event.data };
      },
    });

    const { result } = renderHook(() => useCounterOfferSim());

    await act(async () => {
      await result.current.startSimulation(sampleInput);
    });

    expect(result.current.status).toBe('waiting_for_response');
    expect(result.current.currentPushback).not.toBeNull();
    expect(result.current.currentPushback?.round).toBe(1);
    expect(result.current.currentPushback?.round_type).toBe('initial_response');
    expect(result.current.currentPushback?.employer_tactic).toBe('Budget Constraints');
  });

  it('SSE: response_evaluated event appends to evaluations and resets status to running', async () => {
    const event = makeEvent('response_evaluated', { evaluation: sampleEvaluation } as unknown as Record<string, unknown>);

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({ ok: true, body: { [Symbol.asyncIterator]: async function* () {} } });

    vi.stubGlobal('fetch', mockFetch);

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield { event: event.event, data: event.data };
      },
    });

    const { result } = renderHook(() => useCounterOfferSim());

    await act(async () => {
      await result.current.startSimulation(sampleInput);
    });

    expect(result.current.status).toBe('running');
    expect(result.current.evaluations).toHaveLength(1);
    expect(result.current.evaluations[0].overall_score).toBe(81);
    expect(result.current.evaluations[0].scores.value_anchoring).toBe(88);
    expect(result.current.evaluations[0].what_worked).toHaveLength(2);
    expect(result.current.evaluations[0].what_to_improve).toHaveLength(2);
  });

  it('SSE: simulation_complete sets summary and status to complete', async () => {
    const event = makeEvent('simulation_complete', sampleSummary as unknown as Record<string, unknown>);

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({ ok: true, body: { [Symbol.asyncIterator]: async function* () {} } });

    vi.stubGlobal('fetch', mockFetch);

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield { event: event.event, data: event.data };
      },
    });

    const { result } = renderHook(() => useCounterOfferSim());

    await act(async () => {
      await result.current.startSimulation(sampleInput);
    });

    expect(result.current.status).toBe('complete');
    expect(result.current.summary).not.toBeNull();
    expect(result.current.summary?.overall_score).toBe(79);
    expect(result.current.summary?.total_rounds).toBe(3);
    expect(result.current.summary?.best_round).toBe(2);
    expect(result.current.summary?.strengths).toHaveLength(2);
    expect(result.current.summary?.areas_for_improvement).toHaveLength(2);
  });

  it('SSE: pipeline_error event sets error state and error message', async () => {
    const event = makeEvent('pipeline_error', {
      error: 'LLM provider timed out during scenario generation',
      stage: 'scenario_setup',
    });

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({ ok: true, body: { [Symbol.asyncIterator]: async function* () {} } });

    vi.stubGlobal('fetch', mockFetch);

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield { event: event.event, data: event.data };
      },
    });

    const { result } = renderHook(() => useCounterOfferSim());

    await act(async () => {
      await result.current.startSimulation(sampleInput);
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('LLM provider timed out during scenario generation');
  });

  it('submitResponse POSTs to /api/counter-offer-sim/respond with correct payload', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({ ok: true, body: { [Symbol.asyncIterator]: async function* () {} } })
      .mockResolvedValueOnce({ ok: true });

    vi.stubGlobal('fetch', mockFetch);

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {},
    });

    const { result } = renderHook(() => useCounterOfferSim());

    await act(async () => {
      await result.current.startSimulation(sampleInput);
    });

    await act(async () => {
      await result.current.submitResponse('I appreciate your position. Based on market data, the median compensation is $195,000...');
    });

    const respondCall = mockFetch.mock.calls[2];
    expect(respondCall[0]).toBe('http://localhost:3001/api/counter-offer-sim/respond');
    expect(respondCall[1].method).toBe('POST');

    const body = JSON.parse(respondCall[1].body as string) as Record<string, unknown>;
    expect(body.gate).toBe('counter_offer_response');
    expect(body.response).toBe('I appreciate your position. Based on market data, the median compensation is $195,000...');
  });

  it('submitResponse sets status to evaluating before the response arrives', async () => {
    let resolveRespond!: () => void;
    const respondPromise = new Promise<Response>((resolve) => {
      resolveRespond = () => resolve({ ok: true } as Response);
    });

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({ ok: true, body: { [Symbol.asyncIterator]: async function* () {} } })
      .mockReturnValueOnce(respondPromise);

    vi.stubGlobal('fetch', mockFetch);

    const { parseSSEStream } = await import('@/lib/sse-parser');
    const pbEvent = makeEvent('pushback_presented', { pushback: samplePushback } as unknown as Record<string, unknown>);
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield { event: pbEvent.event, data: pbEvent.data };
        // Hang to simulate live stream
        await new Promise(() => {});
      },
    });

    const { result } = renderHook(() => useCounterOfferSim());

    await act(async () => {
      await result.current.startSimulation(sampleInput);
    });

    expect(result.current.status).toBe('waiting_for_response');

    act(() => {
      void result.current.submitResponse('My response here...');
    });

    expect(result.current.status).toBe('evaluating');

    resolveRespond();
  });

  it('reset clears all state back to idle', async () => {
    const evalEvent = makeEvent('response_evaluated', { evaluation: sampleEvaluation } as unknown as Record<string, unknown>);

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({ ok: true, body: { [Symbol.asyncIterator]: async function* () {} } });

    vi.stubGlobal('fetch', mockFetch);

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield { event: evalEvent.event, data: evalEvent.data };
      },
    });

    const { result } = renderHook(() => useCounterOfferSim());

    await act(async () => {
      await result.current.startSimulation(sampleInput);
    });

    expect(result.current.evaluations).toHaveLength(1);

    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.evaluations).toEqual([]);
    expect(result.current.currentPushback).toBeNull();
    expect(result.current.summary).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.activityMessages).toEqual([]);
  });

  it('single_round mode sends correct payload including round_type', async () => {
    const singleRoundInput = {
      resumeText: 'Jane Smith resume text...',
      offerCompany: 'TechCorp',
      offerRole: 'Director of Engineering',
      mode: 'single_round' as const,
      roundType: 'budget_constraints',
    };

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({ ok: true, body: { [Symbol.asyncIterator]: async function* () {} } });

    vi.stubGlobal('fetch', mockFetch);

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {},
    });

    const { result } = renderHook(() => useCounterOfferSim());

    await act(async () => {
      await result.current.startSimulation(singleRoundInput);
    });

    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body as string) as Record<string, unknown>;
    expect(body.mode).toBe('single_round');
    expect(body.round_type).toBe('budget_constraints');
  });

  it('SSE: transparency event adds to activityMessages', async () => {
    const event = makeEvent('transparency', {
      stage: 'scenario_setup',
      message: 'Building your negotiation scenario based on the offer details...',
    });

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({ ok: true, body: { [Symbol.asyncIterator]: async function* () {} } });

    vi.stubGlobal('fetch', mockFetch);

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield { event: event.event, data: event.data };
      },
    });

    const { result } = renderHook(() => useCounterOfferSim());

    await act(async () => {
      await result.current.startSimulation(sampleInput);
    });

    expect(result.current.activityMessages).toHaveLength(1);
    expect(result.current.activityMessages[0].text).toBe('Building your negotiation scenario based on the offer details...');
    expect(result.current.activityMessages[0].stage).toBe('scenario_setup');
  });

  it('cleanup: abort controller fires on unmount without errors', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({ ok: true, body: { [Symbol.asyncIterator]: async function* () {} } });

    vi.stubGlobal('fetch', mockFetch);

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        await new Promise(() => {});
      },
    });

    const { result, unmount } = renderHook(() => useCounterOfferSim());

    await act(async () => {
      await result.current.startSimulation(sampleInput);
    });

    expect(() => unmount()).not.toThrow();

    expect(mockFetch.mock.calls[1][0]).toContain('/counter-offer-sim/');
    expect(mockFetch.mock.calls[1][0]).toContain('/stream');
  });

  it('SSE: stage_start and stage_complete events add to activityMessages', async () => {
    const startEvent = makeEvent('stage_start', {
      stage: 'scenario_generation',
      message: 'Generating employer pushback scenario...',
    });
    const completeEvent = makeEvent('stage_complete', {
      stage: 'scenario_generation',
      message: 'Scenario ready — starting negotiation',
    });

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({ ok: true, body: { [Symbol.asyncIterator]: async function* () {} } });

    vi.stubGlobal('fetch', mockFetch);

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield { event: startEvent.event, data: startEvent.data };
        yield { event: completeEvent.event, data: completeEvent.data };
      },
    });

    const { result } = renderHook(() => useCounterOfferSim());

    await act(async () => {
      await result.current.startSimulation(sampleInput);
    });

    expect(result.current.activityMessages).toHaveLength(2);
    expect(result.current.activityMessages[0].text).toBe('Generating employer pushback scenario...');
    expect(result.current.activityMessages[1].text).toBe('Scenario ready — starting negotiation');
  });

  it('unauthenticated: sets error state when no session token', async () => {
    const { supabase: mockSupabase } = await import('@/lib/supabase');
    (mockSupabase.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { session: null },
    });

    const { result } = renderHook(() => useCounterOfferSim());

    await act(async () => {
      await result.current.startSimulation(sampleInput);
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Not authenticated');
  });
});
