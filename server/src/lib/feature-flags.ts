// ─── Production Feature Flag Defaults ────────────────────────────────────────
//
// Consumer-ready features default to TRUE. Niche/B2B/incomplete features
// default to FALSE. In any environment, override with env vars (e.g.
// FF_COVER_LETTER=false) via Railway dashboard or server/.env.
//
// ENABLED BY DEFAULT (consumer-ready agents and features):
//
//   FF_COVER_LETTER           Cover Letter Writer
//   FF_NETWORK_INTELLIGENCE   Network Intelligence
//   FF_INTERVIEW_PREP         Interview Prep Agent
//   FF_LINKEDIN_OPTIMIZER     LinkedIn Optimizer
//   FF_LINKEDIN_EDITOR        LinkedIn Profile Editor
//   FF_LINKEDIN_CONTENT       LinkedIn Content Writer
//   FF_LINKEDIN_TOOLS         LinkedIn Studio utility endpoints
//   FF_CONTENT_CALENDAR       Content Calendar
//   FF_NETWORKING_OUTREACH    Networking Outreach
//   FF_NETWORKING_CRM         Networking CRM
//   FF_JOB_TRACKER            Job Application Tracker
//   FF_JOB_FINDER             Job Finder
//   FF_JOB_SEARCH             Job Search API (Firecrawl adapter)
//   FF_APPLICATION_PIPELINE   Application Pipeline CRUD
//   FF_SALARY_NEGOTIATION     Salary Negotiation
//   FF_EXECUTIVE_BIO          Executive Bio
//   FF_THANK_YOU_NOTE         Thank You Note Writer
//   FF_NINETY_DAY_PLAN        90-Day Plan Generator
//   FF_ONBOARDING             Onboarding Assessment Agent
//   FF_MOCK_INTERVIEW         Mock Interview Simulation
//   FF_INTERVIEW_DEBRIEF      Interview Debrief
//   FF_MOMENTUM               Momentum Tracking
//   FF_VIRTUAL_COACH          Virtual Coach conversational agent
//   FF_RESUME_V2              Resume v2 pipeline (current production pipeline)
//
// DISABLED BY DEFAULT (niche, B2B, or incomplete):
//
//   FF_RETIREMENT_BRIDGE      Retirement Bridge (niche financial product)
//   FF_B2B_OUTPLACEMENT       B2B Outplacement admin portal (enterprise only)
//   FF_EXTENSION              Chrome Extension API (not yet released)
//   FF_CASE_STUDY             Portfolio / Case Study (incomplete)
//
// INFRASTRUCTURE FLAGS — leave false unless scaling requires it:
//
//   FF_REDIS_BUS              Requires REDIS_URL; do not enable until agent
//                             loops are resumable and horizontal scaling needed
//   FF_REDIS_RATE_LIMIT       Requires REDIS_URL; falls back to in-memory if
//                             Redis is unavailable
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
 * Default: true (consumer-ready).
 * Set FF_COVER_LETTER=false in server/.env to deactivate.
 */
export const FF_COVER_LETTER = envBool('FF_COVER_LETTER', true);

/**
 * FF_NETWORK_INTELLIGENCE — Enable the Network Intelligence routes.
 *
 * Default: true (consumer-ready).
 * Set FF_NETWORK_INTELLIGENCE=false in server/.env to deactivate.
 */
export const FF_NETWORK_INTELLIGENCE = envBool('FF_NETWORK_INTELLIGENCE', true);

/**
 * FF_INTERVIEW_PREP — Enable the Interview Prep Agent routes.
 *
 * Default: true (consumer-ready).
 * Set FF_INTERVIEW_PREP=false in server/.env to deactivate.
 */
export const FF_INTERVIEW_PREP = envBool('FF_INTERVIEW_PREP', true);

/**
 * FF_LINKEDIN_OPTIMIZER — Enable the LinkedIn Optimizer Agent routes.
 *
 * Default: true (consumer-ready).
 * Set FF_LINKEDIN_OPTIMIZER=false in server/.env to deactivate.
 */
export const FF_LINKEDIN_OPTIMIZER = envBool('FF_LINKEDIN_OPTIMIZER', true);

/**
 * FF_CONTENT_CALENDAR — Enable the Content Calendar Agent routes.
 *
 * Default: true (consumer-ready).
 * Set FF_CONTENT_CALENDAR=false in server/.env to deactivate.
 */
export const FF_CONTENT_CALENDAR = envBool('FF_CONTENT_CALENDAR', true);

/**
 * FF_NETWORKING_OUTREACH — Enable the Networking Outreach Agent routes.
 *
 * Default: true (consumer-ready).
 * Set FF_NETWORKING_OUTREACH=false in server/.env to deactivate.
 */
export const FF_NETWORKING_OUTREACH = envBool('FF_NETWORKING_OUTREACH', true);

/**
 * FF_JOB_TRACKER — Enable the Job Application Tracker Agent routes.
 *
 * Default: true (consumer-ready).
 * Set FF_JOB_TRACKER=false in server/.env to deactivate.
 */
export const FF_JOB_TRACKER = envBool('FF_JOB_TRACKER', true);

/**
 * FF_SALARY_NEGOTIATION — Enable the Salary Negotiation Agent routes.
 *
 * Default: true (consumer-ready, core job-workspace flow).
 * Set FF_SALARY_NEGOTIATION=false in server/.env to deactivate.
 */
export const FF_SALARY_NEGOTIATION = envBool('FF_SALARY_NEGOTIATION', true);

/**
 * FF_EXECUTIVE_BIO — Enable the Executive Bio Agent routes.
 *
 * Default: true (consumer-ready).
 * Set FF_EXECUTIVE_BIO=false in server/.env to deactivate.
 */
export const FF_EXECUTIVE_BIO = envBool('FF_EXECUTIVE_BIO', true);

/**
 * FF_CASE_STUDY — Enable the Case Study Agent routes.
 *
 * Default: false (incomplete product).
 * Set FF_CASE_STUDY=true in server/.env to activate.
 */
export const FF_CASE_STUDY = envBool('FF_CASE_STUDY', false);

/**
 * FF_THANK_YOU_NOTE — Enable the Thank You Note Agent routes.
 *
 * Default: true (consumer-ready).
 * Set FF_THANK_YOU_NOTE=false in server/.env to deactivate.
 */
export const FF_THANK_YOU_NOTE = envBool('FF_THANK_YOU_NOTE', true);

/**
 * FF_NINETY_DAY_PLAN — Enable the 90-Day Plan Agent routes.
 *
 * Default: true (consumer-ready).
 * Set FF_NINETY_DAY_PLAN=false in server/.env to deactivate.
 */
export const FF_NINETY_DAY_PLAN = envBool('FF_NINETY_DAY_PLAN', true);

/**
 * FF_ONBOARDING — Enable the Onboarding Assessment Agent routes.
 *
 * Default: true (consumer-ready).
 * Set FF_ONBOARDING=false in server/.env to deactivate.
 */
export const FF_ONBOARDING = envBool('FF_ONBOARDING', true);

// ─── Phase 4: CareerIQ Simulation Suite ──────────────────────────────

/**
 * FF_MOCK_INTERVIEW — Enable the Mock Interview Simulation routes.
 *
 * Default: true (consumer-ready).
 * Set FF_MOCK_INTERVIEW=false in server/.env to deactivate.
 */
export const FF_MOCK_INTERVIEW = envBool('FF_MOCK_INTERVIEW', true);

// ─── Phase 3: Active Campaign Suite ──────────────────────────────────

/**
 * FF_JOB_FINDER — Enable the Job Finder agent routes.
 *
 * Default: true (consumer-ready).
 * Set FF_JOB_FINDER=false in server/.env to deactivate.
 */
export const FF_JOB_FINDER = envBool('FF_JOB_FINDER', true);

/**
 * FF_APPLICATION_PIPELINE — Enable the Application Pipeline CRUD routes.
 *
 * Default: true (consumer-ready).
 * Set FF_APPLICATION_PIPELINE=false in server/.env to deactivate.
 */
export const FF_APPLICATION_PIPELINE = envBool('FF_APPLICATION_PIPELINE', true);

/**
 * FF_JOB_SEARCH — Enable the Job Search API routes (Firecrawl adapter).
 *
 * Default: true (consumer-ready).
 * Set FF_JOB_SEARCH=false in server/.env to deactivate.
 * Requires: FIRECRAWL_API_KEY.
 */
export const FF_JOB_SEARCH = envBool('FF_JOB_SEARCH', true);

/**
 * FF_LINKEDIN_CONTENT — Enable the LinkedIn Content Writer agent routes.
 *
 * Default: true (consumer-ready).
 * Set FF_LINKEDIN_CONTENT=false in server/.env to deactivate.
 */
export const FF_LINKEDIN_CONTENT = envBool('FF_LINKEDIN_CONTENT', true);

/**
 * FF_LINKEDIN_EDITOR — Enable the LinkedIn Profile Editor agent routes.
 *
 * Default: true (consumer-ready).
 * Set FF_LINKEDIN_EDITOR=false in server/.env to deactivate.
 */
export const FF_LINKEDIN_EDITOR = envBool('FF_LINKEDIN_EDITOR', true);

/**
 * FF_LINKEDIN_TOOLS — Enable the LinkedIn Studio utility tool endpoints.
 *
 * Provides stateless POST endpoints:
 *   /api/linkedin-tools/recruiter-sim    — Recruiter search simulator
 *   /api/linkedin-tools/writing-analyzer — Writing quality analyzer
 *
 * Default: true (consumer-ready).
 * Set FF_LINKEDIN_TOOLS=false in server/.env to deactivate.
 */
export const FF_LINKEDIN_TOOLS = envBool('FF_LINKEDIN_TOOLS', true);

/**
 * FF_NETWORKING_CRM — Enable the Networking CRM CRUD routes.
 *
 * Default: true (consumer-ready).
 * Set FF_NETWORKING_CRM=false in server/.env to deactivate.
 */
export const FF_NETWORKING_CRM = envBool('FF_NETWORKING_CRM', true);

// ─── Phase 4: Interview Prep Enhancement ──────────────────────────────────────

/**
 * FF_INTERVIEW_DEBRIEF — Enable the Interview Debrief CRUD routes.
 *
 * Default: true (consumer-ready).
 * Set FF_INTERVIEW_DEBRIEF=false in server/.env to deactivate.
 */
export const FF_INTERVIEW_DEBRIEF = envBool('FF_INTERVIEW_DEBRIEF', true);

// ─── Phase 5: Emotional Intelligence Layer ────────────────────────────────────

/**
 * FF_MOMENTUM — Enable Momentum Tracking routes (Sprint 49, Stories 5-1 to 5-3).
 *
 * Default: true (consumer-ready).
 * Set FF_MOMENTUM=false in server/.env to deactivate.
 * Enables: activity logging, streak computation, coaching nudges, stall detection.
 */
export const FF_MOMENTUM = envBool('FF_MOMENTUM', true);

// ─── Phase 6: Retirement Bridge ───────────────────────────────────────────────

/**
 * FF_RETIREMENT_BRIDGE — Enable the Retirement Bridge Assessment Agent routes.
 *
 * Default: false (niche financial product, not consumer-ready for general audience).
 * Set FF_RETIREMENT_BRIDGE=true in server/.env to activate.
 * Assesses retirement readiness across 7 dimensions. Never gives financial advice.
 */
export const FF_RETIREMENT_BRIDGE = envBool('FF_RETIREMENT_BRIDGE', false);

// ─── Phase 7: B2B Outplacement ────────────────────────────────────────────────

/**
 * FF_B2B_OUTPLACEMENT — Enable the B2B Outplacement admin portal routes.
 *
 * Default: false (enterprise/B2B product, not for general consumer use).
 * Set FF_B2B_OUTPLACEMENT=true in server/.env to activate.
 * Governs: organization CRUD, contract management, seat provisioning/activation,
 * cohort management, and aggregate engagement metrics endpoints.
 */
export const FF_B2B_OUTPLACEMENT = envBool('FF_B2B_OUTPLACEMENT', false);

// ─── Chrome Extension ────────────────────────────────────────────────────────

/**
 * FF_EXTENSION — Enable the Chrome Extension API routes.
 *
 * Default: false (extension not yet released).
 * Set FF_EXTENSION=true in server/.env to activate.
 * Provides: resume-lookup, job-discover, apply-status, auth-verify, infer-field.
 */
export const FF_EXTENSION = envBool('FF_EXTENSION', false);

// ─── Virtual Coach ────────────────────────────────────────────────────────────

/**
 * FF_VIRTUAL_COACH — Enable the Virtual Coach conversational agent routes.
 *
 * Default: true (consumer-ready).
 * Set FF_VIRTUAL_COACH=false in server/.env to deactivate.
 * The Virtual Coach guides clients through the 8-phase coaching journey,
 * orients them on next steps, and routes them to the appropriate product.
 */
export const FF_VIRTUAL_COACH = envBool('FF_VIRTUAL_COACH', true);

// ─── Resume v2 Pipeline ───────────────────────────────────────────────────────

/**
 * FF_RESUME_V2 — Enable the Resume v2 pipeline routes.
 *
 * Default: true (the v2 pipeline is the current production pipeline).
 * Set FF_RESUME_V2=false to disable /api/pipeline/* for emergency rollback.
 */
export const FF_RESUME_V2 = envBool('FF_RESUME_V2', true);

// ─── Resume v3 ────────────────────────────────────────────────────────────────

/**
 * FF_V3_PRIMARY — Mount the v3 resume pipeline at /api/v3-pipeline/*.
 *
 * Default: true (v3 is the primary resume pipeline).
 * Set FF_V3_PRIMARY=false only if rolling back to v2-only operation during
 * local testing. v2 remains available at /api/pipeline/* until Phase C
 * cutover deletion.
 */
export const FF_V3_PRIMARY = envBool('FF_V3_PRIMARY', true);

// ─── Resume v3 Shadow Deploy ──────────────────────────────────────────────────

/**
 * FF_V3_SHADOW_ENABLED — Enable v3 shadow deploy for every v2 pipeline run.
 *
 * Default: false (shadow runs disabled).
 * Set FF_V3_SHADOW_ENABLED=true in server/.env to activate.
 *
 * When on, the v2 pipeline fires v3 as a post-response background job after
 * v2 finalizes. v3 output + verify result + per-stage timings + per-stage cost
 * are written to the `resume_v3_shadow_runs` Supabase table. v2 response is
 * authoritative; v3 errors are logged but never affect user-facing response.
 *
 * See docs/v3-rebuild/07-Phase-5-Shadow-Deploy-Plan.md.
 */
export const FF_V3_SHADOW_ENABLED = envBool('FF_V3_SHADOW_ENABLED', false);
