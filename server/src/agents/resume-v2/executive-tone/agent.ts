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
- suggestion: don't just flag — REWRITE the problematic text in proper executive voice
- Be specific: "Led cross-functional team" is fine. "Responsible for leading teams" is not.
- Executives use: "drove," "orchestrated," "championed," "spearheaded," "influenced," "architected"
- Executives DON'T use: "helped," "assisted," "supported," "worked on," "was responsible for"`;

export async function runExecutiveTone(
  input: ExecutiveToneInput,
  signal?: AbortSignal,
): Promise<ExecutiveToneOutput> {
  const resumeText = formatDraftForTone(input);

  const userMessage = `Audit this resume for executive tone:\n\n${resumeText}`;

  // Attempt 1
  const response = await llm.chat({
    model: MODEL_MID,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
    max_tokens: 4096,
    signal,
  });

  const parsed = repairJSON<ExecutiveToneOutput>(response.text);
  if (parsed) return parsed;

  // Attempt 2: retry with explicit JSON-only instruction
  logger.warn(
    { rawSnippet: response.text.substring(0, 500) },
    'Executive Tone: first attempt unparseable, retrying with stricter prompt',
  );

  const retry = await llm.chat({
    model: MODEL_MID,
    system: 'You are a JSON extraction machine. Return ONLY valid JSON — no markdown fences, no commentary, no text before or after the JSON object. Start with { and end with }.',
    messages: [{ role: 'user', content: `${SYSTEM_PROMPT}\n\n${userMessage}` }],
    max_tokens: 4096,
    signal,
  });

  const retryParsed = repairJSON<ExecutiveToneOutput>(retry.text);
  if (retryParsed) return retryParsed;

  logger.error(
    { rawSnippet: retry.text.substring(0, 500) },
    'Executive Tone: both attempts returned unparseable response',
  );
  throw new Error('Executive Tone agent returned unparseable response after 2 attempts');
}

function formatDraftForTone(input: ExecutiveToneInput): string {
  const d = input.draft;
  const parts: string[] = [
    `SUMMARY: ${d.executive_summary.content}`,
    '',
    'SELECTED ACCOMPLISHMENTS:',
    ...d.selected_accomplishments.map(a => `- ${a.content}`),
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
