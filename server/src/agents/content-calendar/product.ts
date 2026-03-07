/**
 * Content Calendar Product — ProductConfig implementation.
 *
 * Agent #12: 2-agent pipeline (Strategist → Writer) that generates
 * a 30-day LinkedIn posting plan from resume data, positioning strategy,
 * and industry expertise.
 * Autonomous — no user gates. Full calendar report delivered at once.
 */

import type { ProductConfig } from '../runtime/product-config.js';
import { strategistConfig } from './strategist/agent.js';
import { writerConfig } from './writer/agent.js';
import type { ContentCalendarState, ContentCalendarSSEEvent } from './types.js';
import { supabaseAdmin } from '../../lib/supabase.js';
import logger from '../../lib/logger.js';

export function createContentCalendarProductConfig(): ProductConfig<ContentCalendarState, ContentCalendarSSEEvent> {
  return {
    domain: 'content-calendar',

    agents: [
      {
        name: 'strategist',
        config: strategistConfig,
        stageMessage: {
          startStage: 'strategy',
          start: 'Analyzing expertise and mapping audience interests...',
          complete: 'Strategy complete — themes and content mix identified',
        },
        onComplete: (scratchpad, state) => {
          if (scratchpad.resume_data && !state.resume_data) {
            state.resume_data = scratchpad.resume_data as ContentCalendarState['resume_data'];
          }
          if (scratchpad.expertise_analysis && !state.expertise_analysis) {
            state.expertise_analysis = scratchpad.expertise_analysis as ContentCalendarState['expertise_analysis'];
          }
          if (scratchpad.audience_mapping && !state.audience_mapping) {
            state.audience_mapping = scratchpad.audience_mapping as ContentCalendarState['audience_mapping'];
          }
          if (scratchpad.themes && !state.themes) {
            state.themes = scratchpad.themes as ContentCalendarState['themes'];
          }
          if (scratchpad.content_mix && !state.content_mix) {
            state.content_mix = scratchpad.content_mix as ContentCalendarState['content_mix'];
          }
        },
      },
      {
        name: 'writer',
        config: writerConfig,
        stageMessage: {
          startStage: 'writing',
          start: 'Writing your 30-day content calendar...',
          complete: 'Content calendar complete',
        },
        onComplete: (scratchpad, state) => {
          if (scratchpad.final_report && typeof scratchpad.final_report === 'string') {
            state.final_report = scratchpad.final_report;
          }
          if (typeof scratchpad.quality_score === 'number') {
            state.quality_score = scratchpad.quality_score;
          }
          if (typeof scratchpad.coherence_score === 'number') {
            state.coherence_score = scratchpad.coherence_score;
          }
          if (Array.isArray(scratchpad.posts)) {
            state.posts = scratchpad.posts as ContentCalendarState['posts'];
          }
        },
      },
    ],

    createInitialState: (sessionId, userId, input) => ({
      session_id: sessionId,
      user_id: userId,
      current_stage: 'strategy',
      platform_context: input.platform_context as ContentCalendarState['platform_context'],
      target_context: {
        target_role: (input.target_role as string) ?? '',
        target_industry: (input.target_industry as string) ?? '',
        target_seniority: (input.target_seniority as string) ?? '',
      },
      posts: [],
    }),

    buildAgentMessage: (agentName, state, input) => {
      if (agentName === 'strategist') {
        const parts = [
          'Analyze the candidate resume to identify expertise, themes, and audience for a 30-day LinkedIn content calendar.',
          '',
          '## Resume',
          String(input.resume_text ?? ''),
        ];

        if (state.platform_context?.why_me_story) {
          parts.push(
            '',
            '## Why-Me Story (from CareerIQ)',
            JSON.stringify(state.platform_context.why_me_story, null, 2),
          );
        }

        if (state.platform_context?.positioning_strategy) {
          parts.push(
            '',
            '## Prior Positioning Strategy',
            JSON.stringify(state.platform_context.positioning_strategy, null, 2),
          );
        }

        if (state.platform_context?.linkedin_analysis) {
          parts.push(
            '',
            '## LinkedIn Profile Analysis (from LinkedIn Optimizer)',
            JSON.stringify(state.platform_context.linkedin_analysis, null, 2),
          );
        }

        if (input.target_role) {
          parts.push('', `Target Role: ${String(input.target_role)}`);
        }
        if (input.target_industry) {
          parts.push(`Target Industry: ${String(input.target_industry)}`);
        }

        parts.push(
          '',
          'Call analyze_expertise first, then identify_themes, then map_audience_interests, then plan_content_mix.',
        );
        return parts.join('\n');
      }

      if (agentName === 'writer') {
        return [
          'Write the complete 30-day content calendar using the strategy data gathered.',
          '',
          'Follow your workflow exactly:',
          '1. Write posts following the content mix and themes',
          '2. assemble_calendar',
          '',
          'Do NOT skip any post day.',
        ].join('\n');
      }

      return '';
    },

    finalizeResult: (state, _input, emit) => {
      emit({
        type: 'calendar_complete',
        session_id: state.session_id,
        report: state.final_report ?? '',
        quality_score: state.quality_score ?? 0,
        post_count: state.posts.length,
      });

      return {
        report: state.final_report,
        quality_score: state.quality_score,
        posts: state.posts,
        themes: state.themes,
        content_mix: state.content_mix,
      };
    },

    persistResult: async (state, result) => {
      const data = result as {
        report: string;
        quality_score: number;
        posts: unknown;
        themes: unknown;
        content_mix: unknown;
      };

      try {
        await supabaseAdmin
          .from('content_calendar_reports')
          .insert({
            user_id: state.user_id,
            target_role: state.target_context?.target_role ?? '',
            target_industry: state.target_context?.target_industry ?? '',
            report_markdown: data.report,
            quality_score: data.quality_score,
            posts: data.posts,
            themes: data.themes,
            content_mix: data.content_mix,
          });
      } catch (err) {
        logger.warn(
          { error: err instanceof Error ? err.message : String(err), userId: state.user_id },
          'Content calendar: failed to persist report (non-fatal)',
        );
      }
    },

    validateAfterAgent: (agentName, state) => {
      if (agentName === 'strategist') {
        if (!state.resume_data) {
          throw new Error('Strategist did not parse resume data');
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
