/**
 * Tests for Mock Interview simulation tools.
 * Validates all 4 tools: generate_interview_question, present_question_to_user,
 * evaluate_answer, and emit_transparency. Also covers agent registration and
 * ProductConfig behavior.
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

vi.mock('../lib/logger.js', () => ({
  default: {
    info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  createSessionLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { interviewerTools } from '../agents/interview-prep/simulation/interviewer/tools.js';
import { interviewerConfig } from '../agents/interview-prep/simulation/interviewer/agent.js';
import { agentRegistry } from '../agents/runtime/agent-registry.js';
import { createMockInterviewProductConfig } from '../agents/interview-prep/simulation/product.js';
import type { MockInterviewState, MockInterviewSSEEvent, AnswerEvaluation } from '../agents/interview-prep/simulation/types.js';
import { createEmptySharedContext } from '../contracts/shared-context.js';
import { makeMockGenericContext } from './helpers/mock-factories.js';

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

function makeContext(state: MockInterviewState, waitForUserResult: unknown = 'I led a project to completion.') {
  return makeMockGenericContext<MockInterviewState, MockInterviewSSEEvent>(state, waitForUserResult);
}

function makeMockEvalLLMResponse(overrides: Record<string, unknown> = {}) {
  return {
    text: JSON.stringify({
      scores: { star_completeness: 80, relevance: 75, impact: 70, specificity: 65 },
      overall_score: 73,
      strengths: ['Good STAR structure', 'Relevant example'],
      improvements: ['Add more metrics'],
      model_answer_hint: 'Consider leading with the business impact.',
      ...overrides,
    }),
  };
}

function makeMockQuestionLLMResponse(overrides: Record<string, unknown> = {}) {
  return {
    text: JSON.stringify({
      question: 'Tell me about a time you led a major organizational change.',
      context: 'Tests leadership scope and change management capability.',
      ...overrides,
    }),
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Agent Registration
// ═══════════════════════════════════════════════════════════════════════

describe('Mock Interview Agent Registration', () => {
  it('interviewer is registered in the agent registry', () => {
    expect(agentRegistry.has('mock-interview', 'interviewer')).toBe(true);
  });

  it('mock-interview domain appears in listDomains', () => {
    const domains = agentRegistry.listDomains();
    expect(domains).toContain('mock-interview');
  });

  it('interviewer has expected capabilities', () => {
    const desc = agentRegistry.describe('mock-interview', 'interviewer');
    expect(desc).toBeDefined();
    expect(desc!.capabilities).toContain('mock_interview');
    expect(desc!.capabilities).toContain('interview_simulation');
    expect(desc!.capabilities).toContain('star_evaluation');
  });

  it('interviewer has correct tool count (4 tools)', () => {
    const desc = agentRegistry.describe('mock-interview', 'interviewer');
    expect(desc).toBeDefined();
    expect(desc!.tools).toHaveLength(4);
  });

  it('interviewer tools include all expected names', () => {
    const desc = agentRegistry.describe('mock-interview', 'interviewer');
    expect(desc).toBeDefined();
    expect(desc!.tools).toContain('generate_interview_question');
    expect(desc!.tools).toContain('present_question_to_user');
    expect(desc!.tools).toContain('evaluate_answer');
    expect(desc!.tools).toContain('emit_transparency');
  });

  it('findByCapability discovers mock-interview interviewer for mock_interview', () => {
    const agents = agentRegistry.findByCapability('mock_interview', 'mock-interview');
    expect(agents.length).toBeGreaterThanOrEqual(1);
    expect(agents[0].identity.name).toBe('interviewer');
  });

  it('findByCapability discovers mock-interview interviewer for star_evaluation', () => {
    const agents = agentRegistry.findByCapability('star_evaluation', 'mock-interview');
    expect(agents.length).toBeGreaterThanOrEqual(1);
    expect(agents[0].identity.name).toBe('interviewer');
  });

  it('interviewer model is orchestrator', () => {
    expect(interviewerConfig.model).toBe('orchestrator');
  });

  it('interviewer max_rounds is 25', () => {
    expect(interviewerConfig.max_rounds).toBe(25);
  });

  it('interviewer parallel_safe_tools includes emit_transparency', () => {
    expect(interviewerConfig.parallel_safe_tools).toContain('emit_transparency');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Tool Shape Tests
// ═══════════════════════════════════════════════════════════════════════

describe('Mock Interview Tool Shapes', () => {
  it('all tools have descriptions longer than 20 characters', () => {
    for (const tool of interviewerTools) {
      expect(tool.description).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(20);
    }
  });

  it('all tools have input_schema with type object', () => {
    for (const tool of interviewerTools) {
      expect(tool.input_schema.type).toBe('object');
    }
  });

  it('generate_interview_question has model_tier mid', () => {
    const tool = interviewerTools.find(t => t.name === 'generate_interview_question')!;
    expect(tool.model_tier).toBe('mid');
  });

  it('evaluate_answer has model_tier mid', () => {
    const tool = interviewerTools.find(t => t.name === 'evaluate_answer')!;
    expect(tool.model_tier).toBe('mid');
  });

  it('generate_interview_question requires question_type', () => {
    const tool = interviewerTools.find(t => t.name === 'generate_interview_question')!;
    expect(tool.input_schema.required).toContain('question_type');
  });

  it('present_question_to_user requires question_index', () => {
    const tool = interviewerTools.find(t => t.name === 'present_question_to_user')!;
    expect(tool.input_schema.required).toContain('question_index');
  });

  it('evaluate_answer requires question_index and answer', () => {
    const tool = interviewerTools.find(t => t.name === 'evaluate_answer')!;
    expect(tool.input_schema.required).toContain('question_index');
    expect(tool.input_schema.required).toContain('answer');
  });

  it('emit_transparency requires message', () => {
    const tool = interviewerTools.find(t => t.name === 'emit_transparency')!;
    expect(tool.input_schema.required).toContain('message');
  });

  it('generate_interview_question description mentions tailoring context', () => {
    const tool = interviewerTools.find(t => t.name === 'generate_interview_question')!;
    expect(tool.description.toLowerCase()).toContain('resume');
  });

  it('evaluate_answer description mentions STAR', () => {
    const tool = interviewerTools.find(t => t.name === 'evaluate_answer')!;
    expect(tool.description).toContain('STAR');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Tool: generate_interview_question
// ═══════════════════════════════════════════════════════════════════════

describe('generate_interview_question tool', () => {
  const generateQuestion = interviewerTools.find(t => t.name === 'generate_interview_question')!;

  beforeEach(() => {
    mockChat.mockReset();
  });

  it('happy path: generates a behavioral question and persists to state', async () => {
    mockChat.mockResolvedValue(makeMockQuestionLLMResponse());

    const state = makeState({ questions_asked: [], current_question_index: 0 });
    const ctx = makeContext(state);

    const result = await generateQuestion.execute({ question_type: 'behavioral' }, ctx as never);
    const parsed = JSON.parse(result as string);

    expect(parsed.question).toBeDefined();
    expect(parsed.question.question).toContain('major organizational change');
    expect(parsed.question.type).toBe('behavioral');
    expect(parsed.question.index).toBe(0);
    expect(parsed.question_index).toBe(0);
  });

  it('persists generated question to state via updateState', async () => {
    mockChat.mockResolvedValue(makeMockQuestionLLMResponse());

    const state = makeState({ questions_asked: [], current_question_index: 0 });
    const ctx = makeContext(state);

    await generateQuestion.execute({ question_type: 'behavioral' }, ctx as never);

    const updatedState = ctx.getState();
    expect(updatedState.questions_asked).toHaveLength(1);
    expect(updatedState.questions_asked[0]).toMatchObject({ type: 'behavioral', index: 0 });
  });

  it('accumulates questions in scratchpad', async () => {
    mockChat.mockResolvedValue(makeMockQuestionLLMResponse());

    const state = makeState({ questions_asked: [], current_question_index: 0 });
    const ctx = makeContext(state);

    await generateQuestion.execute({ question_type: 'behavioral' }, ctx as never);

    expect(Array.isArray(ctx.scratchpad.questions_asked)).toBe(true);
    const questions = ctx.scratchpad.questions_asked as unknown[];
    expect(questions).toHaveLength(1);
  });

  it('generates a technical question when question_type is technical', async () => {
    mockChat.mockResolvedValue(makeMockQuestionLLMResponse({
      question: 'How do you approach system design for high-throughput APIs?',
      context: 'Tests technical depth.',
    }));

    const state = makeState({ questions_asked: [], current_question_index: 0 });
    const ctx = makeContext(state);

    const result = await generateQuestion.execute({ question_type: 'technical' }, ctx as never);
    const parsed = JSON.parse(result as string);

    expect(parsed.question.type).toBe('technical');
  });

  it('generates a situational question when question_type is situational', async () => {
    mockChat.mockResolvedValue(makeMockQuestionLLMResponse({
      question: 'How would you handle a critical outage during a major product launch?',
      context: 'Tests crisis decision-making.',
    }));

    const state = makeState({ questions_asked: [], current_question_index: 0 });
    const ctx = makeContext(state);

    const result = await generateQuestion.execute({ question_type: 'situational' }, ctx as never);
    const parsed = JSON.parse(result as string);

    expect(parsed.question.type).toBe('situational');
  });

  it('falls back to behavioral when question_type is invalid', async () => {
    mockChat.mockResolvedValue(makeMockQuestionLLMResponse());

    const state = makeState({ questions_asked: [], current_question_index: 0 });
    const ctx = makeContext(state);

    const result = await generateQuestion.execute({ question_type: 'invalid_type' }, ctx as never);
    const parsed = JSON.parse(result as string);

    expect(parsed.question.type).toBe('behavioral');
  });

  it('falls back to a default question when LLM returns null', async () => {
    mockChat.mockResolvedValue({ text: 'not valid json at all' });

    const state = makeState({ questions_asked: [], current_question_index: 0 });
    const ctx = makeContext(state);

    const result = await generateQuestion.execute({ question_type: 'behavioral' }, ctx as never);
    const parsed = JSON.parse(result as string);

    expect(parsed.question.question).toContain('behavioral');
    expect(parsed.question.index).toBe(0);
  });

  it('tracks context from prior evaluations in prompt (avg score)', async () => {
    mockChat.mockResolvedValue(makeMockQuestionLLMResponse());

    const state = makeState({
      questions_asked: [],
      evaluations: [
        {
          question_index: 0, question_type: 'behavioral', question: 'Q1', answer: 'A1',
          scores: { star_completeness: 80, relevance: 80, impact: 80, specificity: 80 },
          overall_score: 80, strengths: [], improvements: [],
        },
      ],
    });
    const ctx = makeContext(state);

    await generateQuestion.execute({ question_type: 'behavioral' }, ctx as never);

    const callArgs = mockChat.mock.calls[0][0];
    expect(callArgs.messages[0].content).toContain('80');
  });

  it('includes resume_text in prompt when present in state', async () => {
    mockChat.mockResolvedValue(makeMockQuestionLLMResponse());

    const state = makeState({
      questions_asked: [],
      resume_text: 'Jane Smith, VP Engineering at Acme Corp for 8 years.',
    });
    const ctx = makeContext(state);

    await generateQuestion.execute({ question_type: 'behavioral' }, ctx as never);

    const callArgs = mockChat.mock.calls[0][0];
    expect(callArgs.messages[0].content).toContain('Jane Smith');
  });

  it('includes job_description in prompt when present in state', async () => {
    mockChat.mockResolvedValue(makeMockQuestionLLMResponse());

    const state = makeState({
      questions_asked: [],
      job_description: 'CTO role at TechCorp, leading 200-person engineering org.',
    });
    const ctx = makeContext(state);

    await generateQuestion.execute({ question_type: 'behavioral' }, ctx as never);

    const callArgs = mockChat.mock.calls[0][0];
    expect(callArgs.messages[0].content).toContain('CTO role');
  });

  it('assigns sequential index based on existing questions_asked length', async () => {
    mockChat.mockResolvedValue(makeMockQuestionLLMResponse());

    const state = makeState({
      questions_asked: [
        { index: 0, type: 'behavioral', question: 'Q1' },
        { index: 1, type: 'situational', question: 'Q2' },
      ],
    });
    const ctx = makeContext(state);

    const result = await generateQuestion.execute({ question_type: 'technical' }, ctx as never);
    const parsed = JSON.parse(result as string);

    expect(parsed.question.index).toBe(2);
    expect(parsed.question_index).toBe(2);
  });

  it('passes context_notes through to LLM prompt', async () => {
    mockChat.mockResolvedValue(makeMockQuestionLLMResponse());

    const state = makeState({ questions_asked: [] });
    const ctx = makeContext(state);

    await generateQuestion.execute({
      question_type: 'behavioral',
      context_notes: 'focus on leadership at scale',
    }, ctx as never);

    const callArgs = mockChat.mock.calls[0][0];
    expect(callArgs.messages[0].content).toContain('focus on leadership at scale');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Tool: present_question_to_user
// ═══════════════════════════════════════════════════════════════════════

describe('present_question_to_user tool', () => {
  const presentQuestion = interviewerTools.find(t => t.name === 'present_question_to_user')!;

  beforeEach(() => {
    mockChat.mockReset();
  });

  it('happy path: emits question_presented and returns user answer', async () => {
    const state = makeState();
    const ctx = makeContext(state, 'I led a 45-person engineering org through a cloud migration.');

    const result = await presentQuestion.execute({ question_index: 0 }, ctx as never);
    const parsed = JSON.parse(result as string);

    expect(parsed.question_index).toBe(0);
    expect(parsed.answer).toBe('I led a 45-person engineering org through a cloud migration.');
    expect(parsed.message).toContain('evaluate_answer');
  });

  it('emits question_presented SSE event with the correct question', async () => {
    const state = makeState();
    const ctx = makeContext(state);

    await presentQuestion.execute({ question_index: 0 }, ctx as never);

    expect(ctx.emitSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'question_presented',
      question: expect.objectContaining({
        index: 0,
        type: 'behavioral',
      }),
    }));
  });

  it('calls waitForUser with the mock_interview_answer gate key', async () => {
    const state = makeState();
    const ctx = makeContext(state);

    await presentQuestion.execute({ question_index: 0 }, ctx as never);

    expect(ctx.waitForUser).toHaveBeenCalledWith('mock_interview_answer');
  });

  it('stores user answer in scratchpad under answer_{index}', async () => {
    const state = makeState();
    const ctx = makeContext(state, 'My answer to question 0.');

    await presentQuestion.execute({ question_index: 0 }, ctx as never);

    expect(ctx.scratchpad['answer_0']).toBe('My answer to question 0.');
  });

  it('returns error JSON when question_index has no matching question', async () => {
    const state = makeState({ questions_asked: [] });
    const ctx = makeContext(state);

    const result = await presentQuestion.execute({ question_index: 5 }, ctx as never);
    const parsed = JSON.parse(result as string);

    expect(parsed.error).toContain('No question at index');
    expect(parsed.error).toContain('5');
  });

  it('falls back to current_question_index when question_index is not a number', async () => {
    const state = makeState({ current_question_index: 0 });
    const ctx = makeContext(state);

    const result = await presentQuestion.execute({ question_index: undefined }, ctx as never);
    const parsed = JSON.parse(result as string);

    expect(parsed.question_index).toBe(0);
  });

  it('handles null waitForUser result gracefully (converts to empty string)', async () => {
    const state = makeState();
    const ctx = makeContext(state, null);

    const result = await presentQuestion.execute({ question_index: 0 }, ctx as never);
    const parsed = JSON.parse(result as string);

    expect(parsed.answer).toBe('');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Tool: evaluate_answer
// ═══════════════════════════════════════════════════════════════════════

describe('evaluate_answer tool', () => {
  const evaluateAnswer = interviewerTools.find(t => t.name === 'evaluate_answer')!;

  beforeEach(() => {
    mockChat.mockReset();
  });

  it('returns structured evaluation with scores', async () => {
    mockChat.mockResolvedValue(makeMockEvalLLMResponse());

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
    expect(ctx.emitSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'answer_evaluated' }));
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

  it('persists evaluation to state via updateState', async () => {
    mockChat.mockResolvedValue(makeMockEvalLLMResponse());

    const state = makeState();
    const ctx = makeContext(state);

    await evaluateAnswer.execute(
      { question_index: 0, answer: 'Strong answer with quantified results.' },
      ctx as never,
    );

    const updatedState = ctx.getState();
    expect(updatedState.evaluations).toHaveLength(1);
    expect(updatedState.evaluations[0]).toMatchObject({ question_index: 0, overall_score: 73 });
  });

  it('accumulates evaluations in scratchpad', async () => {
    mockChat.mockResolvedValue(makeMockEvalLLMResponse());

    const state = makeState();
    const ctx = makeContext(state);

    await evaluateAnswer.execute(
      { question_index: 0, answer: 'An answer.' },
      ctx as never,
    );

    expect(Array.isArray(ctx.scratchpad.evaluations)).toBe(true);
    const evals = ctx.scratchpad.evaluations as unknown[];
    expect(evals).toHaveLength(1);
  });

  it('emits answer_evaluated SSE with full evaluation payload', async () => {
    mockChat.mockResolvedValue(makeMockEvalLLMResponse());

    const state = makeState();
    const ctx = makeContext(state);

    await evaluateAnswer.execute(
      { question_index: 0, answer: 'I led a team.' },
      ctx as never,
    );

    expect(ctx.emitSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'answer_evaluated',
      evaluation: expect.objectContaining({
        question_index: 0,
        scores: expect.objectContaining({ star_completeness: 80 }),
        overall_score: 73,
        strengths: expect.arrayContaining(['Good STAR structure']),
      }),
    }));
  });

  it('computes overall_score from weighted formula when LLM omits it', async () => {
    mockChat.mockResolvedValue({
      text: JSON.stringify({
        scores: { star_completeness: 100, relevance: 100, impact: 100, specificity: 100 },
        // overall_score deliberately omitted
        strengths: [],
        improvements: [],
      }),
    });

    const state = makeState();
    const ctx = makeContext(state);

    const result = await evaluateAnswer.execute(
      { question_index: 0, answer: 'Perfect answer.' },
      ctx as never,
    );
    const parsed = JSON.parse(result as string);
    // 100*0.3 + 100*0.25 + 100*0.25 + 100*0.2 = 100
    expect(parsed.evaluation.overall_score).toBe(100);
  });

  it('defaults all score dimensions to 50 when LLM returns null', async () => {
    mockChat.mockResolvedValue({ text: 'INVALID JSON' });

    const state = makeState();
    const ctx = makeContext(state);

    const result = await evaluateAnswer.execute(
      { question_index: 0, answer: 'Answer.' },
      ctx as never,
    );
    const parsed = JSON.parse(result as string);

    expect(parsed.evaluation.scores.star_completeness).toBe(50);
    expect(parsed.evaluation.scores.relevance).toBe(50);
    expect(parsed.evaluation.scores.impact).toBe(50);
    expect(parsed.evaluation.scores.specificity).toBe(50);
  });

  it('reads answer from scratchpad when input.answer is undefined', async () => {
    mockChat.mockResolvedValue(makeMockEvalLLMResponse());

    const state = makeState();
    const ctx = makeContext(state);
    ctx.scratchpad['answer_0'] = 'Scratchpad stored answer.';

    // Pass undefined (not empty string) — the tool uses ?? which only falls back on null/undefined
    const result = await evaluateAnswer.execute(
      { question_index: 0, answer: undefined as unknown as string },
      ctx as never,
    );
    const parsed = JSON.parse(result as string);

    const callArgs = mockChat.mock.calls[0][0];
    expect(callArgs.messages[0].content).toContain('Scratchpad stored answer.');
    expect(parsed.evaluation.answer).toBe('Scratchpad stored answer.');
  });

  it('includes model_answer_hint in evaluation when LLM provides one', async () => {
    mockChat.mockResolvedValue(makeMockEvalLLMResponse({
      model_answer_hint: 'Lead with the outcome: cost reduced by 60%.',
    }));

    const state = makeState();
    const ctx = makeContext(state);

    const result = await evaluateAnswer.execute(
      { question_index: 0, answer: 'I improved the system.' },
      ctx as never,
    );
    const parsed = JSON.parse(result as string);

    expect(parsed.evaluation.model_answer_hint).toBe('Lead with the outcome: cost reduced by 60%.');
  });

  it('evaluation result message includes question number and score', async () => {
    mockChat.mockResolvedValue(makeMockEvalLLMResponse());

    const state = makeState();
    const ctx = makeContext(state);

    const result = await evaluateAnswer.execute(
      { question_index: 0, answer: 'Answer here.' },
      ctx as never,
    );
    const parsed = JSON.parse(result as string);

    expect(parsed.message).toContain('Question 1');
    expect(parsed.message).toContain('73/100');
  });

  it('evaluation preserves question_type from the InterviewQuestion object', async () => {
    mockChat.mockResolvedValue(makeMockEvalLLMResponse());

    const state = makeState({
      questions_asked: [{ index: 0, type: 'technical', question: 'How do you design for scale?' }],
    });
    const ctx = makeContext(state);

    const result = await evaluateAnswer.execute(
      { question_index: 0, answer: 'I use horizontal scaling with Kubernetes.' },
      ctx as never,
    );
    const parsed = JSON.parse(result as string);

    expect(parsed.evaluation.question_type).toBe('technical');
  });

  it('appends to existing evaluations in scratchpad rather than overwriting', async () => {
    mockChat.mockResolvedValue(makeMockEvalLLMResponse());

    const existingEval: AnswerEvaluation = {
      question_index: 0, question_type: 'behavioral', question: 'Q0', answer: 'A0',
      scores: { star_completeness: 70, relevance: 70, impact: 70, specificity: 70 },
      overall_score: 70, strengths: [], improvements: [],
    };

    const state = makeState({
      questions_asked: [
        { index: 0, type: 'behavioral', question: 'Q0' },
        { index: 1, type: 'situational', question: 'Q1' },
      ],
      evaluations: [existingEval],
    });
    const ctx = makeContext(state);
    ctx.scratchpad.evaluations = [existingEval];

    await evaluateAnswer.execute(
      { question_index: 1, answer: 'My situational answer.' },
      ctx as never,
    );

    const scratchpadEvals = ctx.scratchpad.evaluations as AnswerEvaluation[];
    expect(scratchpadEvals).toHaveLength(2);
    expect(scratchpadEvals[0].question_index).toBe(0);
    expect(scratchpadEvals[1].question_index).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Tool: emit_transparency
// ═══════════════════════════════════════════════════════════════════════

describe('emit_transparency tool', () => {
  const emitTransparency = interviewerTools.find(t => t.name === 'emit_transparency')!;

  beforeEach(() => {
    mockChat.mockReset();
  });

  it('happy path: emits transparency SSE event with message', async () => {
    const state = makeState();
    const ctx = makeContext(state);

    await emitTransparency.execute(
      { message: 'Preparing question 1 of 6 — behavioral' },
      ctx as never,
    );

    expect(ctx.emitSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'transparency',
      message: 'Preparing question 1 of 6 — behavioral',
    }));
  });

  it('returns emitted: true on success', async () => {
    const state = makeState();
    const ctx = makeContext(state);

    const result = await emitTransparency.execute(
      { message: 'Evaluating your answer...' },
      ctx as never,
    );

    expect((result as Record<string, unknown>).emitted).toBe(true);
  });

  it('uses provided stage when given', async () => {
    const state = makeState();
    const ctx = makeContext(state);

    await emitTransparency.execute(
      { message: 'Scoring answer against STAR framework', stage: 'evaluation' },
      ctx as never,
    );

    expect(ctx.emitSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'transparency',
      stage: 'evaluation',
      message: 'Scoring answer against STAR framework',
    }));
  });

  it('falls back to current_stage from state when no stage is provided', async () => {
    const state = makeState({ current_stage: 'interview' });
    const ctx = makeContext(state);

    await emitTransparency.execute(
      { message: 'Starting interview session' },
      ctx as never,
    );

    expect(ctx.emitSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'transparency',
      stage: 'interview',
    }));
  });

  it('returns success: false and does not emit when message is empty string', async () => {
    const state = makeState();
    const ctx = makeContext(state);

    const result = await emitTransparency.execute(
      { message: '' },
      ctx as never,
    );

    expect((result as Record<string, unknown>).success).toBe(false);
    expect(ctx.emitSpy).not.toHaveBeenCalled();
  });

  it('returns success: false and does not emit when message is whitespace only', async () => {
    const state = makeState();
    const ctx = makeContext(state);

    const result = await emitTransparency.execute(
      { message: '   ' },
      ctx as never,
    );

    expect((result as Record<string, unknown>).success).toBe(false);
    expect(ctx.emitSpy).not.toHaveBeenCalled();
  });

  it('result echoes the message back in the return value', async () => {
    const state = makeState();
    const ctx = makeContext(state);

    const result = await emitTransparency.execute(
      { message: 'All questions complete. Generating summary.' },
      ctx as never,
    );

    expect((result as Record<string, unknown>).message).toBe('All questions complete. Generating summary.');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// ProductConfig
// ═══════════════════════════════════════════════════════════════════════

describe('Mock Interview ProductConfig', () => {
  const config = createMockInterviewProductConfig();

  it('creates a valid product config with domain mock-interview', () => {
    expect(config.domain).toBe('mock-interview');
  });

  it('has 1 agent (interviewer) — single-agent pipeline', () => {
    expect(config.agents).toHaveLength(1);
    expect(config.agents[0].name).toBe('interviewer');
  });

  it('has stage message on interviewer (startStage: interview)', () => {
    expect(config.agents[0].stageMessage).toBeDefined();
    expect(config.agents[0].stageMessage!.startStage).toBe('interview');
  });

  it('createInitialState produces valid state with current_stage=interview', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    expect(state.session_id).toBe('sess-1');
    expect(state.user_id).toBe('user-1');
    expect(state.current_stage).toBe('interview');
  });

  it('createInitialState defaults to full mode with 6 max_questions', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    expect(state.mode).toBe('full');
    expect(state.max_questions).toBe(6);
  });

  it('createInitialState sets practice mode with 1 max_question when mode=practice', () => {
    const state = config.createInitialState('sess-1', 'user-1', { mode: 'practice' });
    expect(state.mode).toBe('practice');
    expect(state.max_questions).toBe(1);
  });

  it('createInitialState initializes empty questions_asked and evaluations', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    expect(state.questions_asked).toEqual([]);
    expect(state.evaluations).toEqual([]);
  });

  it('createInitialState passes through resume_text', () => {
    const state = config.createInitialState('sess-1', 'user-1', {
      resume_text: 'Jane Smith, VP Engineering...',
    });
    expect(state.resume_text).toBe('Jane Smith, VP Engineering...');
  });

  it('createInitialState passes through job_description', () => {
    const state = config.createInitialState('sess-1', 'user-1', {
      job_description: 'CTO role at FinTech Corp.',
    });
    expect(state.job_description).toBe('CTO role at FinTech Corp.');
  });

  it('createInitialState passes through company_name', () => {
    const state = config.createInitialState('sess-1', 'user-1', { company_name: 'Stripe' });
    expect(state.company_name).toBe('Stripe');
  });

  it('createInitialState preserves shared_context when provided', () => {
    const sharedContext = createEmptySharedContext();
    sharedContext.positioningStrategy.positioningAngle = 'Candidate needs rigorous interview reps tied to supported evidence';
    const state = config.createInitialState('sess-1', 'user-1', { shared_context: sharedContext });
    expect(state.shared_context?.positioningStrategy.positioningAngle).toBe('Candidate needs rigorous interview reps tied to supported evidence');
  });

  it('buildAgentMessage for interviewer (full mode) includes question count', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    const msg = config.buildAgentMessage('interviewer', state, {});
    expect(msg).toContain('6');
    expect(msg).toContain('behavioral');
  });

  it('buildAgentMessage for interviewer (practice mode) includes question type', () => {
    const state = config.createInitialState('sess-1', 'user-1', { mode: 'practice' });
    const msg = config.buildAgentMessage('interviewer', state, { question_type: 'technical' });
    expect(msg).toContain('technical');
    expect(msg).toContain('1');
  });

  it('buildAgentMessage includes resume_text when present', () => {
    const state = config.createInitialState('sess-1', 'user-1', {
      resume_text: 'Jane Smith VP Engineering at Acme.',
    });
    const msg = config.buildAgentMessage('interviewer', state, {});
    expect(msg).toContain('Jane Smith VP Engineering at Acme.');
  });

  it('buildAgentMessage includes positioning_strategy when in platform_context', () => {
    const state = config.createInitialState('sess-1', 'user-1', {
      platform_context: {
        positioning_strategy: { angle: 'Platform-first engineering executive' },
      },
    });
    const msg = config.buildAgentMessage('interviewer', state, {});
    expect(msg).toContain('Positioning Strategy');
    expect(msg).toContain('Platform-first engineering executive');
  });

  it('buildAgentMessage includes canonical shared context when legacy room context is absent', () => {
    const sharedContext = createEmptySharedContext();
    sharedContext.careerNarrative.careerArc = 'Career story built around calm execution under pressure';
    sharedContext.positioningStrategy.positioningAngle = 'Interview on proof, not generic leadership claims';
    const state = config.createInitialState('sess-1', 'user-1', { shared_context: sharedContext });

    const msg = config.buildAgentMessage('interviewer', state, {});
    expect(msg).toContain('Career story built around calm execution under pressure');
    expect(msg).toContain('Interview on proof, not generic leadership claims');
  });

  it('buildAgentMessage for unknown agent returns empty string', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    const msg = config.buildAgentMessage('unknown_agent', state, {});
    expect(msg).toBe('');
  });

  it('finalizeResult emits simulation_complete event', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    state.evaluations = [
      {
        question_index: 0, question_type: 'behavioral', question: 'Q1', answer: 'A1',
        scores: { star_completeness: 80, relevance: 75, impact: 70, specificity: 65 },
        overall_score: 73, strengths: ['Strong STAR'], improvements: ['More metrics'],
      },
    ];

    const events: MockInterviewSSEEvent[] = [];
    config.finalizeResult(state, {}, (e) => events.push(e));

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('simulation_complete');
    const evt = events[0] as Extract<MockInterviewSSEEvent, { type: 'simulation_complete' }>;
    expect(evt.session_id).toBe('sess-1');
    expect(evt.summary).toBeDefined();
    expect(evt.summary!.overall_score).toBe(73);
    expect(evt.summary!.total_questions).toBe(1);
  });

  it('finalizeResult computes overall_score as average of all evaluations', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    state.evaluations = [
      {
        question_index: 0, question_type: 'behavioral', question: 'Q1', answer: 'A1',
        scores: { star_completeness: 80, relevance: 80, impact: 80, specificity: 80 },
        overall_score: 80, strengths: [], improvements: [],
      },
      {
        question_index: 1, question_type: 'technical', question: 'Q2', answer: 'A2',
        scores: { star_completeness: 60, relevance: 60, impact: 60, specificity: 60 },
        overall_score: 60, strengths: [], improvements: [],
      },
    ];

    const events: MockInterviewSSEEvent[] = [];
    config.finalizeResult(state, {}, (e) => events.push(e));

    const evt = events[0] as Extract<MockInterviewSSEEvent, { type: 'simulation_complete' }>;
    expect(evt.summary!.overall_score).toBe(70);
  });

  it('finalizeResult recommendation is outstanding for score >= 85', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    state.evaluations = [{
      question_index: 0, question_type: 'behavioral', question: 'Q1', answer: 'A1',
      scores: { star_completeness: 90, relevance: 90, impact: 90, specificity: 90 },
      overall_score: 90, strengths: [], improvements: [],
    }];

    const events: MockInterviewSSEEvent[] = [];
    config.finalizeResult(state, {}, (e) => events.push(e));

    const evt = events[0] as Extract<MockInterviewSSEEvent, { type: 'simulation_complete' }>;
    expect(evt.summary!.recommendation).toContain('Outstanding');
  });

  it('finalizeResult recommendation is solid foundation for score in 55-69 range', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    state.evaluations = [{
      question_index: 0, question_type: 'behavioral', question: 'Q1', answer: 'A1',
      scores: { star_completeness: 60, relevance: 60, impact: 60, specificity: 60 },
      overall_score: 60, strengths: [], improvements: [],
    }];

    const events: MockInterviewSSEEvent[] = [];
    config.finalizeResult(state, {}, (e) => events.push(e));

    const evt = events[0] as Extract<MockInterviewSSEEvent, { type: 'simulation_complete' }>;
    expect(evt.summary!.recommendation).toContain('STAR');
  });

  it('finalizeResult with no evaluations yields overall_score of 0', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});

    const events: MockInterviewSSEEvent[] = [];
    config.finalizeResult(state, {}, (e) => events.push(e));

    const evt = events[0] as Extract<MockInterviewSSEEvent, { type: 'simulation_complete' }>;
    expect(evt.summary!.overall_score).toBe(0);
    expect(evt.summary!.total_questions).toBe(0);
  });

  it('finalizeResult persists final_summary to state', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    state.evaluations = [{
      question_index: 0, question_type: 'behavioral', question: 'Q1', answer: 'A1',
      scores: { star_completeness: 75, relevance: 75, impact: 75, specificity: 75 },
      overall_score: 75, strengths: ['Clear STAR'], improvements: ['Add numbers'],
    }];

    config.finalizeResult(state, {}, () => {});

    expect(state.final_summary).toBeDefined();
    expect(state.final_summary!.overall_score).toBe(75);
  });

  it('onComplete transfers evaluations from scratchpad when state.evaluations is empty', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    const scratchpad: Record<string, unknown> = {
      evaluations: [
        {
          question_index: 0, question_type: 'behavioral', question: 'Q1', answer: 'A1',
          scores: { star_completeness: 80, relevance: 75, impact: 70, specificity: 65 },
          overall_score: 73, strengths: [], improvements: [],
        },
      ],
    };

    config.agents[0].onComplete!(scratchpad, state, () => {});

    expect(state.evaluations).toHaveLength(1);
    expect(state.evaluations[0].question_index).toBe(0);
  });

  it('onComplete does not overwrite existing evaluations in state', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    state.evaluations = [{
      question_index: 0, question_type: 'behavioral', question: 'Q0', answer: 'A0',
      scores: { star_completeness: 80, relevance: 80, impact: 80, specificity: 80 },
      overall_score: 80, strengths: [], improvements: [],
    }];
    const scratchpad: Record<string, unknown> = {
      evaluations: [
        {
          question_index: 99, question_type: 'technical', question: 'Q99', answer: 'A99',
          scores: { star_completeness: 50, relevance: 50, impact: 50, specificity: 50 },
          overall_score: 50, strengths: [], improvements: [],
        },
      ],
    };

    config.agents[0].onComplete!(scratchpad, state, () => {});

    // State had evaluations already — scratchpad should not overwrite
    expect(state.evaluations).toHaveLength(1);
    expect(state.evaluations[0].question_index).toBe(0);
  });

  it('emitError emits pipeline_error event', () => {
    const events: MockInterviewSSEEvent[] = [];
    config.emitError!('interview', 'LLM timed out', (e) => events.push(e));

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('pipeline_error');
    const evt = events[0] as Extract<MockInterviewSSEEvent, { type: 'pipeline_error' }>;
    expect(evt.stage).toBe('interview');
    expect(evt.error).toBe('LLM timed out');
  });
});
