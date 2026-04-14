/**
 * Agent 6: Resume Writer
 *
 * Single powerful prompt that produces a COMPLETE resume (typically 2-3 pages).
 * Not a tool-calling loop. Not section-by-section. One pass, full document.
 *
 * The agent has creative authority within the strategic guardrails set by
 * the Narrative Strategy agent. It writes like a $3,000 executive resume writer.
 *
 * Model: MODEL_PRIMARY
 */

import { runSectionBySection } from './section-writer.js';
import logger from '../../../lib/logger.js';
import { BANNED_PHRASES, getResumeRulesPrompt, SOURCE_DISCIPLINE } from '../knowledge/resume-rules.js';
import { getAuthoritativeSourceExperience } from '../source-resume-outline.js';
import { applySectionPlanning, buildWriterSectionStrategy } from '../section-planning.js';
import type {
  ResumeWriterInput,
  ResumeDraftOutput,
  ResumeBullet,
  RequirementGap,
  RequirementSource,
  CandidateExperience,
  BulletSource,
  BulletConfidence,
  ProofLevel,
  FramingGuardrail,
  NextBestAction,
  RequirementWorkItem,
  ResumePriorityTarget,
  ResumeContentOrigin,
  ResumeReviewState,
  ResumeSupportOrigin,
} from '../types.js';

const loggedFuzzyExperienceFramingMatches = new Set<string>();
const BRACKET_PLACEHOLDER_PATTERN = /\[[^\]]{2,80}\]\s*:?\s*/g;
const PROMPT_EXAMPLE_LEAKAGE_MARKERS = [
  'eagle ford shale',
  'delaware basin',
  'bha failures',
  'insulated drill pipe',
  'drilling fluid program',
  'well completions',
];
const DISPLAY_BANNED_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bspearheaded\b/gi, 'Led'],
];
const PROOF_SIGNAL_STOPWORDS = new Set([
  'about',
  'across',
  'after',
  'along',
  'among',
  'around',
  'before',
  'below',
  'built',
  'could',
  'during',
  'drove',
  'every',
  'focus',
  'from',
  'improved',
  'including',
  'into',
  'launched',
  'led',
  'managed',
  'over',
  'through',
  'throughout',
  'under',
  'using',
  'with',
  'within',
]);

const JSON_OUTPUT_GUARDRAILS = `CRITICAL JSON RULES:
- Return exactly one JSON object.
- The first character of your response must be { and the last character must be }.
- Use double-quoted JSON keys and string values.
- Do not wrap the JSON in markdown fences.
- Do not add introductions like "Here is the complete resume" or any other prose outside the JSON object.
- Keep field values concise and resume-ready.`;

const _SYSTEM_PROMPT = `You are an expert executive resume writer producing a COMPLETE, tailored resume. You write like a $3,000 executive resume writer who has placed hundreds of VPs and C-suite leaders.

## YOUR NORTH STAR

The Why Me story is not a reference document — it is your north star. Every section of this resume must reinforce the narrative arc it establishes. A hiring manager who reads the resume cover to cover should feel the same cumulative story as someone who reads the Why Me story. If a section feels disconnected from the narrative, reframe it.

## YOUR VOICE — How Real Executive Resumes Sound

You write like a senior executive's trusted ghostwriter — someone who has sat across from 500 VP/C-suite candidates and knows how they actually talk about their work.

REAL EXECUTIVE VOICE sounds like this:
- "Inherited a division losing $2M per quarter. Rebuilt the P&L model, renegotiated three supplier contracts, and closed the gap within two quarters."
- "Built the analytics function from zero — hired 6 data scientists, stood up the Snowflake environment, and delivered the first executive dashboard within 90 days."
- "Took over a 40-person ops team with 23% turnover. Introduced structured mentoring and quarterly stretch assignments. Turnover dropped to 9% within 18 months."

AI/CORPORATE VOICE sounds like this (NEVER write this way):
- "Spearheaded transformational operational excellence initiatives, driving significant improvements across the enterprise."
- "Leveraged cross-functional collaboration to deliver innovative solutions that enhanced stakeholder engagement."
- "Seasoned leader with a proven track record of driving results in dynamic, fast-paced environments."
- "Championed a culture of continuous improvement, fostering strategic partnerships and ensuring seamless execution."

The difference: REAL voice has a SPECIFIC person doing a SPECIFIC thing with a SPECIFIC result. AI voice has a generic person doing generic things with generic outcomes.

EVERY BULLET you write must pass the PERSON TEST: Could you picture a specific human being describing this work to you over coffee? If it sounds like a LinkedIn AI summary generator, rewrite it until it sounds like a real person talking about real work.

## YOUR STRATEGIC GUARDRAILS

- The Narrative Strategy provides your strategic direction — follow it with discipline
- The Gap Analysis tells you what to emphasize and how to position gaps
- The gap_positioning_map (when provided) tells you WHERE to surface gap strategies and how to justify them narratively — use it
- Every claim must trace to the source resume. When uncertain, use the candidate's exact words rather than paraphrasing.
- Mark ALL AI-enhanced content with is_new: true (content not directly from original resume)

## STEP ZERO — HEAR THE CANDIDATE'S VOICE

Before writing any section, study the candidate's original resume text. Find:
1. Their natural terminology — industry jargon, methodology names, tools they actually use
2. Their strongest self-descriptions — phrases where they sound most confident and specific
3. Their metrics language — how they naturally express scale (team sizes, budgets, outcomes)

Anchor your writing in THEIR vocabulary. If they say "plant floor," don't upgrade it to "manufacturing facility." If they say "cut costs," don't inflate it to "optimized expenditure allocation." Their words are authentic. Yours are not.

## EXECUTIVE SUMMARY — READ THIS FIRST

CRITICAL — the executive summary is the first thing a hiring manager reads. Get it right or lose the reader.

STRUCTURE (follow this order exactly):
1. FIRST SENTENCE: "[Title/Identity] with [X] years of experience [doing what they do best]." — establishes who they are. Open with identity — who they are, then prove it with metrics in sentence 2.
2. SECOND SENTENCE: The core capability pattern — what they consistently deliver across roles.
3. REMAINING SENTENCES: Key proof points (metrics, scope, outcomes) that back up sentences 1 and 2.
4. FINAL SENTENCE (optional): Forward-looking positioning for the target role.

RULES:
- Open with identity — who they are as a professional. A metric or dollar figure belongs in sentence 2 or later as proof.
- Open the summary with a positioning statement, not a duty. "Lead a team of 14 engineers..." belongs in experience, not here.
- Write in third-person implied voice (no I/my/we/our). "Consistently delivers..." not "I consistently deliver..."
- Each title in the opening line must connect naturally: "Cloud Infrastructure Architect and Engineering Leader" — not two titles jammed together without punctuation.
- Read every sentence aloud before including it. If it doesn't parse when spoken, rewrite it.
- Let accomplishments speak for themselves — remove self-assessments like "making me an ideal candidate" or "uniquely positioned."
- Write a summary that works across multiple applications — no company names, no role-specific references that only fit one job.
- Replace vague filler with specific proof. Instead of "Results-driven leader," write what the results actually were.
- Every sentence must be grammatically correct. Proofread for missing punctuation, doubled nouns, and awkward phrasing.
- The summary should sound like it was written by the candidate, not about them.

BAD EXAMPLE (every rule violation in one paragraph):
"Lead a team of 14 infrastructure and DevOps engineers supporting 200+ microservices. I possess a unique combination of technical expertise and leadership experience, making me an ideal candidate for this role. I have reduced hosting costs by 35%."
Problems: Opens with duty not identity. Uses first person "I possess/I have." Says "ideal candidate" (self-assessment filler). Reads like a bullet list, not a positioning statement.

GOOD EXAMPLE:
"Cloud Infrastructure Architect with 12 years of experience designing, scaling, and securing enterprise platforms across hybrid and multi-cloud environments. Consistently delivers cost optimization at scale — most recently driving 35% hosting cost reduction through a 60+ application cloud migration while maintaining 99.95% availability. Combines deep AWS and Kubernetes expertise with cross-functional leadership of 14-person engineering teams supporting 200+ microservices."

${getResumeRulesPrompt()}

## CONTENT DECISIONS

For each bullet on the original resume, assess its quality and decide:

- PRESERVE — bullet is already strong: specific metrics, clear impact, directly relevant. Take it near-verbatim with minor polish only.
- ENHANCE — core achievement is solid but needs stronger action verb, an added metric, or tighter framing. Improve without losing the candidate's voice.
- REWRITE — bullet is duty-focused, vague, metric-free, or uses passive/banned language. Transform it into an impact statement.
- CUT — bullet is completely irrelevant to the target role AND does not fill an employment gap. Remove it.

The goal is surgical improvement, not wholesale replacement. Preserve everything that is already working.

## POSITION DECISIONS

Bullet count is governed by JD-relevance and available evidence — not by minimums or arbitrary targets:

- Most recent / highest-relevance position: write as many bullets as strong evidence supports. A useful ceiling is approximately 1-2 bullets per year held in the role.
- Other recent relevant positions: proportional detail based on available strong evidence
- Recent but less relevant: fewer bullets, reframe explicitly for transferable skills
- Older but highly relevant (10-15 years): only the strongest accomplishments
- 15-20 years ago: brief; scope statement if the role was senior
- 20+ years ago: move to "Additional Work Experience" ONLY when the role is both old and low relevance to the current target. Keep older relevant roles detailed.
- NEVER remove a position that would create an employment gap greater than 6 months
- NEVER drop ANY position from the candidate's experience. Every single position must appear either in professional_experience (with bullets) or in earlier_career (title/company only for old, low-relevance roles). Count the input positions and verify your output has the same total count.
- Do not produce fewer bullets than the original resume had for a role that stays in professional_experience. If the source role has 4 bullets, preserve 4 distinct proof points unless one rewritten bullet clearly preserves multiple source bullets. You are here to improve, not shrink.

## CORE COMPETENCIES

- Group competencies to reinforce the narrative themes, not as a keyword dump
- Use the competency_themes from the Narrative Strategy to create meaningful clusters
- The grouping should reflect the candidate's unique combination — the thing that makes them the benchmark
- Use exact JD phrases wherever possible — this section is the primary ATS keyword magnet

## EXPERIENCE BULLETS

- Before writing each bullet, ask: "Does this reinforce why this person is THE candidate for this role?"
- If a bullet does not reinforce the narrative, reframe it so it does — without fabricating
- Every bullet must show agency, scale, and impact — not just activity
- If the gap_positioning_map specifies where to surface a gap strategy, execute it in that role's bullets

## EVIDENCE EXCLUSIVITY — NO CROSS-SECTION REPETITION

This is a HARD RULE. The same evidence, accomplishment, or proof point MUST NOT appear in more than one section of the resume.

RULES:
1. Once a proof point is used in SELECTED ACCOMPLISHMENTS, it MUST NOT appear as a bullet in Professional Experience or any custom section. The Professional Experience entry for that role should reference different achievements.
2. Custom sections (AI Leadership, Transformation Highlights, Selected Projects, etc.) must contain UNIQUE proof not already featured in Selected Accomplishments or Professional Experience bullets.
3. If two custom sections would draw from the same evidence pool, MERGE them into one section or DROP the weaker one. Two thin sections that repeat each other are worse than one strong section.
4. If the evidence pool for a custom section is too thin to fill it without repeating content from other sections, DO NOT include that custom section. Omit it entirely.
5. Professional Experience bullets should NOT echo the same phrasing as Selected Accomplishments. If a top achievement appears in Selected Accomplishments, the corresponding role in Professional Experience should highlight DIFFERENT accomplishments from that role.

SELF-CHECK: Before finalizing output, scan every line in every section. If any accomplishment, metric, or phrasing appears in more than one section — rewrite or remove the duplicate.

## VOICE GUIDANCE

Preserve the candidate's authentic domain language when it is already strong.
"Architected a new customer onboarding system" stays — do not genericize to "Designed a system."
"Negotiated a $4.2M multi-year contract" stays — do not soften to "Led contract negotiations."
Rewrite only what NEEDS improvement. Genuine expertise expressed in the candidate's own words is more credible than polished resume-speak.
Preserve dollar amounts, percentages, temperatures, county names, team sizes, rig counts, and any other concrete specifics. These are the proof. Generic rewrites destroy credibility.

## PROVENANCE RULE

Every specific detail — dollar amounts, percentages, headcounts, locations, product names, client names — must come from the original resume or explicit user-provided context. Never substitute a plausible-sounding number for a real one. When inferring scope (e.g., budget from team size), back off 10-20% from the math and flag with "~" or "up to." Mark all inferred or enhanced content as is_new: true.

## ULTIMATE RESUME MODE

You are generating the BEST POSSIBLE resume that addresses ALL requirements. For each bullet you write:

1. **Strong evidence exists**: Use the candidate's actual experience. Set source='original' or 'enhanced', confidence='strong'.
2. **Partial evidence exists**: Strengthen and position the adjacent experience. Set source='enhanced', confidence='partial'.
3. **No evidence found**: Do NOT write a bullet for this requirement. Mark it as unaddressed. If the candidate genuinely has no relevant experience for a requirement, it is better to leave it out than to fabricate positioning. Set confidence='gap_unaddressed'. The gap will be surfaced to the user for their input.
4. **Benchmark aspiration**: Include top benchmark items where evidence exists. Set requirement_source='benchmark'.

For EVERY bullet in selected_accomplishments and professional_experience, include:
- source: 'original' | 'enhanced' | 'drafted'
- confidence: 'strong' | 'partial' | 'needs_validation'
- addresses_requirements: which requirement(s) this bullet covers
- requirement_source: 'job_description' | 'benchmark' (if addressing a specific requirement)
- evidence_found: quote from original resume if applicable (empty string if none)

For SELECTED ACCOMPLISHMENTS specifically:
- only feature 3-4 spectacular, supportable proof points from the candidate
- target accomplishment-worthy job needs, not screening requirements like degree, certifications, or years thresholds
- each line must have one primary target requirement, not a bundle of unrelated needs
- include target_evidence that directly supports that primary target

For EVERY scope_statement in professional_experience, include:
- scope_statement_source: 'original' | 'enhanced' | 'drafted'
- scope_statement_confidence: 'strong' | 'partial' | 'needs_validation'
- scope_statement_evidence_found: quote from original resume if applicable (empty string if none)

Scope statements must read as natural sentences about the role's scale — NEVER start with labels like "Brief scope:", "Scope:", "Team:", or "Budget:". Write it as a sentence a human would say: "Oversaw 22-person product team across North America and EMEA with $8M operating budget."

CRITICAL: The resume must address ALL job description requirements. For benchmark items, include the top 5-8 where evidence is strongest.

## LANGUAGE GUIDE — REPLACE ABSTRACT WITH CONCRETE

These phrases are fingerprints of AI-generated content. The downstream tone agent will flag every one. More importantly, they destroy credibility with hiring managers who read hundreds of resumes.

BANNED VERBS (overused by every AI resume tool):
- "Spearheaded" / "Championed" / "Orchestrated" / "Fostered" / "Pioneered"

BANNED PATTERNS:
- "Driving [noun]" / "Ensuring [noun]" / "Fostering [noun]" (gerund + abstract noun = AI fingerprint)
- "Cross-functional collaboration" / "Stakeholder engagement" / "Strategic alignment"
- "Demonstrated expertise in" / "Brings a unique combination of" / "Proven ability to"
- "Transformational" / "Innovative solutions" / "Best-in-class" / "World-class"
- "End-to-end" / "Holistic" / "Robust" / "Cutting-edge" / "Operational excellence"
- Any sentence where removing the subject still makes sense to anyone — it is too generic

The fix is always the same: find the specific person, action, number, or outcome hiding behind the corporate language and write that instead.

Instead of:                                         Write:
"Spearheaded transformation"                    →   "Turned around the $12M product line"
"Leveraged data-driven insights"                →   "Used Tableau to identify 3 cost bottlenecks"
"Drove cross-functional alignment"              →   "Got engineering, sales, and ops on one roadmap"
"Championed a culture of innovation"            →   "Hired 4 engineers and shipped 3 new features in Q1"
"Fostered strategic partnerships"               →   "Signed 3 distribution deals worth $8M ARR"
"Ensuring seamless execution"                   →   "Hit every milestone for 6 straight quarters"
"Demonstrated expertise in X"                   →   [DELETE — show the expertise through proof]
"Passionate about Y"                            →   [DELETE — passion is shown through action, not stated]
"Results-driven leader with a proven track record"  →   "Cut $18M in manufacturing waste through Lean transformation"

PREFERRED VERBS (concrete, specific, human):
Built, Grew, Cut, Launched, Designed, Negotiated, Reduced, Expanded, Closed, Fixed, Hired, Shipped, Opened, Restructured, Merged, Won, Saved, Automated, Standardized, Eliminated, Inherited, Turned around, Took over, Stood up, Shut down, Consolidated, Renegotiated

## BEFORE YOU OUTPUT — SELF-CRITIQUE

After writing each section, pause and evaluate it against these four tests:

1. READ IT ALOUD TEST: Mentally read each sentence. Does it sound like a person talking, or a template filling in blanks? If it sounds like a template, rewrite it.

2. COFFEE TEST: Could the candidate say this sentence to a colleague over coffee and have it sound natural? "I inherited a team with 23% turnover and fixed it" = yes. "I spearheaded transformational talent retention initiatives" = no.

3. SPECIFICITY TEST: Point to ONE specific thing in every sentence — a number, a company name, a methodology, a timeline. If you cannot point to something specific, the sentence is too vague to include.

4. STEAL TEST: Could this sentence appear unchanged on any other executive's resume? If yes, it is generic. Add something only THIS candidate could say — their team size, their specific method, their actual outcome.

If any sentence fails 2 or more of these tests, rewrite it before including it in your output.

## 10 QUALITY GATES — CHECK BEFORE OUTPUT

Run this self-check before finalizing the JSON. Every gate must pass:

1. SCOPE TEST — Does every role with meaningful responsibility have a scope statement (team size, budget, geography, P&L)?
2. METRIC TEST — Do bullets include metrics where the source provides them? Never invent a number to meet a quota.
3. RELEVANCE TEST — Can every bullet, accomplishment, and competency answer: "Why does this matter for THIS role?"
4. ALTITUDE TEST — Does the language, scope, and framing match the seniority level being targeted? Zero task-completion bullets.
5. CLICHE TEST — Zero instances of: "responsible for," "proven leader," "results-oriented," "team player," and all other banned phrases.
6. LENGTH TEST — Is the resume the right length? Target 2 pages for executives. 3 only for C-suite with 20+ years. No padding. No truncation of quality content.
7. RECENCY TEST — Do the most recent 1-2 roles have the most bullets? Do older roles taper proportionally?
8. ATS TEST — Do the top 10 JD keywords each appear at least once? Do the top 5 appear in 2+ sections?
9. SO-WHAT TEST — Zero pure-activity bullets. Every bullet has a result, outcome, or demonstrated impact.
10. AGE-PROOF TEST — No graduation years for degrees 20+ years old. No "30 years of experience." No obsolete tech. No objective statement.

## THE STORY BEHIND THE METRIC

Every major bullet should answer THREE questions, not just one:
1. What was broken or challenging? (the before-state)
2. What did this person do — and HOW? (through people, creativity, process)
3. What became possible? (not just the metric — the transformation)

BAD: "Reduced manufacturing defects by 34%, saving $2.1M annually"
GOOD: "Inherited quality-plagued operation averaging 12% defect rate. Diagnosed root cause: technicians didn't understand the economics of their errors. Launched peer-led quality circles where each team member tracked their own defect-to-cost chain. Defect rate dropped to 7.9% within 6 months — $2.1M in annual savings driven by ownership, not mandates."

The metric matters. But the HOW matters more. Show process discipline, not just outcomes.

## LEADERSHIP THROUGH PEOPLE, NOT JUST SCOPE

"Managed a team of 40" tells me nothing. Show me:
- Who did you develop into leaders? ("Promoted 7 direct reports, 4 to director level")
- How did you empower people? ("Created decision framework empowering regional managers to approve up to $500K spend — decision time from 8 weeks to 1 week")
- How did you grow the team's capability? ("Built team from 4 to 18, established career paths yielding 60% internal promotion rate")
- Did you delegate authority, not just tasks? Show trust.

The best leaders are measured by what their people accomplished, not by team headcount.

## ACCOUNTABILITY AND STANDARDS

Real leaders set standards and hold to them — including themselves.
- Show how standards were set and enforced, not just results achieved
- Include at least one controlled setback-and-recovery per resume: "Q2 adoption stalled at 35%. Conducted root cause analysis within 48 hours. Discovered onboarding friction. Redesigned UX flow + launched peer coaching. Adoption reached 72% by Q4."
- This proves resilience, not perfection. Hiring managers trust people who face failure data calmly and act fast.

## ADAPTABILITY — PROVE YOU'RE NOT STUCK

For candidates with 15+ years of experience, EVERY resume must show at least one moment of deliberate adaptation:
- Technology shift adopted ("Led migration from on-prem to cloud-native architecture")
- Methodology evolved ("Transitioned team from waterfall to agile, then to continuous delivery")
- Strategy pivoted based on data ("Market data showed channel shift; retooled from direct sales to partner-led model, growing channel revenue from 12% to 48% of total")

This directly counters "set in their ways" perception. It proves the candidate learns, adapts, and evolves.

## THE PROCESS — SHOW YOUR WORK

Don't just show what was accomplished. Show the deliberate process:
- What preparation happened before acting?
- What methodology was followed?
- What was the sequence and why?

"Before launching the turnaround, spent 6 weeks auditing expense allocation across 23 cost centers. Identified $4.2M in misclassified spend. Developed zero-based budget framework. Cut overhead 18% sustainably — not through cuts, through clarity."

Hiring managers hire process discipline, not luck. The separation is in the preparation.

CRITICAL is_new RULES:
1. is_new = true for ANY content you wrote, rephrased, or enhanced beyond the original resume
2. is_new = false ONLY for content taken verbatim or near-verbatim from the original
3. Contact info comes from the Candidate Intelligence — use the ACTUAL name, never a placeholder
4. No graduation dates for candidates 45+ (career span > 20 years)
5. If the job has an explicit years-of-experience threshold and the candidate clearly meets it, state that years count explicitly in the executive summary.

OUTPUT FORMAT: Return valid JSON matching this exact structure:
{
  "header": {
    "name": "candidate's actual name",
    "phone": "phone number",
    "email": "email address",
    "linkedin": "LinkedIn URL if available",
    "branded_title": "branded title from Narrative Strategy"
  },
  "executive_summary": {
    "content": "3-5 sentence executive summary. Brand statement + target role + 2-3 quantified accomplishments.",
    "is_new": true
  },
  "core_competencies": ["12-18 skills mirroring exact JD keywords, grouped by category"],
  "selected_accomplishments": [
    {
      "content": "Strong Action Verb + What You Did (with context) + Measurable Result",
      "is_new": false,
      "addresses_requirements": ["which JD requirements this addresses"],
      "primary_target_requirement": "single JD need this line is primarily proving",
      "primary_target_source": "job_description",
      "target_evidence": "proof from the original resume that supports that primary target",
      "source": "original",
      "requirement_source": "job_description",
      "evidence_found": "quote from original resume or empty string",
      "confidence": "strong"
    }
  ],
  "professional_experience": [
    {
      "company": "Company Name",
      "title": "Job Title",
      "start_date": "Start",
      "end_date": "End",
      "scope_statement": "Oversaw 22-person product team across North America and EMEA with $8M operating budget",
      "scope_statement_source": "original",
      "scope_statement_confidence": "strong",
      "scope_statement_evidence_found": "quote from original resume or empty string",
      "bullets": [
        {
          "text": "Strong action verb + context + quantified result",
          "is_new": false,
          "addresses_requirements": ["requirement1"],
          "source": "original",
          "requirement_source": "job_description",
          "evidence_found": "quote from original resume or empty string",
          "confidence": "strong"
        }
      ]
    }
  ],
  "technical_skills": ["grouped domain-specific tools and technologies — omit section if not relevant"],
  "earlier_career": [
    {"company": "Company", "title": "Title", "dates": ""}
  ],
  "education": [
    {"degree": "Degree", "institution": "School", "year": "only if <20 years ago"}
  ],
  "certifications": ["active, relevant certifications only — omit expired or unrelated"],
  "custom_sections": [
    {
      "id": "ai_highlights",
      "title": "AI Leadership & Transformation",
      "kind": "bullet_list",
      "summary": "optional short framing sentence",
      "lines": ["grounded proof line 1", "grounded proof line 2"],
      "source": "job_match",
      "recommended_for_job": true,
      "rationale": "why this section belongs in this resume"
    }
  ],
  "section_plan": [
    {
      "id": "executive_summary",
      "type": "executive_summary",
      "title": "Executive Summary",
      "enabled": true,
      "order": 0,
      "source": "default",
      "is_custom": false
    }
  ]
}

OUTPUT: Write the COMPLETE resume as a JSON object matching the schema above.
Include ALL sections that have data. Do not truncate. This is a finished document, not an outline.
When the section strategy clearly recommends a grounded custom section, include it in custom_sections and reflect the intended order in section_plan.
CRITICAL — EVERY position from the candidate's experience MUST appear in the output.
Recent positions go in professional_experience with full bullets. Older positions stay in professional_experience when they still prove the target role; move them to earlier_career only when they are both old and low relevance.
NEVER omit a position to save space. A 2-page target is a guideline, not a hard limit — include all roles even if that means 3 pages.

${SOURCE_DISCIPLINE}

${JSON_OUTPUT_GUARDRAILS}`;

export async function runResumeWriter(
  input: ResumeWriterInput,
  signal?: AbortSignal,
): Promise<ResumeDraftOutput> {
  const selectedAccomplishmentTargets = deriveSelectedAccomplishmentTargets(input);

  // Section-by-section writing: 5 focused LLM calls instead of one massive 32K-token pass.
  // Each call gets section-specific rules and explicit cross-section evidence tracking.
  // Falls back to deterministic per-section if any individual call fails.
  let parsed = await runSectionBySection(input, signal);

  // NOTE: ensureSatisfiedYearsThresholdVisible and ensureStrongestProofVisible were removed.
  // They were designed for the old single-pass writer where the LLM often returned incomplete summaries.
  // With section-by-section writing, the summary prompt constructs an identity-first opener that
  // already includes career span years, and instructs the LLM to include proof in follow-up sentences.
  // The old guardrails PREPENDED content before the identity opener, destroying the structure.

  // Guardrail: ensure contact info is from candidate, not a placeholder
  if (!parsed.header?.name || parsed.header.name.toLowerCase().includes('john doe')) {
    parsed.header = {
      ...parsed.header,
      name: input.candidate.contact.name,
      phone: input.candidate.contact.phone,
      email: input.candidate.contact.email,
      linkedin: input.candidate.contact.linkedin,
      branded_title: parsed.header?.branded_title ?? input.narrative.branded_title,
    };
  }

  parsed.education = preserveCandidateEducationDetail(parsed.education, input.candidate.education ?? []);

  // Guardrail: ensure ALL candidate positions appear in the output.
  // If the LLM dropped positions, backfill them to prevent truncation.
  parsed = ensureAllPositionsPresent(parsed, input);

  // Guardrail: if the model collapsed an older-but-relevant role into earlier_career,
  // move it back into detailed professional experience with bullets.
  parsed = ensureRelevantPositionsRemainDetailed(parsed, input);

  // Guardrail: backfill bullets when the LLM wrote fewer than the original resume had.
  // The prompt says "Do not produce fewer bullets than the original" but LLMs don't always follow.
  parsed = ensureMinimumBulletCounts(parsed, input);

  // Guardrail: ensure EVERY bullet has confidence metadata for frontend color coding.
  // The LLM frequently omits optional fields — this guarantees them.
  // Pass input so we can look up requirement_source from gap_analysis.
  parsed = ensureBulletMetadata(parsed, input);
  // Guardrail: back-fill any missing or "undefined" date strings from source resume.
  parsed = ensureDatePopulation(parsed, input);
  // Guardrail: drop exact and near-duplicate bullets within each role.
  parsed = deduplicateWithinRole(parsed);
  // Guardrail: vary opening verbs when the same verb appears 3+ times in one role.
  parsed = varyOpeningVerbs(parsed);
  parsed.selected_accomplishment_targets = mergeSelectedAccomplishmentTargets(
    parsed.selected_accomplishment_targets,
    selectedAccomplishmentTargets,
  );

  // FINAL PASS: deterministic validation and annotation.
  // This layer fills blanks and flags risky lines, but it must not silently
  // redefine valid agent-owned priority or placement decisions.
  parsed = deterministicRequirementMatch(
    parsed,
    getAuthoritativeSourceExperience(input.candidate),
    input.gap_analysis.requirements,
    selectedAccomplishmentTargets,
  );
  parsed = applySectionPlanning(parsed, input.candidate, input.gap_analysis);
  parsed = sanitizeDraftForDisplay(parsed, input);

  // Log review-state distribution summary
  const reviewStateCounts = {
    supported: 0,
    supported_rewrite: 0,
    strengthen: 0,
    confirm_fit: 0,
    code_red: 0,
  };
  for (const a of parsed.selected_accomplishments ?? []) {
    const reviewState = a.review_state ?? inferReviewState({
      confidence: a.confidence,
      requirementSource: a.requirement_source,
      contentOrigin: a.content_origin,
      primaryTargetRequirement: a.primary_target_requirement,
      targetEvidence: a.target_evidence,
    });
    reviewStateCounts[reviewState]++;
  }
  for (const exp of parsed.professional_experience ?? []) {
    for (const b of exp.bullets ?? []) {
      const reviewState = b.review_state ?? inferReviewState({
        confidence: b.confidence,
        requirementSource: b.requirement_source,
        contentOrigin: b.content_origin,
        primaryTargetRequirement: b.primary_target_requirement,
        targetEvidence: b.target_evidence,
      });
      reviewStateCounts[reviewState]++;
    }
  }
  logger.info({ reviewStateCounts }, 'Resume Writer: deterministic review-state distribution');


  return parsed;
}

function sanitizeDraftForDisplay(
  draft: ResumeDraftOutput,
  input: ResumeWriterInput,
): ResumeDraftOutput {
  const sourceCorpus = buildDraftSafetySourceCorpus(input);
  const fallback = buildDeterministicResumeDraft(input);
  let sanitizedFieldCount = 0;

  const sanitizeField = (value: string, fallbackValue: string): string => {
    const stripped = sanitizeDisplayText(value);
    const fallbackText = sanitizeDisplayText(fallbackValue);
    if (!stripped) {
      if (value.trim()) sanitizedFieldCount += 1;
      return fallbackText;
    }
    // Prompt example leakage is a hard replace — the entire content is contaminated
    if (containsPromptExampleLeakage(stripped, sourceCorpus)) {
      sanitizedFieldCount += 1;
      return fallbackText;
    }
    // Banned display phrases: strip just the offending phrase, don't replace the entire field.
    // The old behavior nuked well-crafted LLM content because one word was banned.
    let cleaned = stripped;
    for (const phrase of BANNED_PHRASES) {
      if (cleaned.toLowerCase().includes(phrase)) {
        sanitizedFieldCount += 1;
        cleaned = cleaned.replace(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '').replace(/\s+/g, ' ').trim();
      }
    }
    // Clean up orphaned articles/prepositions left behind by phrase stripping.
    // e.g. "A initiative delivering..." → "An initiative delivering..."
    cleaned = cleaned
      .replace(/\b(a|an|the)\s+(a|an|the)\b/gi, '$1') // doubled articles
      .replace(/\b(a)\s+([aeiou])/gi, 'an $2') // a → an before vowel
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (cleaned !== value.trim()) {
      sanitizedFieldCount += 1;
    }
    return cleaned || fallbackText;
  };

  const sanitized: ResumeDraftOutput = {
    ...draft,
    executive_summary: {
      ...draft.executive_summary,
      content: sanitizeField(
        draft.executive_summary.content,
        fallback.executive_summary.content,
      ),
    },
    core_competencies: draft.core_competencies
      .map((item, index) => shortenCompetencyPhrase(sanitizeField(item, fallback.core_competencies[index] ?? item)))
      .filter((item) => {
        if (item.length === 0) return false;
        return competencyMatchesSource(item, sourceCorpus);
      })
      .slice(0, 18),
    selected_accomplishments: draft.selected_accomplishments.map((item, index) => ({
      ...item,
      content: sanitizeField(
        item.content,
        fallback.selected_accomplishments[index]?.content ?? item.content,
      ),
    })),
    professional_experience: draft.professional_experience.map((experience, experienceIndex) => ({
      ...experience,
      scope_statement: sanitizeField(
        experience.scope_statement,
        fallback.professional_experience[experienceIndex]?.scope_statement ?? experience.scope_statement,
      ),
      bullets: experience.bullets.map((bullet, bulletIndex) => ({
        ...bullet,
        text: sanitizeField(
          bullet.text,
          fallback.professional_experience[experienceIndex]?.bullets[bulletIndex]?.text ?? bullet.text,
        ),
      })),
    })),
    custom_sections: draft.custom_sections?.map((section) => ({
      ...section,
      summary: section.summary
        ? sanitizeField(section.summary, section.summary.replace(BRACKET_PLACEHOLDER_PATTERN, '').trim())
        : section.summary,
      lines: section.lines
        .map((line) => sanitizeField(line, line.replace(BRACKET_PLACEHOLDER_PATTERN, '').trim()))
        .filter((line) => line.length > 0),
    })),
  };

  if (sanitizedFieldCount > 0) {
    logger.warn(
      { sanitizedFieldCount },
      'Resume Writer: sanitized placeholder/example leakage from draft before returning it to the client',
    );
  }

  return sanitized;
}

function shortenCompetencyPhrase(value: string): string {
  const cleaned = value
    .replace(/[|•]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b(?:through|via|across|for|using|within)\b.*$/i, '')
    .replace(/[,:;]+$/g, '')
    .trim();

  if (!cleaned) return '';
  const words = cleaned.split(/\s+/);
  if (words.length > 6) return words.slice(0, 6).join(' ');
  return cleaned;
}

function competencyMatchesSource(phrase: string, sourceCorpus: string): boolean {
  const normalizedPhrase = shortenCompetencyPhrase(phrase).toLowerCase();
  if (!normalizedPhrase) return false;

  const sourceTokens = new Set(sourceCorpus.split(/\s+/).filter(Boolean));
  if (sourceCorpus.includes(normalizedPhrase)) return true;

  const tokens = normalizedPhrase.split(/\s+/).filter((token) => token.length > 3);
  if (tokens.length === 0) return false;
  return tokens.every((token) => sourceTokens.has(token));
}

function buildDraftSafetySourceCorpus(input: ResumeWriterInput): string {
  return [
    input.candidate.raw_text,
    input.candidate.contact.name,
    input.candidate.contact.email,
    input.candidate.contact.phone,
    input.candidate.contact.linkedin,
    input.candidate.contact.location,
    input.candidate.leadership_scope,
    input.candidate.operational_scale,
    ...(input.candidate.career_themes ?? []),
    ...(input.candidate.industry_depth ?? []),
    ...(input.candidate.technologies ?? []),
    ...(input.candidate.hidden_accomplishments ?? []),
    ...getAuthoritativeSourceExperience(input.candidate).flatMap((experience) => [
      experience.company,
      experience.title,
      experience.start_date,
      experience.end_date,
      ...(experience.bullets ?? []),
    ]),
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join('\n')
    .toLowerCase();
}

function containsPromptExampleLeakage(
  text: string,
  sourceCorpus: string,
): boolean {
  const normalized = text.toLowerCase();
  return PROMPT_EXAMPLE_LEAKAGE_MARKERS.some((marker) => (
    normalized.includes(marker) && !sourceCorpus.includes(marker)
  ));
}

function _containsBannedDisplayPhrase(text: string): boolean {
  const normalized = text.toLowerCase();
  return BANNED_PHRASES.some((phrase) => normalized.includes(phrase));
}

function sanitizeDisplayText(value: string): string {
  const stripped = value.replace(BRACKET_PLACEHOLDER_PATTERN, '').replace(/\s+/g, ' ').trim();
  if (!stripped) return '';

  const cleanedSentences = stripped
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => {
      const lower = sentence.toLowerCase();
      if (PROMPT_EXAMPLE_LEAKAGE_MARKERS.some((marker) => lower.includes(marker))) {
        return '';
      }

      let cleaned = sentence.trim();
      for (const [pattern, replacement] of DISPLAY_BANNED_REPLACEMENTS) {
        cleaned = cleaned.replace(pattern, replacement);
      }
      return cleaned.trim();
    })
    .filter((sentence) => sentence.length > 0);

  return cleanedSentences.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Looks up the experience framing for a company name using progressive fuzzy matching.
 * Tries: (1) exact match, (2) case-insensitive match, (3) one name includes the other.
 * Normalizes common "Title at Company" patterns first and logs fuzzy fallback only once.
 */
function lookupExperienceFraming(
  framingMap: Record<string, string>,
  companyName: string,
): string | undefined {
  const normalizedFramingMap = buildExperienceFramingAliasMap(framingMap);

  // 1. Exact match
  if (normalizedFramingMap[companyName] !== undefined) {
    return normalizedFramingMap[companyName];
  }

  const normalizedTarget = companyName.toLowerCase();

  for (const key of Object.keys(normalizedFramingMap)) {
    const normalizedKey = key.toLowerCase();

    // 2. Case-insensitive match
    if (normalizedKey === normalizedTarget) {
      logFuzzyExperienceFramingMatch('case-insensitive', companyName, key);
      return normalizedFramingMap[key];
    }

    // 3. Substring includes match (either direction)
    if (normalizedKey.includes(normalizedTarget) || normalizedTarget.includes(normalizedKey)) {
      logFuzzyExperienceFramingMatch('includes', companyName, key);
      return normalizedFramingMap[key];
    }
  }

  return undefined;
}

function buildExperienceFramingAliasMap(
  framingMap: Record<string, string>,
): Record<string, string> {
  const aliases: Record<string, string> = { ...framingMap };

  for (const [key, value] of Object.entries(framingMap)) {
    for (const alias of extractExperienceFramingAliases(key)) {
      if (aliases[alias] === undefined) {
        aliases[alias] = value;
      }
    }
  }

  return aliases;
}

function extractExperienceFramingAliases(key: string): string[] {
  const aliases = new Set<string>();
  const trimmed = key.trim();
  if (!trimmed) return [];

  aliases.add(trimmed);

  const companyAfterAt = trimmed.match(/\b(?:at|@)\s+(.+)$/i)?.[1]?.trim();
  if (companyAfterAt) {
    aliases.add(companyAfterAt);
  }

  const segments = trimmed.split(/\s+[|/]\s+|\s+[—–-]\s+/).map((segment) => segment.trim()).filter(Boolean);
  for (const segment of segments) {
    if (segment.length >= 3) aliases.add(segment);
  }

  return Array.from(aliases);
}

function logFuzzyExperienceFramingMatch(
  mode: 'case-insensitive' | 'includes',
  companyName: string,
  matchedKey: string,
): void {
  const dedupeKey = `${mode}::${companyName.toLowerCase()}::${matchedKey.toLowerCase()}`;
  if (loggedFuzzyExperienceFramingMatches.has(dedupeKey)) return;
  loggedFuzzyExperienceFramingMatches.add(dedupeKey);

  logger.debug(
    {
      match_mode: mode,
      resume_company: companyName,
      framing_key: matchedKey,
    },
    'Resume Writer: experience_framing used fuzzy match',
  );
}

function _buildUserMessage(input: ResumeWriterInput): string {
  const sourceExperience = getAuthoritativeSourceExperience(input.candidate);
  const competencyThemes = Array.isArray(input.narrative.section_guidance.competency_themes)
    ? input.narrative.section_guidance.competency_themes
    : [];
  const accomplishmentPriorities = Array.isArray(input.narrative.section_guidance.accomplishment_priorities)
    ? input.narrative.section_guidance.accomplishment_priorities
    : [];
  const experienceFraming = input.narrative.section_guidance.experience_framing
    && typeof input.narrative.section_guidance.experience_framing === 'object'
    ? input.narrative.section_guidance.experience_framing
    : {};
  const selectedAccomplishmentTargets = deriveSelectedAccomplishmentTargets(input);
  const sectionStrategy = buildWriterSectionStrategy(input.candidate, input.gap_analysis);

  const parts: string[] = [
    '## YOUR STRATEGIC DIRECTION',
    `Primary narrative: ${input.narrative.primary_narrative}`,
    `Branded title: ${input.narrative.branded_title}`,
    `Summary angle: ${input.narrative.section_guidance.summary_angle}`,
    `Competency themes: ${competencyThemes.join(', ')}`,
    `Accomplishment priorities: ${accomplishmentPriorities.join('; ')}`,
    '',
  ];

  parts.push(
    '## SECTION STRATEGY',
    ...sectionStrategy.guidance_lines.map((line) => `- ${line}`),
    '',
  );

  if (sectionStrategy.recommended_custom_sections.length > 0) {
    parts.push('## RECOMMENDED CUSTOM SECTIONS');
    for (const section of sectionStrategy.recommended_custom_sections) {
      parts.push(
        `- ${section.title} (${section.id})`,
        `  Placement: before Core Competencies and Professional Experience when the evidence below is genuinely strong enough to stand alone.`,
        `  Why it belongs: ${section.rationale ?? 'Role-relevant proof should surface earlier.'}`,
      );
      if (section.summary?.trim()) {
        parts.push(`  Section summary: ${section.summary.trim()}`);
      }
      for (const line of section.lines.slice(0, 3)) {
        parts.push(`  Proof to reuse: ${line}`);
      }
    }
    parts.push('');
  }

  if (selectedAccomplishmentTargets.length > 0) {
    parts.push(
      '## SELECTED ACCOMPLISHMENTS — AGENT-OWNED PRIORITY TARGETS',
      'This section must directly prove these role priorities first. Do not drift into secondary needs unless the top priorities are already covered convincingly.',
      ...selectedAccomplishmentTargets.map((target, index) => (
        `${index + 1}. ${target.requirement} (${target.source === 'benchmark' ? 'benchmark signal' : 'job need'}; ${target.importance})${target.source_evidence ? ` — source evidence: ${target.source_evidence}` : ''}`
      )),
      '',
    );
  }

  if (input.career_profile) {
    parts.push(
      '## CAREER PROFILE',
      `Profile summary: ${input.career_profile.profile_summary}`,
      `Core strengths: ${input.career_profile.positioning.core_strengths.join(', ') || 'Not yet defined'}`,
      `Proof themes: ${input.career_profile.positioning.proof_themes.join(', ') || 'Not yet defined'}`,
      `Differentiators: ${input.career_profile.positioning.differentiators.join(', ') || 'Not yet defined'}`,
      `Constraints: ${input.career_profile.preferences.constraints.join(', ') || 'None recorded'}`,
      '',
    );
  }

  parts.push(
    '## CANDIDATE CONTACT INFO (use exactly)',
    `Name: ${input.candidate.contact.name}`,
    `Email: ${input.candidate.contact.email}`,
    `Phone: ${input.candidate.contact.phone}`,
    `LinkedIn: ${input.candidate.contact.linkedin ?? 'not provided'}`,
    `Location: ${input.candidate.contact.location ?? 'not provided'}`,
    '',
    `## CANDIDATE EXPERIENCE (source material — ${sourceExperience.length} positions total, ALL must appear in output)`,
  );

  const positionLayoutPlan = derivePositionLayoutPlan(input);

  for (const exp of sourceExperience) {
    const scope = exp.inferred_scope
      ? `\n  Scope: team=${exp.inferred_scope.team_size ?? '?'}, budget=${exp.inferred_scope.budget ?? '?'}, geo=${exp.inferred_scope.geography ?? '?'}`
      : '';
    parts.push(`\n### ${exp.title} at ${exp.company} (${exp.start_date}–${exp.end_date})${scope}`);
    for (const bullet of exp.bullets) {
      parts.push(`  - ${bullet}`);
    }
    parts.push(`  [DETAIL FLOOR: If this role stays in professional_experience, preserve at least ${exp.bullets.length} distinct bullet-level proof points.]`);
    parts.push("  [PROOF FLOOR: Preserve the role's concrete proof - metrics, named systems, site counts, geographies, product context, and other specifics. Improve the wording without genericizing the evidence.]");
    // Add experience framing from narrative strategy using fuzzy company name lookup.
    // The LLM may return slightly different company names (e.g. "Acme Corp" vs "Acme"),
    // so fall back through: exact → case-insensitive → substring-includes.
    const framing = lookupExperienceFraming(
      experienceFraming,
      exp.company,
    );
    if (framing) {
      parts.push(`  [FRAMING GUIDANCE: ${framing}]`);
    }
    const layoutPlan = positionLayoutPlan.get(normalizeCompanyKey(exp.company, exp.title));
    if (layoutPlan) {
      parts.push(`  [DETAIL GUIDANCE: ${layoutPlan.reason}]`);
    }
  }

  parts.push(
    '',
    `## CANDIDATE METRICS (quantified outcomes)`,
    ...input.candidate.quantified_outcomes.map(
      o => `- [${o.metric_type}] ${o.outcome}: ${o.value}`
    ),
    '',
    `Career span: ${input.candidate.career_span_years} years`,
    `Education: ${input.candidate.education.map(e => `${e.degree} from ${e.institution}${e.year ? ` (${e.year})` : ''}`).join('; ')}`,
    `Certifications: ${input.candidate.certifications.join(', ')}`,
    '',
  );

  if (input.candidate.technologies?.length) {
    parts.push('## Technologies & Tools');
    parts.push(input.candidate.technologies.join(', '));
    parts.push('');
  }

  if (input.candidate.industry_depth?.length) {
    parts.push('## Industry Depth');
    parts.push(input.candidate.industry_depth.join(', '));
    parts.push('');
  }

  parts.push(
    '## JOB KEYWORDS (ATS targets — weave naturally)',
    input.job_intelligence.language_keywords.join(', '),
    '',
  );

  if (input.job_intelligence.role_profile) {
    const rp = input.job_intelligence.role_profile;
    parts.push(
      '## ROLE PROFILE',
      `Function: ${rp.function} | Industry: ${rp.industry} | Scope: ${rp.scope}`,
      `Success: ${rp.success_definition}`,
      'Proof point priorities (allocate resume space in this order):',
      ...rp.proof_point_priorities.map((p, i) => `${i + 1}. ${p}`),
      'Cultural signals (use this language):',
      rp.cultural_signals.join(', '),
      '',
    );
  }

  parts.push('## GAP STRATEGIES (user-approved — use in bullets)');

  for (const s of input.approved_strategies) {
    const metricNote = s.strategy.inferred_metric ? ` [use: ${s.strategy.inferred_metric}]` : '';
    const baseLine = `- ${s.requirement}: ${s.strategy.positioning}${metricNote}`;
    if (!s.target_section || s.target_section === 'auto') {
      parts.push(baseLine);
    } else if (s.target_section === 'experience' && s.target_company) {
      parts.push(baseLine);
      parts.push(`  PLACEMENT: Experience bullets for ${s.target_company}`);
    } else {
      const sectionLabel: Record<string, string> = {
        summary: 'Executive Summary',
        competencies: 'Core Competencies',
        accomplishments: 'Selected Accomplishments',
        experience: 'Experience (most recent role)',
      };
      parts.push(baseLine);
      parts.push(`  PLACEMENT: ${sectionLabel[s.target_section] ?? s.target_section}`);
    }
  }

  parts.push(
    '',
    '## WHY ME STORY — YOUR NORTH STAR',
    '(This narrative arc must be reinforced in every section. Do not copy verbatim — let it shape every framing decision.)',
    input.narrative.why_me_story.slice(0, 3000),
  );

  if (input.narrative.unique_differentiators && input.narrative.unique_differentiators.length > 0) {
    parts.push(
      '',
      '## UNIQUE DIFFERENTIATORS (what sets this candidate apart — reinforce these throughout)',
      ...input.narrative.unique_differentiators.map(d => `- ${d}`),
    );
  }

  if (input.benchmark.positioning_frame) {
    parts.push(
      '',
      '## BENCHMARK POSITIONING DIRECTIVE',
      '(The entire resume must reinforce this frame. Lead with what this directive says to lead with. Subordinate what it says to subordinate.)',
      input.benchmark.positioning_frame,
    );
  }

  if (input.benchmark.direct_matches && input.benchmark.direct_matches.length > 0) {
    parts.push(
      '',
      '## DIRECT CANDIDATE-TO-ROLE MATCHES (surface these prominently — they are the strongest evidence)',
      ...input.benchmark.direct_matches.map(
        m => `- [${m.strength}] JD requires: ${m.jd_requirement} → Candidate has: ${m.candidate_evidence}`
      ),
    );
  }

  if (input.benchmark.gap_assessment && input.benchmark.gap_assessment.length > 0) {
    const significantGaps = input.benchmark.gap_assessment.filter(g => g.severity !== 'NOISE');
    if (significantGaps.length > 0) {
      parts.push(
        '',
        '## GAP SEVERITY GUIDANCE (address DISQUALIFYING proactively, minimize NOISE)',
        ...significantGaps.map(
          g => `- [${g.severity}] ${g.gap}: ${g.bridging_strategy}`
        ),
      );
    }
  }

  if (input.narrative.gap_positioning_map && input.narrative.gap_positioning_map.length > 0) {
    parts.push(
      '',
      '## GAP POSITIONING MAP (where and how to surface each gap strategy in the resume)',
    );
    for (const entry of input.narrative.gap_positioning_map) {
      parts.push(
        `- Requirement: ${entry.requirement}`,
        `  Where to feature: ${entry.where_to_feature}`,
        `  How to frame it: ${entry.narrative_positioning}`,
        `  Justification: ${entry.narrative_justification}`,
      );
    }
  }

  parts.push(
    '',
    `POSITION COUNT CHECK: The candidate has ${sourceExperience.length} positions. Your output must include ALL ${sourceExperience.length}. Use earlier_career only for positions that are both old and low current-role relevance. Keep older but still relevant roles in professional_experience with bullets. Do NOT drop any positions.`,
    '',
    'Now write the complete resume. Every section reinforces the Why Me narrative. Every bullet answers: "Does this prove why I am THE candidate?" Mark is_new correctly.',
    'Return JSON only. Do not write any introduction, explanation, or markdown fences.',
  );

  return parts.join('\n');
}

function buildDeterministicResumeDraft(input: ResumeWriterInput): ResumeDraftOutput {
  const selectedAccomplishmentTargets = deriveSelectedAccomplishmentTargets(input);
  const coreCompetencies = buildSourceBoundCoreCompetencies(input);

  const positionLayoutPlan = derivePositionLayoutPlan(input);
  const earlierCareer = buildEarlierCareer(input, positionLayoutPlan);

  return {
    header: {
      name: input.candidate.contact.name,
      phone: input.candidate.contact.phone,
      email: input.candidate.contact.email,
      linkedin: input.candidate.contact.linkedin,
      branded_title: input.narrative.branded_title,
    },
    executive_summary: {
      content: buildExecutiveSummary(input),
      is_new: true,
    },
    core_competencies: coreCompetencies,
    selected_accomplishment_targets: selectedAccomplishmentTargets,
    selected_accomplishments: buildSelectedAccomplishments(input, selectedAccomplishmentTargets),
    professional_experience: buildProfessionalExperience(input, positionLayoutPlan),
    ...(earlierCareer.length > 0 ? { earlier_career: earlierCareer } : {}),
    education: input.candidate.education ?? [],
    certifications: input.candidate.certifications ?? [],
  };
}

function normalizeRequirementKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function scoreRequirementTextMatch(left: string, right: string): number {
  const a = normalizeRequirementKey(left);
  const b = normalizeRequirementKey(right);
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (a.includes(b) || b.includes(a)) return 80;

  const leftTokens = new Set(a.split(/\s+/).filter(Boolean));
  const rightTokens = new Set(b.split(/\s+/).filter(Boolean));
  let shared = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) shared++;
  }
  if (shared === 0) return 0;
  return Math.round((shared / Math.max(leftTokens.size, rightTokens.size)) * 60);
}

function importanceRank(value: 'must_have' | 'important' | 'nice_to_have'): number {
  switch (value) {
    case 'must_have':
      return 0;
    case 'important':
      return 1;
    default:
      return 2;
  }
}

const SELECTED_ACCOMPLISHMENT_TARGET_LIMIT = 4;

interface AccomplishmentEvidenceCandidate {
  content: string;
  evidence: string;
  proofStrength: number;
  hasMetric: boolean;
  source: BulletSource;
  confidence: BulletConfidence;
  contentOrigin: ResumeContentOrigin;
  supportOrigin: ResumeSupportOrigin;
}

function isCredentialOrScreeningRequirement(requirement: string): boolean {
  const normalized = normalizeRequirementKey(requirement);
  if (!normalized) return false;

  return /\b(bachelor|master|mba|phd|doctorate|degree|certification|certified|license|licensed|clearance|citizen|citizenship|visa|work authorization|authorized to work|travel required|relocat|onsite|hybrid|remote)\b/.test(normalized)
    || /\b\d+\+?\s+years?\b/.test(normalized)
    || /\bminimum of\s+\d+\+?\s+years?\b/.test(normalized)
    || /\b\d+\+?\s+years?\s+of\b/.test(normalized);
}

function isAccomplishmentCompatibleRequirement(requirement: RequirementGap): boolean {
  if (requirement.source !== 'job_description') return false;
  if (requirement.category === 'benchmark_certification') return false;
  return !isCredentialOrScreeningRequirement(requirement.requirement);
}

function buildSelectedAccomplishmentEvidencePool(input: ResumeWriterInput): AccomplishmentEvidenceCandidate[] {
  const deduped: AccomplishmentEvidenceCandidate[] = [];
  const seen = new Set<string>();
  const pushCandidate = (
    content: string,
    evidence: string,
    proofStrength: number,
    source: BulletSource,
    confidence: BulletConfidence,
    contentOrigin: ResumeContentOrigin,
    supportOrigin: ResumeSupportOrigin,
  ) => {
    const normalized = content.toLowerCase().trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    deduped.push({
      content,
      evidence,
      proofStrength,
      hasMetric: /[%$]|\b\d/.test(content),
      source,
      confidence,
      contentOrigin,
      supportOrigin,
    });
  };

  for (const experience of getAuthoritativeSourceExperience(input.candidate)) {
    for (const bullet of experience.bullets ?? []) {
      pushCandidate(
        bullet,
        bullet,
        scoreSourceBulletImportance(bullet, input) + 2,
        'original',
        'strong',
        'verbatim_resume',
        'original_resume',
      );
    }
  }

  for (const item of input.candidate.quantified_outcomes ?? []) {
    const content = `${item.outcome} ${item.value}`.replace(/\s+/g, ' ').trim();
    pushCandidate(
      content,
      content,
      6,
      'enhanced',
      'strong',
      'multi_source_synthesis',
      'original_resume',
    );
  }

  for (const item of input.candidate.hidden_accomplishments ?? []) {
    pushCandidate(
      item,
      item,
      4,
      'enhanced',
      'partial',
      'multi_source_synthesis',
      'adjacent_resume_inference',
    );
  }

  return deduped;
}

function scoreEvidenceAgainstRequirement(
  evidence: AccomplishmentEvidenceCandidate,
  requirement: RequirementGap,
  accomplishmentPriorityHints: string[],
): number {
  const textScore = scoreRequirementTextMatch(evidence.content, requirement.requirement);
  const directKeywordMatch = matchRequirementLinks(evidence.content, [{ requirement: requirement.requirement }]).length > 0
    ? 18
    : 0;
  const hintBoost = accomplishmentPriorityHints.some((hint) => scoreRequirementTextMatch(hint, requirement.requirement) >= 40)
    ? 8
    : 0;
  const metricBoost = evidence.hasMetric ? 6 : 0;
  return textScore + directKeywordMatch + hintBoost + metricBoost + (evidence.proofStrength * 4);
}

function resolveBestPrimaryTarget(
  text: string,
  requirements: Array<{ requirement: string; source: RequirementSource }>,
): { requirement: string; source: RequirementSource } | null {
  let bestMatch: { requirement: string; source: RequirementSource } | null = null;
  let bestScore = 0;

  for (const requirement of requirements) {
    const score = scoreRequirementTextMatch(text, requirement.requirement);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = { requirement: requirement.requirement, source: requirement.source };
    }
  }

  return bestScore >= 25 ? bestMatch : null;
}

function evidenceSupportsRequirement(evidence: string, requirement: string): boolean {
  if (!evidence.trim() || !requirement.trim()) return false;
  return scoreRequirementTextMatch(evidence, requirement) >= 25
    || matchRequirementLinks(evidence, [{ requirement }]).length > 0;
}

function deriveSelectedAccomplishmentTargets(input: ResumeWriterInput): ResumePriorityTarget[] {
  const targets: ResumePriorityTarget[] = [];
  const seen = new Set<string>();
  const accomplishmentPriorityHints = Array.isArray(input.narrative.section_guidance.accomplishment_priorities)
    ? input.narrative.section_guidance.accomplishment_priorities
    : [];
  const evidencePool = buildSelectedAccomplishmentEvidencePool(input);
  const eligibleRequirements = input.gap_analysis.requirements.filter(isAccomplishmentCompatibleRequirement);

  const pushTarget = (target: ResumePriorityTarget | null | undefined) => {
    if (!target) return;
    const key = normalizeRequirementKey(target.requirement);
    if (!key || seen.has(key)) return;
    seen.add(key);
    targets.push(target);
  };

  const rankedRequirements = eligibleRequirements
    .map((requirement) => {
      const bestEvidence = evidencePool.reduce<{ score: number; evidence: AccomplishmentEvidenceCandidate | null }>(
        (best, evidence) => {
          const score = scoreEvidenceAgainstRequirement(evidence, requirement, accomplishmentPriorityHints);
          if (score > best.score) {
            return { score, evidence };
          }
          return best;
        },
        { score: 0, evidence: null },
      );

      return {
        requirement,
        bestEvidenceScore: bestEvidence.score,
        bestEvidence: bestEvidence.evidence,
      };
    })
    .filter((entry) => entry.bestEvidenceScore >= 35)
    .sort((left, right) => {
      const importanceDelta = importanceRank(left.requirement.importance) - importanceRank(right.requirement.importance);
      if (importanceDelta !== 0) return importanceDelta;
      if (right.bestEvidenceScore !== left.bestEvidenceScore) return right.bestEvidenceScore - left.bestEvidenceScore;
      return left.requirement.requirement.localeCompare(right.requirement.requirement);
    });

  for (const entry of rankedRequirements) {
    pushTarget({
      requirement: entry.requirement.requirement,
      source: entry.requirement.source,
      importance: entry.requirement.importance,
      source_evidence: entry.bestEvidence?.evidence ?? entry.requirement.source_evidence,
    });
    if (targets.length >= SELECTED_ACCOMPLISHMENT_TARGET_LIMIT) break;
  }

  if (targets.length === 0) {
    for (const requirement of eligibleRequirements.sort((a, b) => importanceRank(a.importance) - importanceRank(b.importance))) {
      pushTarget({
        requirement: requirement.requirement,
        source: requirement.source,
        importance: requirement.importance,
        source_evidence: requirement.source_evidence,
      });
      if (targets.length >= Math.min(3, SELECTED_ACCOMPLISHMENT_TARGET_LIMIT)) break;
    }
  }

  return targets.slice(0, SELECTED_ACCOMPLISHMENT_TARGET_LIMIT);
}

function mergeSelectedAccomplishmentTargets(
  existing: ResumeDraftOutput['selected_accomplishment_targets'],
  fallback: ResumePriorityTarget[],
): ResumePriorityTarget[] {
  const merged: ResumePriorityTarget[] = [];
  const seen = new Set<string>();
  const candidates = [...(existing ?? []), ...fallback];
  for (const target of candidates) {
    if (!target) continue;
    const key = normalizeRequirementKey(target.requirement);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push({
      requirement: target.requirement,
      source: target.source,
      importance: target.importance,
      source_evidence: target.source_evidence,
    });
  }
  return merged.slice(0, SELECTED_ACCOMPLISHMENT_TARGET_LIMIT);
}

function preserveCandidateEducationDetail(
  draftEducation: ResumeDraftOutput['education'],
  candidateEducation: Array<{ degree: string; institution: string; year?: string }>,
): ResumeDraftOutput['education'] {
  if (candidateEducation.length === 0) return draftEducation;
  if (draftEducation.length === 0) return candidateEducation.map((entry) => ({ ...entry }));

  const merged = draftEducation.map((draftEntry) => {
    const fallback = candidateEducation.find((candidateEntry) => {
      const sameInstitution = normalizeEducationValue(candidateEntry.institution) === normalizeEducationValue(draftEntry.institution);
      const sameLevel = inferEducationDegreeLevel(candidateEntry.degree) === inferEducationDegreeLevel(draftEntry.degree);
      return sameInstitution || Boolean(inferEducationDegreeLevel(candidateEntry.degree) && sameLevel);
    });

    if (!fallback) return draftEntry;

    return {
      degree: isGenericEducationDegree(draftEntry.degree) && !isGenericEducationDegree(fallback.degree)
        ? fallback.degree
        : draftEntry.degree || fallback.degree,
      institution: draftEntry.institution || fallback.institution,
      year: draftEntry.year || fallback.year || '',
    };
  });

  return dedupeEducationEntries(merged);
}

function normalizeEducationValue(value: string | undefined): string {
  return (value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function inferEducationDegreeLevel(value: string | undefined): 'bachelor' | 'master' | 'doctorate' | 'mba' | '' {
  const normalized = normalizeEducationValue(value);
  if (/\bmba\b/.test(normalized)) return 'mba';
  if (/\b(phd|doctorate|doctor)\b/.test(normalized)) return 'doctorate';
  if (/\b(master|m\.?s\.?|m\.?a\.?)\b/.test(normalized)) return 'master';
  if (/\b(bachelor|b\.?s\.?|b\.?a\.?)\b/.test(normalized)) return 'bachelor';
  return '';
}

function isGenericEducationDegree(value: string | undefined): boolean {
  const normalized = normalizeEducationValue(value)
    .replace(/\((?:b\.?s\.?|b\.?a\.?|m\.?s\.?|m\.?a\.?)\)/g, '')
    .trim();
  if (!normalized) return true;
  return /^(bachelor(?: of science| of arts)?|master(?: of science| of arts)?|b\.?s\.?|b\.?a\.?|m\.?s\.?|m\.?a\.?|mba|phd|doctorate)(?: degree)?$/i.test(normalized);
}

function dedupeEducationEntries(
  entries: ResumeDraftOutput['education'],
): ResumeDraftOutput['education'] {
  const deduped: ResumeDraftOutput['education'] = [];

  for (const entry of entries) {
    const existingIndex = deduped.findIndex((candidate) => {
      const sameInstitution = normalizeEducationValue(candidate.institution) === normalizeEducationValue(entry.institution);
      const sameLevel = inferEducationDegreeLevel(candidate.degree) === inferEducationDegreeLevel(entry.degree);
      return sameInstitution || Boolean(inferEducationDegreeLevel(candidate.degree) && sameLevel);
    });

    if (existingIndex === -1) {
      deduped.push(entry);
      continue;
    }

    const current = deduped[existingIndex];
    deduped[existingIndex] = {
      degree: isGenericEducationDegree(current.degree) && !isGenericEducationDegree(entry.degree)
        ? entry.degree
        : current.degree,
      institution: current.institution || entry.institution,
      year: current.year || entry.year || '',
    };
  }

  return deduped;
}

/**
 * Guardrail: if the LLM produced fewer bullets for a position than the original resume had,
 * backfill missing original bullets to prevent content loss.
 * Matches positions by normalized company name.
 */
function ensureMinimumBulletCounts(draft: ResumeDraftOutput, input: ResumeWriterInput): ResumeDraftOutput {
  const sourceExperience = getAuthoritativeSourceExperience(input.candidate);
  if (!Array.isArray(draft.professional_experience) || sourceExperience.length === 0) return draft;

  for (const draftExp of draft.professional_experience) {
    // Find the matching original experience entry
    const originalExp = sourceExperience.find((orig) => {
      const draftKey = `${draftExp.company} ${draftExp.title}`.toLowerCase().replace(/[^a-z0-9]/g, '');
      const origKey = `${orig.company} ${orig.title}`.toLowerCase().replace(/[^a-z0-9]/g, '');
      return draftKey === origKey || draftKey.includes(origKey) || origKey.includes(draftKey);
    });

    if (!originalExp) continue;

    // Filter out lines that CI parsed as bullets but are actually section headers
    // (EDUCATION:, CERTIFICATIONS:, SKILLS:, etc.) or raw comma-separated skill lists.
    const cleanOriginalBullets = originalExp.bullets.filter((bullet) => {
      if (/^(education|certifications?|skills|awards|publications|languages|interests)\s*[:|\-–—]/i.test(bullet.trim())) return false;
      if (/^[A-Z][A-Za-z\s]+(?:,\s*[A-Z][A-Za-z\s]+){3,}$/.test(bullet.trim())) return false;
      return true;
    });

    const draftBulletCount = (draftExp.bullets ?? []).length;
    const originalBulletCount = cleanOriginalBullets.length;
    const draftBullets = draftExp.bullets ?? [];
    const uncoveredSourceBullets = cleanOriginalBullets
      .filter((origBullet) => {
        const sourceImportance = scoreSourceBulletImportance(origBullet, input);
        return !draftBullets.some((draftBullet) => (
          bulletPreservesProofDensity(draftBullet.text, origBullet)
          && !bulletOverCompressesImportantSourceProof(draftBullet.text, origBullet, sourceImportance)
        ));
      })
      .sort((left, right) => {
        const rightScore = scoreSourceBulletImportance(right, input);
        const leftScore = scoreSourceBulletImportance(left, input);
        return rightScore - leftScore;
      });

    // If the LLM wrote fewer bullets than the original, backfill original bullets
    if (draftBulletCount < originalBulletCount) {
      let added = 0;
      for (const bulletText of uncoveredSourceBullets) {
        if ((draftExp.bullets ?? []).length >= originalBulletCount) break;
        draftExp.bullets = draftExp.bullets ?? [];
        draftExp.bullets.push({
          text: bulletText,
          is_new: false,
          addresses_requirements: [],
          source: 'original',
          confidence: 'strong',
          review_state: 'supported',
          evidence_found: bulletText,
          requirement_source: 'job_description',
          content_origin: 'verbatim_resume',
          support_origin: 'original_resume',
        });
        added += 1;
      }

      if (added > 0) {
        logger.warn(
          {
            company: draftExp.company,
            draftCount: draftBulletCount,
            originalCount: originalBulletCount,
            uncoveredOriginals: uncoveredSourceBullets.length,
            backfilled: added,
          },
          'Backfilled bullets — LLM wrote fewer than original',
        );
      }

      continue;
    }

    if (uncoveredSourceBullets.length === 0 || draftBullets.length === 0) {
      continue;
    }

    let replaced = 0;
    const consumedDraftIndexes = new Set<number>();

    for (const sourceBulletText of uncoveredSourceBullets) {
      const match = findBestDraftBulletMatch(sourceBulletText, draftBullets, consumedDraftIndexes);
      if (match.index === -1 || match.score < 0.35) continue;

      const matchedDraft = draftBullets[match.index];
      const sourceImportance = scoreSourceBulletImportance(sourceBulletText, input);
      if (
        bulletPreservesProofDensity(matchedDraft.text, sourceBulletText)
        && !bulletOverCompressesImportantSourceProof(matchedDraft.text, sourceBulletText, sourceImportance)
      ) {
        consumedDraftIndexes.add(match.index);
        continue;
      }

      draftBullets[match.index] = {
        text: sourceBulletText,
        is_new: false,
        addresses_requirements: [],
        source: 'original',
        confidence: 'strong',
        review_state: 'supported',
        evidence_found: sourceBulletText,
        requirement_source: 'job_description',
        content_origin: 'verbatim_resume',
        support_origin: 'original_resume',
      };
      consumedDraftIndexes.add(match.index);
      replaced += 1;
    }

    if (replaced > 0) {
      logger.warn(
        {
          company: draftExp.company,
          draftCount: draftBulletCount,
          originalCount: originalBulletCount,
          uncoveredOriginals: uncoveredSourceBullets.length,
          proofDensityRestored: replaced,
        },
        'Replaced low-density bullets with source proof to prevent over-compression',
      );
    }

    const coverageRecovery = findUncoveredSourceBulletsAndUnusedDraftIndexes(cleanOriginalBullets, draftBullets, input);
    let coverageRestored = 0;

    for (const [slot, replacementIndex] of coverageRecovery.unusedDraftIndexes.entries()) {
      const sourceBulletText = coverageRecovery.uncoveredSourceBullets[slot];
      if (!sourceBulletText) break;

      draftBullets[replacementIndex] = {
        text: sourceBulletText,
        is_new: false,
        addresses_requirements: [],
        source: 'original',
        confidence: 'strong',
        review_state: 'supported',
        evidence_found: sourceBulletText,
        requirement_source: 'job_description',
        content_origin: 'verbatim_resume',
        support_origin: 'original_resume',
      };
      coverageRestored += 1;
    }

    if (coverageRestored > 0) {
      logger.warn(
        {
          company: draftExp.company,
          originalCount: originalBulletCount,
          coverageGaps: coverageRecovery.uncoveredSourceBullets.length,
          coverageRestored,
        },
        'Replaced unmatched draft bullets with missing source proof to preserve full role coverage',
      );
    }

    const residualCoverage = findResidualCoverageGaps(cleanOriginalBullets, draftBullets, input);
    let residualRestored = 0;

    for (const [slot, replacementIndex] of residualCoverage.unmatchedDraftIndexes.entries()) {
      const sourceBulletText = residualCoverage.uncoveredSourceBullets[slot];
      if (!sourceBulletText) break;

      draftBullets[replacementIndex] = {
        text: sourceBulletText,
        is_new: false,
        addresses_requirements: [],
        source: 'original',
        confidence: 'strong',
        review_state: 'supported',
        evidence_found: sourceBulletText,
        requirement_source: 'job_description',
        content_origin: 'verbatim_resume',
        support_origin: 'original_resume',
      };
      residualRestored += 1;
    }

    if (residualRestored > 0) {
      logger.warn(
        {
          company: draftExp.company,
          originalCount: originalBulletCount,
          residualCoverageGaps: residualCoverage.uncoveredSourceBullets.length,
          residualRestored,
        },
        'Force-restored missing source proof after same-count rewrite drift',
      );
    }

    const duplicateCoverage = findDuplicateCoverageGaps(cleanOriginalBullets, draftBullets, input);
    let duplicateRestored = 0;

    for (const [slot, replacementIndex] of duplicateCoverage.duplicateDraftIndexes.entries()) {
      const sourceBulletText = duplicateCoverage.uncoveredSourceBullets[slot];
      if (!sourceBulletText) break;

      draftBullets[replacementIndex] = {
        text: sourceBulletText,
        is_new: false,
        addresses_requirements: [],
        source: 'original',
        confidence: 'strong',
        review_state: 'supported',
        evidence_found: sourceBulletText,
        requirement_source: 'job_description',
        content_origin: 'verbatim_resume',
        support_origin: 'original_resume',
      };
      duplicateRestored += 1;
    }

    if (duplicateRestored > 0) {
      logger.warn(
        {
          company: draftExp.company,
          originalCount: originalBulletCount,
          duplicateCoverageGaps: duplicateCoverage.uncoveredSourceBullets.length,
          duplicateRestored,
        },
        'Replaced duplicate source coverage with missing role-local proof',
      );
    }
  }

  return draft;
}

// ─── Deterministic Validation & Annotation ─────────────────────────────────
// These functions validate and annotate resume metadata when the model leaves
// fields blank. They must not silently replace valid agent-owned decisions.

/**
 * Tokenize text into lowercase alphanumeric tokens of 4+ characters.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-zA-Z0-9]+/)
    .filter((t) => t.length >= 4);
}

function normalizeLooseText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function calculateTokenOverlap(leftText: string, rightText: string): number {
  const leftTokens = tokenize(leftText);
  const rightTokens = tokenize(rightText);
  if (leftTokens.length === 0 || rightTokens.length === 0) return 0;

  const rightSet = new Set(rightTokens);
  const shared = leftTokens.filter((token) => rightSet.has(token)).length;
  return Math.max(shared / leftTokens.length, shared / rightTokens.length);
}

function _calculateLongestCommonSubstringRatio(leftText: string, rightText: string): number {
  const left = normalizeLooseText(leftText);
  const right = normalizeLooseText(rightText);
  if (!left || !right) return 0;

  const widths = new Array(right.length + 1).fill(0);
  let longest = 0;

  for (let i = 1; i <= left.length; i += 1) {
    let previous = 0;
    for (let j = 1; j <= right.length; j += 1) {
      const nextPrevious = widths[j];
      if (left[i - 1] === right[j - 1]) {
        widths[j] = previous + 1;
        if (widths[j] > longest) longest = widths[j];
      } else {
        widths[j] = 0;
      }
      previous = nextPrevious;
    }
  }

  return longest / Math.max(left.length, right.length);
}

function extractConcreteProofSignals(text: string): {
  numbers: string[];
  acronyms: string[];
  distinctiveTokens: string[];
} {
  const normalized = normalizeLooseText(text);
  const numberMatches = text.match(/[$~]?\d[\d.,]*(?:%|x|k|m|b)?/gi) ?? [];
  const acronymMatches = text.match(/\b[A-Z]{2,}(?:\/[A-Z]{2,})*\b/g) ?? [];

  return {
    numbers: Array.from(new Set(numberMatches.map((value) => normalizeLooseText(value)).filter(Boolean))),
    acronyms: Array.from(new Set(acronymMatches.map((value) => value.toLowerCase()))),
    distinctiveTokens: Array.from(
      new Set(
        tokenize(text).filter((token) => !PROOF_SIGNAL_STOPWORDS.has(token) && normalized.includes(token)),
      ),
    ),
  };
}

function bulletCoversSourceProof(draftBulletText: string, sourceBulletText: string): boolean {
  const draftNormalized = draftBulletText.toLowerCase().replace(/\s+/g, ' ').trim();
  const sourceNormalized = sourceBulletText.toLowerCase().replace(/\s+/g, ' ').trim();

  if (!draftNormalized || !sourceNormalized) return false;
  if (draftNormalized === sourceNormalized) return true;
  if (draftNormalized.includes(sourceNormalized) || sourceNormalized.includes(draftNormalized)) return true;

  return calculateTokenOverlap(draftBulletText, sourceBulletText) >= 0.45;
}

export function bulletPreservesProofDensity(draftBulletText: string, sourceBulletText: string): boolean {
  if (!bulletCoversSourceProof(draftBulletText, sourceBulletText)) return false;

  const draftNormalized = normalizeLooseText(draftBulletText);
  const sourceSignals = extractConcreteProofSignals(sourceBulletText);
  const draftSignals = extractConcreteProofSignals(draftBulletText);

  if (sourceSignals.numbers.length > 0) {
    const preservedNumberCount = sourceSignals.numbers.filter((value) => draftNormalized.includes(value)).length;
    if (preservedNumberCount === 0) return false;
  }

  if (sourceSignals.acronyms.length > 0) {
    const draftAcronyms = new Set(draftSignals.acronyms);
    const preservedAcronymCount = sourceSignals.acronyms.filter((value) => draftAcronyms.has(value)).length;
    if (preservedAcronymCount === 0) return false;
  }

  const sourceHasHardProofSignals = sourceSignals.numbers.length > 0 || sourceSignals.acronyms.length > 0;
  if (sourceHasHardProofSignals && sourceSignals.distinctiveTokens.length >= 3) {
    const draftTokenSet = new Set(draftSignals.distinctiveTokens);
    const sharedDistinctive = sourceSignals.distinctiveTokens.filter((token) => draftTokenSet.has(token)).length;
    if ((sharedDistinctive / sourceSignals.distinctiveTokens.length) < 0.3) {
      return false;
    }
  }

  return true;
}

function bulletOverCompressesImportantSourceProof(
  draftBulletText: string,
  sourceBulletText: string,
  sourceImportance: number,
): boolean {
  if (sourceImportance < 2) return false;

  const overlap = calculateTokenOverlap(draftBulletText, sourceBulletText);
  if (overlap < 0.35) return false;

  const sourceSignals = extractConcreteProofSignals(sourceBulletText);
  if (sourceSignals.numbers.length > 0 || sourceSignals.acronyms.length > 0) return false;

  const sourceLength = sourceBulletText.trim().length;
  const draftLength = draftBulletText.trim().length;
  if (sourceLength < 90) return false;

  return draftLength < (sourceLength * 0.65);
}

function findBestDraftBulletMatch(
  sourceBulletText: string,
  draftBullets: ResumeBullet[],
  excludedIndexes: Set<number>,
): { index: number; score: number } {
  let bestIndex = -1;
  let bestScore = 0;

  for (const [index, draftBullet] of draftBullets.entries()) {
    if (excludedIndexes.has(index)) continue;
    const score = calculateTokenOverlap(draftBullet.text, sourceBulletText);
    if (score > bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  }

  return { index: bestIndex, score: bestScore };
}

function findUncoveredSourceBulletsAndUnusedDraftIndexes(
  sourceBullets: string[],
  draftBullets: ResumeBullet[],
  input: ResumeWriterInput,
): { uncoveredSourceBullets: string[]; unusedDraftIndexes: number[] } {
  const assignedDraftIndexes = new Set<number>();
  const coveredSourceIndexes = new Set<number>();

  for (const [sourceIndex, sourceBulletText] of sourceBullets.entries()) {
    const sourceImportance = scoreSourceBulletImportance(sourceBulletText, input);
    let bestIndex = -1;
    let bestScore = 0;

    for (const [draftIndex, draftBullet] of draftBullets.entries()) {
      if (assignedDraftIndexes.has(draftIndex)) continue;
      if (
        !bulletPreservesProofDensity(draftBullet.text, sourceBulletText)
        || bulletOverCompressesImportantSourceProof(draftBullet.text, sourceBulletText, sourceImportance)
      ) {
        continue;
      }

      const score = calculateTokenOverlap(draftBullet.text, sourceBulletText);
      if (score > bestScore) {
        bestIndex = draftIndex;
        bestScore = score;
      }
    }

    if (bestIndex !== -1) {
      assignedDraftIndexes.add(bestIndex);
      coveredSourceIndexes.add(sourceIndex);
    }
  }

  return {
    uncoveredSourceBullets: sourceBullets.filter((_, index) => !coveredSourceIndexes.has(index)),
    unusedDraftIndexes: draftBullets
      .map((_, index) => index)
      .filter((index) => !assignedDraftIndexes.has(index)),
  };
}

function findResidualCoverageGaps(
  sourceBullets: string[],
  draftBullets: ResumeBullet[],
  input: ResumeWriterInput,
): { uncoveredSourceBullets: string[]; unmatchedDraftIndexes: number[] } {
  const uncoveredSourceBullets = sourceBullets.filter((sourceBulletText) => {
    const sourceImportance = scoreSourceBulletImportance(sourceBulletText, input);
    return !draftBullets.some((draftBullet) => (
      bulletPreservesProofDensity(draftBullet.text, sourceBulletText)
      && !bulletOverCompressesImportantSourceProof(draftBullet.text, sourceBulletText, sourceImportance)
    ));
  });

  const unmatchedDraftIndexes = draftBullets
    .map((draftBullet, index) => ({
      index,
      preservesAny: sourceBullets.some((sourceBulletText) => {
        const sourceImportance = scoreSourceBulletImportance(sourceBulletText, input);
        return bulletPreservesProofDensity(draftBullet.text, sourceBulletText)
          && !bulletOverCompressesImportantSourceProof(draftBullet.text, sourceBulletText, sourceImportance);
      }),
      isOriginal: draftBullet.source === 'original',
      bestOverlap: sourceBullets.reduce(
        (best, sourceBulletText) => Math.max(best, calculateTokenOverlap(draftBullet.text, sourceBulletText)),
        0,
      ),
    }))
    .filter((entry) => !entry.preservesAny)
    .sort((left, right) => {
      if (left.isOriginal !== right.isOriginal) return left.isOriginal ? 1 : -1;
      return left.bestOverlap - right.bestOverlap;
    })
    .map((entry) => entry.index);

  return {
    uncoveredSourceBullets,
    unmatchedDraftIndexes,
  };
}

function findDuplicateCoverageGaps(
  sourceBullets: string[],
  draftBullets: ResumeBullet[],
  input: ResumeWriterInput,
): { uncoveredSourceBullets: string[]; duplicateDraftIndexes: number[] } {
  const sourceAssignments = new Map<number, Array<{ index: number; overlap: number; isOriginal: boolean }>>();

  for (const [draftIndex, draftBullet] of draftBullets.entries()) {
    let bestSourceIndex = -1;
    let bestOverlap = 0;

    for (const [sourceIndex, sourceBulletText] of sourceBullets.entries()) {
      const sourceImportance = scoreSourceBulletImportance(sourceBulletText, input);
      if (
        !bulletPreservesProofDensity(draftBullet.text, sourceBulletText)
        || bulletOverCompressesImportantSourceProof(draftBullet.text, sourceBulletText, sourceImportance)
      ) {
        continue;
      }

      const overlap = calculateTokenOverlap(draftBullet.text, sourceBulletText);
      if (overlap > bestOverlap) {
        bestSourceIndex = sourceIndex;
        bestOverlap = overlap;
      }
    }

    if (bestSourceIndex === -1) continue;

    const assignments = sourceAssignments.get(bestSourceIndex) ?? [];
    assignments.push({
      index: draftIndex,
      overlap: bestOverlap,
      isOriginal: draftBullet.source === 'original' && draftBullet.content_origin === 'verbatim_resume',
    });
    sourceAssignments.set(bestSourceIndex, assignments);
  }

  const uncoveredSourceBullets = sourceBullets.filter((_, sourceIndex) => !sourceAssignments.has(sourceIndex));
  const duplicateDraftIndexes = Array.from(sourceAssignments.values())
    .flatMap((assignments) => {
      if (assignments.length <= 1) return [];
      return assignments
        .sort((left, right) => {
          if (left.isOriginal !== right.isOriginal) return left.isOriginal ? 1 : -1;
          return left.overlap - right.overlap;
        })
        .slice(0, assignments.length - 1);
    })
    .map((assignment) => assignment.index);

  return {
    uncoveredSourceBullets,
    duplicateDraftIndexes,
  };
}

function scoreSourceBulletImportance(bulletText: string, input: ResumeWriterInput): number {
  const requirementHits = matchRequirementLinks(bulletText, input.gap_analysis.requirements).length;
  const hasMetric = /[%$]|\b\d/.test(bulletText) ? 1 : 0;
  return (requirementHits * 2) + hasMetric;
}

interface IndexedRequirement {
  requirement: string;
  source: RequirementSource;
  keywords: string[];
}

interface BulletRequirementMatch {
  matchedRequirements: string[];
  hasBenchmarkSource: boolean;
}

/**
 * Build an index of the candidate's original bullet texts for fast lookup.
 * - exactLookup: all original bullet texts, lowercased and trimmed
 * - byCompany: map from normalized company key to that company's original bullet texts
 */
function buildOriginalBulletIndex(experience: Array<{ company: string; bullets: string[] }>): {
  exactLookup: Set<string>;
  byCompany: Map<string, string[]>;
} {
  const exactLookup = new Set<string>();
  const byCompany = new Map<string, string[]>();
  for (const exp of experience) {
    const key = exp.company.toLowerCase().replace(/[^a-z0-9]/g, '');
    const bullets: string[] = [];
    for (const bullet of exp.bullets) {
      exactLookup.add(bullet.toLowerCase().trim());
      bullets.push(bullet);
    }
    byCompany.set(key, [...(byCompany.get(key) ?? []), ...bullets]);
  }
  return { exactLookup, byCompany };
}

/**
 * Build an indexed array of requirements with keywords extracted for matching.
 * Keywords: split on non-alphanumeric, keep tokens >= 4 chars, lowercased.
 */
function buildRequirementIndex(
  requirements: Array<{ requirement: string; source: RequirementSource }>,
): IndexedRequirement[] {
  return requirements.map((req) => ({
    requirement: req.requirement,
    source: req.source,
    keywords: req.requirement
      .split(/[^a-zA-Z0-9]+/)
      .filter((t) => t.length >= 4)
      .map((t) => t.toLowerCase()),
  }));
}

/**
 * Match a bullet's text against the requirement index.
 * A requirement matches if:
 *   - any keyword >= 6 chars appears as a substring in the lowercased bullet, OR
 *   - >= 2 keywords of any qualifying length (4+) appear as substrings
 * Returns the top 3 matched requirement texts + whether any matched from 'benchmark'.
 */
function matchBulletToRequirements(
  bulletText: string,
  reqIndex: IndexedRequirement[],
): BulletRequirementMatch {
  const lowerBullet = bulletText.toLowerCase();
  const matched: Array<{ requirement: string; source: RequirementSource; hitCount: number }> = [];

  for (const req of reqIndex) {
    let hitCount = 0;
    let hasLongHit = false;

    for (const kw of req.keywords) {
      if (lowerBullet.includes(kw)) {
        hitCount++;
        if (kw.length >= 6) hasLongHit = true;
      }
    }

    if (hasLongHit || hitCount >= 2) {
      matched.push({ requirement: req.requirement, source: req.source, hitCount });
    }
  }

  // Sort by hit count descending, take top 3
  matched.sort((a, b) => b.hitCount - a.hitCount);
  const top = matched.slice(0, 3);

  return {
    matchedRequirements: top.map((m) => m.requirement),
    hasBenchmarkSource: top.some((m) => m.source === 'benchmark'),
  };
}

/**
 * Classify how closely a bullet matches the candidate's original resume text.
 * Uses per-bullet, company-aware matching with bidirectional overlap.
 * - 'identical': lowercased trimmed text is an exact match in any original bullet
 * - 'similar': >= 35% bidirectional token overlap with any bullet from the same company
 * - 'novel': otherwise
 */
function classifyBulletOriginality(
  bulletText: string,
  companyOriginals: string[],
  allExactLookup: Set<string>,
): 'identical' | 'similar' | 'novel' {
  const normalized = bulletText.toLowerCase().trim();
  if (allExactLookup.has(normalized)) return 'identical';

  const newTokens = tokenize(bulletText);
  if (newTokens.length === 0) return 'novel';

  let bestOverlap = 0;
  for (const orig of companyOriginals) {
    const origTokens = tokenize(orig);
    if (origTokens.length === 0) continue;
    const origSet = new Set(origTokens);
    const shared = newTokens.filter(t => origSet.has(t)).length;
    // Bidirectional: max of (shared/new, shared/orig) so short bullets aren't penalized
    const overlap = Math.max(shared / newTokens.length, shared / origTokens.length);
    bestOverlap = Math.max(bestOverlap, overlap);
  }

  return bestOverlap >= 0.35 ? 'similar' : 'novel';
}

/**
 * Deterministic validation pass for resume metadata.
 *
 * This layer may:
 * - fill blank requirement links
 * - infer support/origin labels when the model omitted them
 * - attach safer defaults for confidence when metadata is missing
 *
 * This layer may not:
 * - silently replace valid agent-selected requirement targets
 * - re-rank Selected Accomplishments after the agent chose section priorities
 * - turn targeting metadata into provenance
 */
function deterministicRequirementMatch(
  draft: ResumeDraftOutput,
  candidateExperience: CandidateExperience[],
  requirements: RequirementGap[],
  selectedAccomplishmentTargets: ResumePriorityTarget[],
): ResumeDraftOutput {
  const { exactLookup, byCompany } = buildOriginalBulletIndex(candidateExperience);
  const reqIndex = buildRequirementIndex(requirements);
  const selectedAccomplishmentTargetCatalog = (
    selectedAccomplishmentTargets.length > 0
      ? selectedAccomplishmentTargets
      : requirements.filter(isAccomplishmentCompatibleRequirement)
  ).map((target) => ({
    requirement: target.requirement,
    source: target.source,
  }));
  const priorityReqIndex = buildRequirementIndex(
    selectedAccomplishmentTargetCatalog.length > 0 ? selectedAccomplishmentTargetCatalog : requirements,
  );

  // Collect ALL originals from every company (used for selected_accomplishments)
  const allOriginals: string[] = [];
  for (const bullets of byCompany.values()) {
    allOriginals.push(...bullets);
  }

  const classify = (
    text: string,
    companyOriginals: string[],
    indexedRequirements: IndexedRequirement[],
    existingRequirements: string[],
    existingRequirementSource: RequirementSource | undefined,
    _existingSource: BulletSource | undefined,
    existingConfidence: BulletConfidence | undefined,
    _existingContentOrigin: ResumeContentOrigin | undefined,
    existingSupportOrigin: ResumeSupportOrigin | undefined,
    evidenceFound: string,
  ): {
    addresses_requirements: string[];
    requirement_source: RequirementSource;
    source: BulletSource;
    confidence: BulletConfidence;
    review_state: ResumeReviewState;
    content_origin: ResumeContentOrigin;
    support_origin: ResumeSupportOrigin;
  } => {
    const match = matchBulletToRequirements(text, indexedRequirements);
    const originality = classifyBulletOriginality(text, companyOriginals, exactLookup);
    const normalizedExistingRequirements = Array.isArray(existingRequirements)
      ? dedupeStrings(existingRequirements.filter((value) => typeof value === 'string' && value.trim().length > 0))
      : [];
    const effectiveRequirements = normalizedExistingRequirements.length > 0
      ? normalizedExistingRequirements
      : match.matchedRequirements;
    const hasMatch = effectiveRequirements.length > 0;
    const hasRealEvidence = typeof evidenceFound === 'string' && evidenceFound.trim().length > 0;

    let confidence: BulletConfidence;
    let requirementSource: RequirementSource;

    const inferredSource: BulletSource = (() => {
      if (originality === 'identical') return 'original';
      if (originality === 'similar') return 'enhanced';
      if (hasRealEvidence) return 'enhanced';
      return 'drafted';
    })();
    const source: BulletSource = inferredSource;

    const contentOrigin = inferContentOrigin(source, {
      originality,
      hasRealEvidence,
      existing: _existingContentOrigin,
    });
    const supportOrigin = inferSupportOrigin(source, evidenceFound, existingSupportOrigin);
    confidence = inferConfidenceFromSupport({
      source,
      evidenceFound,
      supportOrigin,
      contentOrigin,
    });

    requirementSource = existingRequirementSource
      ?? (hasMatch ? (match.hasBenchmarkSource ? 'benchmark' : 'job_description') : 'job_description');
    const reviewState = inferReviewState({
      confidence,
      requirementSource,
      contentOrigin,
    });

    return {
      addresses_requirements: effectiveRequirements,
      requirement_source: requirementSource,
      source,
      confidence,
      review_state: reviewState,
      content_origin: contentOrigin,
      support_origin: supportOrigin,
    };
  };

  // Process selected_accomplishments — compare against ALL companies' originals
  // and only backfill links against the explicit section priority targets.
  if (Array.isArray(draft.selected_accomplishments)) {
    draft.selected_accomplishments = draft.selected_accomplishments.map((a) => {
      const result = classify(
        a.content,
        allOriginals,
        priorityReqIndex,
        a.addresses_requirements ?? [],
        a.requirement_source,
        a.source,
        a.confidence,
        a.content_origin,
        a.support_origin,
        a.evidence_found ?? '',
      );
      const primaryTarget = a.primary_target_requirement
        ? resolveBestPrimaryTarget(
            a.primary_target_requirement,
            selectedAccomplishmentTargetCatalog.length > 0 ? selectedAccomplishmentTargetCatalog : requirements,
          )
        : resolveBestPrimaryTarget(
            a.content,
            selectedAccomplishmentTargetCatalog.length > 0 ? selectedAccomplishmentTargetCatalog : requirements,
          );
      const singleRequirement = primaryTarget?.requirement ?? result.addresses_requirements[0];
      const targetEvidence = typeof a.target_evidence === 'string' && a.target_evidence.trim().length > 0
        ? a.target_evidence
        : singleRequirement && evidenceSupportsRequirement(a.evidence_found ?? '', singleRequirement)
          ? a.evidence_found ?? ''
          : '';

      return {
        ...a,
        addresses_requirements: singleRequirement ? [singleRequirement] : [],
        primary_target_requirement: singleRequirement,
        primary_target_source: primaryTarget?.source ?? result.requirement_source,
        target_evidence: targetEvidence,
        requirement_source: primaryTarget?.source ?? result.requirement_source,
        source: result.source,
        confidence: result.confidence,
        review_state: inferReviewState({
          confidence: result.confidence,
          requirementSource: primaryTarget?.source ?? result.requirement_source,
          contentOrigin: result.content_origin,
          primaryTargetRequirement: singleRequirement,
          targetEvidence,
        }),
        content_origin: result.content_origin,
        support_origin: result.support_origin,
      };
    });
  }

  // Process professional_experience bullets — compare against that company's originals
  if (Array.isArray(draft.professional_experience)) {
    draft.professional_experience = draft.professional_experience.map((exp) => {
      const companyKey = (exp.company ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const companyOriginals = byCompany.get(companyKey) ?? allOriginals;
      return {
        ...exp,
        bullets: Array.isArray(exp.bullets)
          ? exp.bullets.map((bullet) => {
              const result = classify(
                bullet.text,
                companyOriginals,
                reqIndex,
                bullet.addresses_requirements ?? [],
                bullet.requirement_source,
                bullet.source,
                bullet.confidence,
                bullet.content_origin,
                bullet.support_origin,
                bullet.evidence_found ?? '',
              );
              const primaryTarget = bullet.primary_target_requirement
                ? resolveBestPrimaryTarget(
                    bullet.primary_target_requirement,
                    requirements.map((requirement) => ({
                      requirement: requirement.requirement,
                      source: requirement.source,
                    })),
                  )
                : resolveBestPrimaryTarget(
                    bullet.text,
                    requirements.map((requirement) => ({
                      requirement: requirement.requirement,
                      source: requirement.source,
                    })),
                  );
              const singleRequirement = primaryTarget?.requirement ?? result.addresses_requirements[0];
              const targetEvidence = typeof bullet.target_evidence === 'string' && bullet.target_evidence.trim().length > 0
                ? bullet.target_evidence
                : singleRequirement && evidenceSupportsRequirement(bullet.evidence_found ?? '', singleRequirement)
                  ? bullet.evidence_found ?? ''
                  : '';
              return {
                ...bullet,
                addresses_requirements: singleRequirement ? [singleRequirement] : [],
                primary_target_requirement: singleRequirement,
                primary_target_source: primaryTarget?.source ?? result.requirement_source,
                target_evidence: targetEvidence,
                requirement_source: primaryTarget?.source ?? result.requirement_source,
                source: result.source,
                confidence: result.confidence,
                review_state: inferReviewState({
                  confidence: result.confidence,
                  requirementSource: primaryTarget?.source ?? result.requirement_source,
                  contentOrigin: result.content_origin,
                  primaryTargetRequirement: singleRequirement,
                  targetEvidence,
                }),
                content_origin: result.content_origin,
                support_origin: result.support_origin,
              };
            })
          : [],
      };
    });
  }

  return draft;
}

/**
 * Guardrail: ensure every candidate position appears in the resume output.
 * Guarantees every bullet in the resume has metadata for frontend color coding.
 * The LLM is instructed to include these fields but frequently omits them.
 * This function fills any gaps deterministically so the frontend always has data.
 */
function ensureBulletMetadata(draft: ResumeDraftOutput, input?: ResumeWriterInput): ResumeDraftOutput {
  // Build a lookup from requirement text → source ('job_description' | 'benchmark')
  // so we can infer requirement_source when the LLM omits it.
  const reqSourceMap = new Map<string, 'job_description' | 'benchmark'>();
  if (input?.gap_analysis?.requirements) {
    for (const req of input.gap_analysis.requirements) {
      reqSourceMap.set(req.requirement.toLowerCase(), req.source ?? 'job_description');
    }
  }

  const inferReqSource = (addressesRequirements: string[]): 'job_description' | 'benchmark' => {
    for (const req of addressesRequirements) {
      const source = reqSourceMap.get(req.toLowerCase());
      if (source) return source;
    }
    return 'job_description';
  };

  const inferSource = (
    text: string,
    isNew: boolean,
    evidenceFound: string | undefined,
    addressesReqs: string[],
    existingSource?: string,
    existingContentOrigin?: ResumeContentOrigin,
  ): BulletSource => {
    if (existingSource) return existingSource as BulletSource;
    const normalizedContentOrigin = coerceContentOrigin(existingContentOrigin);
    if (normalizedContentOrigin === 'verbatim_resume') return 'original';
    if (normalizedContentOrigin === 'gap_closing_draft') return 'drafted';
    if (normalizedContentOrigin === 'resume_rewrite' || normalizedContentOrigin === 'multi_source_synthesis') return 'enhanced';
    // is_new=true is a clear signal from the LLM
    if (isNew) return 'drafted';
    const normalizedText = normalizeLooseText(text);
    const normalizedEvidence = normalizeLooseText(evidenceFound ?? '');
    if (normalizedText && normalizedEvidence && normalizedText === normalizedEvidence) return 'original';
    // Has evidence (non-empty string) AND addresses requirements → enhanced from original
    const hasRealEvidence = typeof evidenceFound === 'string' && evidenceFound.length > 0;
    // If bullet addresses requirements AND has substantive evidence → it was enhanced
    if (addressesReqs.length > 0 && hasRealEvidence) return 'enhanced';
    // If bullet addresses requirements but no real evidence → it was drafted to fill gaps
    if (addressesReqs.length > 0 && !hasRealEvidence) return 'drafted';
    // Default: from the original resume
    return 'original';
  };

  const inferConfidence = (
    source: BulletSource,
    evidenceFound: string | undefined,
    supportOrigin?: ResumeSupportOrigin,
    contentOrigin?: ResumeContentOrigin,
  ): BulletConfidence => inferConfidenceFromSupport({
    source,
    evidenceFound: evidenceFound ?? '',
    supportOrigin,
    contentOrigin,
  });

  const fillBullet = (bullet: ResumeBullet): ResumeBullet => {
    const reqs = bullet.addresses_requirements ?? [];
    const source = inferSource(
      bullet.text,
      bullet.is_new,
      bullet.evidence_found,
      reqs,
      bullet.source,
      bullet.content_origin,
    );
    const normalizedSupportOrigin = inferSupportOrigin(source, bullet.evidence_found ?? '', bullet.support_origin);
    const contentOrigin = bullet.content_origin ?? inferContentOrigin(source, {
      hasRealEvidence: Boolean(bullet.evidence_found?.trim()),
      existing: bullet.content_origin,
    });
    const confidence = inferConfidence(source, bullet.evidence_found, normalizedSupportOrigin, contentOrigin);
    const primaryTarget = bullet.primary_target_requirement ?? reqs[0];
    const requirementSource = bullet.requirement_source ?? inferReqSource(reqs);
    const workItem = findRequirementWorkItem(input, primaryTarget, requirementSource);
    const targetEvidence = bullet.target_evidence ?? (
      primaryTarget && evidenceSupportsRequirement(bullet.evidence_found ?? '', primaryTarget)
        ? bullet.evidence_found ?? ''
        : ''
    );
    const proofLevel = workItem?.proof_level ?? inferProofLevel({
      confidence,
      evidenceFound: bullet.evidence_found ?? '',
      targetEvidence,
      requirementSource,
      existing: bullet.proof_level,
    });
    const framingGuardrail = workItem?.framing_guardrail ?? inferFramingGuardrail({
      proofLevel,
      existing: bullet.framing_guardrail,
    });
    const nextBestAction = workItem?.next_best_action ?? inferNextBestAction({
      proofLevel,
      requirementSource,
      existing: bullet.next_best_action,
    });
    return {
      ...bullet,
      source,
      confidence,
      review_state: inferReviewState({
        confidence,
        requirementSource,
        contentOrigin,
        primaryTargetRequirement: primaryTarget,
        targetEvidence,
        proofLevel,
        framingGuardrail,
      }),
      evidence_found: bullet.evidence_found ?? '',
      requirement_source: requirementSource,
      addresses_requirements: reqs,
      primary_target_requirement: primaryTarget,
      primary_target_source: bullet.primary_target_source ?? (primaryTarget ? requirementSource : undefined),
      target_evidence: targetEvidence,
      content_origin: contentOrigin,
      support_origin: normalizedSupportOrigin,
      work_item_id: bullet.work_item_id ?? workItem?.id,
      proof_level: proofLevel,
      framing_guardrail: framingGuardrail,
      next_best_action: nextBestAction,
    };
  };

  if (Array.isArray(draft.selected_accomplishments)) {
    draft.selected_accomplishments = draft.selected_accomplishments.map((a) => {
      const reqs = Array.isArray(a.addresses_requirements) ? a.addresses_requirements : [];
      const contentText = typeof a.content === 'string' ? a.content : '';
      const source = inferSource(contentText, a.is_new, a.evidence_found, reqs, a.source, a.content_origin);
      const normalizedSupportOrigin = inferSupportOrigin(source, a.evidence_found ?? '', a.support_origin);
      const contentOrigin = a.content_origin ?? inferContentOrigin(source, {
        hasRealEvidence: Boolean(a.evidence_found?.trim()),
        existing: a.content_origin,
      });
      const confidence = inferConfidence(source, a.evidence_found, normalizedSupportOrigin, contentOrigin);
      const primaryTarget = typeof a.primary_target_requirement === 'string' && a.primary_target_requirement.trim().length > 0
        ? a.primary_target_requirement
        : reqs[0];
      const requirementSource = a.requirement_source ?? inferReqSource(reqs);
      const workItem = findRequirementWorkItem(input, primaryTarget, requirementSource);
      const targetEvidence = a.target_evidence ?? (
        primaryTarget && evidenceSupportsRequirement(a.evidence_found ?? '', primaryTarget)
          ? a.evidence_found ?? ''
          : ''
      );
      const proofLevel = workItem?.proof_level ?? inferProofLevel({
        confidence,
        evidenceFound: a.evidence_found ?? '',
        targetEvidence,
        requirementSource,
        existing: a.proof_level,
      });
      const framingGuardrail = workItem?.framing_guardrail ?? inferFramingGuardrail({
        proofLevel,
        existing: a.framing_guardrail,
      });
      const nextBestAction = workItem?.next_best_action ?? inferNextBestAction({
        proofLevel,
        requirementSource,
        existing: a.next_best_action,
      });
      return {
        ...a,
        source,
        confidence,
        review_state: inferReviewState({
          confidence,
          requirementSource,
          contentOrigin,
          primaryTargetRequirement: primaryTarget,
          targetEvidence,
          proofLevel,
          framingGuardrail,
        }),
        evidence_found: a.evidence_found ?? '',
        requirement_source: requirementSource,
        addresses_requirements: reqs,
        primary_target_requirement: primaryTarget,
        primary_target_source: a.primary_target_source ?? (primaryTarget ? requirementSource : undefined),
        target_evidence: targetEvidence,
        content_origin: contentOrigin,
        support_origin: normalizedSupportOrigin,
        work_item_id: a.work_item_id ?? workItem?.id,
        proof_level: proofLevel,
        framing_guardrail: framingGuardrail,
        next_best_action: nextBestAction,
      };
    });
  }

  if (Array.isArray(draft.professional_experience)) {
    draft.professional_experience = draft.professional_experience.map((exp) => ({
      ...exp,
      scope_statement_source: exp.scope_statement_source ?? (exp.scope_statement_is_new ? 'enhanced' : 'original'),
      scope_statement_confidence: exp.scope_statement_confidence ?? (exp.scope_statement_is_new ? 'partial' : 'strong'),
      scope_statement_evidence_found: exp.scope_statement_evidence_found ?? '',
      bullets: Array.isArray(exp.bullets) ? exp.bullets.map(fillBullet) : [],
    }));
  }

  return draft;
}

/**
 * If the LLM dropped positions (common with tight max_tokens), backfill them
 * into professional_experience or earlier_career as appropriate.
 */
function ensureAllPositionsPresent(
  draft: ResumeDraftOutput,
  input: ResumeWriterInput,
): ResumeDraftOutput {
  const candidatePositions = getAuthoritativeSourceExperience(input.candidate);
  if (candidatePositions.length === 0) return draft;
  const positionLayoutPlan = derivePositionLayoutPlan(input);

  const outputCompanies = new Set<string>();
  for (const exp of draft.professional_experience ?? []) {
    outputCompanies.add(normalizeCompanyKey(exp.company, exp.title));
  }
  for (const ec of draft.earlier_career ?? []) {
    outputCompanies.add(normalizeCompanyKey(ec.company, ec.title));
  }

  const missingPositions = candidatePositions.filter(
    (pos) => !outputCompanies.has(normalizeCompanyKey(pos.company, pos.title)),
  );

  if (missingPositions.length === 0) return draft;

  logger.warn(
    { missing_count: missingPositions.length, missing: missingPositions.map(p => `${p.title} at ${p.company}`) },
    'Resume Writer: LLM dropped positions — backfilling to prevent truncation',
  );

  const additionalProfessional: ResumeDraftOutput['professional_experience'] = [];
  const additionalEarlierCareer: NonNullable<ResumeDraftOutput['earlier_career']> = [];

  for (const pos of missingPositions) {
    const layoutPlan = positionLayoutPlan.get(normalizeCompanyKey(pos.company, pos.title));

    if (layoutPlan?.renderSection === 'earlier_career') {
      additionalEarlierCareer.push({
        company: pos.company,
        title: pos.title,
        dates: '',
      });
    } else {
      additionalProfessional.push(buildProfessionalExperienceEntry(pos, input));
    }
  }

  return {
    ...draft,
    professional_experience: [...(draft.professional_experience ?? []), ...additionalProfessional],
    earlier_career: [...(draft.earlier_career ?? []), ...additionalEarlierCareer],
  };
}

function ensureRelevantPositionsRemainDetailed(
  draft: ResumeDraftOutput,
  input: ResumeWriterInput,
): ResumeDraftOutput {
  const candidatePositions = getAuthoritativeSourceExperience(input.candidate);
  if (candidatePositions.length === 0 || !draft.earlier_career?.length) return draft;

  const positionLayoutPlan = derivePositionLayoutPlan(input);
  const professionalKeys = new Set(
    (draft.professional_experience ?? []).map((position) => normalizeCompanyKey(position.company, position.title)),
  );
  const retainedEarlierCareer: NonNullable<ResumeDraftOutput['earlier_career']> = [];
  const recoveredProfessional: ResumeDraftOutput['professional_experience'] = [];

  for (const earlierCareerItem of draft.earlier_career ?? []) {
    const key = normalizeCompanyKey(earlierCareerItem.company, earlierCareerItem.title);
    if (positionLayoutPlan.get(key)?.renderSection !== 'professional_experience') {
      retainedEarlierCareer.push(earlierCareerItem);
      continue;
    }

    if (professionalKeys.has(key)) {
      continue;
    }

    const sourcePosition = candidatePositions.find((position) => normalizeCompanyKey(position.company, position.title) === key);
    if (!sourcePosition) {
      retainedEarlierCareer.push(earlierCareerItem);
      continue;
    }

    professionalKeys.add(key);
    recoveredProfessional.push(buildProfessionalExperienceEntry(sourcePosition, input));
  }

  if (recoveredProfessional.length === 0) return draft;

  logger.warn(
    {
      recovered: recoveredProfessional.map((position) => `${position.title} at ${position.company}`),
    },
    'Resume Writer: moved older relevant roles back into professional_experience',
  );

  return {
    ...draft,
    professional_experience: [...(draft.professional_experience ?? []), ...recoveredProfessional],
    earlier_career: retainedEarlierCareer.length > 0 ? retainedEarlierCareer : undefined,
  };
}

// ─── Guardrail: Remove duplicate bullets within a single role ────────────────
// If two bullets have >50% normalized token overlap, or one is a substring of
// the other, or they share an identical opening phrase (first 8 words, >20 chars),
// drop the shorter duplicate. Operates in-place and returns draft.
function deduplicateWithinRole(draft: ResumeDraftOutput): ResumeDraftOutput {
  for (const exp of draft.professional_experience ?? []) {
    if (!exp.bullets || exp.bullets.length < 2) continue;
    const kept: ResumeBullet[] = [];
    for (const bullet of exp.bullets) {
      const normalized = bullet.text.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
      const isDup = kept.some((existing) => {
        const existingNorm = existing.text.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
        if (existingNorm === normalized) return true;
        if (existingNorm.includes(normalized) || normalized.includes(existingNorm)) return true;
        const tokens = new Set(normalized.split(/\s+/));
        const existTokens = new Set(existingNorm.split(/\s+/));
        const overlap = [...tokens].filter((t) => existTokens.has(t)).length;
        const maxLen = Math.max(tokens.size, existTokens.size);
        if (maxLen > 0 && overlap / maxLen > 0.5) return true;
        // Also flag as duplicate if the first 8 words are identical (catches near-duplicates
        // that differ only in metrics or trailing phrases).
        const firstWords = normalized.split(/\s+/).slice(0, 8).join(' ');
        const existingFirstWords = existingNorm.split(/\s+/).slice(0, 8).join(' ');
        if (firstWords.length > 20 && firstWords === existingFirstWords) return true;
        return false;
      });
      if (!isDup) kept.push(bullet);
    }
    exp.bullets = kept;
  }
  return draft;
}

// ─── Guardrail: Back-fill missing start_date / end_date from source resume ───
// LLMs occasionally emit "undefined" or omit date fields. Match each output
// entry back to the authoritative source experience and restore dates.
function ensureDatePopulation(draft: ResumeDraftOutput, input: ResumeWriterInput): ResumeDraftOutput {
  const sourceExp = getAuthoritativeSourceExperience(input.candidate);
  for (const exp of draft.professional_experience ?? []) {
    const needsStart = !exp.start_date || exp.start_date === 'undefined';
    const needsEnd = !exp.end_date || exp.end_date === 'undefined';
    if (!needsStart && !needsEnd) continue;
    const draftKey = normalizeCompanyKey(exp.company ?? '', exp.title ?? '');
    const match = sourceExp.find(
      (s) => normalizeCompanyKey(s.company ?? '', s.title ?? '') === draftKey,
    );
    if (match) {
      if (needsStart) exp.start_date = match.start_date ?? '';
      if (needsEnd) exp.end_date = match.end_date ?? '';
    } else {
      if (needsStart) exp.start_date = '';
      if (needsEnd) exp.end_date = '';
    }
  }
  return draft;
}

// ─── Guardrail: Vary repeated opening verbs within a role ────────────────────
// When the same verb opens 3+ bullets in one role, replace subsequent occurrences
// with alternatives from the lookup table to avoid monotony.
const VERB_ALTERNATIVES: Record<string, string[]> = {
  led: ['Directed', 'Guided', 'Headed'],
  managed: ['Oversaw', 'Administered', 'Coordinated'],
  developed: ['Created', 'Designed', 'Established'],
  built: ['Constructed', 'Assembled', 'Launched'],
  drove: ['Accelerated', 'Advanced', 'Propelled'],
  implemented: ['Deployed', 'Executed', 'Introduced'],
  directed: ['Steered', 'Supervised', 'Guided'],
  oversaw: ['Administered', 'Supervised', 'Coordinated'],
  reduced: ['Cut', 'Trimmed', 'Lowered'],
  improved: ['Boosted', 'Strengthened', 'Enhanced'],
};

function varyOpeningVerbs(draft: ResumeDraftOutput): ResumeDraftOutput {
  for (const exp of draft.professional_experience ?? []) {
    if (!exp.bullets || exp.bullets.length < 3) continue;
    const verbCounts = new Map<string, number>();
    for (const b of exp.bullets) {
      const first = b.text.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
      verbCounts.set(first, (verbCounts.get(first) ?? 0) + 1);
    }
    for (const [verb, count] of verbCounts) {
      if (count < 3) continue;
      const alts = VERB_ALTERNATIVES[verb];
      if (!alts) continue;
      let seen = 0;
      let altIdx = 0;
      for (const b of exp.bullets) {
        const first = b.text.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
        if (first !== verb) continue;
        seen++;
        if (seen === 1) continue;
        if (altIdx < alts.length) {
          const rest = b.text.trim().slice(first.length);
          b.text = alts[altIdx] + rest;
          altIdx++;
        }
      }
    }
  }
  return draft;
}

function normalizeCompanyKey(company: string, title: string): string {
  return `${company.toLowerCase().trim()}::${title.toLowerCase().trim()}`;
}

interface PositionLayoutDecision {
  renderSection: 'professional_experience' | 'earlier_career';
  relevanceScore: number;
  matchedPrioritySignals: number;
  ageYears: number | null;
  reason: string;
}

function derivePositionLayoutPlan(
  input: ResumeWriterInput,
): Map<string, PositionLayoutDecision> {
  const positions = getAuthoritativeSourceExperience(input.candidate);
  const prioritySignals = derivePositionPrioritySignals(input);
  const currentYear = new Date().getFullYear();
  const plan = new Map<string, PositionLayoutDecision>();

  positions.forEach((position, index) => {
    const ageYears = getPositionAgeYears(position, currentYear);
    const relevance = scorePositionRelevance(position, input, prioritySignals);
    const isClearlyRecent = ageYears === null || ageYears < 15;
    const isVeryOld = ageYears !== null && ageYears >= 20;
    const isLowRelevance = relevance.score < 4
      && relevance.matchedPrioritySignals === 0
      && relevance.requirementHits === 0;
    const renderSection: PositionLayoutDecision['renderSection'] = isClearlyRecent || !isVeryOld || !isLowRelevance
      ? 'professional_experience'
      : 'earlier_career';

    let reason: string;
    if (renderSection === 'professional_experience') {
      if (isClearlyRecent) {
        reason = 'Keep in professional experience — recent roles should stay detailed.';
      } else if (relevance.matchedPrioritySignals > 0) {
        reason = `Keep in professional experience — older role still proves current priorities (${relevance.matchedPrioritySignals} matched target signals).`;
      } else {
        reason = 'Keep in professional experience — preserve detail unless the role is both old and low relevance.';
      }
    } else {
      reason = 'Can move to Additional Work Experience — older role has low current-role relevance and can taper safely.';
    }

    // Preserve more generous detail for the first several roles when relevance scoring is noisy,
    // but do not override clearly old, low-signal roles.
    if (index < 5 && renderSection === 'earlier_career' && !(isVeryOld && isLowRelevance)) {
      plan.set(normalizeCompanyKey(position.company, position.title), {
        renderSection: 'professional_experience',
        relevanceScore: relevance.score,
        matchedPrioritySignals: relevance.matchedPrioritySignals,
        ageYears,
        reason: 'Keep in professional experience — top of resume history should remain detailed by default.',
      });
      return;
    }

    plan.set(normalizeCompanyKey(position.company, position.title), {
      renderSection,
      relevanceScore: relevance.score,
      matchedPrioritySignals: relevance.matchedPrioritySignals,
      ageYears,
      reason,
    });
  });

  return plan;
}

function derivePositionPrioritySignals(input: ResumeWriterInput): string[] {
  const selectedTargets = deriveSelectedAccomplishmentTargets(input);
  const rankedCompetencies = [...(input.job_intelligence.core_competencies ?? [])]
    .sort((a, b) => importanceRank(a.importance) - importanceRank(b.importance))
    .slice(0, 5)
    .map((item) => item.competency);
  const jdRequirements = input.gap_analysis.requirements
    .filter((requirement) => requirement.source === 'job_description')
    .sort((a, b) => importanceRank(a.importance) - importanceRank(b.importance))
    .slice(0, 5)
    .map((requirement) => requirement.requirement);

  return dedupeStrings([
    input.job_intelligence.role_title,
    ...selectedTargets.map((target) => target.requirement),
    ...rankedCompetencies,
    ...jdRequirements,
    ...(input.benchmark.expected_technical_skills ?? []).slice(0, 3),
    ...(input.benchmark.expected_industry_knowledge ?? []).slice(0, 2),
  ].filter(Boolean));
}

function scorePositionRelevance(
  position: CandidateExperience,
  input: ResumeWriterInput,
  prioritySignals: string[],
): { score: number; matchedPrioritySignals: number; requirementHits: number } {
  const texts = [
    position.title,
    `${position.title} ${position.company}`,
    ...position.bullets.slice(0, 8),
  ].filter(Boolean);

  let score = 0;
  let matchedPrioritySignals = 0;

  for (const signal of prioritySignals) {
    const bestMatch = texts.reduce((best, text) => Math.max(best, scoreRequirementTextMatch(text, signal)), 0);
    if (bestMatch >= 80) {
      score += 3;
      matchedPrioritySignals += 1;
    } else if (bestMatch >= 35) {
      score += 2;
      matchedPrioritySignals += 1;
    } else if (bestMatch >= 25) {
      score += 1;
    }
  }

  const requirementHits = dedupeStrings(
    position.bullets.flatMap((bullet) => matchRequirementLinks(bullet, input.gap_analysis.requirements)),
  ).length;
  score += requirementHits * 2;

  if (/%|\$|\b\d/.test(position.bullets.join(' '))) {
    score += 1;
  }

  return { score, matchedPrioritySignals, requirementHits };
}

function getPositionAgeYears(position: CandidateExperience, currentYear: number): number | null {
  const endYearMatch = position.end_date?.match(/\b(19|20)\d{2}\b/);
  if (!endYearMatch) return null;
  return Math.max(0, currentYear - Number(endYearMatch[0]));
}

function buildProfessionalExperienceEntry(
  experience: CandidateExperience,
  input: ResumeWriterInput,
): ResumeDraftOutput['professional_experience'][number] {
  const scopeStatement = pickSourceScopeStatement(experience);
  const filteredBullets = experience.bullets.filter((bullet) => (
    !scopeStatement || normalizeLooseText(bullet) !== normalizeLooseText(scopeStatement)
  ));
  const roleBullets = filteredBullets.length > 0 ? filteredBullets : experience.bullets;

  return {
    company: experience.company,
    title: experience.title,
    start_date: experience.start_date,
    end_date: experience.end_date,
    scope_statement: scopeStatement,
    scope_statement_is_new: false,
    scope_statement_source: 'original' as const,
    scope_statement_confidence: 'strong' as const,
    scope_statement_evidence_found: scopeStatement,
    bullets: roleBullets.map((bullet) => {
      const addressesRequirements = matchRequirementLinks(bullet, input.gap_analysis.requirements);
      return {
        text: bullet,
        is_new: false,
        addresses_requirements: addressesRequirements,
        source: 'original' as const,
        requirement_source: inferRequirementSource(addressesRequirements, input.gap_analysis.requirements),
        confidence: 'strong' as const,
        review_state: 'supported' as const,
        evidence_found: bullet,
        content_origin: 'verbatim_resume' as const,
        support_origin: 'original_resume' as const,
      };
    }),
  };
}

function buildEarlierCareer(
  input: ResumeWriterInput,
  positionLayoutPlan = derivePositionLayoutPlan(input),
): NonNullable<ResumeDraftOutput['earlier_career']> {
  return getAuthoritativeSourceExperience(input.candidate)
    .filter((experience) => positionLayoutPlan.get(normalizeCompanyKey(experience.company, experience.title))?.renderSection === 'earlier_career')
    .map((experience) => ({
      company: experience.company,
      title: experience.title,
      dates: '',
    }));
}

function _shouldRethrowForAbort(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  return error instanceof Error && /aborted/i.test(error.message);
}

function buildExecutiveSummary(input: ResumeWriterInput): string {
  const sentences = [
    buildSourceBackedIdentityLine(input),
    buildStrongestProofSummaryLine(input),
    buildSourceBackedRoleFocusLine(input),
  ]
    .map((sentence) => ensureSentence(sentence))
    .filter(Boolean);

  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const sentence of sentences) {
    const key = normalizeLooseText(sentence);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(sentence);
  }

  return deduped.join(' ').trim();
}

function buildStrongestProofSummaryLine(input: ResumeWriterInput): string {
  const bestSourceBullet = getAuthoritativeSourceExperience(input.candidate)
    .flatMap((experience) => experience.bullets ?? [])
    .map((bullet) => ({
      bullet,
      score: scoreSourceBulletImportance(bullet, input) + (/[%$]|\b\d/.test(bullet) ? 4 : 0),
    }))
    .sort((left, right) => right.score - left.score)[0]?.bullet?.trim();

  if (!bestSourceBullet) return '';

  return ensureSentence(bestSourceBullet);
}

function buildSourceBoundCoreCompetencies(input: ResumeWriterInput): string[] {
  const sourceCorpus = buildDraftSafetySourceCorpus(input);
  const sourceDerivedCandidates = [
    ...(input.candidate.certifications ?? []),
    ...(input.candidate.technologies ?? []),
    ...(input.candidate.industry_depth ?? []),
    ...(input.job_intelligence.core_competencies ?? []).map((item) => item.competency),
    ...input.gap_analysis.requirements
      .filter((requirement) => requirement.source === 'job_description' && requirement.classification !== 'missing')
      .map((requirement) => requirement.requirement),
  ];

  return dedupeStrings(
    sourceDerivedCandidates
      .map((value) => shortenCompetencyPhrase(value))
      .filter((value) => competencyMatchesSource(value, sourceCorpus)),
  ).slice(0, 18);
}

function pickSourceScopeStatement(experience: CandidateExperience): string {
  const scopeBullet = experience.bullets.find((bullet) => looksLikeScopeStatement(bullet));
  if (scopeBullet) return scopeBullet;
  return '';
}

function looksLikeScopeStatement(text: string): boolean {
  const lower = text.toLowerCase();
  const scopeMarkers = Array.from(
    lower.matchAll(/\b(team|employees?|direct reports?|budget|p&l|sites?|plants?|facilities|regions?|states?|countries|locations?|operating budget|capital program|headcount)\b/g),
  );
  const distinctMarkers = new Set(scopeMarkers.map((match) => match[1])).size;
  const hasLeadershipVerb = /\b(led|oversaw|managed|ran|directed|owned|supervised|headed|guided)\b/.test(lower);
  const looksLikeOutcomeBullet = /\b(improved|reduced|cut|increased|grew|scaled|boosted|raised)\b/.test(lower)
    && (/%|\bfrom\b|\bto\b|\bby\b/.test(lower));

  if (looksLikeOutcomeBullet) return false;
  return distinctMarkers >= 2 || (hasLeadershipVerb && distinctMarkers >= 1);
}

function buildSourceBackedIdentityLine(input: ResumeWriterInput): string {
  const currentTitle = getAuthoritativeSourceExperience(input.candidate)[0]?.title?.trim() ?? '';
  const years = input.candidate.career_span_years > 0 ? `${input.candidate.career_span_years}+ years` : '';
  const discipline = deriveSourceBackedDiscipline(input);

  if (currentTitle && years && discipline) {
    return `${currentTitle} with ${years} of ${discipline} experience`;
  }
  if (currentTitle && years) {
    return `${currentTitle} with ${years} of leadership experience`;
  }
  if (years && discipline) {
    return `${years} of ${discipline} experience`;
  }
  return currentTitle || years;
}

function deriveSourceBackedDiscipline(input: ResumeWriterInput): string {
  const sourceText = buildDraftSafetySourceCorpus(input);
  if (/\bmanufacturing|plant|lean|six sigma|operations\b/.test(sourceText)) return 'manufacturing operations';
  if (/\bmarketing|brand|demand generation|consumer\b/.test(sourceText)) return 'marketing and brand growth';
  if (/\bsales|revenue|commercial|pipeline\b/.test(sourceText)) return 'commercial leadership';
  if (/\bengineering|cloud|platform|software|infrastructure\b/.test(sourceText)) return 'engineering leadership';
  if (/\bfinance|fp&a|treasury|accounting\b/.test(sourceText)) return 'finance leadership';
  if (/\bsupply chain|distribution|logistics\b/.test(sourceText)) return 'operations and supply chain';
  return 'executive leadership';
}

function buildSourceBackedRoleFocusLine(input: ResumeWriterInput): string {
  const roleTitle = input.job_intelligence.role_title?.trim();
  const directCapabilities = dedupeStrings(
    input.gap_analysis.requirements
      .filter((requirement) => requirement.source === 'job_description' && requirement.classification !== 'missing' && requirement.evidence.length > 0)
      .sort((a, b) => importanceRank(a.importance) - importanceRank(b.importance))
      .map((requirement) => simplifySummaryRequirement(requirement.requirement))
      .filter(Boolean),
  ).slice(0, 2);

  if (roleTitle && directCapabilities.length >= 2) {
    return `Positioned for ${roleTitle} roles that value ${directCapabilities[0]} and ${directCapabilities[1]}`;
  }
  if (roleTitle && directCapabilities.length === 1) {
    return `Positioned for ${roleTitle} roles that value ${directCapabilities[0]}`;
  }
  if (roleTitle) {
    return `Positioned for ${roleTitle} roles in environments that value disciplined execution and measurable results`;
  }
  return '';
}

function simplifySummaryRequirement(value: string): string {
  return value
    .replace(/\b(?:minimum of\s*)?\d+\+?\s+years?\s+of\s+/i, '')
    .replace(/\b(?:minimum of\s*)?\d+\+?\s+years?\b/i, '')
    .replace(/\([^)]*\)/g, '')
    .split(/[;,.]/)[0]
    .replace(/\s+/g, ' ')
    .trim();
}

function ensureSentence(value: string): string {
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  return /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`;
}

function inferRequirementSource(
  matchedRequirements: string[],
  requirements: ResumeWriterInput['gap_analysis']['requirements'],
): 'job_description' | 'benchmark' {
  if (matchedRequirements.length === 0) return 'job_description';
  const sources = matchedRequirements
    .map((matchedRequirement) => requirements.find((requirement) => requirement.requirement === matchedRequirement)?.source)
    .filter((source): source is 'job_description' | 'benchmark' => source === 'job_description' || source === 'benchmark');
  return sources.includes('job_description') ? 'job_description' : 'benchmark';
}

function coerceContentOrigin(value: ResumeContentOrigin | string | undefined): ResumeContentOrigin | undefined {
  switch (value) {
    case 'verbatim_resume':
    case 'resume_rewrite':
    case 'multi_source_synthesis':
    case 'gap_closing_draft':
      return value;
    case 'original_resume':
      return 'verbatim_resume';
    case 'enhanced_from_resume':
      return 'resume_rewrite';
    case 'drafted_to_close_gap':
      return 'gap_closing_draft';
    default:
      return undefined;
  }
}

function inferContentOrigin(
  source: BulletSource,
  options?: {
    originality?: 'identical' | 'similar' | 'novel';
    hasRealEvidence?: boolean;
    existing?: ResumeContentOrigin | string | undefined;
  },
): ResumeContentOrigin {
  const existing = coerceContentOrigin(options?.existing);
  if (source === 'drafted') return 'gap_closing_draft';
  if (source === 'original') return 'verbatim_resume';
  if (existing === 'multi_source_synthesis' || existing === 'resume_rewrite') {
    return existing;
  }
  if (options?.originality === 'similar') return 'resume_rewrite';
  if (options?.hasRealEvidence) return 'multi_source_synthesis';
  return 'resume_rewrite';
}

function inferSupportOrigin(
  source: BulletSource,
  evidenceFound: string,
  existing?: ResumeSupportOrigin,
): ResumeSupportOrigin {
  if (source === 'original') return 'original_resume';
  if (existing === 'user_confirmed_context') return existing;
  if (existing === 'original_resume') return existing;
  if (existing === 'adjacent_resume_inference' && source === 'enhanced') return existing;
  if (evidenceFound.trim().length > 0) return 'original_resume';
  if (source === 'enhanced') return 'adjacent_resume_inference';
  return 'not_found';
}

function inferConfidenceFromSupport(options: {
  source: BulletSource;
  evidenceFound: string;
  supportOrigin?: ResumeSupportOrigin;
  contentOrigin?: ResumeContentOrigin | string;
}): BulletConfidence {
  const contentOrigin = coerceContentOrigin(options.contentOrigin);
  if (options.source === 'drafted' || contentOrigin === 'gap_closing_draft') return 'needs_validation';
  // 'original' source with verbatim content or explicit evidence → strong confidence
  if (options.source === 'original' && contentOrigin === 'verbatim_resume') return 'strong';
  if (options.source === 'original' && options.evidenceFound.trim().length > 0) return 'strong';
  if (options.source === 'original') return 'strong';
  if (options.supportOrigin === 'user_confirmed_context' || options.supportOrigin === 'original_resume') return 'strong';
  if (options.supportOrigin === 'adjacent_resume_inference') return 'partial';
  // 'enhanced' or other non-original sources: evidence found → partial (not strong)
  if (options.evidenceFound.trim().length > 0) return 'partial';
  return 'partial';
}

function findRequirementWorkItem(
  input: ResumeWriterInput | undefined,
  requirement: string | undefined,
  source: RequirementSource | undefined,
): RequirementWorkItem | undefined {
  if (!input?.gap_analysis?.requirement_work_items || !requirement) return undefined;
  const normalizedRequirement = requirement.trim().toLowerCase();
  return input.gap_analysis.requirement_work_items.find((item) => (
    item.requirement.trim().toLowerCase() === normalizedRequirement
      && (!source || item.source === source)
  ));
}

function inferProofLevel(options: {
  confidence: BulletConfidence;
  evidenceFound: string;
  targetEvidence?: string;
  requirementSource: RequirementSource;
  existing?: ProofLevel;
}): ProofLevel {
  if (options.existing === 'direct' || options.existing === 'adjacent' || options.existing === 'inferable' || options.existing === 'none') {
    return options.existing;
  }
  if (options.confidence === 'strong' && (options.targetEvidence?.trim() || options.evidenceFound.trim())) {
    return 'direct';
  }
  if (options.confidence === 'partial') {
    return 'adjacent';
  }
  if (options.confidence === 'needs_validation' && options.evidenceFound.trim()) {
    return options.requirementSource === 'benchmark' ? 'adjacent' : 'inferable';
  }
  return 'none';
}

function inferFramingGuardrail(options: {
  proofLevel: ProofLevel;
  existing?: FramingGuardrail;
}): FramingGuardrail {
  if (options.existing === 'exact' || options.existing === 'reframe' || options.existing === 'soft_inference' || options.existing === 'blocked') {
    return options.existing;
  }
  if (options.proofLevel === 'direct') return 'exact';
  if (options.proofLevel === 'adjacent') return 'reframe';
  if (options.proofLevel === 'inferable') return 'soft_inference';
  return 'blocked';
}

function inferNextBestAction(options: {
  proofLevel: ProofLevel;
  requirementSource: RequirementSource;
  existing?: NextBestAction;
}): NextBestAction {
  if (
    options.existing === 'accept'
    || options.existing === 'tighten'
    || options.existing === 'quantify'
    || options.existing === 'confirm'
    || options.existing === 'answer'
    || options.existing === 'remove'
  ) {
    return options.existing;
  }
  if (options.proofLevel === 'direct') return 'accept';
  if (options.proofLevel === 'adjacent') return options.requirementSource === 'benchmark' ? 'confirm' : 'tighten';
  if (options.proofLevel === 'inferable') return 'quantify';
  return 'answer';
}

function inferReviewState(options: {
  confidence: BulletConfidence;
  requirementSource: RequirementSource;
  contentOrigin?: ResumeContentOrigin | string;
  primaryTargetRequirement?: string;
  targetEvidence?: string;
  proofLevel?: ProofLevel;
  framingGuardrail?: FramingGuardrail;
}): ResumeReviewState {
  if (options.proofLevel || options.framingGuardrail) {
    const proofLevel = options.proofLevel ?? 'none';
    const framingGuardrail = options.framingGuardrail ?? inferFramingGuardrail({ proofLevel });
    if (proofLevel === 'none' || framingGuardrail === 'blocked') {
      return 'code_red';
    }
    if (options.requirementSource === 'benchmark' && proofLevel !== 'direct') {
      return 'confirm_fit';
    }
    if (proofLevel === 'adjacent' || proofLevel === 'inferable') {
      return options.requirementSource === 'benchmark' ? 'confirm_fit' : 'strengthen';
    }
  }

  const contentOrigin = coerceContentOrigin(options.contentOrigin);
  const hasPrimaryTarget = typeof options.primaryTargetRequirement === 'string'
    && options.primaryTargetRequirement.trim().length > 0;
  const hasTargetEvidence = typeof options.targetEvidence === 'string'
    && options.targetEvidence.trim().length > 0;

  if (options.confidence === 'needs_validation' && options.requirementSource === 'benchmark') {
    return 'confirm_fit';
  }
  if (options.confidence === 'needs_validation') {
    return 'code_red';
  }
  if (options.requirementSource === 'benchmark' && hasPrimaryTarget && !hasTargetEvidence) {
    return 'confirm_fit';
  }
  if (options.confidence === 'partial') {
    return options.requirementSource === 'benchmark' ? 'confirm_fit' : 'strengthen';
  }
  if (
    contentOrigin
    && contentOrigin !== 'verbatim_resume'
    && hasPrimaryTarget
    && !hasTargetEvidence
  ) {
    return options.requirementSource === 'benchmark' ? 'confirm_fit' : 'strengthen';
  }
  return contentOrigin && contentOrigin !== 'verbatim_resume'
    ? 'supported_rewrite'
    : 'supported';
}

function buildSelectedAccomplishments(
  input: ResumeWriterInput,
  targets: ResumePriorityTarget[],
): ResumeDraftOutput['selected_accomplishments'] {
  const evidencePool = buildSelectedAccomplishmentEvidencePool(input);
  const evidenceStrengthByContent = new Map(
    evidencePool.map((candidate) => [
      candidate.content.toLowerCase().trim(),
      candidate.proofStrength + (candidate.hasMetric ? 4 : 0),
    ]),
  );
  const targetRequirements = targets.length > 0
    ? targets.map((target) => ({ requirement: target.requirement, source: target.source }))
    : input.gap_analysis.requirements
      .filter(isAccomplishmentCompatibleRequirement)
      .map((requirement) => ({ requirement: requirement.requirement, source: requirement.source }));
  const usedEvidence = new Set<string>();
  const selected: ResumeDraftOutput['selected_accomplishments'] = [];

  const pushSelectedItem = (
    candidate: AccomplishmentEvidenceCandidate,
    primaryTarget: { requirement: string; source: RequirementSource } | null,
  ) => {
    const primaryRequirement = primaryTarget?.requirement;
    const targetEvidence = primaryRequirement && evidenceSupportsRequirement(candidate.evidence, primaryRequirement)
      ? candidate.evidence
      : '';
    const confidence = targetEvidence ? candidate.confidence : inferConfidenceFromSupport({
      source: candidate.source,
      evidenceFound: candidate.evidence,
      supportOrigin: candidate.supportOrigin,
      contentOrigin: candidate.contentOrigin,
    });
    const requirementSource = primaryTarget?.source ?? 'job_description';
    selected.push({
      content: candidate.content,
      is_new: candidate.contentOrigin !== 'verbatim_resume',
      addresses_requirements: primaryRequirement ? [primaryRequirement] : [],
      primary_target_requirement: primaryRequirement,
      primary_target_source: requirementSource,
      target_evidence: targetEvidence,
      source: candidate.source,
      requirement_source: requirementSource,
      confidence,
      review_state: inferReviewState({
        confidence,
        requirementSource,
        contentOrigin: candidate.contentOrigin,
        primaryTargetRequirement: primaryRequirement,
        targetEvidence,
      }),
      evidence_found: candidate.evidence,
      content_origin: candidate.contentOrigin,
      support_origin: candidate.supportOrigin,
    });
  };

  for (const target of targets) {
    const bestEvidence = evidencePool
      .filter((candidate) => !usedEvidence.has(candidate.content.toLowerCase().trim()))
      .map((candidate) => ({
        candidate,
        score: scoreEvidenceAgainstRequirement(candidate, {
          requirement: target.requirement,
          source: target.source,
          importance: target.importance,
          classification: 'partial',
          evidence: [],
          source_evidence: target.source_evidence,
        }, []),
      }))
      .sort((left, right) => right.score - left.score)[0];

    if (!bestEvidence || bestEvidence.score < 35) continue;

    usedEvidence.add(bestEvidence.candidate.content.toLowerCase().trim());
    pushSelectedItem(
      bestEvidence.candidate,
      { requirement: target.requirement, source: target.source },
    );
  }

  const fallback = selected.length >= 3
    ? selected
    : [
        ...selected,
        ...evidencePool
          .filter((candidate) => !usedEvidence.has(candidate.content.toLowerCase().trim()))
          .map((candidate) => {
            const primaryTarget = resolveBestPrimaryTarget(candidate.content, targetRequirements);
            return {
              candidate,
              content: candidate.content,
              evidence: candidate.evidence,
              primaryTarget,
              score: primaryTarget
                ? scoreRequirementTextMatch(candidate.content, primaryTarget.requirement) + (candidate.proofStrength * 4)
                : candidate.proofStrength,
            };
          })
          .filter((candidate) => candidate.primaryTarget && candidate.score >= 30)
          .sort((left, right) => right.score - left.score)
          .map((candidate) => ({
            confidence: candidate.primaryTarget && evidenceSupportsRequirement(candidate.evidence, candidate.primaryTarget.requirement)
              ? candidate.candidate.confidence
              : inferConfidenceFromSupport({
                source: candidate.candidate.source,
                evidenceFound: candidate.evidence,
                supportOrigin: candidate.candidate.supportOrigin,
                contentOrigin: candidate.candidate.contentOrigin,
              }),
            content: candidate.content,
            is_new: candidate.candidate.contentOrigin !== 'verbatim_resume',
            addresses_requirements: candidate.primaryTarget ? [candidate.primaryTarget.requirement] : [],
            primary_target_requirement: candidate.primaryTarget?.requirement,
            primary_target_source: candidate.primaryTarget?.source ?? 'job_description',
            target_evidence: candidate.primaryTarget && evidenceSupportsRequirement(candidate.evidence, candidate.primaryTarget.requirement)
              ? candidate.evidence
              : '',
            source: candidate.candidate.source,
            requirement_source: candidate.primaryTarget?.source ?? 'job_description',
            review_state: inferReviewState({
              confidence: candidate.primaryTarget && evidenceSupportsRequirement(candidate.evidence, candidate.primaryTarget.requirement)
                ? candidate.candidate.confidence
                : inferConfidenceFromSupport({
                  source: candidate.candidate.source,
                  evidenceFound: candidate.evidence,
                  supportOrigin: candidate.candidate.supportOrigin,
                  contentOrigin: candidate.candidate.contentOrigin,
                }),
              requirementSource: candidate.primaryTarget?.source ?? 'job_description',
              contentOrigin: candidate.candidate.contentOrigin,
              primaryTargetRequirement: candidate.primaryTarget?.requirement,
              targetEvidence: candidate.primaryTarget && evidenceSupportsRequirement(candidate.evidence, candidate.primaryTarget.requirement)
                ? candidate.evidence
                : '',
            }),
            evidence_found: candidate.evidence,
            content_origin: candidate.candidate.contentOrigin,
            support_origin: candidate.candidate.supportOrigin,
          })),
      ];

  const deduped: ResumeDraftOutput['selected_accomplishments'] = [];
  const seen = new Set<string>();
  for (const item of fallback) {
    const key = item.content.toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped
    .sort((left, right) => {
      const rightScore = evidenceStrengthByContent.get(right.content.toLowerCase().trim()) ?? 0;
      const leftScore = evidenceStrengthByContent.get(left.content.toLowerCase().trim()) ?? 0;
      if (rightScore !== leftScore) return rightScore - leftScore;

      const rightImportance = targets.find((target) => target.requirement === right.primary_target_requirement)?.importance ?? 'nice_to_have';
      const leftImportance = targets.find((target) => target.requirement === left.primary_target_requirement)?.importance ?? 'nice_to_have';
      return importanceRank(leftImportance) - importanceRank(rightImportance);
    })
    .slice(0, SELECTED_ACCOMPLISHMENT_TARGET_LIMIT);
}

function buildProfessionalExperience(
  input: ResumeWriterInput,
  positionLayoutPlan = derivePositionLayoutPlan(input),
): ResumeDraftOutput['professional_experience'] {
  return getAuthoritativeSourceExperience(input.candidate)
    .filter((experience) => positionLayoutPlan.get(normalizeCompanyKey(experience.company, experience.title))?.renderSection !== 'earlier_career')
    .map((experience) => buildProfessionalExperienceEntry(experience, input));
}

function matchRequirementLinks(text: string, requirements: Array<{ requirement: string }>): string[] {
  const normalizedText = text.toLowerCase();
  const matches = requirements
    .filter((requirement) => {
      const keywords = requirement.requirement
        .toLowerCase()
        .split(/[^a-z0-9+.#/-]+/)
        .filter((keyword) => keyword.length >= 4);
      return keywords.some((keyword) => normalizedText.includes(keyword));
    })
    .slice(0, 3)
    .map((requirement) => requirement.requirement);

  return dedupeStrings(matches);
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildSatisfiedYearsThresholdLine(input: ResumeWriterInput): string {
  const satisfiedRequirement = input.gap_analysis.requirements.find((requirement) => {
    const requiredYears = extractYearsThreshold(requirement.requirement);
    return requiredYears !== null
      && input.candidate.career_span_years >= requiredYears
      && requirement.source === 'job_description';
  });

  if (!satisfiedRequirement) return '';

  const descriptor = satisfiedRequirement.requirement
    .replace(/\b(?:minimum of\s*)?\d+\+?\s+years?\s+of\s+/i, '')
    .replace(/\b(?:minimum of\s*)?\d+\+?\s+years?\b/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!descriptor) {
    return `${input.candidate.career_span_years} years of relevant leadership experience.`;
  }

  if (/^(in|within|across)\b/i.test(descriptor)) {
    return `${input.candidate.career_span_years} years ${descriptor}.`;
  }

  return `${input.candidate.career_span_years} years of ${descriptor}.`;
}

function extractYearsThreshold(text: string): number | null {
  const match = text.match(/\b(?:minimum of\s*)?(\d+)\+?\s+years?\b/i);
  return match ? Number(match[1]) : null;
}
