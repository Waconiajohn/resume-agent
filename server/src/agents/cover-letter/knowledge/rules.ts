/**
 * Cover Letter Agent — Knowledge Rules
 *
 * 7 rules (0-6) that govern cover letter analysis, planning, and writing for
 * executive-level candidates. These rules are injected into both the Analyst
 * and Writer agent system prompts.
 *
 * Rule design principles:
 * - A cover letter is a positioning document, not a resume rehash
 * - Specificity over generality — every claim needs a proof point
 * - Generic letters are a failure state — real company context is required
 * - Age awareness protects executives 45+ from systemic bias
 */

import { AGE_AWARENESS_RULES } from '../../knowledge/resume-guide.js';

// ─── Rule 0: Cover Letter Philosophy ────────────────────────────────

export const RULE_0_PHILOSOPHY = `## RULE 0 — COVER LETTER PHILOSOPHY

A cover letter is a positioning document, not a resume rehash. Its sole job is to answer one question for the hiring executive: "Why is this specific person the right choice for this specific role at this specific company?" Every paragraph must earn its place by advancing that answer.

Core principles:
1. **Positioning, not recapping** — The resume already lists the facts. The cover letter interprets those facts in the context of this opportunity. A letter that merely repeats resume content in prose form is a failure. The letter should make the reader want to read the resume, not replace it.
2. **Specificity over generality** — "I have strong leadership experience" is noise. "I led a 120-person cross-functional team through an $89M ERP migration that came in on time and 12% under budget" is proof. Every body paragraph must contain one concrete, specific proof point. Generalities disqualify.
3. **The reader test** — Every sentence should pass this test: would a skeptical hiring executive find this meaningful and memorable? If a sentence could be deleted without losing anything, delete it. The letter should make the reader want to meet this person, not file the application.
4. **300-400 words is the target** — Longer is not more impressive. An executive who can position themselves in 350 words signals stronger communication skills than one who rambles to 600. Trim ruthlessly.
5. **Authenticity over embellishment** — We never fabricate experience, inflate metrics, or misrepresent accomplishments. We better position genuine skills and real achievements. A well-positioned truth is more compelling than any fabrication.

What this is NOT:
- A transcript of the resume in paragraph form
- A list of skills and qualifications
- A document that could be sent to any company in any industry
- A vehicle for expressing generic enthusiasm about "exciting opportunities"`;

// ─── Rule 1: Opening Hook ────────────────────────────────────────────

export const RULE_1_OPENING_HOOK = `## RULE 1 — OPENING HOOK

The first sentence determines whether the rest of the letter gets read. "I am writing to express my interest in..." is the fastest way to ensure the rest does not get read.

The opening hook must be one of three forms:
1. **A specific achievement** — Start with a result that proves immediate relevance: "When I took over a $340M underperforming division at Meridian Health, I had 90 days to demonstrate the turnaround case to the board. Eighteen months later, EBITDA was up 22%."
2. **A bold positioning statement** — A confident declaration of who you are and why it matters here: "For the past decade, I have done exactly one thing: turn legacy insurance technology organizations into platforms that attract fintech talent."
3. **A direct company connection** — Reference something real and specific about this company's current situation: "Your Q3 investor call made one thing clear — Apex needs an operations leader who has already navigated the shift from product-led to enterprise sales. That transition is where I've spent most of my career."

Bad openers to avoid:
- "I am writing to express my interest in the [title] position..."
- "Please accept this letter as my application for..."
- "I was excited to see your posting on LinkedIn..."
- "With [N] years of experience in [field], I believe I am an ideal candidate..."
- "I am a results-driven leader with a passion for..."

The opening hook sets the tone for the entire letter. It must be distinctive. If the first sentence of the draft could be swapped into any cover letter without modification, rewrite it.`;

// ─── Rule 2: Evidence Standards ─────────────────────────────────────

export const RULE_2_EVIDENCE = `## RULE 2 — EVIDENCE STANDARDS

Each body paragraph requires one concrete proof point with metrics. Unsubstantiated claims at the executive level are not just unconvincing — they signal that the candidate cannot meet the standard of evidence expected in senior roles.

Evidence standards for cover letter body paragraphs:
1. **Use the RAS pattern (Result-Action-Situation)** — Lead with the outcome, follow with the action that drove it, ground it in the business context. "Cut time-to-market from 14 months to 5 (Result) by restructuring the product portfolio roadmap and eliminating 40% of the pipeline (Action) during a period when the company was under pressure to respond to a new market entrant (Situation)."
2. **Metrics make the claim** — Dollar amounts, percentages, time savings, team sizes, customer counts, market share gains. If the evidence library contains a metric, use it. If the metric exists but needs approximation, use "approximately" or "nearly." Never invent a number.
3. **One proof point per paragraph** — Three strong, specific proof points beat five vague ones. Depth over breadth. Each paragraph should be 2-4 sentences: the claim, the evidence, and a sentence connecting it to why it matters for this specific role.
4. **Specificity signals credibility** — Company names, system names, team structures, dollar figures — these details signal a real person describing real work. Vague claims signal a generic letter.
5. **Evidence must be from the source material** — Use the resume data, questionnaire responses, and evidence library. Do not invent achievements not present in the source material. Flag gaps and ask rather than fabricate.

The body section should contain 2-3 paragraphs. Each must pass this test: if the specific company name, metric, and action were removed, would the paragraph collapse into something meaningless? If not, it's specific enough.`;

// ─── Rule 3: Company-Specific Tailoring ─────────────────────────────

export const RULE_3_TAILORING = `## RULE 3 — COMPANY-SPECIFIC TAILORING

A cover letter that could be sent to any company without modification is a failure. Company-specific tailoring is not optional — it is the mechanism by which the letter demonstrates genuine interest and preparation.

Tailoring standards:
1. **Reference real company context** — Use intelligence from the research phase: current initiatives, recent news, stated strategic priorities, leadership changes, market challenges. The more specific, the more credible. "Your recent acquisition of DataBridge signals a shift toward an integrated analytics play — exactly the kind of platform integration I drove at Atlas Systems" is strong tailoring.
2. **Connect the candidate's positioning to the company's actual problem** — The letter should not just list qualifications — it should show that the candidate has already thought about the company's challenges and sees how their experience maps. "Given Apex's stated goal of reducing enterprise churn by 30% next year, my work building the first customer success infrastructure at Meridian is directly applicable."
3. **Industry context** — Reference industry-specific dynamics, regulatory environment, or competitive forces that are relevant. This signals domain expertise, not just professional competence.
4. **Cultural fit signals** — If the company's research reveals cultural cues (innovation-first, data-driven, people-centric), embed language that resonates with those values — authentically, not by copying their website language verbatim.
5. **Never use placeholder tailoring** — Generic phrases like "I am excited about your company's mission" or "I admire your commitment to innovation" read as boilerplate. Every expression of interest in the company must be grounded in something specific.

If the research phase did not yield sufficient company-specific intelligence to tailor the letter meaningfully, flag this to the user. A generic letter does more harm than no letter.`;

// ─── Rule 4: Executive-Level Framing ────────────────────────────────

export const RULE_4_EXECUTIVE = `## RULE 4 — EXECUTIVE-LEVEL FRAMING

Cover letters for VP, Director, and C-suite candidates are read by other senior leaders. The framing must reflect the altitude at which these candidates operate.

Executive framing standards:
1. **Strategic impact, not task completion** — "Managed the procurement function" is task-level. "Redesigned the procurement model to reduce cost of goods by 14% while cutting supplier concentration risk in half" is strategic. Every accomplishment must be framed in terms of business outcome, not activity.
2. **Influence and decision-making** — Executive contribution is measured by decisions made, strategies set, and organizations moved. The letter should reveal how the candidate thinks — what they saw, what they decided, and why those decisions delivered the outcomes they did.
3. **Organizational scope signals seniority** — Budget owned, teams led, geographies covered, stakeholders managed. Include scope context so the reader understands the scale at which the candidate operates. "Led a $200M P&L across 4 business units" communicates executive altitude immediately.
4. **Peer-level language** — Write as if one senior leader is writing to another. The tone should be confident and collegial, not eager or deferential. "I believe my background would be an excellent fit" reads as junior. "The operations challenges you're navigating at Apex are exactly where I've built my career" reads as executive-level.
5. **Forward-looking close** — The closing paragraph should not beg for the opportunity. It should express a confident expectation of mutual interest and propose a logical next step. "I would welcome a conversation to discuss how my experience building enterprise analytics platforms applies to your growth roadmap" is appropriate.`;

// ─── Rule 5: Age Awareness ───────────────────────────────────────────

export const RULE_5_AGE_AWARENESS = `## RULE 5 — AGE AWARENESS

${AGE_AWARENESS_RULES}

Cover letter-specific age awareness guidelines:
- **Never include graduation years** in a cover letter — not in the signature, not in a credential reference, nowhere. "I earned my MBA from Kellogg" is sufficient; the year adds nothing and creates risk.
- **Focus on the most recent 10-15 years** — The letter's body evidence should draw from recent experience. Achievements from 20+ years ago should not appear unless they are truly exceptional and directly applicable.
- **Frame long tenure as depth** — If the candidate has 20 years at one company, frame it as "two decades scaling the same platform from startup to $2B enterprise" — depth and progression, not duration and inertia.
- **Emphasize currency** — Mention modern tools, current methodologies, and recent adaptations. An executive who references AI-driven analytics, current SaaS platforms, or recent digital transformation work signals that they are operating in the present, not the past.
- **The letter's tone should be forward-looking** — "What I will bring" rather than "what I have done for many years." The candidate's value is in their future contribution, not their historical service.`;

// ─── Rule 6: Self-Review Checklist ──────────────────────────────────

export const RULE_6_SELF_REVIEW = `## RULE 6 — SELF-REVIEW CHECKLIST

Before presenting a cover letter draft, verify every element against this checklist. A weak cover letter can cancel the impact of a strong resume.

Verification criteria:

1. **Opening hook is distinctive** — The first sentence cannot be "I am writing to express my interest." It must be a specific achievement, a bold positioning statement, or a direct company connection. If it could be sent to any company, rewrite it.
2. **Body points are evidence-backed** — Each body paragraph contains one specific proof point with metrics drawn from the source material. No paragraph makes a claim without evidence.
3. **Company specifics are real** — The letter references actual company intelligence: a stated initiative, a recent event, a named product, a known challenge. Placeholder expressions of admiration are not company tailoring.
4. **Tone is confident, not desperate** — The letter does not beg for the opportunity. It demonstrates value and proposes a conversation as equals. Language like "I would be honored" or "any opportunity would be incredible" is removed.
5. **Length is 300-400 words** — Under 250 is too thin for an executive candidate. Over 450 suggests the candidate cannot edit. Measure and adjust.
6. **No age signals** — No graduation years, no references to "decades" of experience, no outdated terminology or technologies.
7. **No cliches** — "Results-driven," "proven track record," "passionate about," "team player," "thought leader" — flag every occurrence and rewrite to show rather than tell.
8. **The closing proposes a next step** — The final paragraph ends with a specific, confident call to action. Not "I hope to hear from you." A clear, forward-looking invitation to continue the conversation.`;

// ─── Combined System Prompt Injection ────────────────────────────────

/**
 * All 7 rules concatenated for injection into the Cover Letter agent system prompts.
 */
export const COVER_LETTER_RULES = [
  RULE_0_PHILOSOPHY,
  RULE_1_OPENING_HOOK,
  RULE_2_EVIDENCE,
  RULE_3_TAILORING,
  RULE_4_EXECUTIVE,
  RULE_5_AGE_AWARENESS,
  RULE_6_SELF_REVIEW,
].join('\n\n---\n\n');
