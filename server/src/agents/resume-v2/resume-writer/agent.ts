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

import { llm, MODEL_PRIMARY } from '../../../lib/llm.js';
import { repairJSON } from '../../../lib/json-repair.js';
import logger from '../../../lib/logger.js';
import { getResumeRulesPrompt } from '../knowledge/resume-rules.js';
import { getAuthoritativeSourceExperience } from '../source-resume-outline.js';
import type {
  ResumeWriterInput,
  ResumeDraftOutput,
  ResumeBullet,
  RequirementGap,
  RequirementSource,
  CandidateExperience,
  BulletSource,
  BulletConfidence,
  ResumePriorityTarget,
  ResumeContentOrigin,
  ResumeReviewState,
  ResumeSupportOrigin,
} from '../types.js';

const loggedFuzzyExperienceFramingMatches = new Set<string>();
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

const SYSTEM_PROMPT = `You are an expert executive resume writer producing a COMPLETE, tailored resume. You write like a $3,000 executive resume writer who has placed hundreds of VPs and C-suite leaders.

## YOUR NORTH STAR

The Why Me story is not a reference document — it is your north star. Every section of this resume must reinforce the narrative arc it establishes. A hiring manager who reads the resume cover to cover should feel the same cumulative story as someone who reads the Why Me story. If a section feels disconnected from the narrative, reframe it.

## YOUR STRATEGIC GUARDRAILS

- The Narrative Strategy provides your strategic direction — follow it with discipline
- The Gap Analysis tells you what to emphasize and how to position gaps
- The gap_positioning_map (when provided) tells you WHERE to surface gap strategies and how to justify them narratively — use it
- NEVER fabricate experience or metrics the candidate cannot defend
- Mark ALL AI-enhanced content with is_new: true (content not directly from original resume)

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

## EXECUTIVE SUMMARY

- Open with the narrative positioning, not generic accomplishments
- The first sentence must immediately establish who this person is through the lens of the Why Me narrative angle
- Name the specific role being targeted — not a generic "senior leader" statement
- Accomplishments come after — once the reader knows WHY this candidate is the one
- Never open with "Results-driven leader," "Seasoned professional," or any equivalent. Open with the positioning.
- Altitude: every sentence should sound like it was written by the candidate, not about them

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
3. **No evidence found**: Draft aspirational but plausible positioning based on the candidate's career arc. Set source='drafted', confidence='needs_validation'. NEVER fabricate specific metrics — use qualitative language.
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

CRITICAL: The resume must address ALL job description requirements. For benchmark items, include the top 5-8 where evidence is strongest.

## 10 QUALITY GATES — CHECK BEFORE OUTPUT

Run this self-check before finalizing the JSON. Every gate must pass:

1. SCOPE TEST — Does every role with meaningful responsibility have a scope statement (team size, budget, geography, P&L)?
2. METRIC TEST — Do 70%+ of all experience bullets have at least one quantified metric?
3. RELEVANCE TEST — Can every bullet, accomplishment, and competency answer: "Why does this matter for THIS role?"
4. ALTITUDE TEST — Does the language, scope, and framing match the seniority level being targeted? Zero task-completion bullets.
5. CLICHE TEST — Zero instances of: "responsible for," "proven leader," "results-oriented," "team player," and all other banned phrases.
6. LENGTH TEST — Is the resume the right length? Target 2 pages for executives. 3 only for C-suite with 20+ years. No padding. No truncation of quality content.
7. RECENCY TEST — Do the most recent 1-2 roles have the most bullets? Do older roles taper proportionally?
8. ATS TEST — Do the top 10 JD keywords each appear at least once? Do the top 5 appear in 2+ sections?
9. SO-WHAT TEST — Zero pure-activity bullets. Every bullet has a result, outcome, or demonstrated impact.
10. AGE-PROOF TEST — No graduation years for degrees 20+ years old. No "30 years of experience." No obsolete tech. No objective statement.

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
      "scope_statement": "Brief scope: team size, budget, geography, P&L responsibility",
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
  "certifications": ["active, relevant certifications only — omit expired or unrelated"]
}

OUTPUT: Write the COMPLETE resume as a JSON object matching the schema above.
Include ALL sections that have data. Do not truncate. This is a finished document, not an outline.
CRITICAL — EVERY position from the candidate's experience MUST appear in the output.
Recent positions go in professional_experience with full bullets. Older positions stay in professional_experience when they still prove the target role; move them to earlier_career only when they are both old and low relevance.
NEVER omit a position to save space. A 2-page target is a guideline, not a hard limit — include all roles even if that means 3 pages.

${JSON_OUTPUT_GUARDRAILS}`;

export async function runResumeWriter(
  input: ResumeWriterInput,
  signal?: AbortSignal,
): Promise<ResumeDraftOutput> {
  const userMessage = buildUserMessage(input);
  const selectedAccomplishmentTargets = deriveSelectedAccomplishmentTargets(input);

  let parsed: ResumeDraftOutput | null = null;

  try {
    const response = await llm.chat({
      model: MODEL_PRIMARY,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      response_format: { type: 'json_object' },
      max_tokens: 32768,
      signal,
    });

    parsed = repairJSON<ResumeDraftOutput>(response.text);

    if (!parsed) {
      logger.warn(
        { rawSnippet: response.text.substring(0, 500) },
        'Resume Writer: first attempt unparseable, retrying with stricter prompt',
      );
    }
  } catch (error) {
    if (shouldRethrowForAbort(error, signal)) throw error;
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'Resume Writer: first attempt failed, retrying with stricter prompt',
    );
  }

  if (!parsed) {
    try {
      const retry = await llm.chat({
        model: MODEL_PRIMARY,
        system: 'You are a JSON extraction machine. Return ONLY valid JSON — no markdown fences, no commentary, no text before or after the JSON object. Start with { and end with }.',
        messages: [{ role: 'user', content: `${SYSTEM_PROMPT}\n\n${userMessage}` }],
        response_format: { type: 'json_object' },
        max_tokens: 32768,
        signal,
      });

      parsed = repairJSON<ResumeDraftOutput>(retry.text);

      if (!parsed) {
        logger.error(
          { rawSnippet: retry.text.substring(0, 500) },
          'Resume Writer: retry returned unparseable response, using deterministic fallback',
        );
      }
    } catch (error) {
      if (shouldRethrowForAbort(error, signal)) throw error;
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Resume Writer: retry failed, using deterministic fallback',
      );
    }
  }

  if (!parsed) {
    parsed = buildDeterministicResumeDraft(input);
  }

  parsed = ensureSatisfiedYearsThresholdVisible(parsed, input);
  parsed = ensureStrongestProofVisible(parsed, input);

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

  // Temp debug: write to file so we can inspect
  try {
    const fs = await import('node:fs');
    const debugData = {
      reviewStateCounts,
      totalBullets: (parsed.selected_accomplishments?.length ?? 0) + (parsed.professional_experience ?? []).reduce((s, e) => s + (e.bullets?.length ?? 0), 0),
      positions: (parsed.professional_experience ?? []).map(e => ({
        company: e.company,
        bulletCount: (e.bullets ?? []).length,
        bullets: (e.bullets ?? []).slice(0, 2).map(b => ({ text: b.text.slice(0, 60), source: b.source, confidence: b.confidence, req_source: b.requirement_source, reqs: b.addresses_requirements?.slice(0, 2) })),
      })),
      reqSourceMap: input.gap_analysis?.requirements?.slice(0, 5).map(r => ({ req: r.requirement, source: r.source })),
      selectedAccomplishmentTargets,
    };
    fs.writeFileSync('/tmp/resume-color-debug.json', JSON.stringify(debugData, null, 2));
  } catch {}

  return parsed;
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

function buildUserMessage(input: ResumeWriterInput): string {
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

  const parts: string[] = [
    '## YOUR STRATEGIC DIRECTION',
    `Primary narrative: ${input.narrative.primary_narrative}`,
    `Branded title: ${input.narrative.branded_title}`,
    `Summary angle: ${input.narrative.section_guidance.summary_angle}`,
    `Competency themes: ${competencyThemes.join(', ')}`,
    `Accomplishment priorities: ${accomplishmentPriorities.join('; ')}`,
    '',
  ];

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
    '## GAP STRATEGIES (user-approved — use in bullets)',
  );

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
  const topRequirements = input.gap_analysis.requirements
    .filter((requirement) => requirement.source === 'job_description')
    .map((requirement) => requirement.requirement);
  const competencyThemes = input.narrative.section_guidance?.competency_themes ?? [];
  const coreCompetencies = dedupeStrings([
    ...competencyThemes,
    ...topRequirements,
    ...(input.candidate.technologies ?? []),
  ]).slice(0, 20);

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

    const draftBulletCount = (draftExp.bullets ?? []).length;
    const originalBulletCount = originalExp.bullets.length;
    const draftBullets = draftExp.bullets ?? [];
    const uncoveredSourceBullets = originalExp.bullets
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

    const coverageRecovery = findUncoveredSourceBulletsAndUnusedDraftIndexes(originalExp.bullets, draftBullets, input);
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

    const residualCoverage = findResidualCoverageGaps(originalExp.bullets, draftBullets, input);
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

    const duplicateCoverage = findDuplicateCoverageGaps(originalExp.bullets, draftBullets, input);
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

function calculateLongestCommonSubstringRatio(leftText: string, rightText: string): number {
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
    const targetEvidence = bullet.target_evidence ?? (
      primaryTarget && evidenceSupportsRequirement(bullet.evidence_found ?? '', primaryTarget)
        ? bullet.evidence_found ?? ''
        : ''
    );
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
      }),
      evidence_found: bullet.evidence_found ?? '',
      requirement_source: requirementSource,
      addresses_requirements: reqs,
      primary_target_requirement: primaryTarget,
      primary_target_source: bullet.primary_target_source ?? (primaryTarget ? requirementSource : undefined),
      target_evidence: targetEvidence,
      content_origin: contentOrigin,
      support_origin: normalizedSupportOrigin,
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
      const targetEvidence = a.target_evidence ?? (
        primaryTarget && evidenceSupportsRequirement(a.evidence_found ?? '', primaryTarget)
          ? a.evidence_found ?? ''
          : ''
      );
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
        }),
        evidence_found: a.evidence_found ?? '',
        requirement_source: requirementSource,
        addresses_requirements: reqs,
        primary_target_requirement: primaryTarget,
        primary_target_source: a.primary_target_source ?? (primaryTarget ? requirementSource : undefined),
        target_evidence: targetEvidence,
        content_origin: contentOrigin,
        support_origin: normalizedSupportOrigin,
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
  const scopeParts = [
    experience.inferred_scope?.team_size ? `Team: ${experience.inferred_scope.team_size}` : '',
    experience.inferred_scope?.budget ? `Budget: ${experience.inferred_scope.budget}` : '',
    experience.inferred_scope?.geography ? `Geography: ${experience.inferred_scope.geography}` : '',
    experience.inferred_scope?.revenue_impact ? `Revenue: ${experience.inferred_scope.revenue_impact}` : '',
  ].filter(Boolean);

  return {
    company: experience.company,
    title: experience.title,
    start_date: experience.start_date,
    end_date: experience.end_date,
    scope_statement: scopeParts.join(' | ') || (experience.bullets[0] ?? `${experience.title} role`),
    scope_statement_is_new: false,
    scope_statement_source: 'original' as const,
    scope_statement_confidence: 'strong' as const,
    scope_statement_evidence_found: '',
    bullets: experience.bullets.map((bullet) => {
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

function shouldRethrowForAbort(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  return error instanceof Error && /aborted/i.test(error.message);
}

function buildExecutiveSummary(input: ResumeWriterInput): string {
  const yearsThresholdLine = buildSatisfiedYearsThresholdLine(input);
  const strongestProofLine = buildStrongestProofSummaryLine(input);
  return [
    yearsThresholdLine,
    strongestProofLine,
    input.narrative.why_me_concise,
    input.candidate.leadership_scope,
    input.candidate.operational_scale,
  ].filter(Boolean).join(' ').trim();
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

  const summaryText = [
    input.narrative.why_me_concise,
    input.candidate.leadership_scope,
    input.candidate.operational_scale,
  ].join(' ').toLowerCase();
  if (summaryText.includes(bestSourceBullet.toLowerCase())) {
    return '';
  }

  return bestSourceBullet.endsWith('.') ? bestSourceBullet : `${bestSourceBullet}.`;
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
  if (options.source === 'original' || contentOrigin === 'verbatim_resume') return 'strong';
  if (options.supportOrigin === 'user_confirmed_context' || options.supportOrigin === 'original_resume') return 'strong';
  if (options.supportOrigin === 'adjacent_resume_inference') return 'partial';
  if (options.evidenceFound.trim().length > 0) return 'strong';
  return 'partial';
}

function inferReviewState(options: {
  confidence: BulletConfidence;
  requirementSource: RequirementSource;
  contentOrigin?: ResumeContentOrigin | string;
  primaryTargetRequirement?: string;
  targetEvidence?: string;
}): ResumeReviewState {
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

function ensureSatisfiedYearsThresholdVisible(
  draft: ResumeDraftOutput,
  input: ResumeWriterInput,
): ResumeDraftOutput {
  const yearsThresholdLine = buildSatisfiedYearsThresholdLine(input);
  if (!yearsThresholdLine) return draft;

  const currentSummary = draft.executive_summary?.content?.trim() ?? '';
  if (!currentSummary) {
    return {
      ...draft,
      executive_summary: {
        content: yearsThresholdLine,
        is_new: true,
      },
    };
  }

  if (summaryAlreadyShowsYearsThreshold(currentSummary, input)) {
    return draft;
  }

  return {
    ...draft,
    executive_summary: {
      ...draft.executive_summary,
      content: `${yearsThresholdLine} ${currentSummary}`.trim(),
      is_new: true,
    },
  };
}

function ensureStrongestProofVisible(
  draft: ResumeDraftOutput,
  input: ResumeWriterInput,
): ResumeDraftOutput {
  const strongestProofLine = buildStrongestProofSummaryLine(input);
  if (!strongestProofLine) return draft;

  const currentSummary = draft.executive_summary?.content?.trim() ?? '';
  if (!currentSummary) {
    return {
      ...draft,
      executive_summary: {
        content: strongestProofLine,
        is_new: true,
      },
    };
  }

  const normalizedSummary = currentSummary.toLowerCase();
  const normalizedStrongestProof = strongestProofLine.toLowerCase().replace(/\.$/, '');
  if (normalizedSummary.includes(normalizedStrongestProof)) {
    return draft;
  }

  return {
    ...draft,
    executive_summary: {
      ...draft.executive_summary,
      content: `${strongestProofLine} ${currentSummary}`.trim(),
      is_new: true,
    },
  };
}

function summaryAlreadyShowsYearsThreshold(
  summary: string,
  input: ResumeWriterInput,
): boolean {
  const normalizedSummary = summary.toLowerCase();
  const years = input.candidate.career_span_years;
  if (normalizedSummary.includes(`${years} years`)) {
    return true;
  }
  const mentionedYears = Array.from(summary.matchAll(/\b(?:minimum of\s*)?(\d+)\+?\s+years?\b/gi))
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value));

  if (mentionedYears.some((value) => value >= years)) {
    return true;
  }

  const satisfiedRequirement = input.gap_analysis.requirements.find((requirement) => {
    const requiredYears = extractYearsThreshold(requirement.requirement);
    return requiredYears !== null
      && input.candidate.career_span_years >= requiredYears
      && requirement.source === 'job_description';
  });

  if (!satisfiedRequirement) return false;
  const requiredYears = extractYearsThreshold(satisfiedRequirement.requirement);
  return requiredYears !== null && mentionedYears.some((value) => value >= requiredYears);
}

function extractYearsThreshold(text: string): number | null {
  const match = text.match(/\b(?:minimum of\s*)?(\d+)\+?\s+years?\b/i);
  return match ? Number(match[1]) : null;
}
