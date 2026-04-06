/**
 * Profile Setup — Interview Runner
 *
 * Processes one answer at a time. Single LLM call per exchange.
 *
 * Model: MODEL_PRIMARY
 */

import { llm, MODEL_PRIMARY } from '../../lib/llm.js';
import { repairJSON } from '../../lib/json-repair.js';
import logger from '../../lib/logger.js';
import type { InterviewAnswer, InterviewResponse } from './types.js';

const SYSTEM_PROMPT = `You are continuing a focused career interview. Your goal is to surface what documents cannot capture.

You have just received the candidate's answer to a question. Do two things:

ONE — Acknowledge their answer in exactly one sentence. Name something specific they said. Not "great answer" — a specific detail that shows you heard them.

TWO — If this was the last question (question 8), set complete to true and say nothing more. Otherwise, provide the next question from the prepared list.

Return JSON: { "acknowledgment": "one sentence", "next_question": "the next question or null", "question_index": N, "complete": false }

CRITICAL JSON RULES:
- Return exactly one JSON object.
- The first character of your response must be { and the last character must be }.
- Do not wrap the JSON in markdown fences.
- complete must be a boolean, not a string.
- next_question must be null (not the string "null") when complete is true.`;

function buildUserMessage(input: {
  answer: string;
  question_index: number;
  questions: Array<{ question: string; what_we_are_looking_for: string; references_resume_element: string | null }>;
  history: InterviewAnswer[];
}): string {
  const { answer, question_index, questions, history } = input;
  const totalQuestions = questions.length;
  const isLastQuestion = question_index >= totalQuestions - 1;
  const nextQuestion = !isLastQuestion ? questions[question_index + 1] : null;

  const parts: string[] = [
    `## Current Question (${question_index + 1} of ${totalQuestions})`,
    questions[question_index]?.question ?? '(question not found)',
    '',
    '## Candidate Answer',
    answer,
    '',
  ];

  if (history.length > 0) {
    parts.push('## Previous Exchange Summary');
    for (const prev of history.slice(-3)) {
      parts.push(`Q${prev.question_index + 1}: ${prev.question}`);
      parts.push(`A: ${prev.answer.substring(0, 200)}${prev.answer.length > 200 ? '...' : ''}`);
      parts.push('');
    }
  }

  if (isLastQuestion) {
    parts.push('This was the final question (question 8). Set complete to true. next_question must be null.');
  } else if (nextQuestion) {
    parts.push('## Next Prepared Question');
    parts.push(nextQuestion.question);
    parts.push(`(Looking for: ${nextQuestion.what_we_are_looking_for})`);
  }

  parts.push('');
  parts.push(`Return JSON with acknowledgment, next_question (${isLastQuestion ? 'null' : 'the next prepared question'}), question_index ${question_index + 1}, and complete ${isLastQuestion ? 'true' : 'false'}.`);

  return parts.join('\n');
}

function buildDeterministicFallback(input: {
  question_index: number;
  questions: Array<{ question: string }>;
}): InterviewResponse {
  const { question_index, questions } = input;
  const isLastQuestion = question_index >= questions.length - 1;

  return {
    acknowledgment: 'Thank you for sharing that.',
    next_question: isLastQuestion ? null : (questions[question_index + 1]?.question ?? null),
    question_index: question_index + 1,
    complete: isLastQuestion,
  };
}

function shouldRethrowForAbort(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  return error instanceof Error && /aborted/i.test(error.message);
}

function normalizeInterviewResponse(raw: unknown, fallback: InterviewResponse): InterviewResponse {
  const r = raw as Record<string, unknown>;

  return {
    acknowledgment: typeof r.acknowledgment === 'string' && r.acknowledgment.length > 0
      ? r.acknowledgment
      : fallback.acknowledgment,
    next_question: (r.next_question === null || r.next_question === 'null')
      ? null
      : typeof r.next_question === 'string' && r.next_question.length > 0
        ? r.next_question
        : fallback.next_question,
    question_index: typeof r.question_index === 'number'
      ? r.question_index
      : fallback.question_index,
    complete: typeof r.complete === 'boolean' ? r.complete : fallback.complete,
  };
}

export async function processInterviewAnswer(
  input: {
    session_id: string;
    answer: string;
    question_index: number;
    questions: Array<{ question: string; what_we_are_looking_for: string; references_resume_element: string | null }>;
    history: InterviewAnswer[];
  },
  signal?: AbortSignal,
): Promise<InterviewResponse> {
  const userMessage = buildUserMessage(input);
  const fallback = buildDeterministicFallback(input);

  try {
    const response = await llm.chat({
      model: MODEL_PRIMARY,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      response_format: { type: 'json_object' },
      max_tokens: 1024,
      signal,
    });

    const parsed = repairJSON<InterviewResponse>(response.text);
    if (parsed) return normalizeInterviewResponse(parsed, fallback);

    logger.warn(
      { sessionId: input.session_id, rawSnippet: response.text.substring(0, 300) },
      'Interview Runner: first attempt unparseable, retrying',
    );
  } catch (error) {
    if (shouldRethrowForAbort(error, signal)) throw error;
    logger.warn(
      { sessionId: input.session_id, error: error instanceof Error ? error.message : String(error) },
      'Interview Runner: first attempt failed, using deterministic fallback',
    );
    return fallback;
  }

  try {
    const retry = await llm.chat({
      model: MODEL_PRIMARY,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage + '\n\nReturn ONLY valid JSON. Start with { and end with }. No markdown fences, no commentary.' }],
      response_format: { type: 'json_object' },
      max_tokens: 1024,
      signal,
    });

    const retryParsed = repairJSON<InterviewResponse>(retry.text);
    if (retryParsed) return normalizeInterviewResponse(retryParsed, fallback);

    logger.error(
      { sessionId: input.session_id, rawSnippet: retry.text.substring(0, 300) },
      'Interview Runner: retry returned unparseable response, using deterministic fallback',
    );
  } catch (error) {
    if (shouldRethrowForAbort(error, signal)) throw error;
    logger.error(
      { sessionId: input.session_id, error: error instanceof Error ? error.message : String(error) },
      'Interview Runner: retry failed, using deterministic fallback',
    );
  }

  return fallback;
}
