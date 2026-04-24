/**
 * Follow-Up Email Writer — Tool definitions.
 *
 * Two tools:
 * - draft_follow_up_email: Produces a sequence-aware, tone-calibrated draft.
 *   Uses MODEL_PRIMARY and persists the result to ctx.scratchpad.draft for
 *   the product-level onComplete hook to transfer to state.
 * - emit_transparency: provided by shared-tools.
 *
 * The agent writes once per round. The review gate (defined in product.ts)
 * handles approve / revise / direct-edit. On revise, the coordinator reruns
 * the writer and draft_follow_up_email is called again with the user's
 * revision_feedback visible in the agent's system message.
 */

import type { AgentTool } from '../../runtime/agent-protocol.js';
import type {
  FollowUpEmailState,
  FollowUpEmailSSEEvent,
  FollowUpEmailDraft,
  FollowUpTone,
  FollowUpSituation,
} from '../types.js';
import { llm, MODEL_PRIMARY } from '../../../lib/llm.js';
import { repairJSON } from '../../../lib/json-repair.js';

type FollowUpTool = AgentTool<FollowUpEmailState, FollowUpEmailSSEEvent>;

// ─── Sequence + tone copy ─────────────────────────────────────────────

const TONE_GUIDANCE: Record<FollowUpTone, string> = {
  warm:
    'Warm: friendly, specific, optimistic. Reference a concrete moment from the interview if available. End with a light ask about timing.',
  direct:
    'Direct: plainspoken and brief. Open with the reference, state the ask in one sentence, close with an easy out.',
  'value-add':
    'Value-add: lead with something useful — an article, an insight, a referral, a follow-up to a commitment. Do not ask for status. Close gracefully, leave the door open.',
};

const SITUATION_DESCRIPTIONS: Record<FollowUpSituation, string> = {
  post_interview: 'Day 5–7 check-in after the interview — status unknown, reiterate fit lightly.',
  no_response: 'The team has gone silent 2+ weeks after a promised decision. Direct but calm.',
  rejection_graceful: 'Respond to a rejection. Preserve the relationship, do not argue the decision.',
  keep_warm: 'Stay top of mind for a role that stalled or a contact worth maintaining.',
  negotiation_counter: 'Acknowledge the offer warmly and frame a specific counter.',
};

function describeSequence(n: number): string {
  if (n <= 1) return 'First nudge (typically sent 5–7 business days after the interview).';
  if (n === 2) return 'Second nudge (typically sent 10–14 business days after the interview).';
  if (n === 3) return 'Third nudge — this is the graceful breakup / value-add email.';
  return `Nudge #${n} — treat as a graceful breakup / value-add email.`;
}

// ─── Tool: draft_follow_up_email ──────────────────────────────────────

export const draftFollowUpEmailTool: FollowUpTool = {
  name: 'draft_follow_up_email',
  description:
    'Produce a sequence-aware follow-up email draft for the current application. ' +
    'Respects the chosen tone variant, the follow-up number (1 = warm nudge, 2 = direct, 3+ = value-add), ' +
    'and any user revision feedback. Grounds references in prior interview context when available. ' +
    'Returns a structured draft the review gate will surface to the user.',
  model_tier: 'primary',
  input_schema: {
    type: 'object',
    properties: {
      focus_notes: {
        type: 'string',
        description:
          'Optional free-form notes you want to emphasize in this draft pass — e.g. a specific topic to reference, a specific ask to make, a specific interviewer to address.',
      },
    },
    required: [],
  },
  async execute(input, ctx) {
    const state = ctx.getState();
    const focusNotes = typeof input.focus_notes === 'string' ? input.focus_notes : '';

    const tone: FollowUpTone = state.tone;
    const situation: FollowUpSituation = state.situation;
    const company = state.company_name ?? 'the company';
    const role = state.role_title ?? 'the role';
    const recipientLine = state.recipient_name
      ? `Recipient: ${state.recipient_name}${state.recipient_title ? `, ${state.recipient_title}` : ''}`
      : 'Recipient: the primary interviewer or hiring manager';

    const priorReport = state.prior_interview_prep?.report_excerpt?.trim();
    const activity = state.activity_signals;
    const revisionFeedback = state.revision_feedback?.trim();

    const contextLines: string[] = [];
    contextLines.push(`Situation: ${situation} — ${SITUATION_DESCRIPTIONS[situation]}`);
    contextLines.push(`Sequence: ${describeSequence(state.follow_up_number)}`);
    contextLines.push(`Tone: ${tone} — ${TONE_GUIDANCE[tone]}`);
    contextLines.push(`Company: ${company}`);
    contextLines.push(`Role: ${role}`);
    contextLines.push(recipientLine);

    if (activity.most_recent_interview_date) {
      const days = activity.days_since_interview ?? 0;
      contextLines.push(
        `Last interview: ${activity.most_recent_interview_date} (${days} day${days === 1 ? '' : 's'} ago).`,
      );
    }
    contextLines.push(
      activity.thank_you_sent
        ? 'A thank-you note has already been sent for this application — do not repeat it; build on it.'
        : 'No thank-you note has been sent yet — you may incorporate a brief appreciation if it fits the tone.',
    );

    if (state.specific_context?.trim()) {
      contextLines.push('', 'Caller-provided context:', state.specific_context.trim());
    }

    if (priorReport) {
      contextLines.push(
        '',
        'Prior interview-prep report excerpt (use for real references only — never invent):',
        priorReport,
      );
    }

    if (focusNotes) {
      contextLines.push('', 'Focus for this draft pass:', focusNotes);
    }

    if (revisionFeedback) {
      contextLines.push(
        '',
        'User revision feedback (MUST incorporate in this draft):',
        revisionFeedback,
      );
    }

    const response = await llm.chat({
      model: MODEL_PRIMARY,
      max_tokens: 2000,
      system: `You are an executive communication strategist drafting follow-up emails for senior executives in job search. The voice is peer-to-peer, confident, and specific. Return ONLY valid JSON matching the shape below.`,
      messages: [
        {
          role: 'user',
          content: `Write the follow-up email.

${contextLines.join('\n')}

Requirements:
- Subject: short (<60 chars), specific, useful. Not "Following up" or "Checking in".
- Body: 80–180 words. Three short paragraphs. No signature block.
- Match the tone variant strictly.
- If prior interview context is present, reference one concrete moment from it.
- Never fabricate facts. Keep the body generic rather than invent specifics.
- No emoji, no exclamation marks, no "I hope this email finds you well".
- No "Per my last email" language even on nudge #2+.

Return JSON:
{
  "subject": "...",
  "body": "...",
  "tone_notes": "1 short sentence explaining the tone choice",
  "timing_guidance": "1 short sentence on when and how to send"
}`,
        },
      ],
    });

    let parsed: Partial<FollowUpEmailDraft> = {};
    try {
      parsed = JSON.parse(repairJSON(response.text) ?? response.text) as Partial<FollowUpEmailDraft>;
    } catch {
      parsed = { body: response.text.trim() };
    }

    const draft: FollowUpEmailDraft = {
      situation,
      tone,
      follow_up_number: state.follow_up_number,
      subject: (parsed.subject ?? `Re: ${role} at ${company}`).slice(0, 200),
      body: (parsed.body ?? '').trim(),
      tone_notes: (parsed.tone_notes ?? '').trim(),
      timing_guidance: (parsed.timing_guidance ?? '').trim(),
    };

    ctx.scratchpad.draft = draft;

    return {
      draft_ready: true,
      subject: draft.subject,
      body_preview: draft.body.slice(0, 200),
      tone,
      follow_up_number: state.follow_up_number,
    };
  },
};

export const writerTools: FollowUpTool[] = [draftFollowUpEmailTool];
