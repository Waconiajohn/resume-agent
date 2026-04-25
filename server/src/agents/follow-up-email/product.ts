/**
 * Follow-Up Email Product — ProductConfig implementation.
 *
 * Single-agent pipeline. The Writer drafts a sequence-aware, tone-calibrated
 * email; the email_review gate hands it to the user; revision_feedback
 * triggers a rerun so the user can iterate ("shorter", "more assertive",
 * "reference the Q3 roadmap question").
 *
 * Multi-turn refinement is bounded by the coordinator's 3-rerun cap on any
 * single gate; the user can also direct-edit, which skips the rerun entirely.
 */

import type { ProductConfig } from '../runtime/product-config.js';
import { writerConfig } from './writer/agent.js';
import type {
  FollowUpEmailState,
  FollowUpEmailSSEEvent,
  FollowUpEmailDraft,
  FollowUpTone,
  FollowUpSituation,
} from './types.js';
import {
  defaultToneForFollowUpNumber,
  defaultSituationForFollowUpNumber,
} from './types.js';
import { supabaseAdmin } from '../../lib/supabase.js';
import logger from '../../lib/logger.js';

function serializeFollowUpDraft(draft: FollowUpEmailDraft): string {
  const subject = draft.subject ? `Subject: ${draft.subject}\n\n` : '';
  return `${subject}${draft.body ?? ''}`.trim();
}

const VALID_TONES: readonly FollowUpTone[] = ['warm', 'direct', 'value-add'];
const VALID_SITUATIONS: readonly FollowUpSituation[] = [
  'post_interview',
  'no_response',
  'rejection_graceful',
  'keep_warm',
  'negotiation_counter',
];

function normalizeFollowUpNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

function normalizeTone(value: unknown, fallback: FollowUpTone): FollowUpTone {
  if (typeof value !== 'string') return fallback;
  return (VALID_TONES as readonly string[]).includes(value) ? (value as FollowUpTone) : fallback;
}

function normalizeSituation(value: unknown, fallback: FollowUpSituation): FollowUpSituation {
  if (typeof value !== 'string') return fallback;
  return (VALID_SITUATIONS as readonly string[]).includes(value)
    ? (value as FollowUpSituation)
    : fallback;
}

export function createFollowUpEmailProductConfig(): ProductConfig<
  FollowUpEmailState,
  FollowUpEmailSSEEvent
> {
  return {
    domain: 'follow-up-email',

    agents: [
      {
        name: 'writer',
        config: writerConfig,
        stageMessage: {
          startStage: 'drafting',
          start: 'Drafting your follow-up email...',
          complete: 'Draft ready for your review',
        },
        onComplete: (scratchpad, state, emit) => {
          if (scratchpad.draft) {
            state.draft = scratchpad.draft as FollowUpEmailDraft;
          }
          // Clear any pending revision feedback from a prior gate turn —
          // the writer has just consumed it to produce the new draft.
          state.revision_feedback = undefined;

          if (state.draft) {
            emit({
              type: 'email_draft_ready',
              session_id: state.session_id,
              draft: state.draft,
            });
            emit({ type: 'pipeline_gate', gate: 'email_review' });
          }
        },
        gates: [
          {
            name: 'email_review',
            condition: (state) => state.draft !== undefined,
            onResponse: (response, state) => {
              if (response === true || response === 'approved') {
                state.revision_feedback = undefined;
                return;
              }
              if (response && typeof response === 'object') {
                const resp = response as Record<string, unknown>;

                if (typeof resp.edited_subject === 'string' && state.draft) {
                  state.draft = { ...state.draft, subject: resp.edited_subject };
                }
                if (typeof resp.edited_body === 'string' && state.draft) {
                  state.draft = { ...state.draft, body: resp.edited_body };
                }
                if (
                  typeof resp.edited_subject === 'string'
                  || typeof resp.edited_body === 'string'
                ) {
                  state.revision_feedback = undefined;
                  return;
                }

                if (typeof resp.feedback === 'string' && resp.feedback.trim().length > 0) {
                  state.revision_feedback = resp.feedback.trim();
                  return;
                }
              }
              state.revision_feedback = undefined;
            },
            requiresRerun: (state) => Boolean(state.revision_feedback),
          },
        ],
      },
    ],

    createInitialState: (sessionId, userId, input) => {
      const followUpNumber = normalizeFollowUpNumber(input.follow_up_number);
      const tone = normalizeTone(input.tone, defaultToneForFollowUpNumber(followUpNumber));
      const situation = normalizeSituation(
        input.situation,
        defaultSituationForFollowUpNumber(followUpNumber),
      );

      return {
        session_id: sessionId,
        user_id: userId,
        current_stage: 'drafting',
        job_application_id:
          typeof input.job_application_id === 'string' ? input.job_application_id : undefined,
        follow_up_number: followUpNumber,
        tone,
        situation,
        company_name: typeof input.company_name === 'string' ? input.company_name : undefined,
        role_title: typeof input.role_title === 'string' ? input.role_title : undefined,
        recipient_name:
          typeof input.recipient_name === 'string' ? input.recipient_name : undefined,
        recipient_title:
          typeof input.recipient_title === 'string' ? input.recipient_title : undefined,
        specific_context:
          typeof input.specific_context === 'string' ? input.specific_context : undefined,
        prior_interview_prep: input.prior_interview_prep as
          | FollowUpEmailState['prior_interview_prep']
          | undefined,
        activity_signals: (input.activity_signals as FollowUpEmailState['activity_signals']) ?? {
          thank_you_sent: false,
        },
      };
    },

    buildAgentMessage: (agentName, state) => {
      if (agentName !== 'writer') return '';

      const parts: string[] = [
        `Draft a follow-up email. Sequence #${state.follow_up_number} · tone: ${state.tone} · situation: ${state.situation}.`,
        '',
        `Company: ${state.company_name ?? 'Unknown'}`,
        `Role: ${state.role_title ?? 'Unknown'}`,
      ];

      if (state.recipient_name) {
        parts.push(
          `Recipient: ${state.recipient_name}${
            state.recipient_title ? `, ${state.recipient_title}` : ''
          }`,
        );
      }

      const activity = state.activity_signals;
      if (activity?.most_recent_interview_date) {
        const days = activity.days_since_interview ?? 0;
        parts.push(
          `Most recent interview: ${activity.most_recent_interview_date} (${days} day${
            days === 1 ? '' : 's'
          } ago).`,
        );
      }
      parts.push(
        activity?.thank_you_sent
          ? 'Thank-you note has already been sent for this application.'
          : 'No thank-you note on record for this application yet.',
      );

      if (state.prior_interview_prep?.report_excerpt?.trim()) {
        parts.push(
          '',
          '## Prior interview-prep report excerpt (reference real moments; never invent)',
          state.prior_interview_prep.report_excerpt.trim(),
        );
      }

      if (state.specific_context?.trim()) {
        parts.push('', '## Caller-provided context', state.specific_context.trim());
      }

      if (state.revision_feedback?.trim()) {
        parts.push(
          '',
          '## User revision feedback (apply this in the next draft)',
          state.revision_feedback.trim(),
        );
      }

      parts.push(
        '',
        'Call emit_transparency to narrate progress, then call draft_follow_up_email exactly once.',
      );

      return parts.join('\n');
    },

    finalizeResult: (state, _input, emit) => {
      if (state.draft) {
        emit({
          type: 'email_complete',
          session_id: state.session_id,
          draft: state.draft,
        });
      }
      return { draft: state.draft };
    },

    persistResult: async (state, _result) => {
      // Phase 3: persist the canonical "follow-up email for this pursuit" row.
      // UPSERT keyed by (user_id, job_application_id) — latest approved state
      // wins, single row per pursuit. The pursuit timeline reads this to fire
      // the "Follow-up sent" Done card.
      if (!state.job_application_id || !state.draft) return;
      try {
        const { error } = await supabaseAdmin
          .from('follow_up_email_reports')
          .upsert(
            {
              user_id: state.user_id,
              job_application_id: state.job_application_id,
              content: serializeFollowUpDraft(state.draft),
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,job_application_id' },
          );
        if (error) {
          logger.warn(
            { error: error.message, session_id: state.session_id },
            'Follow-up email: failed to upsert follow_up_email_reports (non-fatal)',
          );
        }
      } catch (err) {
        logger.warn(
          { error: err instanceof Error ? err.message : String(err), session_id: state.session_id },
          'Follow-up email: follow_up_email_reports upsert threw (non-fatal)',
        );
      }
    },

    validateAfterAgent: (agentName, state) => {
      if (agentName === 'writer' && !state.draft) {
        throw new Error('Writer did not produce a follow-up email draft');
      }
    },

    emitError: (stage, error, emit) => {
      emit({ type: 'pipeline_error', stage, error });
    },
  };
}
