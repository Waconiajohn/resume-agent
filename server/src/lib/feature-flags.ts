// ─── Production Feature Flag Reference ───────────────────────────────────────
//
// All flags default to false (or their dev-appropriate value) in this file.
// In production, set the following env vars to "true" via Railway dashboard
// or your deployment environment. Do NOT change the defaults here — defaults
// are intentionally conservative to protect local dev and staging environments.
//
// BUILT AGENTS — set these to true in production:
//
//   FF_COVER_LETTER=true          Cover Letter Writer (Agent #8)
//   FF_NETWORK_INTELLIGENCE=true  Network Intelligence (Agent #9)
//   FF_INTERVIEW_PREP=true        Interview Prep Agent (Agent #10)
//   FF_LINKEDIN_OPTIMIZER=true    LinkedIn Optimizer (Agent #11)
//   FF_CONTENT_CALENDAR=true      Content Calendar (Agent #12)
//   FF_NETWORKING_OUTREACH=true   Networking Outreach (Agent #13)
//   FF_JOB_TRACKER=true           Job Application Tracker (Agent #14)
//   FF_SALARY_NEGOTIATION=true    Salary Negotiation (Agent #15)
//   FF_EXECUTIVE_BIO=true         Executive Bio (Agent #16)
//   FF_CASE_STUDY=true            Portfolio / Case Study (Agent #17)
//   FF_THANK_YOU_NOTE=true        Thank You Note Writer (Agent #18)
//   FF_NINETY_DAY_PLAN=true       90-Day Plan Generator (Agent #20)
//   FF_ONBOARDING=true            Onboarding Assessment Agent (Phase 1A)
//   FF_MOCK_INTERVIEW=true        Mock Interview Simulation
//   FF_JOB_FINDER=true            Job Finder
//   FF_APPLICATION_PIPELINE=true  Application Pipeline CRUD
//   FF_LINKEDIN_CONTENT=true      LinkedIn Content Writer
//   FF_LINKEDIN_EDITOR=true       LinkedIn Profile Editor
//   FF_NETWORKING_CRM=true        Networking CRM
//   FF_INTERVIEW_DEBRIEF=true     Interview Debrief
//   FF_MOMENTUM=true              Momentum Tracking (Phase 5)
//   FF_RETIREMENT_BRIDGE=true     Retirement Bridge Assessment (Phase 6)
//   FF_B2B_OUTPLACEMENT=true      B2B Outplacement Admin Portal (Phase 7)
//
// INFRASTRUCTURE FLAGS — leave false unless scaling requires it:
//
//   FF_REDIS_BUS=false            Requires REDIS_URL; do not enable until agent
//                                 loops are resumable and horizontal scaling needed
//   FF_REDIS_RATE_LIMIT=false     Requires REDIS_URL; falls back to in-memory if
//                                 Redis is unavailable
//
// Full deployment instructions: docs/DEPLOYMENT.md
// ─────────────────────────────────────────────────────────────────────────────

function envBool(key: string, fallback: boolean): boolean {
  const val = process.env[key];
  if (val === undefined) return fallback;
  return val === '1' || val.toLowerCase() === 'true';
}

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
 * FF_NINETY_DAY_PLAN — Enable the 90-Day Plan Agent (#20) routes.
 *
 * When false (default), /api/ninety-day-plan/* returns 404.
 * Set FF_NINETY_DAY_PLAN=true in server/.env to activate.
 */
export const FF_NINETY_DAY_PLAN = envBool('FF_NINETY_DAY_PLAN', false);

/**
 * FF_ONBOARDING — Enable the Onboarding Assessment Agent routes.
 *
 * When false (default), /api/onboarding/* returns 404.
 * Set FF_ONBOARDING=true in server/.env to activate.
 */
export const FF_ONBOARDING = envBool('FF_ONBOARDING', false);

// ─── Phase 4: CareerIQ Simulation Suite ──────────────────────────────

/**
 * FF_MOCK_INTERVIEW — Enable the Mock Interview Simulation routes.
 *
 * When false (default), /api/mock-interview/* returns 404.
 * Set FF_MOCK_INTERVIEW=true in server/.env to activate.
 */
export const FF_MOCK_INTERVIEW = envBool('FF_MOCK_INTERVIEW', false);

// ─── Phase 3: Active Campaign Suite ──────────────────────────────────

/**
 * FF_JOB_FINDER — Enable the Job Finder agent routes.
 *
 * When false (default), /api/job-finder/* returns 404.
 * Set FF_JOB_FINDER=true in server/.env to activate.
 */
export const FF_JOB_FINDER = envBool('FF_JOB_FINDER', false);

/**
 * FF_APPLICATION_PIPELINE — Enable the Application Pipeline CRUD routes.
 *
 * When false (default), /api/applications/* returns 404.
 * Set FF_APPLICATION_PIPELINE=true in server/.env to activate.
 */
export const FF_APPLICATION_PIPELINE = envBool('FF_APPLICATION_PIPELINE', false);

/**
 * FF_JOB_SEARCH — Enable the Job Search API routes (JSearch + Adzuna adapters).
 *
 * When false (default), /api/job-search/* returns 404.
 * Set FF_JOB_SEARCH=true in server/.env to activate.
 * Requires: JSEARCH_API_KEY (RapidAPI) and/or ADZUNA_APP_ID + ADZUNA_API_KEY.
 */
export const FF_JOB_SEARCH = envBool('FF_JOB_SEARCH', false);

/**
 * FF_LINKEDIN_CONTENT — Enable the LinkedIn Content Writer agent routes.
 *
 * When false (default), /api/linkedin-content/* returns 404.
 * Set FF_LINKEDIN_CONTENT=true in server/.env to activate.
 */
export const FF_LINKEDIN_CONTENT = envBool('FF_LINKEDIN_CONTENT', false);

/**
 * FF_LINKEDIN_EDITOR — Enable the LinkedIn Profile Editor agent routes.
 *
 * When false (default), /api/linkedin-editor/* returns 404.
 * Set FF_LINKEDIN_EDITOR=true in server/.env to activate.
 */
export const FF_LINKEDIN_EDITOR = envBool('FF_LINKEDIN_EDITOR', false);

/**
 * FF_LINKEDIN_TOOLS — Enable the LinkedIn Studio utility tool endpoints.
 *
 * Provides stateless POST endpoints:
 *   /api/linkedin-tools/recruiter-sim    — Recruiter search simulator
 *   /api/linkedin-tools/writing-analyzer — Writing quality analyzer
 *
 * When false (default), /api/linkedin-tools/* returns 404.
 * Set FF_LINKEDIN_TOOLS=true in server/.env to activate.
 */
export const FF_LINKEDIN_TOOLS = envBool('FF_LINKEDIN_TOOLS', false);

/**
 * FF_NETWORKING_CRM — Enable the Networking CRM CRUD routes.
 *
 * When false (default), /api/networking/* returns 404.
 * Set FF_NETWORKING_CRM=true in server/.env to activate.
 */
export const FF_NETWORKING_CRM = envBool('FF_NETWORKING_CRM', false);

// ─── Phase 4: Interview Prep Enhancement ──────────────────────────────────────

/**
 * FF_INTERVIEW_DEBRIEF — Enable the Interview Debrief CRUD routes.
 *
 * When false (default), /api/interview-debriefs/* returns 404.
 * Set FF_INTERVIEW_DEBRIEF=true in server/.env to activate.
 */
export const FF_INTERVIEW_DEBRIEF = envBool('FF_INTERVIEW_DEBRIEF', false);

// ─── Phase 5: Emotional Intelligence Layer ────────────────────────────────────

/**
 * FF_MOMENTUM — Enable Momentum Tracking routes (Sprint 49, Stories 5-1 to 5-3).
 *
 * When false (default), /api/momentum/* returns 404.
 * Set FF_MOMENTUM=true in server/.env to activate.
 * Enables: activity logging, streak computation, coaching nudges, stall detection.
 */
export const FF_MOMENTUM = envBool('FF_MOMENTUM', false);

// ─── Phase 6: Retirement Bridge ───────────────────────────────────────────────

/**
 * FF_RETIREMENT_BRIDGE — Enable the Retirement Bridge Assessment Agent routes.
 *
 * When false (default), /api/retirement-bridge/* returns 404.
 * Set FF_RETIREMENT_BRIDGE=true in server/.env to activate.
 * Assesses retirement readiness across 7 dimensions. Never gives financial advice.
 */
export const FF_RETIREMENT_BRIDGE = envBool('FF_RETIREMENT_BRIDGE', false);

// ─── Phase 7: B2B Outplacement ────────────────────────────────────────────────

/**
 * FF_B2B_OUTPLACEMENT — Enable the B2B Outplacement admin portal routes.
 *
 * When false (default), /api/b2b/* returns 404.
 * Set FF_B2B_OUTPLACEMENT=true in server/.env to activate.
 * Governs: organization CRUD, contract management, seat provisioning/activation,
 * cohort management, and aggregate engagement metrics endpoints.
 */
export const FF_B2B_OUTPLACEMENT = envBool('FF_B2B_OUTPLACEMENT', false);

// ─── Chrome Extension ────────────────────────────────────────────────────────

/**
 * FF_EXTENSION — Enable the Chrome Extension API routes.
 *
 * When false (default), /api/extension/* returns 404.
 * Set FF_EXTENSION=true in server/.env to activate.
 * Provides: resume-lookup, job-discover, apply-status, auth-verify, infer-field.
 */
export const FF_EXTENSION = envBool('FF_EXTENSION', false);

// ─── Virtual Coach ────────────────────────────────────────────────────────────

/**
 * FF_VIRTUAL_COACH — Enable the Virtual Coach conversational agent routes.
 *
 * When false (default), /api/coach/* returns 404.
 * Set FF_VIRTUAL_COACH=true in server/.env to activate.
 * The Virtual Coach guides clients through the 8-phase coaching journey,
 * orients them on next steps, and routes them to the appropriate product.
 */
export const FF_VIRTUAL_COACH = envBool('FF_VIRTUAL_COACH', false);

// ─── Resume v2 Pipeline ───────────────────────────────────────────────────────

/**
 * FF_RESUME_V2 — Enable the Resume v2 pipeline routes.
 *
 * Default: true (the v2 pipeline is the current production pipeline).
 * Set FF_RESUME_V2=false to disable /api/pipeline/* for emergency rollback.
 */
export const FF_RESUME_V2 = envBool('FF_RESUME_V2', true);
