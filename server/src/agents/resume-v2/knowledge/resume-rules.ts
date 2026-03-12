/**
 * Resume Writing Rules Knowledge Base
 *
 * Structured data encoding the executive resume rulebook from the
 * design blueprint. Agents consume these rules in their prompts.
 *
 * Sources: Perplexity research (owner-endorsed), coaching methodology,
 * executive resume writing best practices for ages 45-60.
 */

// ─── Document Format ─────────────────────────────────────────────────

export const DOCUMENT_FORMAT = {
  max_pages: 2,
  layout: 'single-column' as const,
  style: 'reverse-chronological' as const,
  primary_export: 'docx' as const,
  rationale: 'ATS systems parse single-column DOCX most reliably. 2 pages is standard for mid-level executives (3 only for C-suite).',
};

// ─── Section Order ───────────────────────────────────────────────────

export const SECTION_ORDER = [
  'header',
  'executive_summary',
  'core_competencies',
  'selected_accomplishments',
  'professional_experience',
  'earlier_career',
  'education',
] as const;

export type ResumeSection = typeof SECTION_ORDER[number];

// ─── Section Rules ───────────────────────────────────────────────────

export const SECTION_RULES: Record<ResumeSection, string> = {
  header: `Name, phone, email, LinkedIn URL, branded title line.
The branded title targets the role you WANT, not the one you have.
Example: "Enterprise Transformation Leader | Cloud & Digital Strategy | P&L Ownership to $50M"`,

  executive_summary: `3-5 lines (60-100 words). Structure:
1. Opening pitch line — who you are + what you bring
2. Scale indicators — team size, budget, geography, revenue
3. 1-2 marquee accomplishments — your best quantified hits
No generic phrases. No "results-oriented leader" garbage.
Write in first person without using "I". Start with action verbs or descriptive phrases.`,

  core_competencies: `9-12 hard skills and strategic themes.
Mirror JD keywords directly. Include digital/AI fluency signal where truthful.
Format: 3-4 columns of skills, grouped by theme.
These are the ATS keyword magnets — they should match the JD language closely.`,

  selected_accomplishments: `3-6 quantified career highlights.
Format: Action Verb + What You Did + Measurable Result.
Prioritized by relevance to target role, not chronology.
Every accomplishment must have at least one metric (money, time, volume, or scope).`,

  professional_experience: `Reverse-chronological. Last 10-15 years in detail.
Each role: Company, Title, Dates, Location.
Scope statement above bullets (team size, budget, geography, P&L).
4-7 bullets per recent role. CAR method (Challenge, Action, Result).
Quantify across 4 categories: money, time, volume, scope.
1-2 lines per bullet. Start every bullet with a strong action verb.`,

  earlier_career: `Company, title, dates only. No bullets.
Never detail more than 20 years total.
Condense 15-20 year old roles to one-liners.
This section exists to show career progression without dating the candidate.`,

  education: `Degree, institution. No graduation dates for candidates 45+.
No high school. Certifications listed separately below education.
Professional development and relevant training can be included.`,
};

// ─── Writing Rules ───────────────────────────────────────────────────

export const WRITING_RULES = `## Resume Writing Rules

VOICE:
- Never say "responsible for" — start with strong action verbs
- Speak like a leader: "drove," "championed," "orchestrated," "influenced," "spearheaded"
- Never use: "helped," "assisted," "supported," "participated in"
- Authentic voice beats resume-speak — echo the candidate's actual language where possible
- Write for humans first, ATS second

IMPACT:
- Every bullet shows impact, not just activity
- Prefer metrics across 4 categories: money ($), time (%), volume (#), scope (geography/teams)
- "Led $2.4M cost reduction" beats "Reduced costs significantly"
- If no exact metric, infer conservatively from scope (back off 10-20% from the math)

STRUCTURE:
- CAR method: Challenge → Action → Result
- 1-2 lines per bullet, max
- Front-load the most impressive metric in each bullet
- Use consistent tense: past tense for previous roles, present tense for current role

KEYWORDS:
- Mirror JD language naturally — don't keyword-stuff
- Place critical keywords in summary, competencies, AND experience bullets
- Use both the acronym and spelled-out version where space allows (e.g., "Customer Relationship Management (CRM)")`;

// ─── Banned Phrases ──────────────────────────────────────────────────

export const BANNED_PHRASES = [
  'results-oriented leader',
  'results-driven professional',
  'motivated professional',
  'dynamic team player',
  'proven track record',
  'responsible for',
  'helped',
  'assisted',
  'supported',
  'participated in',
  'team player',
  'go-getter',
  'think outside the box',
  'synergy',
  'leverage',
  'utilize',
  'fast-paced environment',
  'detail-oriented',
  'self-starter',
  'references available upon request',
  'objective statement',
];

// ─── Age-Proofing Rules (Critical for 45-60) ────────────────────────
//
// AGE_AWARENESS_RULES from shared-knowledge.ts is the platform-wide canonical
// version used by cover-letter, executive-bio, and other agents.
// AGE_PROOFING_RULES here is the resume-specific superset that includes the
// "USE" section (template/formatting guidance). Both are kept in sync on
// the shared principles; resume-specific additions live here only.

import { AGE_AWARENESS_RULES } from '../../shared-knowledge.js';
export { AGE_AWARENESS_RULES };

export const AGE_PROOFING_RULES = `${AGE_AWARENESS_RULES}

USE:
- Modern, clean template design
- Contemporary email address (not AOL, Hotmail)
- Current formatting conventions`;

// ─── Guardrails ──────────────────────────────────────────────────────

export const GUARDRAILS = `## Resume Guardrails — Non-Negotiable

1. NEVER fabricate experience or inflate credentials
2. NEVER invent metrics the candidate cannot defend in an interview
3. When inferring numbers (budget from team size, etc.), back off 10-20% from the math
   Example: team of 40 × $85K avg = $3.4M → write "$3M+ payroll budget"
4. Every claim must trace to source data (original resume or user-provided context)
5. Prefer reframing real experience over inventing new experience
6. Creative positioning is encouraged — fabrication is prohibited
7. If a gap truly cannot be addressed, acknowledge it honestly rather than stretching
8. Metrics must be verified or user-confirmed before final draft`;

// ─── Combined Prompt Block ───────────────────────────────────────────

/**
 * Full resume rules block ready to inject into agent prompts.
 * Includes all rules, banned phrases, age-proofing, and guardrails.
 */
export function getResumeRulesPrompt(): string {
  const sectionRulesBlock = SECTION_ORDER
    .map(s => `### ${s.replace(/_/g, ' ').toUpperCase()}\n${SECTION_RULES[s]}`)
    .join('\n\n');

  return `# Executive Resume Writing Rulebook

## Document Format
- ${DOCUMENT_FORMAT.max_pages} pages maximum
- ${DOCUMENT_FORMAT.layout} layout
- ${DOCUMENT_FORMAT.style}
- Primary export: ${DOCUMENT_FORMAT.primary_export}

## Section Order
${SECTION_ORDER.map((s, i) => `${i + 1}. ${s.replace(/_/g, ' ')}`).join('\n')}

## Section Rules

${sectionRulesBlock}

${WRITING_RULES}

## Banned Phrases — NEVER Use These
${BANNED_PHRASES.map(p => `- "${p}"`).join('\n')}

${AGE_PROOFING_RULES}

${GUARDRAILS}`;
}
