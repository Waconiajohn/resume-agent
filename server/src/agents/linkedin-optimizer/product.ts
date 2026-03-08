/**
 * LinkedIn Optimizer Product — ProductConfig implementation.
 *
 * Agent #11: 2-agent pipeline (Analyzer → Writer) that generates
 * LinkedIn profile optimization recommendations from resume + positioning
 * strategy + current LinkedIn profile text.
 * Autonomous — no user gates. Full report delivered at once.
 */

import type { ProductConfig } from '../runtime/product-config.js';
import { analyzerConfig } from './analyzer/agent.js';
import { writerConfig } from './writer/agent.js';
import type { LinkedInOptimizerState, LinkedInOptimizerSSEEvent } from './types.js';
import { supabaseAdmin } from '../../lib/supabase.js';
import logger from '../../lib/logger.js';
import { getToneGuidanceFromInput, getDistressFromInput } from '../../lib/emotional-baseline.js';

export function createLinkedInOptimizerProductConfig(): ProductConfig<LinkedInOptimizerState, LinkedInOptimizerSSEEvent> {
  return {
    domain: 'linkedin-optimizer',

    agents: [
      {
        name: 'analyzer',
        config: analyzerConfig,
        stageMessage: {
          startStage: 'analysis',
          start: 'Analyzing resume and current LinkedIn profile...',
          complete: 'Analysis complete — profile gaps and keyword coverage identified',
        },
        onComplete: (scratchpad, state) => {
          if (scratchpad.resume_data && !state.resume_data) {
            state.resume_data = scratchpad.resume_data as LinkedInOptimizerState['resume_data'];
          }
          if (scratchpad.profile_analysis && !state.profile_analysis) {
            state.profile_analysis = scratchpad.profile_analysis as LinkedInOptimizerState['profile_analysis'];
          }
          if (scratchpad.keyword_analysis && !state.keyword_analysis) {
            state.keyword_analysis = scratchpad.keyword_analysis as LinkedInOptimizerState['keyword_analysis'];
          }
        },
      },
      {
        name: 'writer',
        config: writerConfig,
        stageMessage: {
          startStage: 'writing',
          start: 'Writing your optimized LinkedIn profile...',
          complete: 'LinkedIn optimization report complete',
        },
        onComplete: (scratchpad, state) => {
          if (scratchpad.final_report && typeof scratchpad.final_report === 'string') {
            state.final_report = scratchpad.final_report;
          }
          if (typeof scratchpad.quality_score === 'number') {
            state.quality_score = scratchpad.quality_score;
          }
        },
      },
    ],

    createInitialState: (sessionId, userId, input) => ({
      session_id: sessionId,
      user_id: userId,
      current_stage: 'analysis',
      job_application_id: input.job_application_id as string | undefined,
      platform_context: input.platform_context as LinkedInOptimizerState['platform_context'],
      target_context: {
        target_role: (input.target_role as string) ?? '',
        target_industry: (input.target_industry as string) ?? '',
        target_seniority: (input.target_seniority as string) ?? '',
      },
      sections: {} as LinkedInOptimizerState['sections'],
    }),

    buildAgentMessage: (agentName, state, input) => {
      if (agentName === 'analyzer') {
        const parts = [
          'Analyze the candidate resume and current LinkedIn profile to identify optimization opportunities.',
          '',
          '## Resume',
          String(input.resume_text ?? ''),
        ];

        if (input.linkedin_headline || input.linkedin_about || input.linkedin_experience) {
          parts.push(
            '',
            '## Current LinkedIn Profile',
            `Headline: ${String(input.linkedin_headline ?? '')}`,
            `About: ${String(input.linkedin_about ?? '')}`,
            `Experience: ${String(input.linkedin_experience ?? '')}`,
          );
        }

        if (input.target_role) {
          parts.push('', `Target Role: ${String(input.target_role)}`);
        }
        if (input.target_industry) {
          parts.push(`Target Industry: ${String(input.target_industry)}`);
        }

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

        parts.push('', 'Call parse_inputs first, then analyze_current_profile, then identify_keyword_gaps.');

        // Distress resources — first agent only
        const distress = getDistressFromInput(input);
        if (distress) {
          parts.push('', '## Support Resources', distress.message);
          for (const r of distress.resources) {
            parts.push(`- **${r.name}**: ${r.description} (${r.contact})`);
          }
        }

        // Emotional baseline tone adaptation
        const toneGuidance = getToneGuidanceFromInput(input);
        if (toneGuidance) {
          parts.push(toneGuidance);
        }

        return parts.join('\n');
      }

      if (agentName === 'writer') {
        const parts = [
          'Write the complete LinkedIn profile optimization using the analysis data gathered.',
          '',
          'Follow your workflow exactly:',
          '1. write_headline',
          '2. write_about',
          '3. write_experience_entries',
          '4. optimize_keywords',
          '5. assemble_report',
          '',
          'Do NOT skip any section.',
        ];

        // Emotional baseline tone adaptation
        const toneGuidance = getToneGuidanceFromInput(input);
        if (toneGuidance) {
          parts.push(toneGuidance);
        }

        return parts.join('\n');
      }

      return '';
    },

    finalizeResult: (state, _input, emit) => {
      emit({
        type: 'report_complete',
        session_id: state.session_id,
        report: state.final_report ?? '',
        quality_score: state.quality_score ?? 0,
      });

      return {
        report: state.final_report,
        quality_score: state.quality_score,
        sections: state.sections,
        keyword_analysis: state.keyword_analysis,
        profile_analysis: state.profile_analysis,
      };
    },

    persistResult: async (state, result) => {
      const data = result as {
        report: string;
        quality_score: number;
        sections: unknown;
        keyword_analysis: unknown;
        profile_analysis: unknown;
      };

      try {
        await supabaseAdmin
          .from('linkedin_optimization_reports')
          .insert({
            user_id: state.user_id,
            job_application_id: state.job_application_id ?? null,
            target_role: state.target_context?.target_role ?? '',
            target_industry: state.target_context?.target_industry ?? '',
            report_markdown: data.report,
            quality_score: data.quality_score,
            sections: data.sections,
            keyword_analysis: data.keyword_analysis,
            profile_analysis: data.profile_analysis,
          });
      } catch (err) {
        logger.warn(
          { error: err instanceof Error ? err.message : String(err), userId: state.user_id },
          'LinkedIn optimizer: failed to persist report (non-fatal)',
        );
      }
    },

    validateAfterAgent: (agentName, state) => {
      if (agentName === 'analyzer') {
        if (!state.resume_data) {
          throw new Error('Analyzer did not parse resume data');
        }
        // Profile analysis and keyword analysis are optional — profile may not be provided
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
