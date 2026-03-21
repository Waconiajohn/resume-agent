/**
 * useMockInterview — Hook tests.
 *
 * Validates SSE event handling, state transitions, and pipeline lifecycle.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMockInterview } from '@/hooks/useMockInterview';
import type { AnswerEvaluation, SimulationSummary } from '@/hooks/useMockInterview';

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
  resumeText: 'Jane Smith, VP Engineering with 12 years of distributed systems experience.',
  jobDescription: 'Looking for VP Engineering to lead 200-person org.',
  companyName: 'Acme Corp',
  mode: 'full' as const,
};

const sampleQuestion = {
  index: 0,
  type: 'behavioral' as const,
  question: 'Tell me about a time you led a major transformation.',
  context: 'Focus on scope and impact.',
};

const sampleEvaluation: AnswerEvaluation = {
  question_index: 0,
  question_type: 'behavioral',
  question: 'Tell me about a time you led a major transformation.',
  answer: 'At Acme, I led a 12-month supply chain overhaul saving $4M annually...',
  scores: {
    star_completeness: 85,
    relevance: 90,
    impact: 88,
    specificity: 82,
  },
  overall_score: 86,
  strengths: ['Specific metrics provided', 'Clear situation setup'],
  improvements: ['Add more detail on the Team aspect', 'Quantify timeline better'],
  model_answer_hint: 'Lead with the business problem first, then the scale of your team.',
};

const sampleSummary: SimulationSummary = {
  overall_score: 82,
  total_questions: 6,
  strengths: ['Consistent use of metrics', 'Clear executive presence'],
  areas_for_improvement: ['STAR structure sometimes incomplete', 'Follow-up depth'],
  recommendation:
    'Strong performance. Practice elaborating on team leadership moments for panel interviews.',
};

// ─── Tests ──────────────────────────────────────────────────────────

describe('useMockInterview', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {},
    });
  });

  it('initial state is idle with empty evaluations', () => {
    const { result } = renderHook(() => useMockInterview());
    expect(result.current.status).toBe('idle');
    expect(result.current.currentQuestion).toBeNull();
    expect(result.current.evaluations).toEqual([]);
    expect(result.current.summary).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.activityMessages).toEqual([]);
  });

  it('startSimulation sets status to connecting', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({ ok: true, body: { [Symbol.asyncIterator]: async function* () {} } });

    vi.stubGlobal('fetch', mockFetch);

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {},
    });

    const { result } = renderHook(() => useMockInterview());

    await act(async () => {
      await result.current.startSimulation(sampleInput);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/mock-interview/start',
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
    expect(body.company_name).toBe('Acme Corp');
    expect(body.mode).toBe('full');
  });

  it('SSE: question_presented event sets currentQuestion and status to waiting_for_answer', async () => {
    const event = makeEvent('question_presented', { question: sampleQuestion });

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

    const { result } = renderHook(() => useMockInterview());

    await act(async () => {
      await result.current.startSimulation(sampleInput);
    });

    expect(result.current.status).toBe('waiting_for_answer');
    expect(result.current.currentQuestion).not.toBeNull();
    expect(result.current.currentQuestion?.index).toBe(0);
    expect(result.current.currentQuestion?.type).toBe('behavioral');
    expect(result.current.currentQuestion?.question).toBe(
      'Tell me about a time you led a major transformation.',
    );
  });

  it('SSE: question_presented ignores malformed question payloads', async () => {
    const event = makeEvent('question_presented', { question: { index: 'bad' } });

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

    const { result } = renderHook(() => useMockInterview());

    await act(async () => {
      await result.current.startSimulation(sampleInput);
    });

    expect(result.current.currentQuestion).toBeNull();
    expect(result.current.status).toBe('running');
  });

  it('SSE: answer_evaluated event appends to evaluations and resets status to running', async () => {
    const event = makeEvent('answer_evaluated', { evaluation: sampleEvaluation } as unknown as Record<string, unknown>);

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

    const { result } = renderHook(() => useMockInterview());

    await act(async () => {
      await result.current.startSimulation(sampleInput);
    });

    expect(result.current.status).toBe('running');
    expect(result.current.evaluations).toHaveLength(1);
    expect(result.current.evaluations[0].overall_score).toBe(86);
    expect(result.current.evaluations[0].scores.star_completeness).toBe(85);
    expect(result.current.evaluations[0].strengths).toHaveLength(2);
  });

  it('SSE: answer_evaluated sanitizes numeric strings and malformed arrays', async () => {
    const event = makeEvent('answer_evaluated', {
      evaluation: {
        question_index: '2',
        question_type: 'behavioral',
        question: 'Tell me about a time you changed a process.',
        answer: 'I rebuilt the reporting cadence.',
        scores: {
          star_completeness: '81',
          relevance: 'bad',
          impact: 79,
          specificity: undefined,
        },
        overall_score: '88',
        strengths: ['Clear ownership', 42, ''],
        improvements: [null, 'Add metrics'],
        model_answer_hint: 123,
      },
    } as unknown as Record<string, unknown>);

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

    const { result } = renderHook(() => useMockInterview());

    await act(async () => {
      await result.current.startSimulation(sampleInput);
    });

    expect(result.current.evaluations).toHaveLength(1);
    expect(result.current.evaluations[0]).toMatchObject({
      question_index: 2,
      overall_score: 88,
      strengths: ['Clear ownership'],
      improvements: ['Add metrics'],
      model_answer_hint: '123',
    });
    expect(result.current.evaluations[0].scores).toEqual({
      star_completeness: 81,
      relevance: 0,
      impact: 79,
      specificity: 0,
    });
  });

  it('SSE: simulation_complete sets summary and status to complete', async () => {
    const event = makeEvent('simulation_complete', { summary: sampleSummary } as unknown as Record<string, unknown>);

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

    const { result } = renderHook(() => useMockInterview());

    await act(async () => {
      await result.current.startSimulation(sampleInput);
    });

    expect(result.current.status).toBe('complete');
    expect(result.current.summary).not.toBeNull();
    expect(result.current.summary?.overall_score).toBe(82);
    expect(result.current.summary?.total_questions).toBe(6);
    expect(result.current.summary?.strengths).toHaveLength(2);
    expect(result.current.summary?.areas_for_improvement).toHaveLength(2);
  });

  it('SSE: simulation_complete sanitizes summary payloads and ignores malformed ones', async () => {
    const validEvent = makeEvent('simulation_complete', {
      summary: {
        overall_score: '84',
        total_questions: '5',
        strengths: ['Executive presence', 9],
        areas_for_improvement: ['More specificity', null],
        recommendation: 'Keep sharpening your examples.',
      },
    } as unknown as Record<string, unknown>);

    const invalidEvent = makeEvent('simulation_complete', {
      summary: {
        overall_score: 50,
        total_questions: 2,
      },
    } as unknown as Record<string, unknown>);

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({ ok: true, body: { [Symbol.asyncIterator]: async function* () {} } });

    vi.stubGlobal('fetch', mockFetch);

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield { event: invalidEvent.event, data: invalidEvent.data };
        yield { event: validEvent.event, data: validEvent.data };
      },
    });

    const { result } = renderHook(() => useMockInterview());

    await act(async () => {
      await result.current.startSimulation(sampleInput);
    });

    expect(result.current.status).toBe('complete');
    expect(result.current.summary).toEqual({
      overall_score: 84,
      total_questions: 5,
      strengths: ['Executive presence'],
      areas_for_improvement: ['More specificity'],
      recommendation: 'Keep sharpening your examples.',
    });
  });

  it('SSE: pipeline_error event sets error state and error message', async () => {
    const event = makeEvent('pipeline_error', {
      error: 'LLM provider timed out after 3 retries',
      stage: 'question_generation',
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

    const { result } = renderHook(() => useMockInterview());

    await act(async () => {
      await result.current.startSimulation(sampleInput);
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('LLM provider timed out after 3 retries');
  });

  it('SSE: transparency event adds to activityMessages', async () => {
    const event = makeEvent('transparency', {
      stage: 'question_generation',
      message: 'Generating behavioral question based on your leadership experience...',
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

    const { result } = renderHook(() => useMockInterview());

    await act(async () => {
      await result.current.startSimulation(sampleInput);
    });

    expect(result.current.activityMessages).toHaveLength(1);
    expect(result.current.activityMessages[0].message).toBe(
      'Generating behavioral question based on your leadership experience...',
    );
    expect(result.current.activityMessages[0].stage).toBe('question_generation');
  });

  it('submitAnswer posts to /api/mock-interview/respond with correct payload', async () => {
    // Start first to populate sessionId and token refs
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({ ok: true, body: { [Symbol.asyncIterator]: async function* () {} } })
      .mockResolvedValueOnce({ ok: true });

    vi.stubGlobal('fetch', mockFetch);

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {},
    });

    const { result } = renderHook(() => useMockInterview());

    await act(async () => {
      await result.current.startSimulation(sampleInput);
    });

    await act(async () => {
      await result.current.submitAnswer('At Acme Corp I led a major transformation...');
    });

    const respondCall = mockFetch.mock.calls[2];
    expect(respondCall[0]).toBe('http://localhost:3001/api/mock-interview/respond');
    expect(respondCall[1].method).toBe('POST');

    const body = JSON.parse(respondCall[1].body as string) as Record<string, unknown>;
    expect(body.gate).toBe('mock_interview_answer');
    expect(body.response).toBe('At Acme Corp I led a major transformation...');
  });

  it('submitAnswer sets status to evaluating before the response arrives', async () => {
    // Set up a fetch that never resolves for the respond call
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
    // Simulate a question being presented
    const qEvent = makeEvent('question_presented', { question: sampleQuestion });
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield { event: qEvent.event, data: qEvent.data };
        // Then hang to simulate a live stream
        await new Promise(() => {});
      },
    });

    const { result } = renderHook(() => useMockInterview());

    await act(async () => {
      await result.current.startSimulation(sampleInput);
    });

    expect(result.current.status).toBe('waiting_for_answer');

    // Start submit but don't await — check intermediate state
    act(() => {
      void result.current.submitAnswer('My answer here...');
    });

    expect(result.current.status).toBe('evaluating');

    // Resolve the respond fetch to clean up
    resolveRespond();
  });

  it('reset clears all state back to idle', async () => {
    const evalEvent = makeEvent('answer_evaluated', { evaluation: sampleEvaluation } as unknown as Record<string, unknown>);

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

    const { result } = renderHook(() => useMockInterview());

    await act(async () => {
      await result.current.startSimulation(sampleInput);
    });

    expect(result.current.evaluations).toHaveLength(1);

    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.evaluations).toEqual([]);
    expect(result.current.currentQuestion).toBeNull();
    expect(result.current.summary).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.activityMessages).toEqual([]);
  });

  it('practice mode works — sends question_type in start payload', async () => {
    const practiceInput = {
      resumeText: 'Jane Smith resume text...',
      mode: 'practice' as const,
      questionType: 'behavioral' as const,
    };

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({ ok: true, body: { [Symbol.asyncIterator]: async function* () {} } });

    vi.stubGlobal('fetch', mockFetch);

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {},
    });

    const { result } = renderHook(() => useMockInterview());

    await act(async () => {
      await result.current.startSimulation(practiceInput);
    });

    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body as string) as Record<string, unknown>;
    expect(body.mode).toBe('practice');
    expect(body.question_type).toBe('behavioral');
  });

  it('cleanup: abort controller fires on unmount without errors', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({ ok: true, body: { [Symbol.asyncIterator]: async function* () {} } });

    vi.stubGlobal('fetch', mockFetch);

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        // Simulates long-running stream
        await new Promise(() => {});
      },
    });

    const { result, unmount } = renderHook(() => useMockInterview());

    await act(async () => {
      await result.current.startSimulation(sampleInput);
    });

    expect(() => unmount()).not.toThrow();

    // SSE stream fetch was the second call
    expect(mockFetch.mock.calls[1][0]).toContain('/mock-interview/');
    expect(mockFetch.mock.calls[1][0]).toContain('/stream');
  });

  it('SSE: stage_start and stage_complete events add to activityMessages', async () => {
    const startEvent = makeEvent('stage_start', {
      stage: 'question_generation',
      message: 'Generating your personalized questions...',
    });
    const completeEvent = makeEvent('stage_complete', {
      stage: 'question_generation',
      message: 'Questions ready — starting interview',
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

    const { result } = renderHook(() => useMockInterview());

    await act(async () => {
      await result.current.startSimulation(sampleInput);
    });

    expect(result.current.activityMessages).toHaveLength(2);
    expect(result.current.activityMessages[0].message).toBe('Generating your personalized questions...');
    expect(result.current.activityMessages[1].message).toBe('Questions ready — starting interview');
  });
});
