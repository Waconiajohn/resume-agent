/**
 * Executive Bio Agent Product — ProductConfig implementation.
 *
 * Agent #16: Single-agent pipeline (Writer) that analyzes executive positioning,
 * then writes polished bios across multiple formats and lengths tailored to the
 * user's target audience and context.
 * Autonomous — no user gates. Full bio collection delivered at once.
 */

import type { ProductConfig } from '../runtime/product-config.js';
import { writerConfig } from './writer/agent.js';
import type {
  ExecutiveBioState,
  ExecutiveBioSSEEvent,
  BioFormat,
  BioLength,
} from './types.js';
import { supabaseAdmin } from '../../lib/supabase.js';
import logger from '../../lib/logger.js';

const ALL_FORMATS: BioFormat[] = ['speaker', 'board', 'advisory', 'professional', 'linkedin_featured'];
const DEFAULT_LENGTHS: BioLength[] = ['standard'];

export function createExecutiveBioProductConfig(): ProductConfig<ExecutiveBioState, ExecutiveBioSSEEvent> {
  return {
    domain: 'executive-bio',

    agents: [
      {
        name: 'writer',
        config: writerConfig,
        stageMessage: {
          startStage: 'writing',
          start: 'Analyzing positioning and writing your executive bios...',
          complete: 'Bio collection complete',
        },
        onComplete: (scratchpad, state) => {
          if (scratchpad.positioning_analysis && !state.positioning_analysis) {
            state.positioning_analysis = scratchpad.positioning_analysis as ExecutiveBioState['positioning_analysis'];
          }
          if (Array.isArray(scratchpad.bios) && state.bios.length === 0) {
            state.bios = scratchpad.bios as ExecutiveBioState['bios'];
          }
          if (scratchpad.final_report && typeof scratchpad.final_report === 'string' && !state.final_report) {
            state.final_report = scratchpad.final_report;
          }
          if (typeof scratchpad.quality_score === 'number' && state.quality_score == null) {
            state.quality_score = scratchpad.quality_score;
          }
          if (scratchpad.resume_data && !state.resume_data) {
            state.resume_data = scratchpad.resume_data as ExecutiveBioState['resume_data'];
          }
        },
      },
    ],

    createInitialState: (sessionId, userId, input) => ({
      session_id: sessionId,
      user_id: userId,
      current_stage: 'writing',
      requested_formats: (input.requested_formats as BioFormat[] | undefined)?.length
        ? (input.requested_formats as BioFormat[])
        : ALL_FORMATS,
      requested_lengths: (input.requested_lengths as BioLength[] | undefined)?.length
        ? (input.requested_lengths as BioLength[])
        : DEFAULT_LENGTHS,
      target_context: input.target_context as ExecutiveBioState['target_context'],
      platform_context: input.platform_context as ExecutiveBioState['platform_context'],
      bios: [],
    }),

    buildAgentMessage: (agentName, state, input) => {
      if (agentName === 'writer') {
        const parts = [
          'Analyze executive positioning and write polished bios for this candidate.',
          '',
          '## Resume',
          String(input.resume_text ?? ''),
          '',
          '## Requested Formats',
          state.requested_formats.join(', '),
          '',
          '## Requested Lengths',
          state.requested_lengths.join(', '),
        ];

        if (state.platform_context) {
          if (state.platform_context.why_me_story) {
            parts.push('', '## Why-Me Narrative', state.platform_context.why_me_story);
          }
          if (state.platform_context.positioning_strategy) {
            parts.push('', '## Positioning Strategy', JSON.stringify(state.platform_context.positioning_strategy, null, 2));
          }
        }

        if (state.target_context) {
          parts.push('', '## Target Context');
          if (state.target_context.target_role) parts.push(`Target Role: ${state.target_context.target_role}`);
          if (state.target_context.target_industry) parts.push(`Target Industry: ${state.target_context.target_industry}`);
          if (state.target_context.target_seniority) parts.push(`Target Seniority: ${state.target_context.target_seniority}`);
        }

        parts.push(
          '',
          'Call tools in order: analyze_positioning first, then write_bio + quality_check_bio for each format/length combination, then assemble_bio_collection.',
        );
        return parts.join('\n');
      }

      return '';
    },

    finalizeResult: (state, _input, emit) => {
      emit({
        type: 'collection_complete',
        session_id: state.session_id,
        report: state.final_report ?? '',
        quality_score: state.quality_score ?? 0,
        bio_count: state.bios.length,
      });

      return {
        report: state.final_report,
        quality_score: state.quality_score,
        bios: state.bios,
      };
    },

    persistResult: async (state, result) => {
      const data = result as {
        report: string;
        quality_score: number;
        bios: unknown;
      };

      try {
        await supabaseAdmin
          .from('executive_bio_reports')
          .insert({
            user_id: state.user_id,
            report_markdown: data.report,
            quality_score: data.quality_score,
            bios: data.bios,
            positioning_analysis: state.positioning_analysis,
          });
      } catch (err) {
        logger.warn(
          { error: err instanceof Error ? err.message : String(err), userId: state.user_id },
          'Executive bio: failed to persist report (non-fatal)',
        );
      }
    },

    validateAfterAgent: (agentName, state) => {
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
