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

YOUR GUARDRAILS:
- The Narrative Strategy provides your strategic direction — follow it
- The Gap Analysis tells you what to emphasize and how to position gaps
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
    // Add experience framing from narrative strategy
    const framing = input.narrative.section_guidance.experience_framing[exp.company];
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
    '## WHY ME STORY (for tone reference — do not copy verbatim into resume)',
    input.narrative.why_me_story.slice(0, 2000),
    '',
    'Now write the complete resume. Every bullet must show impact. Every section must reinforce the narrative. Mark is_new correctly.',
  );

  return parts.join('\n');
}
