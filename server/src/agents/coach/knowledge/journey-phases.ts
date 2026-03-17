/**
 * Virtual Coach — Journey Phase Definitions.
 *
 * Defines the 8-phase coaching journey, the prerequisites for each phase,
 * and the completion signals that indicate a phase is done.
 *
 * Used by the assess_journey_phase tool to determine where the client is
 * in their journey and what is blocking progress.
 */

import type { CoachingPhase } from '../types.js';

// ─── Phase Definition ──────────────────────────────────────────────

/**
 * A single phase in the 8-phase coaching journey.
 *
 * prerequisites — platform context types or completed products that must
 *   be present before this phase is meaningful to begin.
 *
 * completion_signals — what must be true (as completed product_type strings
 *   or platform context types) for this phase to be considered done.
 *
 * typical_products — which platform products are used during this phase.
 *
 * sequencing_note — why this phase comes where it does. Used by
 *   recommend_next_action to explain sequencing to clients who ask about
 *   jumping ahead.
 */
export interface PhaseDefinition {
  phase: CoachingPhase;
  name: string;
  description: string;
  /** Context types or product names that must exist before this phase */
  prerequisites: string[];
  /**
   * When ALL of these are present (as completed product types or platform
   * context types), the phase is complete.
   */
  completion_signals: string[];
  /** Products typically used in this phase */
  typical_products: string[];
  /**
   * Estimated pipeline cost if the client starts the primary product.
   * Used by recommend_next_action for cost transparency.
   */
  estimated_cost_usd: number;
  /**
   * Why this phase comes here in the sequence. Surfaces to the client
   * when they ask about skipping ahead.
   */
  sequencing_note: string;
}

// ─── Journey Phase Definitions ─────────────────────────────────────

export const JOURNEY_PHASES: PhaseDefinition[] = [
  {
    phase: 'onboarding',
    name: 'Getting Started',
    description: 'Establish the client profile — who they are, where they are in their career, and what they want next.',
    prerequisites: [],
    completion_signals: ['client_profile'],
    typical_products: ['onboarding'],
    estimated_cost_usd: 0.01,
    sequencing_note: 'Onboarding sets the foundation. Every downstream agent adapts its tone, pacing, and recommendations based on the client profile.',
  },
  {
    phase: 'positioning',
    name: 'Positioning & Evidence',
    description: 'Surface the client\'s real experience through a positioning interview. Build the strategic foundation that all content will flow from.',
    prerequisites: ['client_profile'],
    completion_signals: ['positioning_strategy'],
    typical_products: ['resume'],
    estimated_cost_usd: 0.23,
    sequencing_note: 'Positioning comes before writing because positioning flows downhill. A resume written without a positioning strategy produces generic content. The interview surfaces the 99% of experience that never makes it onto a resume.',
  },
  {
    phase: 'resume_ready',
    name: 'Resume Complete',
    description: 'The resume pipeline is complete — the client has a quality-reviewed, ATS-optimized resume positioned around the benchmark candidate framework.',
    prerequisites: ['positioning_strategy'],
    completion_signals: ['resume'],
    typical_products: ['resume'],
    estimated_cost_usd: 0.23,
    sequencing_note: 'The resume is the flagship document. LinkedIn, cover letters, and networking materials all derive from the positioning established here.',
  },
  {
    phase: 'linkedin_ready',
    name: 'LinkedIn Updated',
    description: 'LinkedIn profile is optimized for the target role, consistent with the resume positioning.',
    prerequisites: ['positioning_strategy'],
    completion_signals: ['linkedin_editor', 'linkedin_content'],
    typical_products: ['linkedin_editor', 'linkedin_content'],
    estimated_cost_usd: 0.15,
    sequencing_note: 'LinkedIn is the resume\'s public face. Recruiters validate the resume against the LinkedIn profile — inconsistency creates doubt. Updating LinkedIn after the resume ensures consistency.',
  },
  {
    phase: 'job_targeting',
    name: 'Active Job Search',
    description: 'The client is actively applying to targeted roles. The job finder, pipeline tracker, and watchlist are in use.',
    prerequisites: ['positioning_strategy'],
    completion_signals: ['job_finder'],
    typical_products: ['job_finder', 'job_tracker', 'networking_outreach'],
    estimated_cost_usd: 0.05,
    sequencing_note: 'Job targeting without positioning leads to spray-and-pray applications. The positioning strategy defines the target, which makes job search 10x more effective.',
  },
  {
    phase: 'interview_prep',
    name: 'Interview Preparation',
    description: 'The client has completed at least one mock interview and has a debrief. Ready to perform in real interviews.',
    prerequisites: ['positioning_strategy'],
    completion_signals: ['interview_prep'],
    typical_products: ['interview_prep', 'thank_you_note'],
    estimated_cost_usd: 0.18,
    sequencing_note: 'Interview prep is most effective once the positioning strategy exists. The mock interview tests whether the client can articulate their positioning under pressure — not just on paper.',
  },
  {
    phase: 'offer_stage',
    name: 'Offer & Negotiation',
    description: 'The client has received at least one offer and is actively in negotiation.',
    prerequisites: ['positioning_strategy'],
    completion_signals: ['salary_negotiation'],
    typical_products: ['salary_negotiation'],
    estimated_cost_usd: 0.12,
    sequencing_note: 'Salary negotiation is unlocked when an offer exists. The positioning strategy frames the negotiation — you negotiate from the benchmark candidate position, not from desperation.',
  },
  {
    phase: 'complete',
    name: 'Transition Complete',
    description: 'The client has accepted an offer and completed their career transition.',
    prerequisites: ['salary_negotiation'],
    completion_signals: ['ninety_day_plan'],
    typical_products: ['ninety_day_plan'],
    estimated_cost_usd: 0.10,
    sequencing_note: 'The 90-day plan sets the client up to succeed in their new role and gives them a strong interview leave-behind during final rounds.',
  },
];

// ─── Phase Determination ───────────────────────────────────────────

/**
 * Determine the client's current coaching phase based on what they have
 * completed and what platform context types exist.
 *
 * Logic: The current phase is the first phase whose completion_signals
 * have NOT yet all been satisfied, but whose prerequisites ARE satisfied.
 *
 * @param completedProducts - Array of product_type strings from completed sessions
 * @param platformContextTypes - Array of context_type strings from user_platform_context
 * @returns The client's current coaching phase
 */
export function determineJourneyPhase(
  completedProducts: string[],
  platformContextTypes: string[],
): CoachingPhase {
  const completed = new Set([...completedProducts, ...platformContextTypes]);

  for (let i = 0; i < JOURNEY_PHASES.length; i++) {
    const phase = JOURNEY_PHASES[i];

    // Check prerequisites
    const prerequisitesMet = phase.prerequisites.every((p) => completed.has(p));
    if (!prerequisitesMet) {
      // Prerequisites not met — stuck at the prior phase
      return JOURNEY_PHASES[Math.max(0, i - 1)].phase;
    }

    // Check completion signals
    const isComplete = phase.completion_signals.every((s) => completed.has(s));
    if (!isComplete) {
      // This phase is in progress or not started
      return phase.phase;
    }
  }

  // All phases complete — including the final phase's completion signals.
  // Note: 'complete' is returned both when the client is IN the final phase
  // (completion signals not yet met) and when all phases are truly done.
  // Callers can distinguish by checking if 'ninety_day_plan' is in completedProducts.
  return 'complete';
}
