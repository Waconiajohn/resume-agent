function envBool(key: string, fallback: boolean): boolean {
  const val = process.env[key];
  if (val === undefined) return fallback;
  return val === '1' || val.toLowerCase() === 'true';
}

export const QUESTIONNAIRE_FLAGS = {
  positioning_batch: envBool('FF_POSITIONING_BATCH', true),
  intake_quiz: envBool('FF_INTAKE_QUIZ', false),
  research_validation: envBool('FF_RESEARCH_VALIDATION', false),
  gap_analysis_quiz: envBool('FF_GAP_ANALYSIS_QUIZ', true),
  quality_review_approval: envBool('FF_QUALITY_REVIEW_APPROVAL', true),
};

export type QuestionnaireStage = keyof typeof QUESTIONNAIRE_FLAGS;

export function isQuestionnaireEnabled(stage: QuestionnaireStage): boolean {
  return QUESTIONNAIRE_FLAGS[stage];
}

export const GUIDED_SUGGESTIONS_ENABLED = envBool('FF_GUIDED_SUGGESTIONS', true);

export const FF_BLUEPRINT_APPROVAL = envBool('FF_BLUEPRINT_APPROVAL', true);

/**
 * FF_REDIS_BUS — Replace the in-memory AgentBus with a Redis Streams implementation.
 *
 * Requires REDIS_URL to be set. Default: false (in-memory bus is used).
 * See ADR-007 in docs/DECISIONS.md for full context.
 *
 * DO NOT enable in production until agent loops are made resumable
 * and horizontal scaling is actually required.
 */
export const FF_REDIS_BUS = envBool('FF_REDIS_BUS', false);

/**
 * FF_REDIS_RATE_LIMIT — Use Redis-backed rate limiting instead of in-memory.
 *
 * Requires REDIS_URL to be set. Default: false (in-memory rate limiter is used).
 * See ADR-009 in docs/DECISIONS.md for full context.
 *
 * When enabled, rate limit counts are stored in Redis with INCR + EXPIRE so that
 * multiple server instances share a single counter per identifier + time window.
 * Falls back to in-memory automatically if Redis is unavailable or errors.
 */
export const FF_REDIS_RATE_LIMIT = envBool('FF_REDIS_RATE_LIMIT', false);
