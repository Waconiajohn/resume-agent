/**
 * Networking Message — Writing rules.
 *
 * Deliberately short. Thin version: no 5-message sequences, no
 * channel matrix, no referral-bonus flows. Rules establish the
 * voice, the recipient-type hint, and the hard prohibitions.
 */

import {
  EVIDENCE_LADDER_RULES,
  HUMAN_EDITORIAL_EFFECTIVENESS_RULES,
} from '../../shared-knowledge.js';

export const NETWORKING_MESSAGE_RULES = [
  `## RULE 1 — Peer, not supplicant
These messages are written by mid-to-senior executives reaching out
to peers. Voice is warm and specific, never pleading. No "I would be
so grateful", no "I know you're busy", no "sorry to bother". Lead
with the reason the recipient will keep reading — not with apology.`,

  `## RULE 2 — Recipient-type is a tone hint, not a script
- 'former_colleague': familiar opener tied to a real shared moment.
  Skip the elevator pitch — they already know you.
- 'second_degree': lead with the shared connection or shared context
  (company, school, group, article). Earn the introduction in the
  first sentence.
- 'cold': open with a specific, well-researched reason to reach out
  to THIS person. Never generic. If you can't name something
  specific about them, don't send a cold message.
- 'referrer': acknowledge the potential ask explicitly and make it
  easy to say no. Frame the referral as a two-way relationship, not
  a transaction.
- 'other': default to peer/professional tone; use whatever context
  the user supplied.
The hint adjusts the opener and the ask — it does NOT force a rigid
template.`,

  `## RULE 3 — Respect the channel's character cap
- connection_request: 300 characters. Every word earns its place.
  Lead with shared context, state the ask in one clean sentence,
  close with a light forward-lean.
- inmail: ~1900 characters. Room for one short paragraph of context
  + a specific ask + a brief rationale. No resume recap.
- group_message: up to 8000 characters. Use the space for genuine
  substance (shared article, thoughtful question, working insight) —
  but if the message is fine at 400 chars, do not pad it.
When the draft approaches a channel's cap, tighten language rather
than truncate mid-thought.`,

  `## RULE 4 — Ground the ask in the application context
The target_application block provides company, role, and optionally
a JD excerpt. Use this to tie the outreach to a concrete opportunity
when the goal references job search. When the goal is informational
(learn about their work, build relationship), the application
context is supporting — not the headline.

${EVIDENCE_LADDER_RULES}

${HUMAN_EDITORIAL_EFFECTIVENESS_RULES}`,

  `## RULE 5 — Hard prohibitions
- No resume attachments, no inline resume bullets.
- No emoji, no exclamation marks.
- No "I hope this finds you well", no "quick question", no
  "wanted to connect".
- No vague "pick your brain" asks — make the ask specific.
- No fabricated shared context. If no real connection point exists,
  say so cleanly and lead with the research reason.
- No negotiation-posturing language in a non-offer message.`,

  `## RULE 6 — One message, one purpose
This is not a sequence. The draft is a single, standalone message.
If the goal implies a multi-step nurture (e.g., "build the
relationship"), still write ONE message — the opener — and let the
user iterate. Never bundle follow-ups into the same draft.`,
].join('\n\n');
