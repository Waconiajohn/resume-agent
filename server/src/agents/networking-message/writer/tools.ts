/**
 * Networking Message Writer — Tool definitions.
 *
 * Two tools:
 * - assess_context: extract a short summary of the target application
 *   (company, role, JD excerpt) + the recipient archetype signal that
 *   the write_message tool will lean on.
 * - write_message: produce a single message draft, calibrated to
 *   recipient_type + messaging_method char cap.
 *
 * The writer decides when (and whether) to call assess_context. It
 * MUST call write_message exactly once per round.
 */

import type { AgentTool } from '../../runtime/agent-protocol.js';
import type {
  NetworkingMessageState,
  NetworkingMessageSSEEvent,
  NetworkingMessageDraft,
  MessagingMethod,
} from '../types.js';
import {
  MESSAGING_METHOD_CHAR_CAP,
  MESSAGING_METHOD_LABELS,
  RECIPIENT_TYPE_LABELS,
} from '../types.js';
import { llm, MODEL_PRIMARY, MODEL_MID } from '../../../lib/llm.js';
import { repairJSON } from '../../../lib/json-repair.js';
import { NETWORKING_MESSAGE_RULES } from '../knowledge/rules.js';

type WriterTool = AgentTool<NetworkingMessageState, NetworkingMessageSSEEvent>;

// ─── Recipient-type tone hints ────────────────────────────────────

const RECIPIENT_TONE_HINTS: Record<string, string> = {
  former_colleague:
    'Familiar, warm. Reference a real shared moment (project, team, person) only if the user-supplied context or rapport signals support it. Skip elevator pitch — they know you.',
  second_degree:
    'Lead with the shared connection or context (mutual contact, shared company/school/group, shared article). One clean sentence earning the introduction, then the ask.',
  cold:
    'Open with ONE specific, well-researched reason to reach out to THIS recipient. If context is thin, prioritize what the user supplied; never fabricate a shared moment.',
  referrer:
    'Acknowledge the potential ask openly and make it easy to say no. Frame as a two-way relationship. Do not demand a referral.',
  other:
    'Default peer/professional tone. Use whatever user-supplied rapport or context exists; otherwise keep it crisp and sincere.',
};

// ─── Tool: assess_context ─────────────────────────────────────────

const assessContextTool: WriterTool = {
  name: 'assess_context',
  description:
    'Summarize the target application context (company, role, JD excerpt) and the recipient archetype ' +
    'into a compact briefing the writer can reference. Optional — call this when the application context ' +
    'is rich enough to be worth distilling. Skip it for simple cases and go straight to write_message.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();
    const app = state.target_application;
    const hasJd = Boolean(app?.jd_excerpt?.trim());

    // If there's nothing substantive, return a lightweight stub.
    if (!app || (!app.company_name && !app.role_title && !hasJd)) {
      const stub = {
        company: 'Unknown',
        role: 'Unknown',
        opportunity_headline: 'Context not yet captured — rely on user goal + rapport notes.',
        recipient_angle: RECIPIENT_TONE_HINTS[state.recipient_type] ?? '',
      };
      ctx.scratchpad.context_assessment = stub;
      return stub;
    }

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 1024,
      system: `You are a senior networking coach distilling an application context into a compact briefing for a message writer.

${NETWORKING_MESSAGE_RULES}

Return ONLY valid JSON.`,
      messages: [{
        role: 'user',
        content: `Summarize this target application in 3 short fields.

Company: ${app.company_name}
Role: ${app.role_title}
${hasJd ? `Job description excerpt:\n${app.jd_excerpt}` : '(No JD provided.)'}

User goal for the outreach: ${state.goal}
Recipient archetype: ${RECIPIENT_TYPE_LABELS[state.recipient_type]} (${state.recipient_type})

Return JSON:
{
  "opportunity_headline": "one sentence naming what the role is about",
  "recipient_angle": "one sentence on how this recipient type should be approached given the goal",
  "do_not_include": "one sentence listing anything the draft should avoid given the context"
}`,
      }],
    });

    let parsed: Record<string, unknown> = {};
    const repaired = repairJSON<Record<string, unknown>>(response.text);
    if (repaired && typeof repaired === 'object') {
      parsed = repaired;
    } else {
      try {
        parsed = JSON.parse(response.text) as Record<string, unknown>;
      } catch {
        parsed = {};
      }
    }

    const result = {
      company: app.company_name,
      role: app.role_title,
      opportunity_headline:
        typeof parsed.opportunity_headline === 'string'
          ? parsed.opportunity_headline
          : `${app.role_title} at ${app.company_name}`,
      recipient_angle:
        typeof parsed.recipient_angle === 'string'
          ? parsed.recipient_angle
          : RECIPIENT_TONE_HINTS[state.recipient_type] ?? '',
      do_not_include:
        typeof parsed.do_not_include === 'string' ? parsed.do_not_include : '',
    };

    ctx.scratchpad.context_assessment = result;
    return result;
  },
};

// ─── Tool: write_message ──────────────────────────────────────────

const writeMessageTool: WriterTool = {
  name: 'write_message',
  description:
    'Produce a single networking-message draft tailored to the recipient_type and messaging_method. ' +
    'Respects the channel character cap (connection_request 300 / inmail 1900 / group_message 8000). ' +
    'When revision_feedback is present on state, incorporate it into this draft.',
  model_tier: 'primary',
  input_schema: {
    type: 'object',
    properties: {
      focus_notes: {
        type: 'string',
        description:
          'Optional free-form notes the writer can emphasize — a specific hook, a specific ask, an opener to try.',
      },
    },
    required: [],
  },
  async execute(input, ctx) {
    const state = ctx.getState();
    const focusNotes = typeof input.focus_notes === 'string' ? input.focus_notes : '';

    const method: MessagingMethod = state.messaging_method;
    const charCap = MESSAGING_METHOD_CHAR_CAP[method];
    const methodLabel = MESSAGING_METHOD_LABELS[method];
    const recipientLabel = RECIPIENT_TYPE_LABELS[state.recipient_type];
    const toneHint = RECIPIENT_TONE_HINTS[state.recipient_type] ?? '';
    const assessment = ctx.scratchpad.context_assessment as Record<string, unknown> | undefined;

    const parts: string[] = [];
    parts.push(`Write a single ${methodLabel} networking message.`);
    parts.push('');
    parts.push(`Recipient: ${state.recipient_name}${state.recipient_title ? ` (${state.recipient_title})` : ''}`);
    parts.push(`Archetype: ${recipientLabel} — ${toneHint}`);
    if (state.recipient_company) parts.push(`Recipient company: ${state.recipient_company}`);
    if (state.recipient_linkedin_url) parts.push(`LinkedIn: ${state.recipient_linkedin_url}`);

    parts.push('');
    parts.push(`Goal: ${state.goal}`);
    if (state.context?.trim()) {
      parts.push('', 'User-supplied context:', state.context.trim());
    }

    const app = state.target_application;
    if (app && (app.company_name || app.role_title)) {
      parts.push('', '## Target application');
      if (app.company_name) parts.push(`Company: ${app.company_name}`);
      if (app.role_title) parts.push(`Role: ${app.role_title}`);
      if (app.jd_excerpt?.trim()) parts.push('', 'JD excerpt:', app.jd_excerpt.trim());
    }

    if (assessment) {
      parts.push('', '## Context assessment (from assess_context)');
      if (assessment.opportunity_headline) parts.push(`Opportunity: ${String(assessment.opportunity_headline)}`);
      if (assessment.recipient_angle) parts.push(`Angle: ${String(assessment.recipient_angle)}`);
      if (assessment.do_not_include) parts.push(`Avoid: ${String(assessment.do_not_include)}`);
    }

    if (focusNotes) parts.push('', '## Focus for this pass', focusNotes);

    if (state.revision_feedback?.trim()) {
      parts.push(
        '',
        '## User revision feedback (MUST incorporate)',
        state.revision_feedback.trim(),
      );
    }

    parts.push(
      '',
      `Character cap: ${charCap}. Stay under it. If the message naturally wants to run longer, tighten language; do not truncate mid-thought.`,
      'Relationship integrity: do not imply a prior relationship, former colleague status, mutual friend, shared employer, shared school, or previous conversation unless the user-supplied context or selected recipient archetype explicitly supports it.',
      'If recipient metadata and context conflict, trust the concrete user-supplied context and keep the copy neutral rather than inventing familiarity.',
      'No emoji, no exclamation marks, no "I hope this finds you well". No resume attachment or inline bullet list.',
      'Return ONLY valid JSON.',
    );

    const response = await llm.chat({
      model: MODEL_PRIMARY,
      max_tokens: 2000,
      system: `You are a senior executive networking coach drafting a single focused message. The voice is peer-to-peer, confident, specific.

${NETWORKING_MESSAGE_RULES}

Return ONLY valid JSON.`,
      messages: [{
        role: 'user',
        content: `${parts.join('\n')}

Return JSON:
{
  "message": "the full message body — no signature block, no attachments",
  "rationale": "1-2 short sentences on the approach you took"
}`,
      }],
    });

    let parsed: { message?: string; rationale?: string } = {};
    const repaired = repairJSON<{ message?: string; rationale?: string }>(response.text);
    if (repaired && typeof repaired === 'object') {
      parsed = repaired;
    } else {
      try {
        parsed = JSON.parse(response.text) as typeof parsed;
      } catch {
        parsed = { message: response.text.trim() };
      }
    }

    let message = (parsed.message ?? '').trim();
    // Safety trim: if the model blew past the cap, clip cleanly at a sentence boundary.
    if (message.length > charCap) {
      const slice = message.slice(0, charCap);
      const lastBreak = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('\n\n'));
      message = (lastBreak > charCap * 0.6 ? slice.slice(0, lastBreak + 1) : slice).trim();
    }

    const draft: NetworkingMessageDraft = {
      recipient_name: state.recipient_name,
      recipient_type: state.recipient_type,
      recipient_title: state.recipient_title,
      recipient_company: state.recipient_company,
      recipient_linkedin_url: state.recipient_linkedin_url,
      messaging_method: method,
      goal: state.goal,
      context: state.context,
      message_markdown: message,
      char_count: message.length,
    };

    ctx.scratchpad.draft = draft;
    ctx.scratchpad.draft_rationale = parsed.rationale ?? '';

    return {
      draft_ready: true,
      char_count: draft.char_count,
      char_cap: charCap,
      over_cap: draft.char_count > charCap,
      preview: draft.message_markdown.slice(0, 200),
    };
  },
};

export const writerTools: WriterTool[] = [assessContextTool, writeMessageTool];
