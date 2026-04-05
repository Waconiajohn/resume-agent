/**
 * Dynamic Role Profile — dimensional framework derived from JD content.
 *
 * Replaces any fixed archetype enum. The LLM derives a RoleProfile from
 * actual JD and resume content. Seed examples guide what a well-formed
 * profile looks like but do not constrain classification.
 */

export interface RoleProfile {
  /** Primary functional domain — derived from JD, not constrained to a fixed list */
  function: string;
  /** Industry context — derived from JD */
  industry: string;
  /** Scope of accountability */
  scope: 'individual-contributor' | 'team' | 'department' | 'business-unit' | 'enterprise';
  /** What success looks like in this specific role — derived from JD language */
  success_definition: string;
  /** What proof points this JD signals it cares about most — ordered by priority */
  proof_point_priorities: string[];
  /** How to position this candidate for this role */
  narrative_frame: string;
  /** Language that signals belonging in this environment */
  cultural_signals: string[];
}
