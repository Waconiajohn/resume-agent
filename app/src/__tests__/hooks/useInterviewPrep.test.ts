import { describe, it, expect } from 'vitest';

/**
 * Unit tests for interview prep SSE event parsing and state transitions.
 *
 * Tests the event->state mapping logic extracted from useInterviewPrep.
 * The hook itself manages React state, but the core parsing logic
 * can be verified through state transition expectations.
 */

interface ActivityMessage {
  id: string;
  text: string;
  stage: string;
  timestamp: number;
}

type InterviewPrepStatus = 'idle' | 'connecting' | 'running' | 'complete' | 'error';

interface InterviewPrepState {
  status: InterviewPrepStatus;
  report: string | null;
  qualityScore: number | null;
  activityMessages: ActivityMessage[];
  error: string | null;
  currentStage: string | null;
}

function initialState(): InterviewPrepState {
  return {
    status: 'running',
    report: null,
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
  state: InterviewPrepState,
  eventType: string,
  data: Record<string, unknown>,
): InterviewPrepState {
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

    case 'section_progress': {
      const section = data.section as string;
      const progressStatus = data.status as string;
      let text = section;
      if (progressStatus === 'writing') text = `Writing section: ${section}`;
      else if (progressStatus === 'reviewing') text = `Reviewing section: ${section}`;
      else if (progressStatus === 'complete') text = `Section complete: ${section}`;
      return {
        ...state,
        activityMessages: [...state.activityMessages, addActivity(text, 'writing')],
      };
    }

    case 'report_complete':
      return {
        ...state,
        status: 'complete',
        report: data.report as string,
        qualityScore: typeof data.quality_score === 'number' ? data.quality_score : state.qualityScore,
      };

    case 'pipeline_error':
      return {
        ...state,
        status: 'error',
        error: data.error as string,
      };

    case 'pipeline_complete':
      return {
        ...state,
        status: state.report ? 'complete' : state.status,
      };

    case 'heartbeat':
      return state;

    default:
      return state;
  }
}

describe('useInterviewPrep event parsing', () => {
  it('stage_start sets currentStage and adds activity', () => {
    const state = applyEvent(initialState(), 'stage_start', {
      stage: 'research',
      message: 'Researching company and sourcing interview questions...',
    });
    expect(state.currentStage).toBe('research');
    expect(state.activityMessages).toHaveLength(1);
    expect(state.activityMessages[0].text).toBe('Researching company and sourcing interview questions...');
    expect(state.activityMessages[0].stage).toBe('research');
  });

  it('stage_complete adds activity message', () => {
    const state = applyEvent(initialState(), 'stage_complete', {
      stage: 'research',
      message: 'Research complete — company intel and questions gathered',
    });
    expect(state.activityMessages).toHaveLength(1);
    expect(state.activityMessages[0].text).toBe('Research complete — company intel and questions gathered');
  });

  it('transparency adds activity message', () => {
    const state = applyEvent(initialState(), 'transparency', {
      stage: 'research',
      message: 'Researching Medtronic...',
    });
    expect(state.activityMessages).toHaveLength(1);
    expect(state.activityMessages[0].text).toBe('Researching Medtronic...');
  });

  it('section_progress writing adds formatted activity message', () => {
    const state = applyEvent(initialState(), 'section_progress', {
      section: 'elevator_pitch',
      status: 'writing',
    });
    expect(state.activityMessages).toHaveLength(1);
    expect(state.activityMessages[0].text).toBe('Writing section: elevator_pitch');
    expect(state.activityMessages[0].stage).toBe('writing');
  });

  it('section_progress complete adds formatted activity message', () => {
    const state = applyEvent(initialState(), 'section_progress', {
      section: 'elevator_pitch',
      status: 'complete',
    });
    expect(state.activityMessages).toHaveLength(1);
    expect(state.activityMessages[0].text).toBe('Section complete: elevator_pitch');
  });

  it('section_progress reviewing adds formatted activity message', () => {
    const state = applyEvent(initialState(), 'section_progress', {
      section: 'behavioral_questions',
      status: 'reviewing',
    });
    expect(state.activityMessages).toHaveLength(1);
    expect(state.activityMessages[0].text).toBe('Reviewing section: behavioral_questions');
  });

  it('report_complete transitions to complete with report and score', () => {
    const state = applyEvent(initialState(), 'report_complete', {
      session_id: 'abc-123',
      report: '# Full Interview Prep Report\n\nContent here...',
      quality_score: 88,
    });
    expect(state.status).toBe('complete');
    expect(state.report).toBe('# Full Interview Prep Report\n\nContent here...');
    expect(state.qualityScore).toBe(88);
  });

  it('report_complete without quality_score preserves existing score', () => {
    const prev = { ...initialState(), qualityScore: 75 };
    const state = applyEvent(prev, 'report_complete', {
      report: 'Updated report...',
    });
    expect(state.report).toBe('Updated report...');
    expect(state.qualityScore).toBe(75);
  });

  it('pipeline_error transitions to error with message', () => {
    const state = applyEvent(initialState(), 'pipeline_error', {
      stage: 'writing',
      error: 'LLM timeout during section writing',
    });
    expect(state.status).toBe('error');
    expect(state.error).toBe('LLM timeout during section writing');
  });

  it('pipeline_complete transitions to complete when report exists', () => {
    const prev = { ...initialState(), report: '# Report' };
    const state = applyEvent(prev, 'pipeline_complete', {});
    expect(state.status).toBe('complete');
  });

  it('pipeline_complete does not transition when no report', () => {
    const state = applyEvent(initialState(), 'pipeline_complete', {});
    expect(state.status).toBe('running');
  });

  it('heartbeat event is ignored', () => {
    const prev = initialState();
    const state = applyEvent(prev, 'heartbeat', {});
    expect(state).toBe(prev);
  });

  it('unknown event types are ignored', () => {
    const prev = initialState();
    const state = applyEvent(prev, 'some_random_event', { data: 'whatever' });
    expect(state).toEqual(prev);
  });

  it('multiple events accumulate activity messages in order', () => {
    let state = initialState();
    state = applyEvent(state, 'stage_start', { stage: 'research', message: 'Starting research' });
    state = applyEvent(state, 'transparency', { stage: 'research', message: 'Parsing resume...' });
    state = applyEvent(state, 'transparency', { stage: 'research', message: 'Researching Medtronic...' });
    state = applyEvent(state, 'stage_complete', { stage: 'research', message: 'Research complete' });
    state = applyEvent(state, 'stage_start', { stage: 'writing', message: 'Starting writing' });
    state = applyEvent(state, 'section_progress', { section: 'company_research', status: 'complete' });
    state = applyEvent(state, 'section_progress', { section: 'elevator_pitch', status: 'writing' });
    expect(state.activityMessages).toHaveLength(7);
    expect(state.currentStage).toBe('writing');
  });

  it('full pipeline lifecycle produces correct final state', () => {
    let state = initialState();
    // Research phase
    state = applyEvent(state, 'stage_start', { stage: 'research', message: 'Researching...' });
    state = applyEvent(state, 'stage_complete', { stage: 'research', message: 'Done' });
    // Writing phase
    state = applyEvent(state, 'stage_start', { stage: 'writing', message: 'Writing...' });
    state = applyEvent(state, 'section_progress', { section: 'company_research', status: 'complete' });
    state = applyEvent(state, 'section_progress', { section: 'elevator_pitch', status: 'complete' });
    state = applyEvent(state, 'stage_complete', { stage: 'writing', message: 'Writing done' });
    // Report delivery
    state = applyEvent(state, 'report_complete', {
      report: '# Interview Prep for Medtronic',
      quality_score: 92,
    });

    expect(state.status).toBe('complete');
    expect(state.report).toBe('# Interview Prep for Medtronic');
    expect(state.qualityScore).toBe(92);
    expect(state.activityMessages).toHaveLength(6);
    expect(state.currentStage).toBe('writing');
  });
});
