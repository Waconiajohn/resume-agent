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

/**
 * FF_SELF_REVIEW_LIGHT — Route self_review_section to MODEL_LIGHT instead of MODEL_MID.
 *
 * Self-review is a structured checklist evaluation, not creative writing.
 * MODEL_LIGHT may handle it adequately at zero cost. Default: false (use MODEL_MID).
 * Enable for A/B testing to measure quality impact.
 */
export const FF_SELF_REVIEW_LIGHT = envBool('FF_SELF_REVIEW_LIGHT', false);

/**
 * FF_COVER_LETTER — Enable the Cover Letter product routes.
 *
 * When false (default), /api/cover-letter/* returns 404.
 * Frontend UI available at /cover-letter (Sprint 18).
 * Set FF_COVER_LETTER=true in server/.env to activate.
 */
export const FF_COVER_LETTER = envBool('FF_COVER_LETTER', false);

/**
 * FF_NETWORK_INTELLIGENCE — Enable the Network Intelligence routes.
 *
 * When false (default), /api/ni/* returns 404.
 * Set FF_NETWORK_INTELLIGENCE=true in server/.env to activate.
 */
export const FF_NETWORK_INTELLIGENCE = envBool('FF_NETWORK_INTELLIGENCE', false);

/**
 * FF_INTERVIEW_PREP — Enable the Interview Prep Agent (#10) routes.
 *
 * When false (default), /api/interview-prep/* returns 404.
 * Set FF_INTERVIEW_PREP=true in server/.env to activate.
 */
export const FF_INTERVIEW_PREP = envBool('FF_INTERVIEW_PREP', false);

/**
 * FF_LINKEDIN_OPTIMIZER — Enable the LinkedIn Optimizer Agent (#11) routes.
 *
 * When false (default), /api/linkedin-optimizer/* returns 404.
 * Set FF_LINKEDIN_OPTIMIZER=true in server/.env to activate.
 */
export const FF_LINKEDIN_OPTIMIZER = envBool('FF_LINKEDIN_OPTIMIZER', false);

/**
 * FF_CONTENT_CALENDAR — Enable the Content Calendar Agent (#12) routes.
 *
 * When false (default), /api/content-calendar/* returns 404.
 * Set FF_CONTENT_CALENDAR=true in server/.env to activate.
 */
export const FF_CONTENT_CALENDAR = envBool('FF_CONTENT_CALENDAR', false);

/**
 * FF_NETWORKING_OUTREACH — Enable the Networking Outreach Agent (#13) routes.
 *
 * When false (default), /api/networking-outreach/* returns 404.
 * Set FF_NETWORKING_OUTREACH=true in server/.env to activate.
 */
export const FF_NETWORKING_OUTREACH = envBool('FF_NETWORKING_OUTREACH', false);

/**
 * FF_JOB_TRACKER — Enable the Job Application Tracker Agent (#14) routes.
 *
 * When false (default), /api/job-tracker/* returns 404.
 * Set FF_JOB_TRACKER=true in server/.env to activate.
 */
export const FF_JOB_TRACKER = envBool('FF_JOB_TRACKER', false);

/**
 * FF_SALARY_NEGOTIATION — Enable the Salary Negotiation Agent (#15) routes.
 *
 * When false (default), /api/salary-negotiation/* returns 404.
 * Set FF_SALARY_NEGOTIATION=true in server/.env to activate.
 */
export const FF_SALARY_NEGOTIATION = envBool('FF_SALARY_NEGOTIATION', false);

/**
 * FF_EXECUTIVE_BIO — Enable the Executive Bio Agent (#16) routes.
 *
 * When false (default), /api/executive-bio/* returns 404.
 * Set FF_EXECUTIVE_BIO=true in server/.env to activate.
 */
export const FF_EXECUTIVE_BIO = envBool('FF_EXECUTIVE_BIO', false);

/**
 * FF_CASE_STUDY — Enable the Case Study Agent (#17) routes.
 *
 * When false (default), /api/case-study/* returns 404.
 * Set FF_CASE_STUDY=true in server/.env to activate.
 */
export const FF_CASE_STUDY = envBool('FF_CASE_STUDY', false);

/**
 * FF_THANK_YOU_NOTE — Enable the Thank You Note Agent (#18) routes.
 *
 * When false (default), /api/thank-you-note/* returns 404.
 * Set FF_THANK_YOU_NOTE=true in server/.env to activate.
 */
export const FF_THANK_YOU_NOTE = envBool('FF_THANK_YOU_NOTE', false);

/**
 * FF_PERSONAL_BRAND_AUDIT — Enable the Personal Brand Audit Agent (#19) routes.
 *
 * When false (default), /api/personal-brand/* returns 404.
 * Set FF_PERSONAL_BRAND_AUDIT=true in server/.env to activate.
 */
export const FF_PERSONAL_BRAND_AUDIT = envBool('FF_PERSONAL_BRAND_AUDIT', false);

/**
 * FF_NINETY_DAY_PLAN — Enable the 90-Day Plan Agent (#20) routes.
 *
 * When false (default), /api/ninety-day-plan/* returns 404.
 * Set FF_NINETY_DAY_PLAN=true in server/.env to activate.
 */
export const FF_NINETY_DAY_PLAN = envBool('FF_NINETY_DAY_PLAN', false);
