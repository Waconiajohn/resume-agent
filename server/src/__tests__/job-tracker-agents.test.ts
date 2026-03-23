/**
 * Job Application Tracker Agent (#14) — Server tests.
 *
 * Tests agent registration, tool model tiers, knowledge rules,
 * status/follow-up type constants, and ProductConfig behavior.
 */

import { describe, it, expect, vi } from 'vitest';

// Mock supabase before any imports that trigger it
vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: () => ({
      insert: () => ({ data: null, error: null }),
      select: () => ({ eq: () => ({ single: () => ({ data: null, error: null }) }) }),
    }),
  },
}));

// ─── Types & Constants ───────────────────────────────────────────────

import {
  STATUS_SEQUENCE,
  STATUS_LABELS,
  FOLLOW_UP_SEQUENCE,
  FOLLOW_UP_LABELS,
  FOLLOW_UP_TIMING,
} from '../agents/job-tracker/types.js';

import type {
  ApplicationStatus,
  FollowUpType,
  JobTrackerState,
  JobTrackerSSEEvent,
  ApplicationAnalysis,
  FollowUpMessage,
} from '../agents/job-tracker/types.js';

// ─── Knowledge Rules ─────────────────────────────────────────────────

import {
  RULE_0_PHILOSOPHY,
  RULE_1_FIT_SCORING,
  RULE_2_FOLLOW_UP_TIMING,
  RULE_3_INITIAL_FOLLOW_UP,
  RULE_4_THANK_YOU,
  RULE_5_CHECK_IN,
  RULE_6_ANALYTICS,
  RULE_7_TONE_AND_REVIEW,
  JOB_TRACKER_RULES,
} from '../agents/job-tracker/knowledge/rules.js';

// ─── Agent Configs ───────────────────────────────────────────────────

import { analystConfig } from '../agents/job-tracker/analyst/agent.js';
import { writerConfig } from '../agents/job-tracker/writer/agent.js';

// ─── Tools ───────────────────────────────────────────────────────────

import { analystTools } from '../agents/job-tracker/analyst/tools.js';
import { writerTools } from '../agents/job-tracker/writer/tools.js';

// ─── ProductConfig ───────────────────────────────────────────────────

import { createJobTrackerProductConfig } from '../agents/job-tracker/product.js';
import { createEmptySharedContext } from '../contracts/shared-context.js';

// ═══════════════════════════════════════════════════════════════════════
// Application Status & Follow-Up Type Constants
// ═══════════════════════════════════════════════════════════════════════

describe('Job Tracker — Application Status Constants', () => {
  it('STATUS_SEQUENCE has 7 statuses in lifecycle order', () => {
    expect(STATUS_SEQUENCE).toEqual([
      'applied',
      'followed_up',
      'interviewing',
      'offered',
      'rejected',
      'ghosted',
      'withdrawn',
    ]);
  });

  it('STATUS_LABELS has labels for all statuses', () => {
    for (const status of STATUS_SEQUENCE) {
      expect(STATUS_LABELS[status]).toBeTruthy();
      expect(typeof STATUS_LABELS[status]).toBe('string');
    }
  });

  it('STATUS_LABELS includes human-readable values', () => {
    expect(STATUS_LABELS.applied).toBe('Applied');
    expect(STATUS_LABELS.ghosted).toBe('No Response');
    expect(STATUS_LABELS.offered).toBe('Offer Received');
  });
});

describe('Job Tracker — Follow-Up Type Constants', () => {
  it('FOLLOW_UP_SEQUENCE has 4 follow-up types in order', () => {
    expect(FOLLOW_UP_SEQUENCE).toEqual([
      'initial_follow_up',
      'thank_you',
      'check_in',
      'post_interview',
    ]);
  });

  it('FOLLOW_UP_LABELS has labels for all types', () => {
    for (const type of FOLLOW_UP_SEQUENCE) {
      expect(FOLLOW_UP_LABELS[type]).toBeTruthy();
      expect(typeof FOLLOW_UP_LABELS[type]).toBe('string');
    }
  });

  it('FOLLOW_UP_TIMING has timing guidance for all types', () => {
    for (const type of FOLLOW_UP_SEQUENCE) {
      expect(FOLLOW_UP_TIMING[type]).toBeTruthy();
      expect(typeof FOLLOW_UP_TIMING[type]).toBe('string');
    }
  });

  it('FOLLOW_UP_TIMING includes specific windows', () => {
    expect(FOLLOW_UP_TIMING.initial_follow_up).toContain('5-7');
    expect(FOLLOW_UP_TIMING.thank_you).toContain('24 hours');
    expect(FOLLOW_UP_TIMING.check_in).toContain('7-10');
    expect(FOLLOW_UP_TIMING.post_interview).toContain('1-2');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Knowledge Rules
// ═══════════════════════════════════════════════════════════════════════

describe('Job Tracker — Knowledge Rules', () => {
  it('RULE_0 covers tracking philosophy', () => {
    expect(RULE_0_PHILOSOPHY).toContain('TRACKING PHILOSOPHY');
    expect(RULE_0_PHILOSOPHY).toContain('Portfolio mindset');
  });

  it('RULE_1 covers 4-dimension fit scoring', () => {
    expect(RULE_1_FIT_SCORING).toContain('FIT SCORING');
    expect(RULE_1_FIT_SCORING).toContain('Keyword match (25%)');
    expect(RULE_1_FIT_SCORING).toContain('Seniority alignment (25%)');
    expect(RULE_1_FIT_SCORING).toContain('Industry relevance (25%)');
    expect(RULE_1_FIT_SCORING).toContain('Positioning fit (25%)');
  });

  it('RULE_2 covers follow-up timing windows', () => {
    expect(RULE_2_FOLLOW_UP_TIMING).toContain('FOLLOW-UP TIMING');
    expect(RULE_2_FOLLOW_UP_TIMING).toContain('5-7 business days');
    expect(RULE_2_FOLLOW_UP_TIMING).toContain('Urgency classification');
  });

  it('RULE_3 covers initial follow-up structure', () => {
    expect(RULE_3_INITIAL_FOLLOW_UP).toContain('INITIAL FOLLOW-UP');
    expect(RULE_3_INITIAL_FOLLOW_UP).toContain('150-200 words');
  });

  it('RULE_4 covers thank-you note guidelines', () => {
    expect(RULE_4_THANK_YOU).toContain('THANK-YOU NOTE');
    expect(RULE_4_THANK_YOU).toContain('100-150 words');
  });

  it('RULE_5 covers check-in message', () => {
    expect(RULE_5_CHECK_IN).toContain('CHECK-IN MESSAGE');
    expect(RULE_5_CHECK_IN).toContain('75-125 words');
  });

  it('RULE_6 covers portfolio analytics', () => {
    expect(RULE_6_ANALYTICS).toContain('PORTFOLIO ANALYTICS');
    expect(RULE_6_ANALYTICS).toContain('Average fit score');
  });

  it('RULE_7 covers tone and self-review', () => {
    expect(RULE_7_TONE_AND_REVIEW).toContain('TONE');
    expect(RULE_7_TONE_AND_REVIEW).toContain('Self-review checklist');
    expect(RULE_7_TONE_AND_REVIEW).toContain('Desperation test');
  });

  it('JOB_TRACKER_RULES combines all 8 rules', () => {
    expect(JOB_TRACKER_RULES).toContain('RULE 0');
    expect(JOB_TRACKER_RULES).toContain('RULE 7');
    expect(JOB_TRACKER_RULES.split('---').length).toBe(8);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Agent Registration
// ═══════════════════════════════════════════════════════════════════════

describe('Job Tracker — Agent Registration', () => {
  describe('Analyst agent', () => {
    it('has correct identity', () => {
      expect(analystConfig.identity.name).toBe('analyst');
      expect(analystConfig.identity.domain).toBe('job-tracker');
    });

    it('has 4 capabilities', () => {
      expect(analystConfig.capabilities).toHaveLength(4);
      expect(analystConfig.capabilities).toContain('application_analysis');
      expect(analystConfig.capabilities).toContain('fit_scoring');
      expect(analystConfig.capabilities).toContain('follow_up_timing');
      expect(analystConfig.capabilities).toContain('portfolio_analytics');
    });

    it('uses orchestrator model', () => {
      expect(analystConfig.model).toBe('orchestrator');
    });

    it('has 6 max rounds', () => {
      expect(analystConfig.max_rounds).toBe(6);
    });

    it('has tools including emit_transparency', () => {
      const toolNames = analystConfig.tools.map((t) => t.name);
      expect(toolNames).toContain('analyze_application');
      expect(toolNames).toContain('score_fit');
      expect(toolNames).toContain('assess_follow_up_timing');
      expect(toolNames).toContain('generate_portfolio_analytics');
      expect(toolNames).toContain('emit_transparency');
    });
  });

  describe('Writer agent', () => {
    it('has correct identity', () => {
      expect(writerConfig.identity.name).toBe('writer');
      expect(writerConfig.identity.domain).toBe('job-tracker');
    });

    it('has 4 capabilities', () => {
      expect(writerConfig.capabilities).toHaveLength(4);
      expect(writerConfig.capabilities).toContain('follow_up_writing');
      expect(writerConfig.capabilities).toContain('thank_you_notes');
      expect(writerConfig.capabilities).toContain('check_in_messaging');
      expect(writerConfig.capabilities).toContain('report_assembly');
    });

    it('uses orchestrator model', () => {
      expect(writerConfig.model).toBe('orchestrator');
    });

    it('has 12 max rounds (higher than standard)', () => {
      expect(writerConfig.max_rounds).toBe(12);
    });

    it('has tools including emit_transparency', () => {
      const toolNames = writerConfig.tools.map((t) => t.name);
      expect(toolNames).toContain('write_follow_up_email');
      expect(toolNames).toContain('write_thank_you');
      expect(toolNames).toContain('write_check_in');
      expect(toolNames).toContain('assess_status');
      expect(toolNames).toContain('assemble_tracker_report');
      expect(toolNames).toContain('emit_transparency');
    });

    it('injects JOB_TRACKER_RULES into system prompt', () => {
      expect(writerConfig.system_prompt).toContain('RULE 0');
      expect(writerConfig.system_prompt).toContain('TRACKING PHILOSOPHY');
    });
  });
});

describe('Job Tracker shared context rollout', () => {
  it('createInitialState preserves shared_context when provided', () => {
    const config = createJobTrackerProductConfig();
    const sharedContext = createEmptySharedContext();
    sharedContext.positioningStrategy.positioningAngle = 'Application analysis should stay tied to credible executive positioning';
    const state = config.createInitialState('sess-1', 'user-1', {
      applications: [],
      shared_context: sharedContext,
    });
    expect(state.shared_context?.positioningStrategy.positioningAngle).toBe('Application analysis should stay tied to credible executive positioning');
  });

  it('buildAgentMessage includes canonical shared context when legacy room context is absent', () => {
    const config = createJobTrackerProductConfig();
    const sharedContext = createEmptySharedContext();
    sharedContext.careerNarrative.careerArc = 'Known for matching operating proof to the right executive scope';
    sharedContext.positioningStrategy.positioningAngle = 'Operator targeting roles where disciplined execution is the differentiator';
    const state = config.createInitialState('s', 'u', {
      applications: [{
        company: 'Acme',
        role: 'VP Operations',
        date_applied: '2026-03-01',
        jd_text: 'Needs an operator who can scale execution.',
        status: 'applied',
      }],
      shared_context: sharedContext,
    });
    const msg = config.buildAgentMessage('analyst', state, { resume_text: 'resume text' });
    expect(msg).toContain('Known for matching operating proof to the right executive scope');
    expect(msg).toContain('Operator targeting roles where disciplined execution is the differentiator');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Tool Model Tiers
// ═══════════════════════════════════════════════════════════════════════

describe('Job Tracker — Tool Model Tiers', () => {
  it('analyst tools use correct tiers', () => {
    const tiers = Object.fromEntries(analystTools.map((t) => [t.name, t.model_tier]));
    expect(tiers.analyze_application).toBe('light');
    expect(tiers.score_fit).toBe('mid');
    expect(tiers.assess_follow_up_timing).toBe('mid');
    expect(tiers.generate_portfolio_analytics).toBe('mid');
  });

  it('writer tools use correct tiers', () => {
    const tiers = Object.fromEntries(writerTools.map((t) => [t.name, t.model_tier]));
    expect(tiers.write_follow_up_email).toBe('primary');
    expect(tiers.write_thank_you).toBe('primary');
    expect(tiers.write_check_in).toBe('primary');
    expect(tiers.assess_status).toBe('mid');
    expect(tiers.assemble_tracker_report).toBe('mid');
  });

  it('analyst has 4 exported tools', () => {
    expect(analystTools).toHaveLength(4);
  });

  it('writer has 5 exported tools', () => {
    expect(writerTools).toHaveLength(5);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// ProductConfig
// ═══════════════════════════════════════════════════════════════════════

describe('Job Tracker — ProductConfig', () => {
  const config = createJobTrackerProductConfig();

  it('has domain job-tracker', () => {
    expect(config.domain).toBe('job-tracker');
  });

  it('has 2 agents: analyst → writer', () => {
    expect(config.agents).toHaveLength(2);
    expect(config.agents[0].name).toBe('analyst');
    expect(config.agents[1].name).toBe('writer');
  });

  it('analyst stage message references analysis', () => {
    expect(config.agents[0].stageMessage?.startStage).toBe('analysis');
    expect(config.agents[0].stageMessage?.start).toContain('Analyzing');
  });

  it('writer stage message references writing', () => {
    expect(config.agents[1].stageMessage?.startStage).toBe('writing');
    expect(config.agents[1].stageMessage?.start).toContain('follow-up');
  });

  it('createInitialState produces valid state', () => {
    const state = config.createInitialState('sess-1', 'user-1', {
      applications: [
        {
          company: 'Acme',
          role: 'VP Ops',
          date_applied: '2026-03-01',
          jd_text: 'Looking for a VP of Operations...',
          status: 'applied',
        },
      ],
    });
    expect(state.session_id).toBe('sess-1');
    expect(state.user_id).toBe('user-1');
    expect(state.current_stage).toBe('analysis');
    expect(state.applications).toHaveLength(1);
    expect(state.follow_up_messages).toEqual([]);
  });

  it('createInitialState handles empty applications', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    expect(state.applications).toEqual([]);
    expect(state.follow_up_messages).toEqual([]);
  });

  it('createInitialState accepts platform_context', () => {
    const state = config.createInitialState('sess-1', 'user-1', {
      applications: [],
      platform_context: {
        positioning_strategy: { theme: 'digital transformation' },
      },
    });
    expect(state.platform_context?.positioning_strategy).toBeDefined();
  });

  it('buildAgentMessage for analyst includes app list and resume', () => {
    const state = config.createInitialState('sess-1', 'user-1', {
      applications: [
        {
          company: 'Acme',
          role: 'VP Ops',
          date_applied: '2026-03-01',
          jd_text: 'VP of Operations role...',
          status: 'applied',
        },
      ],
    });
    const msg = config.buildAgentMessage('analyst', state, {
      resume_text: 'John Doe, 20 years experience in operations...',
    });
    expect(msg).toContain('Acme');
    expect(msg).toContain('VP Ops');
    expect(msg).toContain('analyze_application');
    expect(msg).toContain('John Doe');
  });

  it('buildAgentMessage for writer includes follow-up priorities', () => {
    const state = config.createInitialState('sess-1', 'user-1', {
      applications: [
        {
          company: 'Acme',
          role: 'VP Ops',
          date_applied: '2026-03-01',
          jd_text: 'VP of Operations role...',
          status: 'applied',
        },
      ],
    });
    state.follow_up_priorities = [
      {
        company: 'Acme',
        role: 'VP Ops',
        urgency: 'immediate',
        reason: '10 days since applied',
        recommended_type: 'initial_follow_up',
      },
    ];
    const msg = config.buildAgentMessage('writer', state, {});
    expect(msg).toContain('Acme');
    expect(msg).toContain('immediate');
    expect(msg).toContain('initial_follow_up');
  });

  it('buildAgentMessage for writer filters out no_action priorities', () => {
    const state = config.createInitialState('sess-1', 'user-1', { applications: [] });
    state.follow_up_priorities = [
      { company: 'A', role: 'R', urgency: 'immediate', reason: '', recommended_type: 'initial_follow_up' },
      { company: 'B', role: 'R', urgency: 'no_action', reason: '', recommended_type: 'initial_follow_up' },
    ];
    const msg = config.buildAgentMessage('writer', state, {});
    expect(msg).toContain('1 application(s)');
    expect(msg).not.toContain('B —');
  });

  it('buildAgentMessage for unknown agent returns empty', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    expect(config.buildAgentMessage('unknown', state, {})).toBe('');
  });

  it('finalizeResult emits tracker_complete event', () => {
    const state = config.createInitialState('sess-1', 'user-1', {
      applications: [
        { company: 'Acme', role: 'VP', date_applied: '2026-03-01', jd_text: 'JD', status: 'applied' },
      ],
    });
    state.final_report = '# Tracker Report';
    state.quality_score = 82;
    state.follow_up_messages = [
      {
        company: 'Acme',
        role: 'VP',
        type: 'initial_follow_up',
        subject: 'Following up',
        body: 'Hello...',
        word_count: 150,
        personalization_hooks: [],
        timing: '5-7 days',
        quality_score: 85,
      },
    ] as FollowUpMessage[];

    const events: JobTrackerSSEEvent[] = [];
    const result = config.finalizeResult(state, {}, (e) => events.push(e));

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('tracker_complete');
    const evt = events[0] as Extract<JobTrackerSSEEvent, { type: 'tracker_complete' }>;
    expect(evt.session_id).toBe('sess-1');
    expect(evt.quality_score).toBe(82);
    expect(evt.application_count).toBe(1);
    expect(evt.follow_up_count).toBe(1);
    expect(evt.report).toBe('# Tracker Report');
  });

  it('finalizeResult returns result object with all data', () => {
    const state = config.createInitialState('sess-1', 'user-1', { applications: [] });
    state.final_report = '# Report';
    state.quality_score = 75;
    state.application_analyses = [];
    state.portfolio_analytics = {} as JobTrackerState['portfolio_analytics'];
    state.follow_up_messages = [];

    const result = config.finalizeResult(state, {}, () => {}) as Record<string, unknown>;
    expect(result.report).toBe('# Report');
    expect(result.quality_score).toBe(75);
    expect(result.application_analyses).toEqual([]);
    expect(result.follow_up_messages).toEqual([]);
  });

  it('validateAfterAgent throws if analyst produces no analyses', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    expect(() => config.validateAfterAgent!('analyst', state)).toThrow('application analyses');
  });

  it('validateAfterAgent passes if analyst produces analyses', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    state.application_analyses = [
      {
        company: 'Acme',
        role: 'VP',
        fit_score: 75,
        keyword_match: 70,
        seniority_alignment: 'match',
        industry_relevance: 80,
        positioning_fit: 75,
        strengths: ['Leadership'],
        gaps: [],
        recommended_action: 'Follow up',
        days_elapsed: 10,
        response_likelihood: 'medium',
      },
    ];
    expect(() => config.validateAfterAgent!('analyst', state)).not.toThrow();
  });

  it('validateAfterAgent throws if writer produces no final_report', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    expect(() => config.validateAfterAgent!('writer', state)).toThrow('final report');
  });

  it('validateAfterAgent passes if writer produces final_report', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    state.final_report = '# Report';
    expect(() => config.validateAfterAgent!('writer', state)).not.toThrow();
  });

  it('emitError emits pipeline_error event', () => {
    const events: JobTrackerSSEEvent[] = [];
    config.emitError!('analysis', 'Something failed', (e) => events.push(e));
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('pipeline_error');
    const evt = events[0] as Extract<JobTrackerSSEEvent, { type: 'pipeline_error' }>;
    expect(evt.stage).toBe('analysis');
    expect(evt.error).toBe('Something failed');
  });

  it('analyst onComplete copies analyses from scratchpad', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    const scratchpad: Record<string, unknown> = {
      application_analyses: [
        { company: 'Acme', role: 'VP', fit_score: 80 },
      ],
      portfolio_analytics: {
        total_applications: 1,
        average_fit_score: 80,
      },
      follow_up_priorities: [
        { company: 'Acme', role: 'VP', urgency: 'immediate' },
      ],
      resume_data: {
        name: 'John',
        current_title: 'VP',
        career_summary: 'Experienced leader',
        key_skills: [],
        key_achievements: [],
        work_history: [],
      },
    };
    const noop = () => {};
    config.agents[0].onComplete!(scratchpad, state, noop);
    expect(state.application_analyses).toHaveLength(1);
    expect(state.portfolio_analytics).toBeDefined();
    expect(state.follow_up_priorities).toHaveLength(1);
    expect(state.resume_data?.name).toBe('John');
  });

  it('writer onComplete copies report and messages from scratchpad', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    const scratchpad: Record<string, unknown> = {
      final_report: '# Full Report',
      quality_score: 88,
      follow_up_messages: [
        { company: 'Acme', role: 'VP', type: 'initial_follow_up', body: 'Hello' },
      ],
    };
    const noop = () => {};
    config.agents[1].onComplete!(scratchpad, state, noop);
    expect(state.final_report).toBe('# Full Report');
    expect(state.quality_score).toBe(88);
    expect(state.follow_up_messages).toHaveLength(1);
  });

  it('analyst onComplete does not overwrite existing state', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    state.application_analyses = [{ company: 'Existing', role: 'R', fit_score: 99 }] as ApplicationAnalysis[];
    const scratchpad: Record<string, unknown> = {
      application_analyses: [{ company: 'New', role: 'R2', fit_score: 50 }],
    };
    const noop = () => {};
    config.agents[0].onComplete!(scratchpad, state, noop);
    // Should NOT overwrite since state already has application_analyses
    expect(state.application_analyses[0].company).toBe('Existing');
  });
});
