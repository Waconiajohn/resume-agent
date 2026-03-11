/**
 * Thank You Note Agent Product — ProductConfig implementation.
 *
 * Agent #18: Single-agent pipeline (Writer) that analyzes interview context
 * and writes personalized thank-you notes for each interviewer, tailored
 * to format and delivery timing.
 * Autonomous — no user gates. Full note collection delivered at once.
 */

import type { ProductConfig } from '../runtime/product-config.js';
import { writerConfig } from './writer/agent.js';
import type {
  ThankYouNoteState,
  ThankYouNoteSSEEvent,
  InterviewerContext,
} from './types.js';
import { supabaseAdmin } from '../../lib/supabase.js';
import logger from '../../lib/logger.js';
import { getToneGuidanceFromInput, getDistressFromInput } from '../../lib/emotional-baseline.js';

export function createThankYouNoteProductConfig(): ProductConfig<ThankYouNoteState, ThankYouNoteSSEEvent> {
  return {
    domain: 'thank-you-note',

    agents: [
      {
        name: 'writer',
        config: writerConfig,
        stageMessage: {
          startStage: 'writing',
          start: 'Analyzing interview context and writing personalized thank-you notes...',
          complete: 'Thank-you notes ready for review',
        },
        onComplete: (scratchpad, state, emit) => {
          if (Array.isArray(scratchpad.notes) && scratchpad.notes.length > 0) {
            state.notes = scratchpad.notes as ThankYouNoteState['notes'];
          }
          if (scratchpad.final_report && typeof scratchpad.final_report === 'string') {
            state.final_report = scratchpad.final_report;
          }
          if (typeof scratchpad.quality_score === 'number') {
            state.quality_score = scratchpad.quality_score;
          }

          // Emit notes for review panel before the gate blocks
          if (state.notes.length > 0) {
            emit({
              type: 'note_review_ready',
              session_id: state.session_id,
              notes: state.notes,
              quality_score: state.quality_score ?? 0,
            });
            emit({ type: 'pipeline_gate', gate: 'note_review' });
          }
        },
        gates: [
          {
            name: 'note_review',
            condition: (state) => state.notes.length > 0,
            onResponse: (response, state) => {
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
      },
    ],

    createInitialState: (sessionId, userId, input) => ({
      session_id: sessionId,
      user_id: userId,
      current_stage: 'writing',
      interviewers: (input.interviewers as InterviewerContext[] | undefined) ?? ([] as InterviewerContext[]),
      interview_context: {
        company: String((input as Record<string, unknown>).company ?? ''),
        role: String((input as Record<string, unknown>).role ?? ''),
        interview_date: (input as Record<string, unknown>).interview_date
          ? String((input as Record<string, unknown>).interview_date)
          : undefined,
        interview_type: (input as Record<string, unknown>).interview_type
          ? String((input as Record<string, unknown>).interview_type)
          : undefined,
      },
      notes: [] as ThankYouNoteState['notes'],
      platform_context: input.platform_context as ThankYouNoteState['platform_context'],
      target_context: input.target_context as ThankYouNoteState['target_context'],
    }),

    buildAgentMessage: (agentName, state, input) => {
      if (agentName === 'writer') {
        const parts = [
          'Analyze the interview context and write personalized thank-you notes for each interviewer.',
          '',
          '## Resume',
          String((input as Record<string, unknown>).resume_text ?? ''),
          '',
          '## Interview Context',
          `Company: ${state.interview_context.company}`,
          `Role: ${state.interview_context.role}`,
        ];

        if (state.interview_context.interview_date) {
          parts.push(`Interview Date: ${state.interview_context.interview_date}`);
        }
        if (state.interview_context.interview_type) {
          parts.push(`Interview Type: ${state.interview_context.interview_type}`);
        }

        parts.push('', '## Interviewers');
        for (const interviewer of state.interviewers) {
          parts.push(`### ${interviewer.name} — ${interviewer.title}`);
          parts.push(`Topics Discussed: ${interviewer.topics_discussed.join(', ')}`);
          if (interviewer.rapport_notes) {
            parts.push(`Rapport Notes: ${interviewer.rapport_notes}`);
          }
          if (interviewer.key_questions?.length) {
            parts.push(`Key Questions: ${interviewer.key_questions.join('; ')}`);
          }
          parts.push('');
        }

        if (state.platform_context) {
          if (state.platform_context.why_me_story) {
            parts.push('## Why-Me Narrative', state.platform_context.why_me_story, '');
          }
          if (state.platform_context.positioning_strategy) {
            parts.push('## Positioning Strategy', JSON.stringify(state.platform_context.positioning_strategy, null, 2), '');
          }
        }

        parts.push(
          'Call tools in order: analyze_interview_context first, then write_thank_you_note + personalize_per_interviewer for each interviewer, then assemble_note_set.',
        );

        // If the user requested revisions at the review gate, incorporate feedback
        if (state.revision_feedback) {
          parts.push(
            '',
            '## User Revision Requested',
            `The user reviewed the thank-you notes and requested the following changes: "${state.revision_feedback}"`,
            'Call write_thank_you_note and assemble_note_set again incorporating this feedback.',
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
        note_count: state.notes.length,
      });

      return {
        report: state.final_report,
        quality_score: state.quality_score,
        notes: state.notes,
      };
    },

    persistResult: async (state, result) => {
      const data = result as {
        report: string;
        quality_score: number;
        notes: unknown;
      };

      try {
        await supabaseAdmin
          .from('thank_you_note_reports')
          .insert({
            user_id: state.user_id,
            report_markdown: data.report,
            quality_score: data.quality_score,
            notes: data.notes,
            interview_context: state.interview_context,
          });
      } catch (err) {
        logger.warn(
          { error: err instanceof Error ? err.message : String(err), userId: state.user_id },
          'Thank-you note: failed to persist report (non-fatal)',
        );
      }
    },

    validateAfterAgent: (agentName, state) => {
      if (agentName === 'writer') {
        if (!state.final_report) {
          throw new Error('Writer did not produce a final report');
        }
        if (state.notes.length === 0) {
          throw new Error('Writer did not produce any notes');
        }
      }
    },

    emitError: (stage, error, emit) => {
      emit({ type: 'pipeline_error', stage, error });
    },
  };
}
