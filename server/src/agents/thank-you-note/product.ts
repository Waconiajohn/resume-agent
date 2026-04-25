/**
 * Thank You Note Agent Product — ProductConfig implementation.
 *
 * Phase 2.3e: single-agent pipeline (Writer) with a single `note_review`
 * gate that supports approve / collection-level revise / collection-level
 * direct-edit AND per-recipient revise / per-recipient direct-edit.
 *
 * Multi-recipient: one session with N notes in state. Per-recipient
 * refinement is driven by `state.revision_feedback_by_recipient`, which
 * the writer consumes on rerun and only rewrites the affected notes.
 */

import type { ProductConfig } from '../runtime/product-config.js';
import { writerConfig } from './writer/agent.js';
import type {
  ThankYouNoteState,
  ThankYouNoteSSEEvent,
  RecipientContext,
  RecipientRole,
  ThankYouNote,
  PriorInterviewPrepContext,
  ActivitySignals,
} from './types.js';
import { RECIPIENT_ROLES, RECIPIENT_ROLE_LABELS } from './types.js';
import {
  renderCareerNarrativeSection,
  renderCareerProfileSection,
  renderPositioningStrategySection,
  renderWhyMeStorySection,
} from '../../contracts/shared-context-prompt.js';
import { supabaseAdmin } from '../../lib/supabase.js';
import logger from '../../lib/logger.js';
import { getToneGuidanceFromInput, getDistressFromInput } from '../../lib/emotional-baseline.js';
import { hasMeaningfulSharedValue } from '../../contracts/shared-context.js';

function normalizeRecipientRole(value: unknown): RecipientRole {
  if (typeof value === 'string' && (RECIPIENT_ROLES as readonly string[]).includes(value)) {
    return value as RecipientRole;
  }
  return 'other';
}

function normalizeRecipients(input: unknown): RecipientContext[] {
  if (!Array.isArray(input)) return [];
  const out: RecipientContext[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const name = typeof r.name === 'string' ? r.name : '';
    if (!name.trim()) continue;
    out.push({
      role: normalizeRecipientRole(r.role),
      name,
      title: typeof r.title === 'string' ? r.title : undefined,
      topics_discussed: Array.isArray(r.topics_discussed)
        ? (r.topics_discussed as unknown[]).map((t) => String(t))
        : undefined,
      rapport_notes: typeof r.rapport_notes === 'string' ? r.rapport_notes : undefined,
      key_questions: Array.isArray(r.key_questions)
        ? (r.key_questions as unknown[]).map((t) => String(t))
        : undefined,
    });
  }
  return out;
}

function parsePerRecipientFeedback(
  resp: Record<string, unknown>,
): { recipient_index: number; feedback?: string; edited_subject?: string; edited_body?: string } | null {
  const idxRaw = resp.recipient_index;
  const idx = typeof idxRaw === 'number' ? idxRaw : Number(idxRaw);
  if (!Number.isFinite(idx) || idx < 0) return null;
  const result: {
    recipient_index: number;
    feedback?: string;
    edited_subject?: string;
    edited_body?: string;
  } = { recipient_index: Math.floor(idx) };
  if (typeof resp.feedback === 'string' && resp.feedback.trim().length > 0) {
    result.feedback = resp.feedback.trim();
  }
  if (typeof resp.edited_subject === 'string') {
    result.edited_subject = resp.edited_subject;
  }
  if (typeof resp.edited_body === 'string') {
    result.edited_body = resp.edited_body;
  }
  return result;
}

export function createThankYouNoteProductConfig(): ProductConfig<ThankYouNoteState, ThankYouNoteSSEEvent> {
  return {
    domain: 'thank-you-note',

    agents: [
      {
        name: 'writer',
        config: writerConfig,
        stageMessage: {
          startStage: 'writing',
          start: 'Analyzing interview context and drafting recipient-calibrated thank-you notes...',
          complete: 'Thank-you notes ready for review',
        },
        onComplete: (scratchpad, state, emit) => {
          if (Array.isArray(scratchpad.notes) && scratchpad.notes.length > 0) {
            state.notes = scratchpad.notes as ThankYouNote[];
          }
          if (scratchpad.final_report && typeof scratchpad.final_report === 'string') {
            state.final_report = scratchpad.final_report;
          }
          if (typeof scratchpad.quality_score === 'number') {
            state.quality_score = scratchpad.quality_score;
          }

          // Clear any residual feedback — the writer has just consumed it.
          state.revision_feedback = undefined;
          state.revision_feedback_by_recipient = undefined;

          // Emit the review gate once notes exist.
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
              // Approve — clear everything.
              if (response === true || response === 'approved') {
                state.revision_feedback = undefined;
                state.revision_feedback_by_recipient = undefined;
                return;
              }

              if (response && typeof response === 'object') {
                const resp = response as Record<string, unknown>;

                // Whole-report direct-edit (back-compat with 2.3-era shape).
                if (typeof resp.edited_content === 'string') {
                  state.final_report = resp.edited_content;
                  state.revision_feedback = undefined;
                  state.revision_feedback_by_recipient = undefined;
                  return;
                }

                // Per-recipient variants.
                const perRecipient = parsePerRecipientFeedback(resp);
                if (perRecipient) {
                  const noteIdx = perRecipient.recipient_index;
                  if (noteIdx < 0 || noteIdx >= state.notes.length) {
                    // Out-of-range index — clear feedback, no rerun.
                    state.revision_feedback = undefined;
                    return;
                  }

                  // Per-recipient direct-edit: mutate that note in-place and skip rerun.
                  if (perRecipient.edited_subject !== undefined || perRecipient.edited_body !== undefined) {
                    const current = state.notes[noteIdx];
                    state.notes[noteIdx] = {
                      ...current,
                      ...(perRecipient.edited_subject !== undefined
                        ? { subject_line: perRecipient.edited_subject }
                        : {}),
                      ...(perRecipient.edited_body !== undefined
                        ? { content: perRecipient.edited_body }
                        : {}),
                    };
                    // Don't clear other pending feedback — user may have mixed actions.
                    return;
                  }

                  // Per-recipient revise: queue feedback keyed by index.
                  if (perRecipient.feedback) {
                    const existing = state.revision_feedback_by_recipient ?? {};
                    existing[noteIdx] = perRecipient.feedback;
                    state.revision_feedback_by_recipient = existing;
                    return;
                  }

                  // Index supplied but no useful payload — no-op.
                  return;
                }

                // Collection-level revise.
                if (typeof resp.feedback === 'string' && resp.feedback.trim().length > 0) {
                  state.revision_feedback = resp.feedback.trim();
                  return;
                }

                // Unknown shape — clear to prevent phantom reruns.
                state.revision_feedback = undefined;
                state.revision_feedback_by_recipient = undefined;
                return;
              }

              // Falsy / unknown scalar — clear.
              state.revision_feedback = undefined;
              state.revision_feedback_by_recipient = undefined;
            },
            requiresRerun: (state) =>
              !!state.revision_feedback
              || (state.revision_feedback_by_recipient !== undefined
                && Object.keys(state.revision_feedback_by_recipient).length > 0),
          },
        ],
      },
    ],

    createInitialState: (sessionId, userId, input) => ({
      session_id: sessionId,
      user_id: userId,
      current_stage: 'writing',
      job_application_id: typeof input.job_application_id === 'string' ? input.job_application_id : undefined,
      recipients: normalizeRecipients(input.recipients),
      interview_context: {
        company: String(input.company ?? ''),
        role: String(input.role ?? ''),
        interview_date: typeof input.interview_date === 'string' ? input.interview_date : undefined,
        interview_type: typeof input.interview_type === 'string' ? input.interview_type : undefined,
      },
      notes: [] as ThankYouNote[],
      prior_interview_prep: input.prior_interview_prep as PriorInterviewPrepContext | undefined,
      activity_signals: (input.activity_signals as ActivitySignals | undefined) ?? {},
      platform_context: input.platform_context as ThankYouNoteState['platform_context'],
      shared_context: input.shared_context as ThankYouNoteState['shared_context'],
      target_context: input.target_context as ThankYouNoteState['target_context'],
    }),

    buildAgentMessage: (agentName, state, input) => {
      if (agentName !== 'writer') return '';

      const sharedContext = state.shared_context;
      const parts: string[] = [
        'Analyze the interview context and draft role-calibrated thank-you notes for each recipient.',
        '',
        '## Resume',
        String(input.resume_text ?? ''),
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

      // Timing signals — agent decides whether to emit a warning via the tool.
      const days = state.activity_signals?.days_since_interview;
      if (typeof days === 'number') {
        parts.push(`Days Since Most Recent Interview: ${days}${days > 2 ? ' (warning window)' : ''}`);
      }

      parts.push('', '## Recipients');
      state.recipients.forEach((r, idx) => {
        const roleLabel = RECIPIENT_ROLE_LABELS[r.role];
        parts.push(`### [${idx}] ${r.name}${r.title ? ` — ${r.title}` : ''} · Role: ${roleLabel} (${r.role})`);
        if (r.topics_discussed?.length) {
          parts.push(`Topics Discussed: ${r.topics_discussed.join(', ')}`);
        }
        if (r.rapport_notes) {
          parts.push(`Rapport Notes: ${r.rapport_notes}`);
        }
        if (r.key_questions?.length) {
          parts.push(`Key Questions: ${r.key_questions.join('; ')}`);
        }
        parts.push('');
      });

      // Prior interview-prep excerpt — soft coupling.
      if (state.prior_interview_prep?.report_excerpt?.trim()) {
        parts.push(
          '## Prior interview-prep report excerpt (reference real moments only; never invent)',
          state.prior_interview_prep.report_excerpt.trim(),
          '',
        );
      }

      // Platform / shared context.
      if (state.platform_context || sharedContext) {
        if (state.platform_context?.career_profile || hasMeaningfulSharedValue(sharedContext?.candidateProfile)) {
          parts.push(...renderCareerProfileSection({
            heading: '## Career Profile',
            sharedContext,
            legacyCareerProfile: state.platform_context?.career_profile,
          }));
        }
        if (hasMeaningfulSharedValue(sharedContext?.careerNarrative)) {
          parts.push(...renderCareerNarrativeSection({
            heading: '## Career Narrative Signals',
            sharedNarrative: sharedContext?.careerNarrative,
          }));
        } else if (state.platform_context?.why_me_story) {
          parts.push(...renderWhyMeStorySection({
            heading: '## Career Narrative Signals',
            legacyWhyMeStory: state.platform_context?.why_me_story,
          }));
        }
        if (state.platform_context?.positioning_strategy || hasMeaningfulSharedValue(sharedContext?.positioningStrategy)) {
          parts.push(...renderPositioningStrategySection({
            heading: '## Positioning Strategy',
            sharedStrategy: sharedContext?.positioningStrategy,
            legacyStrategy: state.platform_context?.positioning_strategy,
          }));
        }
      }

      parts.push(
        '',
        'Use your tools. RULE 7 (role-tone) is the primary axis — a note to a hiring_manager must sound audibly different from a note to a panel_interviewer, even about the same interview.',
      );

      // Per-recipient feedback — surfaces the exact recipients the user wants re-written.
      if (state.revision_feedback_by_recipient && Object.keys(state.revision_feedback_by_recipient).length > 0) {
        parts.push(
          '',
          '## Per-Recipient Revisions Requested',
          'The user reviewed the notes and asked for changes on the following recipients only. DO NOT rewrite any other notes.',
        );
        for (const [idxStr, feedback] of Object.entries(state.revision_feedback_by_recipient)) {
          const idx = Number(idxStr);
          const recipient = state.recipients[idx];
          if (recipient) {
            parts.push(
              `- [${idx}] ${recipient.name} (${RECIPIENT_ROLE_LABELS[recipient.role]}): "${feedback}"`,
            );
          }
        }
        parts.push(
          'Call write_thank_you_note ONLY for the recipients listed above (use the same format that was already drafted unless the feedback asks to change it). Then call personalize_per_recipient on those. Then call assemble_note_set to reassemble the full set with the other recipients preserved.',
        );
      } else if (state.revision_feedback) {
        parts.push(
          '',
          '## Collection-Level Revision Requested',
          `The user reviewed the thank-you notes and requested: "${state.revision_feedback}"`,
          'Update ALL notes, keep the personalization truthful, and reassemble with the revised versions.',
        );
      }

      // Distress resources.
      const distress = getDistressFromInput(input);
      if (distress) {
        parts.push('', '## Support Resources', distress.message);
        for (const r of distress.resources) {
          parts.push(`- **${r.name}**: ${r.description} (${r.contact})`);
        }
      }

      // Emotional baseline tone adaptation.
      const toneGuidance = getToneGuidanceFromInput(input);
      if (toneGuidance) {
        parts.push(toneGuidance);
      }

      return parts.join('\n');
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

      // Phase 3: latest approved state wins, single row per pursuit. When the
      // application id is set, prefer update-existing over insert so multi-
      // approval cycles don't litter the table; without an application id we
      // fall back to insert (the row is orphaned and only reachable from the
      // session it came from).
      try {
        if (state.job_application_id) {
          const { data: existing, error: lookupError } = await supabaseAdmin
            .from('thank_you_note_reports')
            .select('id')
            .eq('user_id', state.user_id)
            .eq('job_application_id', state.job_application_id)
            .maybeSingle();

          if (lookupError) {
            logger.warn(
              { error: lookupError.message, userId: state.user_id },
              'Thank-you note: lookup before persist failed (falling through to insert)',
            );
          }

          if (existing?.id) {
            const { error: updateError } = await supabaseAdmin
              .from('thank_you_note_reports')
              .update({
                session_id: state.session_id,
                report_markdown: data.report,
                quality_score: data.quality_score,
                notes: data.notes,
                interview_context: state.interview_context,
              })
              .eq('id', existing.id);
            if (updateError) {
              logger.warn(
                { error: updateError.message, userId: state.user_id },
                'Thank-you note: update failed (non-fatal)',
              );
            }
            return;
          }
        }

        await supabaseAdmin
          .from('thank_you_note_reports')
          .insert({
            user_id: state.user_id,
            session_id: state.session_id,
            job_application_id: state.job_application_id ?? null,
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
