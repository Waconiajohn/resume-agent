import { describe, it, expect } from 'vitest';

/**
 * Unit tests for Content Calendar SSE event parsing and state transitions.
 *
 * Tests the event->state mapping logic extracted from useContentCalendar.
 */

interface ActivityMessage {
  id: string;
  text: string;
  stage: string;
  timestamp: number;
}

type ContentCalendarStatus = 'idle' | 'connecting' | 'running' | 'complete' | 'error';

interface ContentCalendarState {
  status: ContentCalendarStatus;
  report: string | null;
  qualityScore: number | null;
  postCount: number | null;
  activityMessages: ActivityMessage[];
  error: string | null;
  currentStage: string | null;
}

function initialState(): ContentCalendarState {
  return {
    status: 'running',
    report: null,
    qualityScore: null,
    postCount: null,
    activityMessages: [],
    error: null,
    currentStage: null,
  };
}

function applyEvent(
  state: ContentCalendarState,
  eventType: string,
  data: Record<string, unknown>,
): ContentCalendarState {
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

    case 'theme_identified':
      return {
        ...state,
        activityMessages: [
          ...state.activityMessages,
          addActivity(`Theme: ${data.theme_name as string} (${data.theme_count as number} total)`, 'strategy'),
        ],
      };

    case 'post_progress': {
      const day = data.day as number;
      const total = data.total_days as number;
      const progressStatus = data.status as string;
      let text = '';
      if (progressStatus === 'drafting') text = `Drafting post ${day}/${total}...`;
      else if (progressStatus === 'complete') text = `Post ${day}/${total} complete`;
      if (!text) return state;
      return {
        ...state,
        activityMessages: [...state.activityMessages, addActivity(text, 'writing')],
      };
    }

    case 'calendar_complete':
      return {
        ...state,
        status: 'complete',
        report: data.report as string,
        qualityScore: typeof data.quality_score === 'number' ? data.quality_score : state.qualityScore,
        postCount: typeof data.post_count === 'number' ? data.post_count : state.postCount,
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

    default:
      return state;
  }
}

// ─── Tests ───────────────────────────────────────────────────────

describe('Content Calendar SSE Event Parsing', () => {
  it('stage_start sets currentStage and adds activity', () => {
    const state = applyEvent(initialState(), 'stage_start', {
      stage: 'strategy',
      message: 'Analyzing your expertise and industry...',
    });
    expect(state.currentStage).toBe('strategy');
    expect(state.activityMessages).toHaveLength(1);
    expect(state.activityMessages[0].text).toBe('Analyzing your expertise and industry...');
  });

  it('stage_complete adds activity without changing currentStage', () => {
    const prev = { ...initialState(), currentStage: 'strategy' };
    const state = applyEvent(prev, 'stage_complete', {
      stage: 'strategy',
      message: 'Strategy complete',
    });
    expect(state.currentStage).toBe('strategy');
    expect(state.activityMessages).toHaveLength(1);
  });

  it('transparency adds activity', () => {
    const state = applyEvent(initialState(), 'transparency', {
      stage: 'strategy',
      message: 'Identifying content themes...',
    });
    expect(state.activityMessages).toHaveLength(1);
    expect(state.activityMessages[0].text).toBe('Identifying content themes...');
  });

  it('theme_identified adds formatted activity', () => {
    const state = applyEvent(initialState(), 'theme_identified', {
      theme_name: 'Digital Transformation',
      theme_count: 3,
    });
    expect(state.activityMessages).toHaveLength(1);
    expect(state.activityMessages[0].text).toBe('Theme: Digital Transformation (3 total)');
  });

  it('post_progress drafting adds correct activity', () => {
    const state = applyEvent(initialState(), 'post_progress', {
      day: 3,
      total_days: 20,
      content_type: 'thought_leadership',
      status: 'drafting',
    });
    expect(state.activityMessages).toHaveLength(1);
    expect(state.activityMessages[0].text).toBe('Drafting post 3/20...');
  });

  it('post_progress complete adds correct activity', () => {
    const state = applyEvent(initialState(), 'post_progress', {
      day: 5,
      total_days: 20,
      content_type: 'storytelling',
      status: 'complete',
    });
    expect(state.activityMessages).toHaveLength(1);
    expect(state.activityMessages[0].text).toBe('Post 5/20 complete');
  });

  it('calendar_complete sets status, report, qualityScore, and postCount', () => {
    const state = applyEvent(initialState(), 'calendar_complete', {
      session_id: 'test-session',
      report: '# Content Calendar Report',
      quality_score: 88,
      post_count: 20,
    });
    expect(state.status).toBe('complete');
    expect(state.report).toBe('# Content Calendar Report');
    expect(state.qualityScore).toBe(88);
    expect(state.postCount).toBe(20);
  });

  it('pipeline_error sets error status and message', () => {
    const state = applyEvent(initialState(), 'pipeline_error', {
      stage: 'strategy',
      error: 'Strategist failed to identify themes',
    });
    expect(state.status).toBe('error');
    expect(state.error).toBe('Strategist failed to identify themes');
  });

  it('pipeline_complete sets complete when report exists', () => {
    const prev = { ...initialState(), report: '# Report' };
    const state = applyEvent(prev, 'pipeline_complete', {});
    expect(state.status).toBe('complete');
  });

  it('pipeline_complete does not change status when no report', () => {
    const state = applyEvent(initialState(), 'pipeline_complete', {});
    expect(state.status).toBe('running');
  });

  it('unknown event type is ignored', () => {
    const prev = initialState();
    const state = applyEvent(prev, 'unknown_event', { data: 'test' });
    expect(state).toEqual(prev);
  });

  it('full pipeline flow produces expected state', () => {
    let state = initialState();

    // Strategist stage
    state = applyEvent(state, 'stage_start', { stage: 'strategy', message: 'Starting strategy...' });
    state = applyEvent(state, 'transparency', { stage: 'strategy', message: 'Parsing resume...' });
    state = applyEvent(state, 'transparency', { stage: 'strategy', message: 'Analyzing expertise...' });
    state = applyEvent(state, 'theme_identified', { theme_name: 'Leadership', theme_count: 1 });
    state = applyEvent(state, 'theme_identified', { theme_name: 'Operations', theme_count: 2 });
    state = applyEvent(state, 'theme_identified', { theme_name: 'Innovation', theme_count: 3 });
    state = applyEvent(state, 'transparency', { stage: 'strategy', message: 'Mapping audience...' });
    state = applyEvent(state, 'transparency', { stage: 'strategy', message: 'Planning content mix...' });
    state = applyEvent(state, 'stage_complete', { stage: 'strategy', message: 'Strategy complete' });

    // Writer stage
    state = applyEvent(state, 'stage_start', { stage: 'writing', message: 'Writing posts...' });
    state = applyEvent(state, 'post_progress', { day: 1, total_days: 16, content_type: 'thought_leadership', status: 'drafting' });
    state = applyEvent(state, 'post_progress', { day: 1, total_days: 16, content_type: 'thought_leadership', status: 'complete' });
    state = applyEvent(state, 'post_progress', { day: 2, total_days: 16, content_type: 'storytelling', status: 'drafting' });
    state = applyEvent(state, 'post_progress', { day: 2, total_days: 16, content_type: 'storytelling', status: 'complete' });

    // Calendar delivery
    state = applyEvent(state, 'calendar_complete', {
      session_id: 'test',
      report: '# Final Calendar',
      quality_score: 90,
      post_count: 16,
    });

    expect(state.status).toBe('complete');
    expect(state.report).toBe('# Final Calendar');
    expect(state.qualityScore).toBe(90);
    expect(state.postCount).toBe(16);
    expect(state.currentStage).toBe('writing');
    // stage_start(strategy) + 4 transparency + 3 theme_identified + stage_complete(strategy) + stage_start(writing) + 4 post_progress = 14
    expect(state.activityMessages).toHaveLength(14);
  });
});
