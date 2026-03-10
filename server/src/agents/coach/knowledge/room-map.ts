/**
 * Virtual Coach — Room Mapping Constants
 *
 * Single source of truth for product → frontend room slug mapping.
 * The room slugs MUST match CareerIQScreen's VALID_ROOMS set exactly.
 *
 * CareerIQScreen VALID_ROOMS:
 *   dashboard, resume, linkedin, content-calendar, jobs, networking,
 *   interview, salary-negotiation, executive-bio, case-study,
 *   thank-you-note, personal-brand, ninety-day-plan, network-intelligence,
 *   financial, learning
 */

/** Maps product_type to the frontend room slug in CareerIQScreen */
export const PRODUCT_ROOM_MAP: Record<string, string> = {
  onboarding: 'dashboard',
  resume: 'resume',
  cover_letter: 'resume',
  linkedin_editor: 'linkedin',
  linkedin_content: 'content-calendar',
  interview_prep: 'interview',
  mock_interview: 'interview',
  salary_negotiation: 'salary-negotiation',
  networking_outreach: 'networking',
  executive_bio: 'executive-bio',
  case_study: 'case-study',
  thank_you_note: 'thank-you-note',
  ninety_day_plan: 'ninety-day-plan',
  personal_brand: 'personal-brand',
  job_finder: 'jobs',
  job_tracker: 'jobs',
  retirement_bridge: 'financial',
};

/** All navigable room slugs — must match CareerIQScreen VALID_ROOMS */
export const VALID_ROOMS = [
  'dashboard',
  'resume',
  'linkedin',
  'content-calendar',
  'jobs',
  'networking',
  'interview',
  'salary-negotiation',
  'executive-bio',
  'case-study',
  'thank-you-note',
  'personal-brand',
  'ninety-day-plan',
  'network-intelligence',
  'financial',
  'learning',
] as const;

export type RoomSlug = (typeof VALID_ROOMS)[number];
