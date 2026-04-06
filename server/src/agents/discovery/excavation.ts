/**
 * Discovery Agent — Excavation Handler
 *
 * Handles the back-and-forth excavation conversation. Each call processes one
 * user answer and returns the next question + resume updates.
 *
 * Single LLM call per exchange. Not an agentic loop.
 *
 * Model: MODEL_PRIMARY
 */

import { llm, MODEL_PRIMARY } from '../../lib/llm.js';
import { repairJSON } from '../../lib/json-repair.js';
import logger from '../../lib/logger.js';
import type { CandidateIntelligenceOutput, JobIntelligenceOutput } from '../resume-v2/types.js';
import type { ExcavationQuestion, ExcavationResponse, ResumeUpdate } from './types.js';

const SYSTEM_PROMPT = `You are continuing an excavation conversation with a job candidate. Your purpose is to surface real, defensible experience that their resume has not yet captured.

You have already introduced yourself and provided a recognition statement. Now you are in a dialogue.

Your job for each exchange is to acknowledge what was said, assess whether it reveals something resume-worthy, and determine what to ask next.

When acknowledging, be brief and genuine — show you heard a specific detail, not just that they answered. If the answer was vague, push back with precision.

When assessing resume impact, determine whether any existing bullet should be highlighted (this answer proves it more strongly), strengthened (the bullet can be sharpened with new detail), whether something entirely new should be added, or whether an earlier role should be promoted to the top because it is more relevant than the current top entry.

When determining the next step, either generate a specific follow-up if the answer was incomplete, move to the next prepared question if it was sufficient, or set complete to true if enough has been gathered (typically 4-6 exchanges, never more than 8).

Mark the conversation complete when 4 or more full exchanges have happened and the key profile gaps are addressed, or unconditionally after 8 exchanges.

OUTPUT FORMAT: Return valid JSON:
{
  "next_question": "the next question to ask, or null if complete",
  "resume_updates": [
    {
      "section": "experience|summary|accomplishments",
      "bullet_id": "approximate bullet text (first few words) to identify which bullet, if relevant",
      "action": "highlight|strengthen|add|reorder",
      "text": "the new or strengthened text if action is add or strengthen",
      "position": 0
    }
  ],
  "insight": "1-2 sentences: what this answer revealed about the candidate that changes how we think about their positioning",
  "complete": false
}

Use action "reorder" with a position number when an answer reveals that an earlier role is more relevant to the target job than the current top entry. Example: { "section": "exp-3", "action": "reorder", "position": 0 }

RULES:
- next_question must reference something specific from the conversation or from the candidate's background
- Never ask the same question twice
- Never ask more than 8 questions total
- resume_updates may be an empty array if the answer revealed nothing new
- insight must be honest — if the answer was weak or vague, say so
- complete is a boolean, not a string

CRITICAL JSON RULES:
- Return exactly one JSON object.
- The first character of your response must be { and the last character must be }.
- Do not wrap the JSON in markdown fences.`;

function buildUserMessage(input: {
  answer: string;
  conversation_history: Array<{ role: 'ai' | 'user'; content: string }>;
  candidate: CandidateIntelligenceOutput;
  job_intelligence: JobIntelligenceOutput;
  remaining_questions: ExcavationQuestion[];
  profile_gaps: string[];
}): string {
  const {
    answer,
    conversation_history,
    candidate,
    job_intelligence,
    remaining_questions,
    profile_gaps,
  } = input;

  const exchangeCount = conversation_history.filter((m) => m.role === 'user').length + 1;

  const parts: string[] = [
    '## Candidate Context',
    `Name: ${candidate.contact.name}`,
    `Career themes: ${candidate.career_themes.join(', ')}`,
    `Target role: ${job_intelligence.role_title} at ${job_intelligence.company_name}`,
    '',
    '## Profile Gaps Still Open',
    ...profile_gaps.map((g) => `- ${g}`),
    '',
    '## Remaining Prepared Questions',
    remaining_questions.length > 0
      ? remaining_questions.map((q, i) => `${i + 1}. ${q.question}\n   Looking for: ${q.what_we_are_looking_for}`).join('\n')
      : '(none remaining)',
    '',
    `## Exchange Count: ${exchangeCount} of 8 max`,
    '',
    '## Conversation History',
    ...conversation_history.map((m) => `${m.role === 'ai' ? 'CareerIQ' : 'Candidate'}: ${m.content}`),
    '',
    `## Current Answer`,
    answer,
    '',
    'Process this answer. Acknowledge it, identify any resume updates, and determine the next question or mark complete. Return compact JSON only.',
  ];

  return parts.join('\n');
}

function buildDeterministicFallback(input: {
  remaining_questions: ExcavationQuestion[];
  conversation_history: Array<{ role: 'ai' | 'user'; content: string }>;
}): ExcavationResponse {
  const exchangeCount = input.conversation_history.filter((m) => m.role === 'user').length + 1;
  const complete = exchangeCount >= 6 || input.remaining_questions.length === 0;

  return {
    next_question: complete ? null : (input.remaining_questions[0]?.question ?? null),
    resume_updates: [],
    insight: 'Answer noted. Continuing the conversation.',
    complete,
  };
}

function shouldRethrowForAbort(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  return error instanceof Error && /aborted/i.test(error.message);
}

function normalizeExcavationResponse(
  raw: ExcavationResponse,
  fallback: ExcavationResponse,
): ExcavationResponse {
  const r = raw as unknown as Record<string, unknown>;

  const updatesRaw = Array.isArray(r.resume_updates) ? r.resume_updates : [];
  const resume_updates: ResumeUpdate[] = updatesRaw
    .filter((u): u is Record<string, unknown> => Boolean(u && typeof u === 'object'))
    .map((u) => ({
      section: typeof u.section === 'string' ? u.section : 'experience',
      bullet_id: typeof u.bullet_id === 'string' ? u.bullet_id : undefined,
      action: (['highlight', 'strengthen', 'add', 'reorder'] as const).includes(u.action as 'highlight' | 'strengthen' | 'add' | 'reorder')
        ? (u.action as 'highlight' | 'strengthen' | 'add' | 'reorder')
        : 'highlight',
      text: typeof u.text === 'string' ? u.text : undefined,
      // M-4: reorder requires a numeric position; default to 0 if the LLM omits it
      position: u.action === 'reorder'
        ? (typeof u.position === 'number' ? u.position : 0)
        : (typeof u.position === 'number' ? u.position : undefined),
    }));

  return {
    next_question: (r.next_question === null || r.next_question === 'null') ? null
      : typeof r.next_question === 'string' && r.next_question.length > 0
        ? r.next_question
        : fallback.next_question,
    resume_updates,
    insight: typeof r.insight === 'string' && r.insight.length > 0
      ? r.insight
      : fallback.insight,
    complete: typeof r.complete === 'boolean' ? r.complete : fallback.complete,
  };
}

export async function processExcavationAnswer(
  input: {
    session_id: string;
    answer: string;
    conversation_history: Array<{ role: 'ai' | 'user'; content: string }>;
    candidate: CandidateIntelligenceOutput;
    job_intelligence: JobIntelligenceOutput;
    remaining_questions: ExcavationQuestion[];
    profile_gaps: string[];
  },
  signal?: AbortSignal,
): Promise<ExcavationResponse> {
  const userMessage = buildUserMessage(input);
  const fallback = buildDeterministicFallback({
    remaining_questions: input.remaining_questions,
    conversation_history: input.conversation_history,
  });

  try {
    const response = await llm.chat({
      model: MODEL_PRIMARY,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      response_format: { type: 'json_object' },
      max_tokens: 2048,
      signal,
    });

    const parsed = repairJSON<ExcavationResponse>(response.text);
    if (parsed) return normalizeExcavationResponse(parsed, fallback);

    logger.warn(
      { sessionId: input.session_id, rawSnippet: response.text.substring(0, 300) },
      'Excavation: first attempt unparseable, retrying',
    );
  } catch (error) {
    if (shouldRethrowForAbort(error, signal)) throw error;
    logger.warn(
      { sessionId: input.session_id, error: error instanceof Error ? error.message : String(error) },
      'Excavation: first attempt failed, using deterministic fallback',
    );
    return fallback;
  }

  try {
    const retry = await llm.chat({
      model: MODEL_PRIMARY,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage + '\n\nReturn ONLY valid JSON. Start with { and end with }. No markdown fences, no commentary.' }],
      response_format: { type: 'json_object' },
      max_tokens: 2048,
      signal,
    });

    const retryParsed = repairJSON<ExcavationResponse>(retry.text);
    if (retryParsed) return normalizeExcavationResponse(retryParsed, fallback);

    logger.error(
      { sessionId: input.session_id, rawSnippet: retry.text.substring(0, 300) },
      'Excavation: retry returned unparseable response, using deterministic fallback',
    );
  } catch (error) {
    if (shouldRethrowForAbort(error, signal)) throw error;
    logger.error(
      { sessionId: input.session_id, error: error instanceof Error ? error.message : String(error) },
      'Excavation: retry failed, using deterministic fallback',
    );
  }

  return fallback;
}
