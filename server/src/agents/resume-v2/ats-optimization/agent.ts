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
import logger from '../../../lib/logger.js';
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
- Match multi-word PHRASES, not just single keywords. "cross-functional collaboration" counts as one phrase.
- match_score = (keywords_found / total_important_keywords) × 100, where total_important_keywords = keywords_found + keywords_missing
- Only count must-have and important phrases/keywords, not nice-to-haves
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

  const userMessage = `## Resume to Analyze\n\n${resumeText}\n\n## JD Keywords\n${keywords}\n\n## Required Competencies\n${competencies}\n\nScore this resume's ATS match and suggest improvements.`;

  // Attempt 1
  const response = await llm.chat({
    model: MODEL_LIGHT,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
    max_tokens: 4096,
    signal,
  });

  const parsed = repairJSON<ATSOptimizationOutput>(response.text);
  const normalized = parsed ? normalizeATSOptimizationOutput(parsed, input) : null;
  if (normalized) return normalized;

  // Attempt 2: retry with explicit JSON-only instruction
  logger.warn(
    { rawSnippet: response.text.substring(0, 500) },
    'ATS Optimization: first attempt unparseable, retrying with stricter prompt',
  );

  const retry = await llm.chat({
    model: MODEL_LIGHT,
    system: 'You are a JSON extraction machine. Return ONLY valid JSON — no markdown fences, no commentary, no text before or after the JSON object. Start with { and end with }.',
    messages: [{ role: 'user', content: `${SYSTEM_PROMPT}\n\n${userMessage}` }],
    max_tokens: 4096,
    signal,
  });

  const retryParsed = repairJSON<ATSOptimizationOutput>(retry.text);
  const retryNormalized = retryParsed ? normalizeATSOptimizationOutput(retryParsed, input) : null;
  if (retryNormalized) return retryNormalized;

  logger.warn(
    { rawSnippet: retry.text.substring(0, 500) },
    'ATS Optimization: both attempts returned unparseable response, using deterministic fallback',
  );
  return buildDeterministicATSFallback(input);
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

function normalizeATSOptimizationOutput(
  output: ATSOptimizationOutput,
  input: ATSOptimizationInput,
): ATSOptimizationOutput | null {
  if (!output || typeof output !== 'object') return null;

  const fallback = buildDeterministicATSFallback(input);
  const keywordsFound = sanitizeStringArray(output.keywords_found);
  const keywordsMissing = sanitizeStringArray(output.keywords_missing);
  const suggestions = Array.isArray(output.keyword_suggestions)
    ? output.keyword_suggestions
      .filter((item): item is ATSOptimizationOutput['keyword_suggestions'][number] => Boolean(item && typeof item === 'object'))
      .map((item) => ({
        keyword: typeof item.keyword === 'string' ? item.keyword.trim() : '',
        suggested_placement: typeof item.suggested_placement === 'string' ? item.suggested_placement.trim() : 'executive_summary',
        natural_phrasing: typeof item.natural_phrasing === 'string' ? item.natural_phrasing.trim() : '',
      }))
      .filter((item) => item.keyword.length > 0)
    : [];
  const formattingIssues = sanitizeStringArray(output.formatting_issues);

  const matchScore = typeof output.match_score === 'number' && Number.isFinite(output.match_score)
    ? Math.max(0, Math.min(100, Math.round(output.match_score)))
    : fallback.match_score;

  const normalizedFound = keywordsFound.length > 0 ? keywordsFound : fallback.keywords_found;
  const normalizedMissing = keywordsMissing.length > 0 ? keywordsMissing : fallback.keywords_missing;
  const normalizedSuggestions = suggestions.length > 0
    ? suggestions
    : fallback.keyword_suggestions.filter((item) => normalizedMissing.includes(item.keyword));

  return {
    match_score: matchScore,
    keywords_found: dedupeStrings(normalizedFound),
    keywords_missing: dedupeStrings(normalizedMissing.filter((keyword) => !normalizedFound.includes(keyword))),
    keyword_suggestions: dedupeSuggestions(normalizedSuggestions),
    formatting_issues: dedupeStrings(formattingIssues),
  };
}

function buildDeterministicATSFallback(input: ATSOptimizationInput): ATSOptimizationOutput {
  const resumeText = formatDraftForATS(input).toLowerCase();
  const keywordUniverse = dedupeStrings([
    ...input.job_intelligence.language_keywords,
    ...input.job_intelligence.core_competencies
      .filter((competency) => competency.importance !== 'nice_to_have')
      .map((competency) => competency.competency),
  ]).filter(Boolean);

  const keywordsFound = keywordUniverse.filter((keyword) => resumeText.includes(keyword.toLowerCase()));
  const keywordsMissing = keywordUniverse.filter((keyword) => !resumeText.includes(keyword.toLowerCase()));
  const totalKeywords = keywordUniverse.length || (keywordsFound.length + keywordsMissing.length);
  const matchScore = totalKeywords > 0
    ? Math.round((keywordsFound.length / totalKeywords) * 100)
    : 100;

  return {
    match_score: matchScore,
    keywords_found: keywordsFound,
    keywords_missing: keywordsMissing,
    keyword_suggestions: keywordsMissing.slice(0, 5).map((keyword) => ({
      keyword,
      suggested_placement: chooseKeywordPlacement(keyword),
      natural_phrasing: buildNaturalKeywordSuggestion(keyword),
    })),
    formatting_issues: [],
  };
}

function sanitizeStringArray(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean);
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(value.trim());
  }
  return result;
}

function dedupeSuggestions(
  suggestions: ATSOptimizationOutput['keyword_suggestions'],
): ATSOptimizationOutput['keyword_suggestions'] {
  const seen = new Set<string>();
  const result: ATSOptimizationOutput['keyword_suggestions'] = [];
  for (const suggestion of suggestions) {
    const key = suggestion.keyword.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(suggestion);
  }
  return result;
}

function chooseKeywordPlacement(keyword: string): string {
  return keyword.includes(' ') || keyword.length > 18
    ? 'executive_summary'
    : 'core_competencies';
}

function buildNaturalKeywordSuggestion(keyword: string): string {
  return `Add truthful proof of ${keyword} in a summary line or experience bullet rather than listing it without context.`;
}
