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
import { getToneGuidanceFromInput, getDistressFromInput } from '../../lib/emotional-baseline.js';

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
          complete: 'Bio collection ready for review',
        },
        gates: [
          {
            name: 'bio_review',
            condition: (state) => state.bios.length > 0,
            onResponse: (response, state) => {
              // Response: true (approved), or { feedback: string } (revision requested),
              // or { edited_content: string } (direct edit to the final report)
              if (response === true || response === 'approved') {
                state.revision_feedback = undefined;
              } else if (response && typeof response === 'object') {
                const resp = response as Record<string, unknown>;
                if (typeof resp.edited_content === 'string') {
                  state.final_report = resp.edited_content;
                  state.revision_feedback = undefined;
                } else if (typeof resp.feedback === 'string') {
                  state.revision_feedback = resp.feedback;
                }
              }
            },
            requiresRerun: (state) => !!state.revision_feedback,
          },
        ],
        onComplete: (scratchpad, state, emit) => {
          if (scratchpad.positioning_analysis && !state.positioning_analysis) {
            state.positioning_analysis = scratchpad.positioning_analysis as ExecutiveBioState['positioning_analysis'];
          }
          if (Array.isArray(scratchpad.bios) && scratchpad.bios.length > 0) {
            state.bios = scratchpad.bios as ExecutiveBioState['bios'];
          }
          if (scratchpad.final_report && typeof scratchpad.final_report === 'string') {
            state.final_report = scratchpad.final_report;
          }
          if (typeof scratchpad.quality_score === 'number') {
            state.quality_score = scratchpad.quality_score;
          }
          if (scratchpad.resume_data && !state.resume_data) {
            state.resume_data = scratchpad.resume_data as ExecutiveBioState['resume_data'];
          }

          // Emit bios for review panel before the gate blocks
          if (state.bios.length > 0) {
            emit({
              type: 'bio_review_ready',
              session_id: state.session_id,
              bios: state.bios,
              final_report: state.final_report,
              quality_score: state.quality_score,
            });
            emit({ type: 'pipeline_gate', gate: 'bio_review' });
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

        // If the user requested revisions at the review gate, include feedback
        if (state.revision_feedback) {
          parts.push(
            '',
            '## User Revision Requested',
            `The user reviewed the bio collection and requested the following changes: "${state.revision_feedback}"`,
            'Call write_bio again for the affected bios incorporating this feedback, then quality_check_bio, then assemble_bio_collection with all updated bios.',
          );
        }

        // Distress resources — first (and only) agent
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

      return '';
    },

    finalizeResult: (state, _input, emit) => {
      emit({
        type: 'collection_complete',
        session_id: state.session_id,
        report: state.final_report ?? '',
        quality_score: state.quality_score ?? 0,
        bio_count: state.bios.length,
        bios: state.bios,
        positioning_analysis: state.positioning_analysis,
      });

      return {
        report: state.final_report,
        quality_score: state.quality_score,
        bios: state.bios,
        positioning_analysis: state.positioning_analysis,
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
        if (state.bios.length === 0) {
          throw new Error('Writer did not produce any bios');
        }
      }
    },

    emitError: (stage, error, emit) => {
      emit({ type: 'pipeline_error', stage, error });
    },
  };
}
