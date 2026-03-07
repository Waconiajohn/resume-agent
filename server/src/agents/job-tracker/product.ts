/**
 * Job Application Tracker Product — ProductConfig implementation.
 *
 * Agent #14: 2-agent pipeline (Analyst → Follow-Up Writer) that analyzes
 * job applications, scores fit, generates follow-up messages, and produces
 * portfolio-level analytics and a tracker report.
 * Autonomous — no user gates. Full tracker report delivered at once.
 */

import type { ProductConfig } from '../runtime/product-config.js';
import { analystConfig } from './analyst/agent.js';
import { writerConfig } from './writer/agent.js';
import type { JobTrackerState, JobTrackerSSEEvent } from './types.js';
import { supabaseAdmin } from '../../lib/supabase.js';
import logger from '../../lib/logger.js';

export function createJobTrackerProductConfig(): ProductConfig<JobTrackerState, JobTrackerSSEEvent> {
  return {
    domain: 'job-tracker',

    agents: [
      {
        name: 'analyst',
        config: analystConfig,
        stageMessage: {
          startStage: 'analysis',
          start: 'Analyzing your applications and scoring fit...',
          complete: 'Analysis complete — fit scores and priorities ready',
        },
        onComplete: (scratchpad, state) => {
          if (scratchpad.application_analyses && !state.application_analyses) {
            state.application_analyses = scratchpad.application_analyses as JobTrackerState['application_analyses'];
          }
          if (scratchpad.portfolio_analytics && !state.portfolio_analytics) {
            state.portfolio_analytics = scratchpad.portfolio_analytics as JobTrackerState['portfolio_analytics'];
          }
          if (scratchpad.follow_up_priorities && !state.follow_up_priorities) {
            state.follow_up_priorities = scratchpad.follow_up_priorities as JobTrackerState['follow_up_priorities'];
          }
          if (scratchpad.resume_data && !state.resume_data) {
            state.resume_data = scratchpad.resume_data as JobTrackerState['resume_data'];
          }
        },
      },
      {
        name: 'writer',
        config: writerConfig,
        stageMessage: {
          startStage: 'writing',
          start: 'Writing personalized follow-up messages...',
          complete: 'Follow-up messages and tracker report complete',
        },
        onComplete: (scratchpad, state) => {
          if (scratchpad.final_report && typeof scratchpad.final_report === 'string') {
            state.final_report = scratchpad.final_report;
          }
          if (typeof scratchpad.quality_score === 'number') {
            state.quality_score = scratchpad.quality_score;
          }
          if (Array.isArray(scratchpad.follow_up_messages)) {
            state.follow_up_messages = scratchpad.follow_up_messages as JobTrackerState['follow_up_messages'];
          }
        },
      },
    ],

    createInitialState: (sessionId, userId, input) => ({
      session_id: sessionId,
      user_id: userId,
      current_stage: 'analysis',
      applications: (input.applications ?? []) as JobTrackerState['applications'],
      platform_context: input.platform_context as JobTrackerState['platform_context'],
      follow_up_messages: [],
    }),

    buildAgentMessage: (agentName, state, input) => {
      if (agentName === 'analyst') {
        const appCount = state.applications.length;
        const parts = [
          `Analyze ${appCount} job application(s) against the candidate resume and positioning strategy.`,
          '',
          '## Resume',
          String(input.resume_text ?? ''),
          '',
          `## Applications (${appCount})`,
          ...state.applications.map((app, i) =>
            `${i + 1}. ${app.company} — ${app.role} (${app.status}, applied ${app.date_applied})`,
          ),
        ];

        if (state.platform_context?.positioning_strategy) {
          parts.push('', '## Positioning Strategy', JSON.stringify(state.platform_context.positioning_strategy, null, 2));
        }

        parts.push(
          '',
          'Call analyze_application first (pass the resume_text), then score_fit, then assess_follow_up_timing, then generate_portfolio_analytics.',
        );
        return parts.join('\n');
      }

      if (agentName === 'writer') {
        const priorities = state.follow_up_priorities ?? [];
        const actionable = priorities.filter((p) => p.urgency !== 'no_action');
        return [
          `Write follow-up messages for ${actionable.length} application(s) that need attention.`,
          '',
          'Review follow_up_priorities in state and write the appropriate message for each:',
          ...actionable.map((p) =>
            `- ${p.company} — ${p.role}: urgency=${p.urgency}, recommended=${p.recommended_type}`,
          ),
          '',
          'For each qualifying application, call the appropriate write tool.',
          'Then call assess_status, then assemble_tracker_report.',
          '',
          'Do NOT write messages for applications with urgency "no_action".',
        ].join('\n');
      }

      return '';
    },

    finalizeResult: (state, _input, emit) => {
      emit({
        type: 'tracker_complete',
        session_id: state.session_id,
        report: state.final_report ?? '',
        quality_score: state.quality_score ?? 0,
        application_count: state.applications.length,
        follow_up_count: state.follow_up_messages.length,
      });

      return {
        report: state.final_report,
        quality_score: state.quality_score,
        application_analyses: state.application_analyses,
        portfolio_analytics: state.portfolio_analytics,
        follow_up_messages: state.follow_up_messages,
      };
    },

    persistResult: async (state, result) => {
      const data = result as {
        report: string;
        quality_score: number;
        application_analyses: unknown;
        portfolio_analytics: unknown;
        follow_up_messages: unknown;
      };

      try {
        await supabaseAdmin
          .from('job_tracker_reports')
          .insert({
            user_id: state.user_id,
            application_count: state.applications.length,
            report_markdown: data.report,
            quality_score: data.quality_score,
            application_analyses: data.application_analyses,
            portfolio_analytics: data.portfolio_analytics,
            follow_up_messages: data.follow_up_messages,
          });
      } catch (err) {
        logger.warn(
          { error: err instanceof Error ? err.message : String(err), userId: state.user_id },
          'Job tracker: failed to persist report (non-fatal)',
        );
      }
    },

    validateAfterAgent: (agentName, state) => {
      if (agentName === 'analyst') {
        if (!state.application_analyses || state.application_analyses.length === 0) {
          throw new Error('Analyst did not produce application analyses');
        }
      }
      if (agentName === 'writer') {
        if (!state.final_report) {
          throw new Error('Writer did not produce a final report');
        }
      }
    },

    emitError: (stage, error, emit) => {
      emit({ type: 'pipeline_error', stage, error });
    },
  };
}
