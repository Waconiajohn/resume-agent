/**
 * Agent 1: Job Intelligence
 *
 * Single-prompt agent that extracts structured intelligence from a job description.
 * Focuses on what the hiring manager actually cares about — ignores HR fluff.
 *
 * Model: MODEL_MID
 */

import { llm, MODEL_MID } from '../../../lib/llm.js';
import { repairJSON } from '../../../lib/json-repair.js';
import logger from '../../../lib/logger.js';
import type { JobIntelligenceInput, JobIntelligenceOutput } from '../types.js';

const SYSTEM_PROMPT = `You are a senior executive recruiter who has placed 500+ candidates at the VP/C-suite level. Your job is to deconstruct a job description and extract what the hiring manager ACTUALLY wants — not what HR wrote.

You read between the lines. You know that:
- "Fast-paced environment" means they're understaffed or chaotic
- "Stakeholder management" means internal politics are intense
- "Build and scale" means they don't have it yet
- "Transform" means what they have is broken
- "Strategic and hands-on" means you'll be doing both IC and leadership work
- Vague requirements are often the most important ones

OUTPUT FORMAT: Return valid JSON matching this exact structure:
{
  "company_name": "extracted from JD or 'Not specified'",
  "role_title": "exact title from JD",
  "seniority_level": "entry|mid|senior|director|vp|c_suite",
  "core_competencies": [
    {
      "competency": "what they need",
      "importance": "must_have|important|nice_to_have",
      "evidence_from_jd": "the JD text that signals this"
    }
  ],
  "strategic_responsibilities": ["what the role actually owns"],
  "business_problems": ["what problems this hire is expected to solve"],
  "cultural_signals": ["what the culture feels like based on language"],
  "hidden_hiring_signals": ["what they're NOT saying but clearly need"],
  "language_keywords": ["exact phrases/terms from the JD for ATS matching"],
  "industry": "industry/sector"
}

RULES:
- Extract the company name from the JD. If not present, use "Not specified".
- Classify competencies by importance: must_have = explicitly required or repeated, important = mentioned with emphasis, nice_to_have = listed but not emphasized.
- Hidden hiring signals: infer what they need but didn't write (e.g., if they list 15 tools, they probably need someone to consolidate the tech stack).
- Language keywords: extract EXACT phrases as written in the JD — these are ATS matching targets.
- Business problems: what's broken or missing that this hire fixes?
- Be specific, not generic. "Revenue growth" is useless. "$50M ARR to $100M" is useful.`;

export async function runJobIntelligence(
  input: JobIntelligenceInput,
  signal?: AbortSignal,
): Promise<JobIntelligenceOutput> {
  // Attempt 1
  const response = await llm.chat({
    model: MODEL_MID,
    system: SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: `Analyze this job description:\n\n${input.job_description}` },
    ],
    max_tokens: 4096,
    signal,
  });

  const parsed = repairJSON<JobIntelligenceOutput>(response.text);
  if (parsed) return parsed;

  // Attempt 2: retry with explicit JSON-only instruction
  logger.warn(
    { rawSnippet: response.text.substring(0, 500) },
    'Job Intelligence: first attempt unparseable, retrying with stricter prompt',
  );

  const retry = await llm.chat({
    model: MODEL_MID,
    system: 'You are a JSON extraction machine. Return ONLY valid JSON — no markdown fences, no commentary, no text before or after the JSON object. Start with { and end with }.',
    messages: [
      { role: 'user', content: `${SYSTEM_PROMPT}\n\nAnalyze this job description:\n\n${input.job_description}` },
    ],
    max_tokens: 4096,
    signal,
  });

  const retryParsed = repairJSON<JobIntelligenceOutput>(retry.text);
  if (retryParsed) return retryParsed;

  logger.error(
    { rawSnippet: retry.text.substring(0, 500) },
    'Job Intelligence: both attempts returned unparseable response',
  );
  throw new Error('Job Intelligence agent returned unparseable response after 2 attempts');
}
