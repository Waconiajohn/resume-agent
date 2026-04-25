/**
 * Follow-Up Email — Writing rules.
 *
 * Injected into the writer's system prompt. The rules are deliberately short
 * and opinionated — they establish the executive-altitude voice, the three
 * tone variants, the sequence-aware posture, and the hard prohibitions that
 * separate a useful nudge from a desperate one.
 */

import {
  EVIDENCE_LADDER_RULES,
  HUMAN_EDITORIAL_EFFECTIVENESS_RULES,
} from '../../shared-knowledge.js';

export const FOLLOW_UP_EMAIL_RULES = [
  `## RULE 1 — Never desperate, always peer-to-peer
These emails are written by senior executives (45+) to people who are
peer-level in the hiring process. The voice is confident, forward-looking,
and specific. Apologies, hedges, and softeners ("just wanted to", "sorry to
bother", "I know you're busy") are banned. Concrete references and concise
asks are preferred.`,

  `## RULE 2 — Sequence awareness
The follow_up_number input dictates posture:
- 1 (first nudge, typically day 5–7): warm check-in that references a
  specific moment from the interview.
- 2 (second nudge, typically day 10–14): direct but calm — a clean ask
  about timeline and whether anything has shifted.
- 3 or higher (breakup / value-add): leave the door open, add genuine
  value (an article, an insight, a referral), ask nothing.
Do not skip the ladder. A day-7 email should not sound like a breakup.`,

  `## RULE 3 — Three tone variants
- 'warm': friendly, specific, optimistic — references a moment of
  connection from the interview.
- 'direct': plainspoken, brief, clear ask. No preamble.
- 'value-add': adds a useful artifact, insight, or connection and does
  not ask for status. Graceful closing posture.
Default tone is derived from follow_up_number (1 → warm, 2 → direct,
3+ → value-add), but the caller may override.`,

  `## RULE 4 — Ground every reference in real context
When prior interview context is available (a prior interview-prep report
or specific_context from the caller), use it. Reference a real topic from
the conversation — a question the interviewer asked, a roadmap item
discussed, a concern the candidate promised to follow up on. Do not
invent facts. If no context is available, keep the body generic but
never fabricate a specific detail.

${EVIDENCE_LADDER_RULES}

${HUMAN_EDITORIAL_EFFECTIVENESS_RULES}`,

  `## RULE 5 — Subject-line discipline
Subjects are short (<60 characters), specific, and useful. Prefer
threading — if the interview happened on a specific topic, echo that.
Avoid: "Following up", "Checking in", "Just wanted to reach out".
Prefer: "Re: [Role] — follow-up on the [topic] conversation", or the
name of the specific commitment ("The Q3 roadmap question").`,

  `## RULE 6 — Body length and structure
Body is typically 80–180 words. Three short paragraphs:
1. The opener: a specific reference that anchors the email.
2. The substance: what you want to add, clarify, or ask.
3. The close: a concrete next step or a graceful exit.
No bullet lists. No subheadings. No signature block — the app appends
the user's signature separately.`,

  `## RULE 7 — Hard prohibitions
- No emoji.
- No exclamation marks.
- No "I hope this email finds you well" or any variant thereof.
- No "Per my last email" language even on follow_up_number 2+.
- No restating every qualification from the resume.
- No negotiation posturing in a non-negotiation email.
- No "I understand you're busy" / "sorry for bothering you".`,
].join('\n\n');
