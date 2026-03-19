/**
 * Agent 6: Resume Writer
 *
 * Single powerful prompt that produces a COMPLETE 2-page resume.
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

const SYSTEM_PROMPT = `You are the #1 executive resume writer in the country. Your clients pay $3,000+ per engagement. You've placed candidates at Google, McKinsey, Fortune 100 C-suites, and PE-backed growth companies.

You are writing a COMPLETE 2-page executive resume. Not an outline. Not suggestions. The finished product.

YOUR CREATIVE AUTHORITY:
- You decide how to phrase every bullet
- You decide which accomplishments to feature prominently
- You decide how to weave keywords naturally
- You choose the voice, rhythm, and flow of the document
- You are a WRITER, not an executor following instructions

YOUR NORTH STAR:
The Why Me story is not a reference document — it is your north star. Every section of this resume must reinforce the narrative arc it establishes. A hiring manager who reads the resume cover to cover should feel the same cumulative story as someone who reads the Why Me story. If a section feels disconnected from the narrative, reframe it.

YOUR GUARDRAILS:
- The Narrative Strategy provides your strategic direction — follow it with discipline
- The Why Me story establishes the arc — every section must reinforce it
- The Gap Analysis tells you what to emphasize and how to position gaps
- The gap_positioning_map (when provided) tells you WHERE to surface gap strategies and how to justify them narratively — use it
- The Resume Rules are your formatting bible — follow them exactly
- NEVER fabricate experience or metrics the candidate cannot defend
- Mark ALL AI-enhanced content with is_new: true (content not directly from original resume)

${getResumeRulesPrompt()}

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
    "content": "3-5 line executive summary. Pitch + scale + marquee accomplishments.",
    "is_new": true
  },
  // is_new: true = content you wrote, rephrased, or enhanced beyond the original resume
  // is_new: false = content taken verbatim or near-verbatim from the original
  "core_competencies": ["9-12 hard skills mirroring JD keywords"],
  "selected_accomplishments": [
    {
      "content": "Action Verb + What You Did + Measurable Result",
      "is_new": false,
      "addresses_requirements": ["which JD requirements this addresses"]
    }
  ],
  "professional_experience": [
    {
      "company": "Company Name",
      "title": "Job Title",
      "start_date": "Start",
      "end_date": "End",
      "scope_statement": "Brief scope: team size, budget, geography, P&L",
      "bullets": [
        {
          "text": "Strong action verb + challenge/method + measurable result",
          "is_new": false,
          "addresses_requirements": ["requirement1"]
        }
      ]
    }
  ],
  "earlier_career": [
    {"company": "Company", "title": "Title", "dates": "Start–End"}
  ],
  "education": [
    {"degree": "Degree", "institution": "School", "year": "only if <20 years ago"}
  ],
  "certifications": ["list"]
}

SECTION-BY-SECTION NARRATIVE GUIDANCE:

Executive Summary:
- OPEN with the narrative positioning, not generic accomplishments
- The first sentence should immediately establish who this person is through the lens of the Why Me narrative angle
- Accomplishments come second — after the reader knows WHY this candidate is the one
- Do not open with "Results-driven leader" or any equivalent. Open with the positioning.

Core Competencies:
- Group them to reinforce the narrative themes, not just as a keyword dump
- Use the competency_themes from the Narrative Strategy to cluster them
- The grouping should reflect the unique combination from the narrative

Experience Bullets:
- Before writing each bullet, ask: "Does this reinforce why this person is THE candidate for this role?"
- If a bullet doesn't reinforce the narrative, reframe it so it does — without fabricating
- Every bullet should show agency, scale, and impact — not just activity
- If the gap_positioning_map specifies where to surface a gap strategy, execute it in that role's bullets

CRITICAL RULES:
1. is_new = true for ANY content you wrote, rephrased, or enhanced beyond the original resume
2. is_new = false ONLY for content taken verbatim or near-verbatim from the original
3. Contact info comes from the Candidate Intelligence — use the ACTUAL name, never a placeholder
4. 4-7 bullets per recent role, 3-6 selected accomplishments
5. Last 10-15 years detailed, older roles in earlier_career (company/title/dates only)
6. No graduation dates for candidates 45+ (career span > 20 years)
7. Every bullet starts with a strong action verb — NEVER "responsible for"
8. Quantify across money, time, volume, scope wherever possible

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
      max_tokens: 8192,
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
        max_tokens: 8192,
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
    '## CANDIDATE EXPERIENCE (source material)',
  );

  for (const exp of input.candidate.experience) {
    const scope = exp.inferred_scope
      ? `\n  Scope: team=${exp.inferred_scope.team_size ?? '?'}, budget=${exp.inferred_scope.budget ?? '?'}, geo=${exp.inferred_scope.geography ?? '?'}`
      : '';
    parts.push(`\n### ${exp.title} at ${exp.company} (${exp.start_date}–${exp.end_date})${scope}`);
    for (const bullet of exp.bullets.slice(0, 4)) {
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
    '## JOB KEYWORDS (ATS targets — weave naturally)',
    input.job_intelligence.language_keywords.join(', '),
    '',
    '## GAP STRATEGIES (user-approved — use in bullets)',
  );

  for (const s of input.approved_strategies) {
    parts.push(`- ${s.requirement}: ${s.strategy.positioning}${s.strategy.inferred_metric ? ` [use: ${s.strategy.inferred_metric}]` : ''}`);
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
    'Now write the complete resume. Every section reinforces the Why Me narrative. Every bullet answers: "Does this prove why I am THE candidate?" Mark is_new correctly.',
    'Return JSON only. Do not write any introduction, explanation, or markdown fences.',
  );

  return parts.join('\n');
}

function buildDeterministicResumeDraft(input: ResumeWriterInput): ResumeDraftOutput {
  const topRequirements = input.gap_analysis.requirements
    .filter((requirement) => requirement.source === 'job_description')
    .slice(0, 8)
    .map((requirement) => requirement.requirement);
  const competencyThemes = input.narrative.section_guidance?.competency_themes ?? [];
  const coreCompetencies = dedupeStrings([
    ...competencyThemes,
    ...topRequirements,
    ...(input.candidate.technologies ?? []).slice(0, 6),
  ]).slice(0, 12);

  const earlierCareer = (input.candidate.experience ?? []).slice(4).map((experience) => ({
    company: experience.company,
    title: experience.title,
    dates: `${experience.start_date}–${experience.end_date}`,
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

function shouldRethrowForAbort(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  return error instanceof Error && /aborted/i.test(error.message);
}

function buildExecutiveSummary(input: ResumeWriterInput): string {
  return [
    input.narrative.why_me_concise,
    input.candidate.leadership_scope,
    input.candidate.operational_scale,
  ].filter(Boolean).join(' ').trim();
}

function buildSelectedAccomplishments(input: ResumeWriterInput): ResumeDraftOutput['selected_accomplishments'] {
  const quantified = (input.candidate.quantified_outcomes ?? []).slice(0, 3).map((item) => ({
    content: `${item.outcome}: ${item.value}`,
    is_new: false,
    addresses_requirements: matchRequirementLinks(item.outcome, input.gap_analysis.requirements),
  }));

  const hidden = (input.candidate.hidden_accomplishments ?? [])
    .slice(0, Math.max(0, 5 - quantified.length))
    .map((item) => ({
      content: item,
      is_new: false,
      addresses_requirements: matchRequirementLinks(item, input.gap_analysis.requirements),
    }));

  return [...quantified, ...hidden];
}

function buildProfessionalExperience(input: ResumeWriterInput): ResumeDraftOutput['professional_experience'] {
  return (input.candidate.experience ?? []).slice(0, 4).map((experience) => {
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
      bullets: experience.bullets.slice(0, 5).map((bullet) => ({
        text: bullet,
        is_new: false,
        addresses_requirements: matchRequirementLinks(bullet, input.gap_analysis.requirements),
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
