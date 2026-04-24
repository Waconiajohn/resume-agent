/**
 * Networking Message Product — ProductConfig implementation.
 *
 * Single-agent pipeline. Writer drafts one recipient-calibrated
 * message; the message_review gate handles approve / revise /
 * direct-edit. Persistence writes a row to networking_messages on
 * completion, plus a CRM touchpoint via the shared CRM service.
 */

import type { ProductConfig } from '../runtime/product-config.js';
import { writerConfig } from './writer/agent.js';
import type {
  NetworkingMessageState,
  NetworkingMessageSSEEvent,
  NetworkingMessageDraft,
  RecipientType,
  MessagingMethod,
  TargetApplicationContext,
} from './types.js';
import {
  RECIPIENT_TYPES,
  MESSAGING_METHOD_CHAR_CAP,
  RECIPIENT_TYPE_LABELS,
  DEFAULT_MESSAGING_METHOD,
} from './types.js';
import { supabaseAdmin } from '../../lib/supabase.js';
import logger from '../../lib/logger.js';
import { processNewTouchpoint } from '../../lib/networking-crm-service.js';
import { FF_NETWORKING_CRM } from '../../lib/feature-flags.js';

const VALID_MESSAGING_METHODS: readonly MessagingMethod[] = [
  'connection_request',
  'inmail',
  'group_message',
];

/**
 * Look up (or insert) a networking_contacts row for this recipient so
 * `processNewTouchpoint` has a contactId to attach to. Match priority:
 * (linkedin_url) → (name + company) → (name only). Returns the contact
 * id, or null when both lookup and insert fail.
 */
async function upsertContactForMessage(state: NetworkingMessageState): Promise<string | null> {
  if (!state.draft) return null;

  const name = state.draft.recipient_name.trim();
  if (!name) return null;
  const company = state.draft.recipient_company?.trim() || null;
  const linkedin = state.draft.recipient_linkedin_url?.trim() || null;

  // Priority 1: match by linkedin_url if provided.
  if (linkedin) {
    const { data } = await supabaseAdmin
      .from('networking_contacts')
      .select('id')
      .eq('user_id', state.user_id)
      .eq('linkedin_url', linkedin)
      .limit(1)
      .maybeSingle();
    if (data?.id) return data.id as string;
  }

  // Priority 2: match by name (+ company if provided).
  {
    let query = supabaseAdmin
      .from('networking_contacts')
      .select('id')
      .eq('user_id', state.user_id)
      .eq('name', name);
    if (company) query = query.eq('company', company);
    const { data } = await query.limit(1).maybeSingle();
    if (data?.id) return data.id as string;
  }

  // Not found — insert a fresh contact.
  const { data: inserted, error } = await supabaseAdmin
    .from('networking_contacts')
    .insert({
      user_id: state.user_id,
      name,
      title: state.draft.recipient_title ?? null,
      company,
      linkedin_url: linkedin,
      application_id: state.job_application_id || null,
    })
    .select('id')
    .single();

  if (error || !inserted) {
    logger.warn(
      { error: error?.message, userId: state.user_id, name },
      'Networking message: failed to upsert networking_contacts row',
    );
    return null;
  }
  return inserted.id as string;
}

function normalizeRecipientType(value: unknown): RecipientType {
  if (typeof value === 'string' && (RECIPIENT_TYPES as readonly string[]).includes(value)) {
    return value as RecipientType;
  }
  return 'other';
}

function normalizeMessagingMethod(value: unknown): MessagingMethod {
  if (typeof value === 'string' && (VALID_MESSAGING_METHODS as readonly string[]).includes(value)) {
    return value as MessagingMethod;
  }
  return DEFAULT_MESSAGING_METHOD;
}

export function createNetworkingMessageProductConfig(): ProductConfig<
  NetworkingMessageState,
  NetworkingMessageSSEEvent
> {
  return {
    domain: 'networking-message',

    agents: [
      {
        name: 'writer',
        config: writerConfig,
        stageMessage: {
          startStage: 'drafting',
          start: 'Drafting your networking message...',
          complete: 'Draft ready for your review',
        },
        onComplete: (scratchpad, state, emit) => {
          if (scratchpad.draft) {
            state.draft = scratchpad.draft as NetworkingMessageDraft;
          }
          // Writer consumed any pending feedback to produce this draft.
          state.revision_feedback = undefined;

          if (state.draft) {
            emit({
              type: 'message_draft_ready',
              session_id: state.session_id,
              draft: state.draft,
            });
            emit({ type: 'pipeline_gate', gate: 'message_review' });
          }
        },
        gates: [
          {
            name: 'message_review',
            condition: (state) => state.draft !== undefined,
            onResponse: (response, state) => {
              if (response === true || response === 'approved') {
                state.revision_feedback = undefined;
                return;
              }
              if (response && typeof response === 'object') {
                const resp = response as Record<string, unknown>;
                if (typeof resp.edited_content === 'string' && state.draft) {
                  const msg = resp.edited_content;
                  state.draft = { ...state.draft, message_markdown: msg, char_count: msg.length };
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
      const messagingMethod = normalizeMessagingMethod(input.messaging_method);
      const jobApplicationId =
        typeof input.job_application_id === 'string' ? input.job_application_id : '';
      return {
        session_id: sessionId,
        user_id: userId,
        current_stage: 'drafting',
        job_application_id: jobApplicationId,
        recipient_name: String(input.recipient_name ?? ''),
        recipient_type: normalizeRecipientType(input.recipient_type),
        recipient_title:
          typeof input.recipient_title === 'string' ? input.recipient_title : undefined,
        recipient_company:
          typeof input.recipient_company === 'string' ? input.recipient_company : undefined,
        recipient_linkedin_url:
          typeof input.recipient_linkedin_url === 'string' ? input.recipient_linkedin_url : undefined,
        messaging_method: messagingMethod,
        goal: String(input.goal ?? ''),
        context: typeof input.context === 'string' ? input.context : undefined,
        target_application: input.target_application as TargetApplicationContext | undefined,
        platform_context: input.platform_context as NetworkingMessageState['platform_context'],
        shared_context: input.shared_context as NetworkingMessageState['shared_context'],
      };
    },

    buildAgentMessage: (agentName, state) => {
      if (agentName !== 'writer') return '';

      const parts: string[] = [
        `Draft a ${state.messaging_method} networking message.`,
        '',
        `Recipient: ${state.recipient_name}${state.recipient_title ? ` (${state.recipient_title})` : ''}`,
        `Recipient archetype: ${RECIPIENT_TYPE_LABELS[state.recipient_type]} (${state.recipient_type})`,
      ];
      if (state.recipient_company) parts.push(`Recipient company: ${state.recipient_company}`);
      if (state.recipient_linkedin_url) parts.push(`LinkedIn: ${state.recipient_linkedin_url}`);

      parts.push('', `Goal: ${state.goal}`);
      if (state.context?.trim()) {
        parts.push('', 'User context:', state.context.trim());
      }

      const app = state.target_application;
      if (app) {
        parts.push('', '## Target application');
        if (app.company_name) parts.push(`Company: ${app.company_name}`);
        if (app.role_title) parts.push(`Role: ${app.role_title}`);
        if (app.stage) parts.push(`Application stage: ${app.stage}`);
        if (app.jd_excerpt?.trim()) {
          parts.push('', 'JD excerpt (use for real references only):', app.jd_excerpt.trim());
        }
      }

      parts.push(
        '',
        `Channel character cap: ${MESSAGING_METHOD_CHAR_CAP[state.messaging_method]}. Respect it.`,
      );

      if (state.revision_feedback?.trim()) {
        parts.push(
          '',
          '## User revision feedback (apply to the next draft)',
          state.revision_feedback.trim(),
        );
      }

      parts.push(
        '',
        'Call emit_transparency once, optionally call assess_context if the application context is rich, then call write_message exactly once.',
      );

      return parts.join('\n');
    },

    finalizeResult: (state, _input, emit) => {
      if (state.draft) {
        emit({
          type: 'message_complete',
          session_id: state.session_id,
          draft: state.draft,
        });
      }
      return { draft: state.draft };
    },

    persistResult: async (state) => {
      if (!state.draft) return;

      // 1) Persist the message row.
      try {
        await supabaseAdmin
          .from('networking_messages')
          .insert({
            user_id: state.user_id,
            session_id: state.session_id,
            job_application_id: state.job_application_id || null,
            recipient_name: state.draft.recipient_name,
            recipient_type: state.draft.recipient_type,
            recipient_title: state.draft.recipient_title ?? null,
            recipient_company: state.draft.recipient_company ?? null,
            recipient_linkedin_url: state.draft.recipient_linkedin_url ?? null,
            messaging_method: state.draft.messaging_method,
            goal: state.draft.goal ?? null,
            context: state.draft.context ?? null,
            message_markdown: state.draft.message_markdown,
          });
      } catch (err) {
        logger.warn(
          { error: err instanceof Error ? err.message : String(err), userId: state.user_id },
          'Networking message: failed to persist networking_messages row (non-fatal)',
        );
      }

      // 2) CRM touchpoint — best-effort, never fails the session.
      //
      // `processNewTouchpoint` requires a pre-existing contactId, so we
      // upsert a networking_contacts row first (match by user + name,
      // optionally narrowed by linkedin_url). Any failure in this path
      // is logged and swallowed — the message row is the primary write.
      if (!FF_NETWORKING_CRM) return;
      try {
        const contactId = await upsertContactForMessage(state);
        if (contactId) {
          const touchpointType =
            state.draft.messaging_method === 'inmail' ? 'inmail' : 'other';
          await processNewTouchpoint({
            userId: state.user_id,
            contactId,
            type: touchpointType,
            notes: state.draft.message_markdown.slice(0, 280),
          });
        }
      } catch (err) {
        logger.warn(
          { error: err instanceof Error ? err.message : String(err), userId: state.user_id },
          'Networking message: CRM touchpoint write failed (non-fatal)',
        );
      }
    },

    validateAfterAgent: (agentName, state) => {
      if (agentName === 'writer' && !state.draft) {
        throw new Error('Writer did not produce a networking-message draft');
      }
    },

    emitError: (stage, error, emit) => {
      emit({ type: 'pipeline_error', stage, error });
    },
  };
}
