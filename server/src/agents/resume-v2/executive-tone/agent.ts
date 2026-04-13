/**
 * Agent 9: Executive Tone
 *
 * Tone audit — flags junior language, AI-generated phrasing,
 * generic filler, passive voice. Suggests replacements.
 *
 * Model: MODEL_MID
 */

import { MODEL_MID } from '../../../lib/llm.js';
import { chatWithTruncationRetry } from '../../../lib/llm-retry.js';
import { repairJSON } from '../../../lib/json-repair.js';
import logger from '../../../lib/logger.js';
import { BANNED_PHRASES, SOURCE_DISCIPLINE } from '../knowledge/resume-rules.js';
import type { ExecutiveToneInput, ExecutiveToneOutput } from '../types.js';

const JSON_OUTPUT_GUARDRAILS = `CRITICAL JSON RULES:
- Return exactly one JSON object.
- The first character of your response must be { and the last character must be }.
- Use double-quoted JSON keys and string values.
- Do not wrap the JSON in markdown fences.
- Do not add commentary, introductions, or notes outside the JSON object.
- If there are no findings, return an empty findings array instead of prose.
- Keep the output compact: return at most 12 findings.`;

const SYSTEM_PROMPT = `You are an executive communications director who has edited 1,000+ C-suite resumes. You can spot junior language, AI-generated phrasing, and generic filler from a mile away.

CRITICAL CONSTRAINT: Your rewrites may ONLY change wording and style. You may NOT add new facts, metrics, numbers, certifications, titles, company names, or scope claims that are not already in the text you are rewriting. If the original bullet says "Reduced costs," your rewrite must say "Reduced costs" or "Cut costs" — you cannot add "$2M" if that number is not already there. Invent nothing. Preserve all quantitative claims exactly as written.

Your job: audit this resume for tone. Every sentence should sound like it was written BY an executive, FOR an executive audience.

FLAGS TO LOOK FOR:
- "junior_language" — words/phrases a mid-career professional wouldn't use ("helped," "assisted," "participated in")
- "ai_generated" — robotic or ChatGPT-sounding phrasing ("In my role as...", "I was responsible for leveraging...")
- "generic_filler" — clichés and buzzwords with no substance ("results-oriented," "proven track record," "team player")
- "passive_voice" — "was managed" instead of "managed," "were reduced" instead of "reduced"
- "banned_phrase" — any of these exact phrases: ${BANNED_PHRASES.join(', ')}

## ADDITIONAL PATTERNS TO FLAG

Beyond the standard checks, also flag these patterns:

6. wordiness — Any bullet over 30 words that could be said in under 20.
   BAD: "Responsible for overseeing the implementation and orchestration of a multi-phase digital transformation initiative across the enterprise"
   REWRITE: "Led 4-phase digital transformation"

7. metric_free_claim — Bullets that claim impact without proof.
   BAD: "Improved operational efficiency" — HOW MUCH?
   BAD: "Enhanced customer experience" — MEASURED HOW?
   REWRITE: Add the number, or flag for removal.

8. gerund_chain — "Driving growth while ensuring alignment and fostering collaboration" — these are AI-speak fingerprints. Any chain of 2+ gerund phrases connected by "while", "and", or commas.
   REWRITE: Pick one action. Make it concrete.

9. self_assessment — "Expert in", "Proven ability to", "Strong background in", "Demonstrated expertise" — let the proof speak, don't self-certify.
   REWRITE: Remove the self-assessment prefix. Show the proof instead.

10. abstract_nouns — "synergies", "paradigm", "ecosystem", "landscape", "leverage" (as noun), "bandwidth" (meaning capacity)
    REWRITE: Replace with the specific thing being described.

## REWRITE PHILOSOPHY

When you rewrite a flagged phrase, follow ONE rule:
REPLACE ABSTRACT WITH CONCRETE. Find the specific action, person, number, or outcome hiding behind the corporate language.

Examples:
- "Drove cross-functional alignment across multiple stakeholder groups" → "Aligned engineering, sales, and ops teams on a shared quarterly roadmap"
- "Leveraged data-driven insights to optimize performance" → "Used Tableau dashboards to identify the 3 production bottlenecks costing $400K/quarter"
- "Passionate leader committed to operational excellence" → DELETE ENTIRELY — it says nothing
- "Demonstrated expertise in change management and organizational transformation" → "Led 3 org restructurings, most recently consolidating 4 regional teams into 2 while retaining 94% of key talent"

OUTPUT FORMAT: Return valid JSON:
{
  "findings": [
    {
      "text": "the problematic text",
      "section": "which section it's in",
      "issue": "junior_language|ai_generated|generic_filler|passive_voice|banned_phrase|wordiness|metric_free_claim|gerund_chain|self_assessment|abstract_nouns",
      "suggestion": "the replacement text — write it as an executive would"
    }
  ],
  "tone_score": 85,
  "banned_phrases_found": ["any banned phrases detected"]
}

RULES:
- tone_score: 100 = perfect executive voice, deduct 3 points per finding
- suggestion: don't just flag — REWRITE the problematic text in proper executive voice, keeping the rewrite short and crisp
- Be specific: "Led cross-functional team" is fine. "Responsible for leading teams" is not.
- Executives use: "drove," "directed," "influenced," "architected," "Built," "Grew," "Cut," "Launched," "Designed," "Negotiated," "Reduced," "Fixed," "Hired," "Shipped," "Restructured," "Eliminated," "Inherited," "Turned around," "Consolidated"
- Executives DON'T use: "helped," "assisted," "supported," "worked on," "was responsible for"
- Only flag exact text that appears verbatim in the resume draft. The "text" field must be copied exactly from the draft.
- Never comment on phrases that are absent. Do not write explanations like "X is not present" or "Y could be considered".
- Do not flag strong executive verbs such as "led," "directed," "delivered," "implemented," "managed," "oversaw," or "drove" as junior language.
- If a line is acceptable but not perfect, leave it alone. Only return clear, high-confidence issues.
- Focus on the most visible tone issues first: headline, summary, selected accomplishments, and the first bullets under each role.
- Return only the highest-value tone issues. Maximum 12 findings.

${SOURCE_DISCIPLINE}

${JSON_OUTPUT_GUARDRAILS}`;

export async function runExecutiveTone(
  input: ExecutiveToneInput,
  signal?: AbortSignal,
): Promise<ExecutiveToneOutput> {
  const resumeText = formatDraftForTone(input);

  const userMessage = `Audit this resume for executive tone:

${resumeText}

Return JSON only.
- Quote only exact problematic text that appears verbatim in the draft.
- If a phrase is not present, do not mention it.
- Do not flag already-strong executive verbs like led, directed, delivered, implemented, managed, oversaw, or drove.
- Return at most 12 findings, keep each suggestion concise, and focus on the most visible issues first.`;

  try {
    const response = await chatWithTruncationRetry({
      model: MODEL_MID,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      response_format: { type: 'json_object' },
      max_tokens: 4096,
      signal,
    });

    const parsed = normalizeExecutiveToneOutput(repairJSON<ExecutiveToneOutput>(response.text), resumeText);
    if (parsed) return parsed;

    logger.warn(
      { rawSnippet: response.text.substring(0, 500) },
      'Executive Tone: first attempt unparseable, retrying with stricter prompt',
    );
  } catch (error) {
    if (shouldRethrowForAbort(error, signal)) throw error;
    const salvaged = tryRecoverExecutiveToneFromProviderError(error, resumeText);
    if (salvaged) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Executive Tone: recovered parseable JSON from provider failed_generation payload',
      );
      return salvaged;
    }
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'Executive Tone: first attempt failed, using deterministic fallback',
    );
    return buildDeterministicExecutiveToneFallback(input);
  }

  try {
    const retry = await chatWithTruncationRetry({
      model: MODEL_MID,
      system: 'You are a JSON extraction machine. Return ONLY valid JSON — no markdown fences, no commentary, no text before or after the JSON object. Start with { and end with }.',
      messages: [{ role: 'user', content: `${SYSTEM_PROMPT}\n\n${userMessage}` }],
      response_format: { type: 'json_object' },
      max_tokens: 4096,
      signal,
    });

    const retryParsed = normalizeExecutiveToneOutput(repairJSON<ExecutiveToneOutput>(retry.text), resumeText);
    if (retryParsed) return retryParsed;

    logger.error(
      { rawSnippet: retry.text.substring(0, 500) },
      'Executive Tone: retry returned unparseable response, using deterministic fallback',
    );
  } catch (error) {
    if (shouldRethrowForAbort(error, signal)) throw error;
    const salvaged = tryRecoverExecutiveToneFromProviderError(error, resumeText);
    if (salvaged) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Executive Tone: recovered parseable JSON from retry failed_generation payload',
      );
      return salvaged;
    }
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Executive Tone: retry failed, using deterministic fallback',
    );
  }

  return buildDeterministicExecutiveToneFallback(input);
}

function formatDraftForTone(input: ExecutiveToneInput): string {
  const d = input.draft;
  const parts: string[] = [
    `SUMMARY: ${d.executive_summary.content}`,
    '',
    'SELECTED ACCOMPLISHMENTS:',
    ...d.selected_accomplishments.slice(0, 5).map(a => `- ${a.content}`),
    '',
    'PROFESSIONAL EXPERIENCE:',
  ];

  for (const exp of d.professional_experience) {
    parts.push(`\n${exp.title} at ${exp.company}`);
    parts.push(`Scope: ${exp.scope_statement}`);
    for (const b of exp.bullets) {
      parts.push(`- ${b.text}`);
    }
  }

  return parts.join('\n');
}

function shouldRethrowForAbort(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  return error instanceof Error && /aborted/i.test(error.message);
}

function tryRecoverExecutiveToneFromProviderError(
  error: unknown,
  resumeText: string,
): ExecutiveToneOutput | null {
  const failedGeneration = extractFailedGeneration(error);
  if (!failedGeneration) return null;

  const repaired = repairJSON<ExecutiveToneOutput>(failedGeneration);
  return normalizeExecutiveToneOutput(repaired, resumeText);
}

function extractFailedGeneration(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/"failed_generation":"((?:\\.|[^"])*)"/);
  if (!match?.[1]) return null;

  try {
    return JSON.parse(`"${match[1]}"`);
  } catch {
    return null;
  }
}

function normalizeExecutiveToneOutput(
  parsed: ExecutiveToneOutput | null,
  resumeText: string,
): ExecutiveToneOutput | null {
  if (!parsed) return null;

  const findings = Array.isArray(parsed.findings)
    ? dedupeToneFindings(parsed.findings.filter((finding) => isValidExecutiveToneFinding(finding, resumeText))).slice(0, 12)
    : [];
  const bannedPhrasesFound = Array.isArray(parsed.banned_phrases_found)
    ? dedupeStrings(parsed.banned_phrases_found.filter((value): value is string => typeof value === 'string').map((value) => value.trim()).filter(Boolean))
    : [];

  const toneScore = Number.isFinite(parsed.tone_score)
    ? Math.max(40, Math.min(100, parsed.tone_score))
    : Math.max(40, 96 - (findings.length * 4));

  if (findings.length === 0 && bannedPhrasesFound.length === 0 && !Number.isFinite(parsed.tone_score)) {
    return null;
  }

  return {
    findings,
    tone_score: toneScore,
    banned_phrases_found: bannedPhrasesFound,
  };
}

function isValidExecutiveToneFinding(
  finding: unknown,
  resumeText: string,
): finding is ExecutiveToneOutput['findings'][number] {
  if (!finding || typeof finding !== 'object') return false;
  const entry = finding as Record<string, unknown>;
  const text = typeof entry.text === 'string' ? entry.text.trim() : '';
  const section = typeof entry.section === 'string' ? entry.section.trim() : '';
  const issue = typeof entry.issue === 'string' ? entry.issue.trim() : '';
  const suggestion = typeof entry.suggestion === 'string' ? entry.suggestion.trim() : '';

  if (!text || !section || !suggestion) return false;
  if (!['junior_language', 'ai_generated', 'generic_filler', 'passive_voice', 'banned_phrase', 'wordiness', 'metric_free_claim', 'gerund_chain', 'self_assessment', 'abstract_nouns'].includes(issue)) {
    return false;
  }

  return resumeText.includes(text);
}

function buildDeterministicExecutiveToneFallback(input: ExecutiveToneInput): ExecutiveToneOutput {
  const findings: ExecutiveToneOutput['findings'] = [];
  const bannedPhrasesFound = new Set<string>();

  const inspect = (text: string, section: string) => {
    const normalized = text.toLowerCase();

    for (const phrase of BANNED_PHRASES) {
      if (normalized.includes(phrase.toLowerCase())) {
        bannedPhrasesFound.add(phrase);
        findings.push({
          text,
          section,
          issue: 'banned_phrase',
          suggestion: rewriteDeterministically(text, phrase),
        });
        return;
      }
    }

    if (/\bwas responsible for\b/i.test(text)) {
      findings.push({
        text,
        section,
        issue: 'passive_voice',
        suggestion: rewriteDeterministically(text, 'was responsible for'),
      });
      return;
    }

    if (/\b(helped|assisted|supported|worked on)\b/i.test(text)) {
      findings.push({
        text,
        section,
        issue: 'junior_language',
        suggestion: rewriteDeterministically(text),
      });
      return;
    }

    if (GENERIC_FILLER_PATTERNS.some((pattern) => pattern.test(text))) {
      findings.push({
        text,
        section,
        issue: 'generic_filler',
        suggestion: rewriteDeterministically(text),
      });
    }
  };

  inspect(input.draft.executive_summary.content, 'executive_summary');
  input.draft.selected_accomplishments.forEach((item) => inspect(item.content, 'selected_accomplishments'));
  input.draft.professional_experience.forEach((experience) => {
    inspect(experience.scope_statement, `${experience.company} scope_statement`);
    experience.bullets.forEach((bullet) => inspect(bullet.text, `${experience.company} bullet`));
  });

  const deduped = dedupeToneFindings(findings).slice(0, 12);
  const toneScore = Math.max(40, 96 - (deduped.length * 4));

  return {
    findings: deduped,
    tone_score: toneScore,
    banned_phrases_found: [...bannedPhrasesFound],
  };
}

function rewriteDeterministically(text: string, trigger?: string): string {
  let rewritten = text
    .replace(/\bwas responsible for\b/gi, 'Led')
    .replace(/\bresponsible for\b/gi, 'Led')
    .replace(/\bhelped\b/gi, 'Advanced')
    .replace(/\bassisted\b/gi, 'Supported')
    .replace(/\bsupported\b/gi, 'Enabled')
    .replace(/\bworked on\b/gi, 'Executed');

  if (trigger) {
    const escaped = trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    rewritten = rewritten.replace(new RegExp(escaped, 'ig'), 'Led');
  }

  rewritten = rewritten
    .replace(/\bproven track record\b/gi, 'Delivered results')
    .replace(/\bdemonstrating expertise in\b/gi, '')
    .replace(/\bsignificant\b/gi, '')
    .replace(/\bresults[- ]driven\b/gi, 'Operational')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+,/g, ',')
    .trim();

  return rewritten;
}

function dedupeToneFindings(findings: ExecutiveToneOutput['findings']): ExecutiveToneOutput['findings'] {
  const seen = new Set<string>();
  const result: ExecutiveToneOutput['findings'] = [];
  for (const finding of findings) {
    const key = `${finding.section}::${finding.issue}::${finding.text}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(finding);
  }
  return result;
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

const GENERIC_FILLER_PATTERNS = [
  /\bproven track record\b/i,
  /\bdemonstrating expertise in\b/i,
  /\bsignificant cost savings\b/i,
  /\bresults[- ]driven\b/i,
];
