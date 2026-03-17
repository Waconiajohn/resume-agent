import { describe, it, expect } from 'vitest';
import { hydrateV2SessionLoad } from '../resume-v2-session-load';

describe('resume-v2-session-load', () => {
  it('hydrates a running session without forcing it to complete', () => {
    const hydrated = hydrateV2SessionLoad('session-123', {
      version: 'v2',
      status: 'running',
      pipeline_stage: 'strategy',
      pipeline_data: {
        stage: 'strategy',
        gapCoachingCards: [
          {
            requirement: 'Executive stakeholder communication',
            importance: 'important',
            classification: 'partial',
            ai_reasoning: 'There is adjacent leadership evidence to sharpen.',
            proposed_strategy: 'Position steering-committee work as executive alignment.',
            evidence_found: [],
          },
        ],
        preScores: {
          ats_match: 42,
          keywords_found: ['strategy'],
          keywords_missing: ['go to market'],
        },
        stageMessages: [
          { stage: 'analysis', message: 'Analyzing the job and your background...', type: 'start' },
          { stage: 'analysis', message: 'Analysis complete', type: 'complete', duration_ms: 1200 },
        ],
      },
      inputs: {
        resume_text: 'Original resume text',
        job_description: 'Original job description',
      },
      draft_state: null,
    });

    expect(hydrated).not.toBeNull();
    expect(hydrated?.isComplete).toBe(false);
    expect(hydrated?.shouldReconnect).toBe(true);
    expect(hydrated?.data.sessionId).toBe('session-123');
    expect(hydrated?.data.stage).toBe('strategy');
    expect(hydrated?.data.gapCoachingCards).toEqual([
      expect.objectContaining({
        requirement: 'Executive stakeholder communication',
      }),
    ]);
    expect(hydrated?.data.stageMessages).toHaveLength(2);
  });

  it('hydrates a completed session as complete and does not request a reconnect', () => {
    const hydrated = hydrateV2SessionLoad('session-456', {
      version: 'v2',
      status: 'complete',
      pipeline_stage: 'complete',
      pipeline_data: {
        stage: 'verification',
        error: null,
      },
      inputs: {
        resume_text: 'Original resume text',
        job_description: 'Original job description',
      },
      draft_state: null,
    });

    expect(hydrated).not.toBeNull();
    expect(hydrated?.isComplete).toBe(true);
    expect(hydrated?.shouldReconnect).toBe(false);
    expect(hydrated?.data.stage).toBe('complete');
  });
});
