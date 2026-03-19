/**
 * Agent 9: Executive Tone
 *
 * Tone audit — flags junior language, AI-generated phrasing,
 * generic filler, passive voice. Suggests replacements.
 *
 * Model: MODEL_MID
 */

import { llm, MODEL_MID } from '../../../lib/llm.js';
import { repairJSON } from '../../../lib/json-repair.js';
import logger from '../../../lib/logger.js';
import { BANNED_PHRASES } from '../knowledge/resume-rules.js';
import type { ExecutiveToneInput, ExecutiveToneOutput } from '../types.js';

const JSON_OUTPUT_GUARDRAILS = `CRITICAL JSON RULES:
- Return exactly one JSON object.
- The first character of your response must be { and the last character must be }.
- Use double-quoted JSON keys and string values.
- Do not wrap the JSON in markdown fences.
- Do not add commentary, introductions, or notes outside the JSON object.
- If there are no findings, return an empty findings array instead of prose.
- Keep the output compact: return at most 5 findings.`;

const SYSTEM_PROMPT = `You are an executive communications director who has edited 1,000+ C-suite resumes. You can spot junior language, AI-generated phrasing, and generic filler from a mile away.

Your job: audit this resume for tone. Every sentence should sound like it was written BY an executive, FOR an executive audience.

FLAGS TO LOOK FOR:
- "junior_language" — words/phrases a mid-career professional wouldn't use ("helped," "assisted," "participated in")
- "ai_generated" — robotic or ChatGPT-sounding phrasing ("In my role as...", "I was responsible for leveraging...")
- "generic_filler" — clichés and buzzwords with no substance ("results-oriented," "proven track record," "team player")
- "passive_voice" — "was managed" instead of "managed," "were reduced" instead of "reduced"
- "banned_phrase" — any of these exact phrases: ${BANNED_PHRASES.slice(0, 10).join(', ')}... and others

OUTPUT FORMAT: Return valid JSON:
{
  "findings": [
    {
      "text": "the problematic text",
      "section": "which section it's in",
      "issue": "junior_language|ai_generated|generic_filler|passive_voice|banned_phrase",
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
- Executives use: "drove," "orchestrated," "championed," "spearheaded," "influenced," "architected"
- Executives DON'T use: "helped," "assisted," "supported," "worked on," "was responsible for"
- Only flag exact text that appears verbatim in the resume draft. The "text" field must be copied exactly from the draft.
- Never comment on phrases that are absent. Do not write explanations like "X is not present" or "Y could be considered".
- Do not flag strong executive verbs such as "led," "directed," "delivered," "implemented," "managed," "oversaw," or "drove" as junior language.
- If a line is acceptable but not perfect, leave it alone. Only return clear, high-confidence issues.
- Focus on the most visible tone issues first: headline, summary, selected accomplishments, and the first bullets under each role.
- Return only the highest-value tone issues. Maximum 5 findings.

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
- Return at most 5 findings, keep each suggestion concise, and focus on the most visible issues first.`;

  try {
    const response = await llm.chat({
      model: MODEL_MID,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      response_format: { type: 'json_object' },
      max_tokens: 4096,
      signal,
    });

    const parsed = repairJSON<ExecutiveToneOutput>(response.text);
    if (parsed) return parsed;

    logger.warn(
      { rawSnippet: response.text.substring(0, 500) },
      'Executive Tone: first attempt unparseable, retrying with stricter prompt',
    );
  } catch (error) {
    if (shouldRethrowForAbort(error, signal)) throw error;
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'Executive Tone: first attempt failed, using deterministic fallback',
    );
    return buildDeterministicExecutiveToneFallback(input);
  }

  try {
    const retry = await llm.chat({
      model: MODEL_MID,
      system: 'You are a JSON extraction machine. Return ONLY valid JSON — no markdown fences, no commentary, no text before or after the JSON object. Start with { and end with }.',
      messages: [{ role: 'user', content: `${SYSTEM_PROMPT}\n\n${userMessage}` }],
      response_format: { type: 'json_object' },
      max_tokens: 4096,
      signal,
    });

    const retryParsed = repairJSON<ExecutiveToneOutput>(retry.text);
    if (retryParsed) return retryParsed;

    logger.error(
      { rawSnippet: retry.text.substring(0, 500) },
      'Executive Tone: retry returned unparseable response, using deterministic fallback',
    );
  } catch (error) {
    if (shouldRethrowForAbort(error, signal)) throw error;
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

  for (const exp of d.professional_experience.slice(0, 4)) {
    parts.push(`\n${exp.title} at ${exp.company}`);
    parts.push(`Scope: ${exp.scope_statement}`);
    for (const b of exp.bullets.slice(0, 3)) {
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

  const deduped = dedupeToneFindings(findings).slice(0, 5);
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

const GENERIC_FILLER_PATTERNS = [
  /\bproven track record\b/i,
  /\bdemonstrating expertise in\b/i,
  /\bsignificant cost savings\b/i,
  /\bresults[- ]driven\b/i,
];
