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
import { getResumeRulesPrompt } from '../knowledge/resume-rules.js';
import type { ResumeWriterInput, ResumeDraftOutput } from '../types.js';

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
8. Quantify across money, time, volume, scope wherever possible`;

export async function runResumeWriter(
  input: ResumeWriterInput,
  signal?: AbortSignal,
): Promise<ResumeDraftOutput> {
  const userMessage = buildUserMessage(input);

  const response = await llm.chat({
    model: MODEL_PRIMARY,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
    max_tokens: 8192,
    signal,
  });

  const parsed = repairJSON<ResumeDraftOutput>(response.text);
  if (!parsed) throw new Error('Resume Writer agent returned unparseable response');

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
 * Logs a warning when falling back to fuzzy match so drift is visible in server logs.
 */
function lookupExperienceFraming(
  framingMap: Record<string, string>,
  companyName: string,
): string | undefined {
  // 1. Exact match
  if (framingMap[companyName] !== undefined) {
    return framingMap[companyName];
  }

  const normalizedTarget = companyName.toLowerCase();

  for (const key of Object.keys(framingMap)) {
    const normalizedKey = key.toLowerCase();

    // 2. Case-insensitive match
    if (normalizedKey === normalizedTarget) {
      console.warn(
        `[ResumeWriter] experience_framing fuzzy match (case-insensitive): ` +
        `resume company="${companyName}" matched framing key="${key}"`,
      );
      return framingMap[key];
    }

    // 3. Substring includes match (either direction)
    if (normalizedKey.includes(normalizedTarget) || normalizedTarget.includes(normalizedKey)) {
      console.warn(
        `[ResumeWriter] experience_framing fuzzy match (includes): ` +
        `resume company="${companyName}" matched framing key="${key}"`,
      );
      return framingMap[key];
    }
  }

  return undefined;
}

function buildUserMessage(input: ResumeWriterInput): string {
  const parts: string[] = [
    '## YOUR STRATEGIC DIRECTION',
    `Primary narrative: ${input.narrative.primary_narrative}`,
    `Branded title: ${input.narrative.branded_title}`,
    `Summary angle: ${input.narrative.section_guidance.summary_angle}`,
    `Competency themes: ${input.narrative.section_guidance.competency_themes.join(', ')}`,
    `Accomplishment priorities: ${input.narrative.section_guidance.accomplishment_priorities.join('; ')}`,
    '',
    '## CANDIDATE CONTACT INFO (use exactly)',
    `Name: ${input.candidate.contact.name}`,
    `Email: ${input.candidate.contact.email}`,
    `Phone: ${input.candidate.contact.phone}`,
    `LinkedIn: ${input.candidate.contact.linkedin ?? 'not provided'}`,
    `Location: ${input.candidate.contact.location ?? 'not provided'}`,
    '',
    '## CANDIDATE EXPERIENCE (source material)',
  ];

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
      input.narrative.section_guidance.experience_framing,
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
    input.narrative.why_me_story.slice(0, 6000),
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
  );

  return parts.join('\n');
}
