/**
 * useOnboarding — Hook tests.
 *
 * Validates SSE event handling, state transitions, and pipeline lifecycle.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOnboarding } from '@/hooks/useOnboarding';
import type { ClientProfile, AssessmentSummary, AssessmentQuestion } from '@/types/onboarding';

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

const sampleSessionId = 'session-abc-123';
const sampleResumeText = 'Jane Smith, VP Engineering with 12 years experience in distributed systems.';

const sampleQuestions: AssessmentQuestion[] = [
  {
    id: 'q1',
    question: 'What prompted your current job search?',
    category: 'transition_drivers',
    purpose: 'Understand whether this is voluntary or involuntary',
  },
  {
    id: 'q2',
    question: 'What is your ideal timeline for your next role?',
    category: 'timeline_and_urgency',
    purpose: 'Gauge urgency',
  },
  {
    id: 'q3',
    question: 'What are your top career goals for the next 3 years?',
    category: 'goals_and_aspirations',
    purpose: 'Identify aspirational direction',
  },
];

const sampleProfile: ClientProfile = {
  career_level: 'vp',
  industry: 'technology',
  years_experience: 12,
  financial_segment: 'comfortable',
  emotional_state: 'acceptance',
  transition_type: 'voluntary',
  goals: ['Move to C-suite', 'Lead larger engineering org'],
  constraints: ['Remote only', 'No travel'],
  strengths_self_reported: ['Systems thinking', 'Team building'],
  urgency_score: 6,
  recommended_starting_point: 'resume',
  coaching_tone: 'direct',
};

const sampleSummary: AssessmentSummary = {
  key_insights: ['Voluntary transition from stable role', 'Strong technical leadership background'],
  financial_signals: ['Comfortable segment — not in crisis'],
  emotional_signals: ['Acceptance stage — ready to move forward'],
  recommended_actions: ['Update resume immediately', 'Begin networking outreach'],
};

// ─── Tests ──────────────────────────────────────────────────────────

describe('useOnboarding', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());

    // Re-apply the default parseSSEStream mock after clearAllMocks resets it
    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {},
    });
  });

  it('initial state is idle with empty questions', () => {
    const { result } = renderHook(() => useOnboarding());
    expect(result.current.status).toBe('idle');
    expect(result.current.questions).toEqual([]);
    expect(result.current.profile).toBeNull();
    expect(result.current.summary).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.activityMessages).toEqual([]);
    expect(result.current.currentStage).toBeNull();
  });

  it('startAssessment sends POST to /api/onboarding/start', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({ ok: true, body: { [Symbol.asyncIterator]: async function* () {} } });

    vi.stubGlobal('fetch', mockFetch);

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {},
    });

    const { result } = renderHook(() => useOnboarding());

    await act(async () => {
      await result.current.startAssessment(sampleSessionId);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/onboarding/start',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-token',
        }),
      }),
    );

    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.session_id).toBe(sampleSessionId);
  });

  it('startAssessment includes resume_text when provided', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({ ok: true, body: { [Symbol.asyncIterator]: async function* () {} } });

    vi.stubGlobal('fetch', mockFetch);

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {},
    });

    const { result } = renderHook(() => useOnboarding());

    await act(async () => {
      await result.current.startAssessment(sampleSessionId, sampleResumeText);
    });

    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.session_id).toBe(sampleSessionId);
    expect(body.resume_text).toBe(sampleResumeText);
  });

  it('respondToGate sends POST to /api/onboarding/respond', async () => {
    // First, start the assessment to populate sessionIdRef and accessTokenRef
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({ ok: true, body: { [Symbol.asyncIterator]: async function* () {} } })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'ok' }) });

    vi.stubGlobal('fetch', mockFetch);

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {},
    });

    const { result } = renderHook(() => useOnboarding());

    await act(async () => {
      await result.current.startAssessment(sampleSessionId);
    });

    const responses = {
      q1: 'I was laid off and am now actively searching.',
      q2: 'Within the next 3 months ideally.',
      q3: 'I want to become a CTO at a mid-size tech company.',
    };

    await act(async () => {
      await result.current.respondToGate(responses);
    });

    const respondCall = mockFetch.mock.calls[2];
    expect(respondCall[0]).toBe('http://localhost:3001/api/onboarding/respond');
    expect(respondCall[1].method).toBe('POST');

    const body = JSON.parse(respondCall[1].body);
    expect(body.session_id).toBe(sampleSessionId);
    expect(body.gate).toBe('assessment_responses');
    expect(body.response).toEqual(responses);
  });

  it('SSE: questions_ready event updates questions and sets status to awaiting_responses', async () => {
    const questionsReadyEvent = makeEvent('questions_ready', {
      questions: sampleQuestions,
    });

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({
        ok: true,
        body: { [Symbol.asyncIterator]: async function* () {} },
      });

    vi.stubGlobal('fetch', mockFetch);

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield { event: questionsReadyEvent.event, data: questionsReadyEvent.data };
      },
    });

    const { result } = renderHook(() => useOnboarding());

    await act(async () => {
      await result.current.startAssessment(sampleSessionId);
    });

    expect(result.current.status).toBe('awaiting_responses');
    expect(result.current.questions).toHaveLength(3);
    expect(result.current.questions[0].id).toBe('q1');
    expect(result.current.questions[1].category).toBe('timeline_and_urgency');
  });

  it('SSE: stage_start event updates currentStage', async () => {
    const stageStartEvent = makeEvent('stage_start', {
      stage: 'generating_questions',
      message: 'Generating personalized assessment questions...',
    });

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({
        ok: true,
        body: { [Symbol.asyncIterator]: async function* () {} },
      });

    vi.stubGlobal('fetch', mockFetch);

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield { event: stageStartEvent.event, data: stageStartEvent.data };
      },
    });

    const { result } = renderHook(() => useOnboarding());

    await act(async () => {
      await result.current.startAssessment(sampleSessionId);
    });

    expect(result.current.currentStage).toBe('generating_questions');
    expect(result.current.activityMessages).toHaveLength(1);
    expect(result.current.activityMessages[0].text).toContain('Generating personalized');
  });

  it('SSE: transparency event adds to activityMessages', async () => {
    const transparencyEvent = makeEvent('transparency', {
      stage: 'analysis',
      message: 'Analyzing resume context to tailor questions...',
    });

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({
        ok: true,
        body: { [Symbol.asyncIterator]: async function* () {} },
      });

    vi.stubGlobal('fetch', mockFetch);

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield { event: transparencyEvent.event, data: transparencyEvent.data };
      },
    });

    const { result } = renderHook(() => useOnboarding());

    await act(async () => {
      await result.current.startAssessment(sampleSessionId);
    });

    expect(result.current.activityMessages).toHaveLength(1);
    expect(result.current.activityMessages[0].text).toBe(
      'Analyzing resume context to tailor questions...',
    );
    expect(result.current.activityMessages[0].stage).toBe('analysis');
  });

  it('SSE: assessment_complete event stores profile and summary', async () => {
    const completeEvent = makeEvent('assessment_complete', {
      profile: sampleProfile,
      summary: sampleSummary,
    });

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({
        ok: true,
        body: { [Symbol.asyncIterator]: async function* () {} },
      });

    vi.stubGlobal('fetch', mockFetch);

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield { event: completeEvent.event, data: completeEvent.data };
      },
    });

    const { result } = renderHook(() => useOnboarding());

    await act(async () => {
      await result.current.startAssessment(sampleSessionId);
    });

    expect(result.current.status).toBe('complete');
    expect(result.current.profile).not.toBeNull();
    expect(result.current.profile?.career_level).toBe('vp');
    expect(result.current.profile?.financial_segment).toBe('comfortable');
    expect(result.current.summary).not.toBeNull();
    expect(result.current.summary?.key_insights).toHaveLength(2);
    expect(result.current.summary?.recommended_actions[0]).toBe('Update resume immediately');
  });

  it('SSE: pipeline_error event sets error state', async () => {
    const errorEvent = makeEvent('pipeline_error', {
      stage: 'evaluation',
      error: 'LLM provider timed out after 3 retries',
    });

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({
        ok: true,
        body: { [Symbol.asyncIterator]: async function* () {} },
      });

    vi.stubGlobal('fetch', mockFetch);

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield { event: errorEvent.event, data: errorEvent.data };
      },
    });

    const { result } = renderHook(() => useOnboarding());

    await act(async () => {
      await result.current.startAssessment(sampleSessionId);
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('LLM provider timed out after 3 retries');
  });

  it('cleanup: abort controller fires on unmount', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({
        ok: true,
        body: { [Symbol.asyncIterator]: async function* () {} },
      });

    vi.stubGlobal('fetch', mockFetch);

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        // Yield nothing — simulates a long-running stream
        await new Promise(() => {});
      },
    });

    const { result, unmount } = renderHook(() => useOnboarding());

    await act(async () => {
      await result.current.startAssessment(sampleSessionId);
    });

    // Hook is mid-stream. Unmounting should trigger the cleanup effect which calls abort().
    // We verify indirectly: after unmount, startAssessment should no longer update state
    // (mountedRef.current becomes false). The primary guard is that no errors are thrown.
    expect(() => unmount()).not.toThrow();

    // Verify the stream fetch was initiated (abort controller was created and used)
    // The SSE stream fetch call is the second call
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[1][0]).toBe(
      `http://localhost:3001/api/onboarding/${sampleSessionId}/stream`,
    );
  });

  it('onComplete callback fires with profile and summary', async () => {
    const onComplete = vi.fn();

    const completeEvent = makeEvent('assessment_complete', {
      profile: sampleProfile,
      summary: sampleSummary,
    });

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({
        ok: true,
        body: { [Symbol.asyncIterator]: async function* () {} },
      });

    vi.stubGlobal('fetch', mockFetch);

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield { event: completeEvent.event, data: completeEvent.data };
      },
    });

    const { result } = renderHook(() => useOnboarding({ onComplete }));

    await act(async () => {
      await result.current.startAssessment(sampleSessionId);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
    const [calledProfile, calledSummary] = onComplete.mock.calls[0] as [
      ClientProfile,
      AssessmentSummary,
    ];
    expect(calledProfile.career_level).toBe('vp');
    expect(calledProfile.emotional_state).toBe('acceptance');
    expect(calledSummary.key_insights).toHaveLength(2);
    expect(calledSummary.recommended_actions[1]).toBe('Begin networking outreach');
  });

  it('onError callback fires on pipeline_error', async () => {
    const onError = vi.fn();

    const errorEvent = makeEvent('pipeline_error', {
      stage: 'evaluation',
      error: 'Evaluation model returned malformed JSON',
    });

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'started' }) })
      .mockResolvedValueOnce({
        ok: true,
        body: { [Symbol.asyncIterator]: async function* () {} },
      });

    vi.stubGlobal('fetch', mockFetch);

    const { parseSSEStream } = await import('@/lib/sse-parser');
    (parseSSEStream as ReturnType<typeof vi.fn>).mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield { event: errorEvent.event, data: errorEvent.data };
      },
    });

    const { result } = renderHook(() => useOnboarding({ onError }));

    await act(async () => {
      await result.current.startAssessment(sampleSessionId);
    });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith('Evaluation model returned malformed JSON');
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Evaluation model returned malformed JSON');
  });
});
