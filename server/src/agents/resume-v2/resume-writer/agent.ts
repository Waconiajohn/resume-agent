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
import type { ResumeWriterInput, ResumeDraftOutput } from '../types.js';

const loggedFuzzyExperienceFramingMatches = new Set<string>();

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
- 20+ years ago: move to "Additional Work Experience" — title, company, city/state ONLY. No bullets. No dates.
- NEVER remove a position that would create an employment gap greater than 6 months
- NEVER drop ANY position from the candidate's experience. Every single position must appear either in professional_experience (with bullets) or in earlier_career (title/company only for 20+ year old roles). Count the input positions and verify your output has the same total count.
- Do not produce fewer bullets than the original resume had for a role. If the original has 4 bullets, write at least 4 — enhanced, not reduced. You are here to improve, not shrink.

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
Recent positions go in professional_experience with full bullets. Positions 20+ years old go in earlier_career (title/company only).
NEVER omit a position to save space. A 2-page target is a guideline, not a hard limit — include all roles even if that means 3 pages.

${JSON_OUTPUT_GUARDRAILS}`;

export async function runResumeWriter(
  input: ResumeWriterInput,
  signal?: AbortSignal,
): Promise<ResumeDraftOutput> {
  const userMessage = buildUserMessage(input);

  let parsed: ResumeDraftOutput | null = null;

  try {
    const response = await llm.chat({
      model: MODEL_PRIMARY,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      response_format: { type: 'json_object' },
      max_tokens: 16384,
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
        max_tokens: 16384,
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

  const parts: string[] = [
    '## YOUR STRATEGIC DIRECTION',
    `Primary narrative: ${input.narrative.primary_narrative}`,
    `Branded title: ${input.narrative.branded_title}`,
    `Summary angle: ${input.narrative.section_guidance.summary_angle}`,
    `Competency themes: ${competencyThemes.join(', ')}`,
    `Accomplishment priorities: ${accomplishmentPriorities.join('; ')}`,
    '',
  ];

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
    `## CANDIDATE EXPERIENCE (source material — ${input.candidate.experience.length} positions total, ALL must appear in output)`,
  );

  for (const exp of input.candidate.experience) {
    const scope = exp.inferred_scope
      ? `\n  Scope: team=${exp.inferred_scope.team_size ?? '?'}, budget=${exp.inferred_scope.budget ?? '?'}, geo=${exp.inferred_scope.geography ?? '?'}`
      : '';
    parts.push(`\n### ${exp.title} at ${exp.company} (${exp.start_date}–${exp.end_date})${scope}`);
    for (const bullet of exp.bullets) {
      parts.push(`  - ${bullet}`);
    }
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
    `POSITION COUNT CHECK: The candidate has ${input.candidate.experience.length} positions. Your output must include ALL ${input.candidate.experience.length} — split between professional_experience (with bullets) and earlier_career (title/company only for 20+ year old roles). Do NOT drop any positions.`,
    '',
    'Now write the complete resume. Every section reinforces the Why Me narrative. Every bullet answers: "Does this prove why I am THE candidate?" Mark is_new correctly.',
    'Return JSON only. Do not write any introduction, explanation, or markdown fences.',
  );

  return parts.join('\n');
}

function buildDeterministicResumeDraft(input: ResumeWriterInput): ResumeDraftOutput {
  const topRequirements = input.gap_analysis.requirements
    .filter((requirement) => requirement.source === 'job_description')
    .map((requirement) => requirement.requirement);
  const competencyThemes = input.narrative.section_guidance?.competency_themes ?? [];
  const coreCompetencies = dedupeStrings([
    ...competencyThemes,
    ...topRequirements,
    ...(input.candidate.technologies ?? []),
  ]).slice(0, 20);

  const currentYear = new Date().getFullYear();
  const earlierCareerThresholdYear = currentYear - 20;
  const allExperience = input.candidate.experience ?? [];
  // Positions 0-7 are always kept in professional_experience (up to 8 recent roles).
  // Beyond index 7, move to "Additional Work Experience" only if end_date is 20+ years ago.
  // If end_date is unparseable, treat as recent to avoid hiding valid experience.
  const earlierCareer = allExperience.slice(8).filter((experience) => {
    const endYearMatch = experience.end_date?.match(/\b(\d{4})\b/);
    if (!endYearMatch) return false; // keep in professional_experience if date is unclear
    return Number(endYearMatch[1]) < earlierCareerThresholdYear;
  }).map((experience) => ({
    company: experience.company,
    title: experience.title,
    dates: '', // 20+ year old positions: title + company only, no dates
  }));

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
    selected_accomplishments: buildSelectedAccomplishments(input),
    professional_experience: buildProfessionalExperience(input),
    ...(earlierCareer.length > 0 ? { earlier_career: earlierCareer } : {}),
    education: input.candidate.education ?? [],
    certifications: input.candidate.certifications ?? [],
  };
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
 * Guardrail: ensure every candidate position appears in the resume output.
 * If the LLM dropped positions (common with tight max_tokens), backfill them
 * into professional_experience or earlier_career as appropriate.
 */
function ensureAllPositionsPresent(
  draft: ResumeDraftOutput,
  input: ResumeWriterInput,
): ResumeDraftOutput {
  const candidatePositions = input.candidate.experience ?? [];
  if (candidatePositions.length === 0) return draft;

  const outputCompanies = new Set<string>();
  for (const exp of draft.professional_experience ?? []) {
    outputCompanies.add(normalizeCompanyKey(exp.company, exp.title));
  }
  for (const ec of draft.earlier_career ?? []) {
    outputCompanies.add(normalizeCompanyKey(ec.company, ec.title));
  }

  const currentYear = new Date().getFullYear();
  const earlierCareerThresholdYear = currentYear - 20;
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
    const endYearMatch = pos.end_date?.match(/\b(\d{4})\b/);
    const endYear = endYearMatch ? Number(endYearMatch[1]) : currentYear;
    const isOld = endYear < earlierCareerThresholdYear;

    if (isOld) {
      additionalEarlierCareer.push({
        company: pos.company,
        title: pos.title,
        dates: '',
      });
    } else {
      additionalProfessional.push({
        company: pos.company,
        title: pos.title,
        start_date: pos.start_date,
        end_date: pos.end_date,
        scope_statement: pos.inferred_scope
          ? [
              pos.inferred_scope.team_size ? `Team: ${pos.inferred_scope.team_size}` : '',
              pos.inferred_scope.budget ? `Budget: ${pos.inferred_scope.budget}` : '',
              pos.inferred_scope.geography ? `Geography: ${pos.inferred_scope.geography}` : '',
            ].filter(Boolean).join(' | ') || `${pos.title} role`
          : `${pos.title} role`,
        scope_statement_source: 'original' as const,
        scope_statement_confidence: 'strong' as const,
        scope_statement_evidence_found: '',
        bullets: pos.bullets.map((bullet) => ({
          text: bullet,
          is_new: false,
          addresses_requirements: matchRequirementLinks(bullet, input.gap_analysis.requirements),
          source: 'original' as const,
          confidence: 'strong' as const,
          evidence_found: '',
        })),
      });
    }
  }

  return {
    ...draft,
    professional_experience: [...(draft.professional_experience ?? []), ...additionalProfessional],
    earlier_career: [...(draft.earlier_career ?? []), ...additionalEarlierCareer],
  };
}

function normalizeCompanyKey(company: string, title: string): string {
  return `${company.toLowerCase().trim()}::${title.toLowerCase().trim()}`;
}

function shouldRethrowForAbort(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  return error instanceof Error && /aborted/i.test(error.message);
}

function buildExecutiveSummary(input: ResumeWriterInput): string {
  const yearsThresholdLine = buildSatisfiedYearsThresholdLine(input);
  return [
    yearsThresholdLine,
    input.narrative.why_me_concise,
    input.candidate.leadership_scope,
    input.candidate.operational_scale,
  ].filter(Boolean).join(' ').trim();
}

function buildSelectedAccomplishments(input: ResumeWriterInput): ResumeDraftOutput['selected_accomplishments'] {
  const quantified = (input.candidate.quantified_outcomes ?? []).map((item) => ({
    content: `${item.outcome}: ${item.value}`,
    is_new: false,
    addresses_requirements: matchRequirementLinks(item.outcome, input.gap_analysis.requirements),
    source: 'original' as const,
    confidence: 'strong' as const,
    evidence_found: '',
  }));

  const hidden = (input.candidate.hidden_accomplishments ?? [])
    .map((item) => ({
      content: item,
      is_new: false,
      addresses_requirements: matchRequirementLinks(item, input.gap_analysis.requirements),
      source: 'original' as const,
      confidence: 'strong' as const,
      evidence_found: '',
    }));

  return [...quantified, ...hidden];
}

function buildProfessionalExperience(input: ResumeWriterInput): ResumeDraftOutput['professional_experience'] {
  return (input.candidate.experience ?? []).map((experience) => {
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
      bullets: experience.bullets.map((bullet) => ({
        text: bullet,
        is_new: false,
        addresses_requirements: matchRequirementLinks(bullet, input.gap_analysis.requirements),
        source: 'original' as const,
        confidence: 'strong' as const,
        evidence_found: '',
      })),
    };
  });
}

function matchRequirementLinks(text: string, requirements: ResumeWriterInput['gap_analysis']['requirements']): string[] {
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
