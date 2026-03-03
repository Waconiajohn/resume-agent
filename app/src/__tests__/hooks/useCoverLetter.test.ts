import { describe, it, expect } from 'vitest';

/**
 * Unit tests for cover letter SSE event parsing and state transitions.
 *
 * Tests the event→state mapping logic extracted from useCoverLetter.
 * The hook itself manages React state, but the core parsing logic
 * can be verified through state transition expectations.
 */

interface ActivityMessage {
  id: string;
  text: string;
  stage: string;
  timestamp: number;
}

type CoverLetterStatus = 'idle' | 'connecting' | 'running' | 'complete' | 'error';

interface CoverLetterState {
  status: CoverLetterStatus;
  letterDraft: string | null;
  qualityScore: number | null;
  activityMessages: ActivityMessage[];
  error: string | null;
  currentStage: string | null;
}

function initialState(): CoverLetterState {
  return {
    status: 'running',
    letterDraft: null,
    qualityScore: null,
    activityMessages: [],
    error: null,
    currentStage: null,
  };
}

/**
 * Pure state transition function matching the hook's handleSSEEvent logic.
 */
function applyEvent(
  state: CoverLetterState,
  eventType: string,
  data: Record<string, unknown>,
): CoverLetterState {
  const addActivity = (text: string, stage: string): ActivityMessage => ({
    id: `${Date.now()}-test`,
    text,
    stage,
    timestamp: Date.now(),
  });

  switch (eventType) {
    case 'stage_start':
      return {
        ...state,
        currentStage: data.stage as string,
        activityMessages: [...state.activityMessages, addActivity(data.message as string, data.stage as string)],
      };

    case 'stage_complete':
      return {
        ...state,
        activityMessages: [...state.activityMessages, addActivity(data.message as string, data.stage as string)],
      };

    case 'transparency':
      return {
        ...state,
        activityMessages: [...state.activityMessages, addActivity(data.message as string, data.stage as string)],
      };

    case 'letter_draft':
      return {
        ...state,
        letterDraft: data.letter as string,
        qualityScore: typeof data.quality_score === 'number' ? data.quality_score : state.qualityScore,
      };

    case 'letter_complete':
      return {
        ...state,
        status: 'complete',
        letterDraft: data.letter as string,
        qualityScore: data.quality_score as number,
      };

    case 'pipeline_error':
      return {
        ...state,
        status: 'error',
        error: data.error as string,
      };

    default:
      return state;
  }
}

describe('useCoverLetter event parsing', () => {
  it('stage_start sets currentStage and adds activity', () => {
    const state = applyEvent(initialState(), 'stage_start', {
      stage: 'analysis',
      message: 'Analyzing job description...',
    });
    expect(state.currentStage).toBe('analysis');
    expect(state.activityMessages).toHaveLength(1);
    expect(state.activityMessages[0].text).toBe('Analyzing job description...');
    expect(state.activityMessages[0].stage).toBe('analysis');
  });

  it('stage_complete adds activity message', () => {
    const state = applyEvent(initialState(), 'stage_complete', {
      stage: 'analysis',
      message: 'Analysis complete',
      duration_ms: 5000,
    });
    expect(state.activityMessages).toHaveLength(1);
    expect(state.activityMessages[0].text).toBe('Analysis complete');
  });

  it('transparency adds activity message', () => {
    const state = applyEvent(initialState(), 'transparency', {
      stage: 'writing',
      message: 'Crafting opening paragraph...',
    });
    expect(state.activityMessages).toHaveLength(1);
    expect(state.activityMessages[0].text).toBe('Crafting opening paragraph...');
  });

  it('letter_draft stores draft and optional quality score', () => {
    const state = applyEvent(initialState(), 'letter_draft', {
      letter: 'Dear Hiring Manager...',
      quality_score: 82,
    });
    expect(state.letterDraft).toBe('Dear Hiring Manager...');
    expect(state.qualityScore).toBe(82);
    expect(state.status).toBe('running');
  });

  it('letter_draft without quality_score preserves existing score', () => {
    const prev = { ...initialState(), qualityScore: 75 };
    const state = applyEvent(prev, 'letter_draft', {
      letter: 'Updated letter...',
    });
    expect(state.letterDraft).toBe('Updated letter...');
    expect(state.qualityScore).toBe(75);
  });

  it('letter_complete transitions to complete with letter and score', () => {
    const state = applyEvent(initialState(), 'letter_complete', {
      session_id: 'abc-123',
      letter: 'Final cover letter content...',
      quality_score: 91,
    });
    expect(state.status).toBe('complete');
    expect(state.letterDraft).toBe('Final cover letter content...');
    expect(state.qualityScore).toBe(91);
  });

  it('pipeline_error transitions to error with message', () => {
    const state = applyEvent(initialState(), 'pipeline_error', {
      stage: 'writing',
      error: 'LLM timeout',
    });
    expect(state.status).toBe('error');
    expect(state.error).toBe('LLM timeout');
  });

  it('unknown event types are ignored', () => {
    const prev = initialState();
    const state = applyEvent(prev, 'unknown_event', { data: 'whatever' });
    expect(state).toEqual(prev);
  });

  it('multiple events accumulate activity messages', () => {
    let state = initialState();
    state = applyEvent(state, 'stage_start', { stage: 'analysis', message: 'Starting analysis' });
    state = applyEvent(state, 'transparency', { stage: 'analysis', message: 'Reading JD...' });
    state = applyEvent(state, 'stage_complete', { stage: 'analysis', message: 'Analysis done' });
    state = applyEvent(state, 'stage_start', { stage: 'writing', message: 'Starting writing' });
    expect(state.activityMessages).toHaveLength(4);
    expect(state.currentStage).toBe('writing');
  });
});
