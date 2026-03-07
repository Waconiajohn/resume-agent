import { describe, it, expect } from 'vitest';

/**
 * Unit tests for LinkedIn optimizer SSE event parsing and state transitions.
 *
 * Tests the event->state mapping logic extracted from useLinkedInOptimizer.
 */

interface ActivityMessage {
  id: string;
  text: string;
  stage: string;
  timestamp: number;
}

type LinkedInOptimizerStatus = 'idle' | 'connecting' | 'running' | 'complete' | 'error';

interface LinkedInOptimizerState {
  status: LinkedInOptimizerStatus;
  report: string | null;
  qualityScore: number | null;
  activityMessages: ActivityMessage[];
  error: string | null;
  currentStage: string | null;
}

function initialState(): LinkedInOptimizerState {
  return {
    status: 'running',
    report: null,
    qualityScore: null,
    activityMessages: [],
    error: null,
    currentStage: null,
  };
}

function applyEvent(
  state: LinkedInOptimizerState,
  eventType: string,
  data: Record<string, unknown>,
): LinkedInOptimizerState {
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
      let text = '';
      if (progressStatus === 'writing') text = `Writing: ${section}`;
      else if (progressStatus === 'reviewing') text = `Reviewing: ${section}`;
      else if (progressStatus === 'complete') text = `Complete: ${section}`;
      if (!text) return state;
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

    default:
      return state;
  }
}

// ─── Tests ───────────────────────────────────────────────────────

describe('LinkedIn Optimizer SSE Event Parsing', () => {
  it('stage_start sets currentStage and adds activity', () => {
    const state = applyEvent(initialState(), 'stage_start', {
      stage: 'analysis',
      message: 'Analyzing resume and LinkedIn profile...',
    });
    expect(state.currentStage).toBe('analysis');
    expect(state.activityMessages).toHaveLength(1);
    expect(state.activityMessages[0].text).toBe('Analyzing resume and LinkedIn profile...');
  });

  it('stage_complete adds activity without changing currentStage', () => {
    const prev = { ...initialState(), currentStage: 'analysis' };
    const state = applyEvent(prev, 'stage_complete', {
      stage: 'analysis',
      message: 'Analysis complete',
    });
    expect(state.currentStage).toBe('analysis');
    expect(state.activityMessages).toHaveLength(1);
  });

  it('transparency adds activity', () => {
    const state = applyEvent(initialState(), 'transparency', {
      stage: 'keywords',
      message: 'Analyzing keyword coverage...',
    });
    expect(state.activityMessages).toHaveLength(1);
    expect(state.activityMessages[0].text).toBe('Analyzing keyword coverage...');
  });

  it('section_progress writing adds correct activity', () => {
    const state = applyEvent(initialState(), 'section_progress', {
      section: 'headline',
      status: 'writing',
    });
    expect(state.activityMessages).toHaveLength(1);
    expect(state.activityMessages[0].text).toBe('Writing: headline');
  });

  it('section_progress reviewing adds correct activity', () => {
    const state = applyEvent(initialState(), 'section_progress', {
      section: 'about',
      status: 'reviewing',
    });
    expect(state.activityMessages).toHaveLength(1);
    expect(state.activityMessages[0].text).toBe('Reviewing: about');
  });

  it('section_progress complete adds correct activity', () => {
    const state = applyEvent(initialState(), 'section_progress', {
      section: 'keywords',
      status: 'complete',
    });
    expect(state.activityMessages).toHaveLength(1);
    expect(state.activityMessages[0].text).toBe('Complete: keywords');
  });

  it('report_complete sets status, report, and qualityScore', () => {
    const state = applyEvent(initialState(), 'report_complete', {
      session_id: 'test-session',
      report: '# LinkedIn Optimization Report',
      quality_score: 88,
    });
    expect(state.status).toBe('complete');
    expect(state.report).toBe('# LinkedIn Optimization Report');
    expect(state.qualityScore).toBe(88);
  });

  it('pipeline_error sets error status and message', () => {
    const state = applyEvent(initialState(), 'pipeline_error', {
      stage: 'analysis',
      error: 'Analyzer failed to parse resume',
    });
    expect(state.status).toBe('error');
    expect(state.error).toBe('Analyzer failed to parse resume');
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

    // Analyzer stage
    state = applyEvent(state, 'stage_start', { stage: 'analysis', message: 'Starting analysis...' });
    state = applyEvent(state, 'transparency', { stage: 'analysis', message: 'Parsing resume...' });
    state = applyEvent(state, 'transparency', { stage: 'keywords', message: 'Analyzing keywords...' });
    state = applyEvent(state, 'stage_complete', { stage: 'analysis', message: 'Analysis complete' });

    // Writer stage
    state = applyEvent(state, 'stage_start', { stage: 'writing', message: 'Writing optimizations...' });
    state = applyEvent(state, 'section_progress', { section: 'headline', status: 'writing' });
    state = applyEvent(state, 'section_progress', { section: 'headline', status: 'complete' });
    state = applyEvent(state, 'section_progress', { section: 'about', status: 'writing' });
    state = applyEvent(state, 'section_progress', { section: 'about', status: 'complete' });
    state = applyEvent(state, 'section_progress', { section: 'experience', status: 'writing' });
    state = applyEvent(state, 'section_progress', { section: 'experience', status: 'complete' });
    state = applyEvent(state, 'section_progress', { section: 'keywords', status: 'writing' });
    state = applyEvent(state, 'section_progress', { section: 'keywords', status: 'complete' });

    // Report delivery
    state = applyEvent(state, 'report_complete', {
      session_id: 'test',
      report: '# Final Report',
      quality_score: 95,
    });

    expect(state.status).toBe('complete');
    expect(state.report).toBe('# Final Report');
    expect(state.qualityScore).toBe(95);
    expect(state.currentStage).toBe('writing');
    // 2 stage_start + 2 stage_complete + 2 transparency + 8 section_progress - 1 (report_complete doesn't add) = 13 activity-producing events
    // Actually: stage_start(analysis) + transparency + transparency + stage_complete(analysis) + stage_start(writing) + 8 section_progress = 13
    expect(state.activityMessages).toHaveLength(13);
  });
});
