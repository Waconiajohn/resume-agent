/**
 * Resume Writing Rules Knowledge Base
 *
 * Comprehensive executive resume rulebook — the definitive ruleset for the
 * resume-v2 pipeline. Every agent that produces or evaluates resume content
 * consumes these rules via getResumeRulesPrompt().
 *
 * Sources: Perplexity research (owner-endorsed), coaching methodology,
 * executive resume writing best practices for ages 45-60.
 */

// ─── Document Format ─────────────────────────────────────────────────

export const DOCUMENT_FORMAT = {
  /**
   * Page length is driven by content quality, not a fixed number.
   * Target 2 pages for most executives. 3 pages is acceptable for C-suite
   * candidates with 20+ year careers when the evidence genuinely demands it.
   * Never pad to fill space. Never compress quality content to hit an
   * arbitrary limit. Every line must earn its place.
   */
  page_guidance: 'Target 2 pages for executives. 3 pages acceptable for C-suite with 20+ year careers when evidence demands it. Never pad. Never cut quality content for an arbitrary limit.',
  layout: 'single-column' as const,
  style: 'reverse-chronological' as const,
  fonts: 'Standard professional fonts only — Calibri, Garamond, Georgia, or Times New Roman. No decorative fonts.',
  graphics: 'No tables, graphics, text boxes, headers/footers, or columns. ATS systems cannot parse them.',
  headings: 'Standard section headings: Professional Experience, Education, Core Competencies, etc.',
  primary_export: 'docx' as const,
  rationale: 'ATS systems parse single-column DOCX most reliably. Page count follows content quality — typically 2 pages for executives, 3 for C-suite.',
};

// ─── Section Order ───────────────────────────────────────────────────

export const SECTION_ORDER = [
  'header',
  'executive_summary',
  'core_competencies',
  'selected_accomplishments',
  'professional_experience',
  'technical_skills',
  'earlier_career',
  'education',
  'certifications',
] as const;

export type ResumeSection = typeof SECTION_ORDER[number];

// ─── Section Rules ───────────────────────────────────────────────────

export const SECTION_RULES: Record<ResumeSection, string> = {
  header: `Name, phone, email, LinkedIn URL, branded title line.
The branded title targets the role you WANT, not the one you have.
Example: "Enterprise Transformation Leader | Cloud & Digital Strategy | P&L Ownership to $50M"
No street address. Phone, email, and LinkedIn only.`,

  executive_summary: `3-5 sentences (60-100 words). Structure:
1. Brand statement — who you are, what you own, what makes you different
2. Name the specific role you are targeting — directly, not generically
3. 2-3 quantified accomplishments that prove the brand statement
No generic phrases. The first sentence must establish identity and positioning, not adjectives.
Write in first person without using "I". Start with action verbs or descriptive phrases.
Altitude: every sentence should sound like a VP or C-suite candidate wrote it.

BANNED PHRASES IN SUMMARY (never use):
- "results-oriented leader" / "results-driven professional"
- "motivated professional" / "dynamic team player"
- "proven track record" / "extensive experience"
- "strong communication skills" / "excellent interpersonal skills"
- "passionate about" / "dedicated to"
- "seasoned professional" / "accomplished leader"`,

  core_competencies: `12-18 keywords and strategic themes.
Use EXACT phrases from the job description — this is the ATS keyword magnet section.
No soft skills ("leadership," "communication," "teamwork") — only domain skills and strategic capabilities.
Group by category if applicable: Technical, Leadership, Domain, Functional.
Include AI/digital fluency signal where truthful. For executives, AI readiness means leadership
of technology adoption, data-driven operations, process automation, and digital transformation —
not hands-on AI/ML technical skills. Frame at the executive level: "AI-Enabled Process
Optimization" not "Machine Learning."
Format: 3-4 columns of skills, or grouped thematic lines.`,

  selected_accomplishments: `3-6 career highlights that directly address the top JD requirements.
Each must be substantial, specific, and quantified — the "proof points" that make the candidate undeniable.
Format: Strong Action Verb + What You Did (with context) + Measurable Result.
Every accomplishment must have at least one metric (money, time, volume, or scope).
Prioritized by relevance to target role, not chronology.
These are the achievements that stop a hiring manager from moving to the next resume.`,

  professional_experience: `Reverse-chronological. Last 10-15 years in full detail.
Each role: Company | Title | Dates | Location.
Scope statement above bullets: team size, budget, geography, P&L responsibility.
Bullet format: Action Verb + Context + Quantified Result (70% of bullets must have metrics).

BULLET COUNT — JD-relevance governs, not minimums:
- Most recent / most relevant positions: write as many bullets as strong evidence supports
- A useful ceiling is approximately 1-2 bullets per year held in the role
- Other recent relevant positions: proportional to available strong evidence
- Older but still relevant (10-15 years): focus only on the strongest accomplishments
- 15-20 years ago: brief, reframe for transferable skills, scope statement if role was senior
- Never pad bullets to meet a count target
- Never cut strong evidence to reduce length
- 20+ years ago: move to "Additional Work Experience" ONLY when the role is both old and low current-role relevance
- If an older role directly supports the top job needs, benchmark differentiators, or the candidate's current positioning, keep it in Professional Experience with bullets

Strong action verbs: Drove, Championed, Orchestrated, Spearheaded, Transformed, Architected, Scaled, Delivered, Directed, Built, Negotiated, Launched
BANNED bullet openers: "Responsible for," "Helped," "Assisted," "Supported," "Participated in," "Worked on"

BULLET ARCHETYPES — use a mix across each role, not just impact bullets:

1. TRANSFORMATION BULLET (before → action → after):
   "Inherited [broken state]. [What you did and HOW — through people/process/creativity]. [What became possible — metric + human impact]."
   Example: "Inherited operations division with 23% annual turnover and no succession plan. Built structured mentorship program pairing senior managers with high-potential ICs. Within 18 months, turnover dropped to 9%, promoted 5 internal candidates to management, and eliminated $340K in external recruiting spend."

2. EMPOWERMENT BULLET (leadership through growing others):
   "Built/developed/mentored [who]. [How you empowered them]. [What they accomplished as a result]."
   Example: "Developed 8-person engineering leadership pipeline through quarterly stretch assignments and executive shadowing. Five promoted to team leads within 3 years; three later led independent product teams generating $12M combined revenue."

3. ACCOUNTABILITY BULLET (standards and follow-through):
   "Set [standard/target]. [How you tracked and enforced it]. [Result — including what happened when things missed]."
   Example: "Established weekly OKR reviews with 100% participation requirement. Every miss triggered 48-hour root cause analysis. Maintained 89% quarterly attainment against 67% historical baseline while building a culture where misses were learning opportunities, not blame events."

4. RECOVERY BULLET (setback, diagnosis, course correction):
   "When [what went wrong]. [How fast you diagnosed — data-driven]. [What you changed]. [Result]."
   Example: "When Q3 product launch missed adoption targets by 40%, conducted cross-functional post-mortem within one week. Root cause: sales enablement gap. Designed 2-week intensive training program and rebuilt onboarding flow. Q4 adoption exceeded original targets by 15%."

5. PROCESS BULLET (show methodology and preparation):
   "Conducted [preparation/analysis]. Identified [insight]. Designed [framework/approach]. [Result]."
   Example: "Conducted 6-week market analysis across 14 competitor offerings before entering enterprise segment. Identified underserved mid-market niche. Designed land-and-expand pricing model that captured 23 logos in first year with 140% net revenue retention."

6. IMPACT BULLET (action → quantified result — the traditional format):
   Use these but limit to approximately 30% of bullets. The other 70% should use archetypes 1-5 to tell richer stories.

Each role should have a MIX of archetypes. No role should be all impact bullets. The goal: when a hiring manager reads the experience section, they should think "this person builds things, grows people, solves real problems, and holds themselves accountable."`,

  technical_skills: `Optional — include only when the role specifically values technical depth.
Domain-specific tools, platforms, and technologies grouped by category.
Example categories: Cloud Platforms, Data & Analytics, ERP/CRM Systems, Programming Languages, Security.
Do not include basic tools (Word, Excel, PowerPoint) unless the role explicitly requires them.
Omit this section entirely if the candidate lacks genuine technical breadth relevant to the target role.`,

  earlier_career: `Additional Work Experience — for positions that are old AND no longer materially relevant to the target role.
Title, company, city and state only. No bullets. No dates.
This section shows career foundation without revealing age or dating the candidate.
Do not move a role here if it still provides proof for the top job needs, benchmark expectations, or a major differentiator.
Only include positions whose end_date is 20+ years before the current year AND whose relevance is low.
Never include dates in this section.`,

  education: `Degree and institution.
No graduation year for degrees earned 20+ years ago (suppresses age signal).
No high school.
Relevant coursework and honors only if they directly support the target role.`,

  certifications: `ONLY certifications that are: (1) active/current, (2) relevant to the target role.
Omit expired certifications entirely.
Omit certifications unrelated to the target role — even if impressive in other contexts.
List format: Certification Name — Issuing Body (Year if recent, otherwise omit).
When in doubt, omit. A sparse, relevant list beats a cluttered, irrelevant one.`,
};

// ─── Writing Rules ───────────────────────────────────────────────────

export const WRITING_RULES = `## Resume Writing Rules

VOICE:
- Strong past-tense action verbs for all prior roles; present tense for current role
- Speak like a leader: "drove," "championed," "orchestrated," "influenced," "directed," "transformed"
- Never use: "responsible for," "helped," "assisted," "supported," "participated in," "worked on"
- Authentic voice beats resume-speak — echo the candidate's actual language when it is strong
- Preserve specific domain terminology; generic rewrites destroy credibility
- Write for humans first, ATS second

BANNED BULLET PATTERNS (rewrite any bullet that opens with these):
- "Responsible for..."
- "Assisted with..." / "Helped achieve..."
- "Participated in..." / "Worked on..."
- "Supported the..." / "Contributed to..."
- "Member of..." / "Part of the team that..."
- "Duties included..."

BANNED SUMMARY PHRASES (never appear anywhere in the resume):
- "results-oriented" / "results-driven"
- "proven leader" / "proven track record"
- "motivated professional" / "dynamic team player"
- "detail-oriented" / "self-starter" / "go-getter"
- "think outside the box" / "synergy"
- "fast-paced environment"
- "excellent communication skills"
- "references available upon request"
- "objective statement" (use executive summary instead)
- "leverage" / "utilize" (use "use" or "apply")

IMPACT:
- Every bullet shows impact, not just activity
- 70% or more of all bullets must have at least one metric
- Metric types for executives: money ($), time reduction (%), volume (#), scope (teams/geography/revenue)
- "Led $2.4M cost reduction" beats "Reduced costs significantly"
- If no exact metric exists, infer conservatively from scope (back off 10-20% from the math)
  Example: team of 40 × $85K avg = $3.4M → write "$3M+ payroll budget"

STRUCTURE:
- Action + Context + Result (not just Action + Activity)
- 1-2 lines per bullet, max
- Front-load the most impressive metric or outcome in each bullet

PROVENANCE RULE:
- Every claim must trace to source data in the original resume or explicit user-provided context
- Never fabricate metrics the candidate cannot defend in an interview
- Creative positioning and strategic framing are encouraged — fabrication is prohibited
- Mark all AI-enhanced content with is_new: true

KEYWORDS:
- Mirror exact JD language naturally — do not keyword-stuff
- Place critical keywords in summary, competencies, AND experience bullets
- Spell out acronyms on first use: "Customer Relationship Management (CRM)"
- Aim for 15-25 keywords from the JD distributed across the document
- Primary keywords should appear in at least 2 distinct sections

AI READINESS (executive resumes):
- When the candidate has led automation, data-driven decision making, technology adoption,
  or digital transformation, reframe those accomplishments to signal AI readiness
- Executive-level AI language: "AI-ready infrastructure," "automation-enabled operations,"
  "data-driven decision frameworks" — not technical jargon
- AI readiness is woven into existing sections, not a standalone section
- Only include AI signals that trace to real experience on the resume`;

// ─── Age-Proofing Rules (Critical for 45-60) ────────────────────────
//
// AGE_AWARENESS_RULES from shared-knowledge.ts is the platform-wide canonical
// version used by cover-letter, executive-bio, and other agents.
// AGE_PROOFING_RULES here is the resume-specific superset that adds
// the "USE" section (template/formatting guidance). Both are kept in sync
// on the shared principles; resume-specific additions live here only.

import { AGE_AWARENESS_RULES } from '../../shared-knowledge.js';
export { AGE_AWARENESS_RULES };

export const AGE_PROOFING_RULES = `${AGE_AWARENESS_RULES}

USE:
- Modern, clean single-column template design
- Contemporary email address (not AOL, Hotmail — signals dated digital habits)
- Current formatting conventions (no objective statement, no tables/graphics)
- Include modern terminology relevant to the role: AI, cloud, data-driven, digital transformation`;

// ─── ATS Rules ───────────────────────────────────────────────────────

export const ATS_RULES = `## ATS Optimization Rules

KEYWORD STRATEGY:
- Mirror exact phrases from the job description — ATS matches strings, not concepts
- Target 15-25 keywords total, distributed naturally across the document
- Primary keywords (the role's core requirements) must appear in at least 2 distinct sections
- Use both spelled-out and abbreviated versions where space allows: "Customer Relationship Management (CRM)"
- Do not stuff keywords — place them where they read naturally

FORMATTING FOR PARSABILITY:
- Single-column layout only — multi-column confuses most ATS parsers
- Standard section headings — do not rename "Professional Experience" to "Where I've Worked"
- No tables, text boxes, headers/footers, or graphics — ATS cannot parse them
- Standard fonts only (Calibri, Garamond, Georgia, Times New Roman)
- DOCX is the primary export format — PDF can corrupt parsing on some systems

CRITICAL ATS TRAPS TO AVOID:
- Do not embed keywords in images or graphics (invisible to ATS)
- Do not use abbreviations without the spelled-out version appearing at least once
- Dates must be consistently formatted: MM/YYYY or Month YYYY throughout`;

// ─── Banned Phrases (used by executive-tone agent) ──────────────────

export const BANNED_PHRASES = [
  'results-oriented', 'results-driven', 'proven leader', 'proven track record',
  'motivated professional', 'dynamic team player', 'detail-oriented',
  'self-starter', 'go-getter', 'think outside the box', 'synergy',
  'fast-paced environment', 'excellent communication skills',
  'strong interpersonal skills', 'team player', 'passionate about',
  'dedicated to', 'seasoned professional', 'accomplished leader',
  'extensive experience', 'references available upon request',
  'responsible for', 'helped', 'assisted', 'supported',
  'participated in', 'worked on', 'duties included',
  'leverage', 'utilize', 'value-add',
  'spearheaded', 'high stakes', 'high-stakes',
  'member of', 'part of the team that', 'contributed to',
  'driving transformation', 'driving operational excellence', 'driving growth',
  'showcasing', 'demonstrating ability', 'ensuring seamless',
  'holistic', 'robust', 'cutting-edge', 'best-in-class', 'world-class',
  'transformational', 'innovative solutions', 'strategic vision',
  'cross-functional collaboration', 'stakeholder engagement',
  'thought leadership', 'paradigm shift', 'disruptive',
  'championed', 'fostering', 'fostered', 'operational excellence',
  'end-to-end', 'strategic partnerships',
];

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
8. Metrics must be verified or inferable before inclusion in final draft`;

// ─── Quality Gates ───────────────────────────────────────────────────

export const QUALITY_GATES = [
  {
    id: 'scope_test',
    name: 'Scope Test',
    description: 'Does the executive summary and each role\'s scope statement communicate the scale of responsibility (team size, budget, geography, P&L)?',
    pass_criterion: 'Every role that held meaningful scope has a scope statement. Summary anchors with a scale indicator.',
  },
  {
    id: 'metric_test',
    name: 'Metric Test (70%+)',
    description: '70% or more of all experience bullets have at least one quantified metric (money, time, volume, or scope).',
    pass_criterion: 'Count bullets with metrics. Count total bullets. Ratio must be ≥ 0.70.',
  },
  {
    id: 'relevance_test',
    name: 'Relevance Test',
    description: 'Every bullet, accomplishment, and competency on the resume is either directly relevant to the target role or demonstrates a transferable capability that has been explicitly framed as relevant.',
    pass_criterion: 'No bullet survives that cannot answer: "Why does this matter for THIS role?"',
  },
  {
    id: 'altitude_test',
    name: 'Altitude Test',
    description: 'The language, scope, and framing are consistent with the seniority level being targeted. An executive candidate should not sound like a mid-level contributor.',
    pass_criterion: 'Every bullet shows agency, scale, and strategic impact — not just task completion.',
  },
  {
    id: 'cliche_test',
    name: 'Cliche Test',
    description: 'The resume contains none of the banned phrases from the BANNED BULLET PATTERNS and BANNED SUMMARY PHRASES lists.',
    pass_criterion: 'Zero instances of: "responsible for," "proven leader," "results-oriented," "team player," and all other banned phrases.',
  },
  {
    id: 'length_test',
    name: 'Length Test',
    description: 'The resume is the right length for the candidate\'s career depth. Typically 2 pages for executives; 3 pages only for C-suite with 20+ year careers.',
    pass_criterion: 'No padding. No truncation of strong evidence. Every line earns its place.',
  },
  {
    id: 'recency_test',
    name: 'Recency Test',
    description: 'The most recent 10 years receive proportionally more detail than older roles. The most impressive and relevant accomplishments from recent years are prominently featured.',
    pass_criterion: 'Most recent 1-2 roles have the most bullets. Older roles taper proportionally.',
  },
  {
    id: 'ats_test',
    name: 'ATS Test',
    description: 'The resume uses exact keyword phrases from the job description. Primary keywords appear in at least 2 sections. 15-25 keywords are distributed naturally throughout.',
    pass_criterion: 'Top 10 JD keywords each appear at least once. Top 5 appear in 2+ sections.',
  },
  {
    id: 'so_what_test',
    name: 'So-What Test',
    description: 'Every bullet answers the question: "So what? Why does this matter for this role?" Activity bullets (what you did) have been upgraded to impact bullets (what changed because of you).',
    pass_criterion: 'Zero pure-activity bullets. Every bullet has a result, outcome, or demonstrated impact.',
  },
  {
    id: 'age_proof_test',
    name: 'Age-Proof Test',
    description: 'The resume does not reveal the candidate\'s age through graduation dates (if 20+ years ago), outdated technology references, objective statements, or tenure phrasing.',
    pass_criterion: 'No graduation years for degrees 20+ years old. No "30 years of experience." No obsolete tech. No objective statement.',
  },
] as const;

export type QualityGateId = typeof QUALITY_GATES[number]['id'];

// ─── Source Discipline ──────────────────────────────────────────────

/**
 * Injected into every resume-v2 agent system prompt.
 * Prevents hallucinated metrics, stale context carry-forward,
 * and fabricated credentials across all pipeline agents.
 */
export const SOURCE_DISCIPLINE = `
SOURCE DISCIPLINE — NON-NEGOTIABLE:
- Read the candidate's actual resume text and job description fresh for this evaluation.
- Never assume metrics, accomplishments, or credentials from prior context.
- Never carry forward or cache numbers between evaluations.
- If a fact is not in the source resume or job description provided, it does not exist.
- Every claim must trace to text in the provided inputs.
- Do not reference anything from a previous pipeline run.`;

// ─── Combined Prompt Block ───────────────────────────────────────────

/**
 * Full resume rules block ready to inject into agent system prompts.
 * Includes all format rules, section rules, writing rules, ATS rules,
 * age-proofing rules, guardrails, and the 10 quality gates.
 */
export function getResumeRulesPrompt(): string {
  const sectionRulesBlock = SECTION_ORDER
    .map(s => `### ${s.replace(/_/g, ' ').toUpperCase()}\n${SECTION_RULES[s]}`)
    .join('\n\n');

  const qualityGatesBlock = QUALITY_GATES
    .map((gate, i) => `${i + 1}. **${gate.name}** — ${gate.description}\n   Pass: ${gate.pass_criterion}`)
    .join('\n\n');

  return `# Executive Resume Writing Rulebook

## Document Format
- ${DOCUMENT_FORMAT.page_guidance}
- Layout: ${DOCUMENT_FORMAT.layout} — ${DOCUMENT_FORMAT.graphics}
- Fonts: ${DOCUMENT_FORMAT.fonts}
- Primary export: ${DOCUMENT_FORMAT.primary_export}
- Headings: ${DOCUMENT_FORMAT.headings}

## Section Order
${SECTION_ORDER.map((s, i) => `${i + 1}. ${s.replace(/_/g, ' ')}`).join('\n')}

## Section Rules

${sectionRulesBlock}

${WRITING_RULES}

${ATS_RULES}

${AGE_PROOFING_RULES}

${GUARDRAILS}

## 10 Quality Gates — Self-Check Before Output

Before finalizing the resume, verify every gate passes:

${qualityGatesBlock}`;
}
