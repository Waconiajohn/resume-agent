/**
 * Cover Letter Product — ProductConfig implementation.
 *
 * Minimal POC that runs 2 agents (Analyst → Writer) to generate
 * a cover letter from resume + JD inputs. Validates the platform
 * abstraction works for a second product beyond resumes.
 */

import type { ProductConfig } from '../runtime/product-config.js';
import { analystConfig } from './analyst/agent.js';
import { writerConfig } from './writer/agent.js';
import type { CoverLetterState, CoverLetterSSEEvent } from './types.js';
import { getToneGuidanceFromInput, getDistressFromInput } from '../../lib/emotional-baseline.js';
import { supabaseAdmin } from '../../lib/supabase.js';
import logger from '../../lib/logger.js';

export function createCoverLetterProductConfig(): ProductConfig<CoverLetterState, CoverLetterSSEEvent> {
  return {
    domain: 'cover-letter',

    agents: [
      {
        name: 'analyst',
        config: analystConfig,
        stageMessage: {
          startStage: 'analysis',
          start: 'Analyzing resume and job description...',
          complete: 'Analysis complete — letter plan ready',
        },
        onComplete: (scratchpad, state) => {
          // Transfer analyst findings to state if not already set by tools
          if (scratchpad.resume_data && !state.resume_data) {
            state.resume_data = scratchpad.resume_data as CoverLetterState['resume_data'];
          }
          if (scratchpad.jd_analysis && !state.jd_analysis) {
            state.jd_analysis = scratchpad.jd_analysis as CoverLetterState['jd_analysis'];
          }
          if (scratchpad.letter_plan && !state.letter_plan) {
            state.letter_plan = scratchpad.letter_plan as CoverLetterState['letter_plan'];
          }
        },
      },
      {
        name: 'writer',
        config: writerConfig,
        stageMessage: {
          startStage: 'writing',
          start: 'Writing your cover letter...',
          complete: 'Cover letter ready for review',
        },
        gates: [
          {
            name: 'letter_review',
            condition: (state) => typeof state.letter_draft === 'string' && state.letter_draft.length > 0,
            onResponse: (response, state) => {
              // Response: true (approved), or { feedback: string } (revision requested),
              // or { edited_content: string } (direct edit)
              if (response === true || response === 'approved') {
                state.revision_feedback = undefined;
              } else if (response && typeof response === 'object') {
                const resp = response as Record<string, unknown>;
                if (typeof resp.edited_content === 'string') {
                  state.letter_draft = resp.edited_content;
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
          if (scratchpad.letter_draft && typeof scratchpad.letter_draft === 'string') {
            state.letter_draft = scratchpad.letter_draft;
          }
          if (typeof scratchpad.quality_score === 'number') {
            state.quality_score = scratchpad.quality_score;
          }
          if (typeof scratchpad.review_feedback === 'string') {
            state.review_feedback = scratchpad.review_feedback;
          }

          // Emit letter for review panel before the gate blocks
          if (state.letter_draft) {
            emit({
              type: 'letter_review_ready',
              session_id: state.session_id,
              letter_draft: state.letter_draft,
              quality_score: state.quality_score,
            });
            emit({ type: 'pipeline_gate', gate: 'letter_review' });
          }
        },
      },
    ],

    createInitialState: (sessionId, userId, input) => ({
      session_id: sessionId,
      user_id: userId,
      current_stage: 'analysis',
      platform_context: input.platform_context as CoverLetterState['platform_context'],
      // Input data will be parsed by the analyst agent's tools
      resume_data: undefined,
      jd_analysis: undefined,
    }),

    buildAgentMessage: (agentName, state, input) => {
      if (agentName === 'analyst') {
        const parts = [
          'Analyze the following resume and job description to create a cover letter plan.',
          '',
          '## Resume',
          String(input.resume_text ?? ''),
          '',
          '## Job Description',
          String(input.job_description ?? ''),
          '',
          `Company: ${String(input.company_name ?? 'Unknown')}`,
        ];

        if (state.platform_context?.positioning_strategy) {
          parts.push(
            '',
            '## Prior Positioning Strategy (from Resume Strategist)',
            'The user has previously completed a resume positioning session. Use this strategy to inform your analysis:',
            JSON.stringify(state.platform_context.positioning_strategy, null, 2),
          );
        }

        if (
          state.platform_context?.evidence_items &&
          state.platform_context.evidence_items.length > 0
        ) {
          parts.push(
            '',
            '## Prior Evidence Items',
            'The following evidence items were captured during the resume process. Leverage relevant items:',
            JSON.stringify(state.platform_context.evidence_items, null, 2),
          );
        }

        parts.push('', 'Call parse_inputs first, then match_requirements, then plan_letter.');

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
        const plan = state.letter_plan;
        const parts = [
          'Write a professional cover letter based on the analysis plan.',
          '',
          plan ? `## Letter Plan\n${JSON.stringify(plan, null, 2)}` : '',
          '',
          'Call write_letter to generate the letter, then review_letter to check quality.',
        ];

        // If the user requested revisions at the review gate, include feedback
        if (state.revision_feedback) {
          parts.push(
            '',
            '## User Revision Requested',
            `The user reviewed the cover letter and requested the following changes: "${state.revision_feedback}"`,
            'Call write_letter again incorporating this feedback, then review_letter to check quality.',
          );
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
        type: 'letter_complete',
        session_id: state.session_id,
        letter: state.letter_draft ?? '',
        quality_score: state.quality_score ?? 0,
      });

      return {
        letter: state.letter_draft,
        quality_score: state.quality_score,
        review_feedback: state.review_feedback,
      };
    },

    persistResult: async (state, result) => {
      const data = result as {
        letter: string | undefined;
        quality_score: number | undefined;
        review_feedback: string | undefined;
      };

      try {
        const { error } = await supabaseAdmin
          .from('session_workflow_artifacts')
          .insert({
            session_id: state.session_id,
            node_key: 'complete',
            artifact_type: 'cover_letter_result',
            version: 1,
            payload: {
              letter_draft: data.letter ?? '',
              quality_score: data.quality_score ?? 0,
              review_feedback: data.review_feedback ?? '',
              jd_analysis: state.jd_analysis,
              letter_plan: state.letter_plan,
            },
            created_by: 'cover-letter',
          });

        if (error) {
          logger.warn(
            { error: error.message, session_id: state.session_id },
            'Cover letter: failed to persist result to workflow artifacts (non-fatal)',
          );
        }
      } catch (err) {
        logger.warn(
          { error: err instanceof Error ? err.message : String(err), session_id: state.session_id },
          'Cover letter: failed to persist result (non-fatal)',
        );
      }
    },

    validateAfterAgent: (agentName, state) => {
      if (agentName === 'analyst' && !state.letter_plan) {
        throw new Error('Analyst did not produce a letter plan');
      }
    },

    emitError: (stage, error, emit) => {
      emit({ type: 'pipeline_error', stage, error });
    },
  };
}
