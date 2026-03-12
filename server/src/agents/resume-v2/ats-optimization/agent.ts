/**
 * Agent 8: ATS Optimization
 *
 * Keyword match scoring, missing keyword identification,
 * placement suggestions, formatting compliance.
 * Optimizes without keyword-stuffing — humans first, ATS second.
 *
 * Model: MODEL_LIGHT
 */

import { llm, MODEL_LIGHT } from '../../../lib/llm.js';
import { repairJSON } from '../../../lib/json-repair.js';
import type { ATSOptimizationInput, ATSOptimizationOutput } from '../types.js';

const SYSTEM_PROMPT = `You are an ATS (Applicant Tracking System) optimization specialist. You know exactly how resume parsing algorithms work and how to maximize keyword match scores WITHOUT making the resume sound like a keyword-stuffed mess.

OUTPUT FORMAT: Return valid JSON:
{
  "match_score": 82,
  "keywords_found": ["keywords from the JD that appear in the resume"],
  "keywords_missing": ["important JD keywords NOT in the resume"],
  "keyword_suggestions": [
    {
      "keyword": "the missing keyword",
      "suggested_placement": "which section to add it to",
      "natural_phrasing": "how to work it in naturally without keyword-stuffing"
    }
  ],
  "formatting_issues": ["any ATS parsing issues (tables, columns, headers, etc.)"]
}

RULES:
- match_score = (keywords_found / total_important_keywords) × 100, where total_important_keywords = keywords_found + keywords_missing
- Only count must-have and important keywords, not nice-to-haves
- natural_phrasing: suggest ACTUAL resume text that incorporates the keyword naturally
- formatting_issues: flag anything that would trip up ATS parsing (tables, multi-column, images, unusual section headers)
- Readability for humans comes FIRST — keyword optimization second`;

export async function runATSOptimization(
  input: ATSOptimizationInput,
  signal?: AbortSignal,
): Promise<ATSOptimizationOutput> {
  const resumeText = formatDraftForATS(input);
  const keywords = input.job_intelligence.language_keywords.join(', ');
  const competencies = input.job_intelligence.core_competencies
    .map(c => `[${c.importance}] ${c.competency}`)
    .join('\n');

  const response = await llm.chat({
    model: MODEL_LIGHT,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `## Resume to Analyze\n\n${resumeText}\n\n## JD Keywords\n${keywords}\n\n## Required Competencies\n${competencies}\n\nScore this resume's ATS match and suggest improvements.`,
    }],
    max_tokens: 4096,
    signal,
  });

  const parsed = repairJSON<ATSOptimizationOutput>(response.text);
  if (!parsed) throw new Error('ATS Optimization agent returned unparseable response');
  return parsed;
}

function formatDraftForATS(input: ATSOptimizationInput): string {
  const d = input.draft;
  const parts: string[] = [
    d.header.name,
    d.header.branded_title,
    '',
    d.executive_summary.content,
    '',
    d.core_competencies.join(' | '),
    '',
  ];

  for (const a of d.selected_accomplishments) {
    parts.push(a.content);
  }

  for (const exp of d.professional_experience) {
    parts.push(`\n${exp.title} | ${exp.company} | ${exp.start_date}–${exp.end_date}`);
    parts.push(exp.scope_statement);
    for (const b of exp.bullets) {
      parts.push(b.text);
    }
  }

  return parts.join('\n');
}
