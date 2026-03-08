/**
 * Tests for Mock Interview simulation tools.
 * Validates evaluate_answer tool produces structured evaluations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────

const mockChat = vi.hoisted(() => vi.fn());

vi.mock('../lib/llm.js', () => ({
  llm: { chat: mockChat },
  MODEL_MID: 'test-mid',
  MODEL_PRIMARY: 'test-primary',
  MODEL_LIGHT: 'test-light',
  MODEL_ORCHESTRATOR: 'test-orchestrator',
}));

vi.mock('../lib/json-repair.js', () => ({
  repairJSON: vi.fn((text: string) => {
    try { return JSON.parse(text); } catch { return null; }
  }),
}));

import { interviewerTools } from '../agents/interview-prep/simulation/interviewer/tools.js';
import type { MockInterviewState } from '../agents/interview-prep/simulation/types.js';

// ─── Helpers ──────────────────────────────────────────────────────────

function makeState(overrides: Partial<MockInterviewState> = {}): MockInterviewState {
  return {
    session_id: 'sess-1',
    user_id: 'user-1',
    current_stage: 'interview',
    mode: 'full',
    max_questions: 6,
    questions_asked: [{
      index: 0,
      type: 'behavioral',
      question: 'Tell me about a time you led a team through a challenging project.',
    }],
    evaluations: [],
    current_question_index: 0,
    ...overrides,
  };
}

function makeContext(state: MockInterviewState) {
  return {
    getState: () => state,
    updateState: vi.fn(),
    emit: vi.fn(),
    waitForUser: vi.fn(),
    scratchpad: {} as Record<string, unknown>,
    signal: new AbortController().signal,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('evaluateAnswerTool', () => {
  const evaluateAnswer = interviewerTools.find(t => t.name === 'evaluate_answer')!;

  beforeEach(() => {
    mockChat.mockReset();
  });

  it('returns structured evaluation with scores', async () => {
    mockChat.mockResolvedValue({
      text: JSON.stringify({
        scores: { star_completeness: 80, relevance: 75, impact: 70, specificity: 65 },
        overall_score: 73,
        strengths: ['Good STAR structure', 'Relevant example'],
        improvements: ['Add more metrics'],
        model_answer_hint: 'Consider leading with the business impact.',
      }),
    });

    const state = makeState();
    const ctx = makeContext(state);
    const result = await evaluateAnswer.execute(
      { question_index: 0, answer: 'I led a team of 10 engineers to deliver a platform migration...' },
      ctx as never,
    );

    const parsed = JSON.parse(result as string);
    expect(parsed.evaluation).toBeDefined();
    expect(parsed.evaluation.scores.star_completeness).toBe(80);
    expect(parsed.evaluation.overall_score).toBe(73);
    expect(parsed.evaluation.strengths).toHaveLength(2);
    expect(parsed.evaluation.improvements).toHaveLength(1);
    expect(ctx.emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'answer_evaluated' }));
  });

  it('handles missing optional fields gracefully', async () => {
    mockChat.mockResolvedValue({
      text: JSON.stringify({
        scores: { star_completeness: 50 },
        overall_score: 50,
      }),
    });

    const state = makeState();
    const ctx = makeContext(state);
    const result = await evaluateAnswer.execute(
      { question_index: 0, answer: 'I worked on a project.' },
      ctx as never,
    );

    const parsed = JSON.parse(result as string);
    expect(parsed.evaluation.scores.relevance).toBe(50); // default
    expect(parsed.evaluation.strengths).toEqual([]);
    expect(parsed.evaluation.improvements).toEqual([]);
  });

  it('returns error for invalid question index', async () => {
    const state = makeState({ questions_asked: [] });
    const ctx = makeContext(state);
    const result = await evaluateAnswer.execute(
      { question_index: 5, answer: 'test' },
      ctx as never,
    );

    const parsed = JSON.parse(result as string);
    expect(parsed.error).toContain('No question at index');
  });
});
