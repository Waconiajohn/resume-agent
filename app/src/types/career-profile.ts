export type CareerProfileSignalLevel = 'green' | 'yellow' | 'red';
export type CareerProfileDashboardState = 'new-user' | 'refining' | 'strong';
export type CareerProfileCompletenessStatus = 'ready' | 'partial' | 'missing';

export interface CareerProfileV2 {
  version: 'career_profile_v2';
  source: 'career_profile' | 'legacy_migration' | 'profile-setup' | 'discovery';
  generated_at: string;
  targeting: {
    target_roles: string[];
    target_industries: string[];
    seniority: string;
    transition_type: string;
    preferred_company_environments: string[];
  };
  positioning: {
    core_strengths: string[];
    proof_themes: string[];
    differentiators: string[];
    adjacent_positioning: string[];
    positioning_statement: string;
    narrative_summary: string;
    leadership_scope: string;
    scope_of_responsibility: string;
  };
  narrative: {
    colleagues_came_for_what: string;
    known_for_what: string;
    why_not_me: string;
    story_snippet: string;
  };
  preferences: {
    must_haves: string[];
    constraints: string[];
    compensation_direction: string;
  };
  coaching: {
    financial_segment: string;
    emotional_state: string;
    coaching_tone: string;
    urgency_score: number;
    recommended_starting_point: string;
  };
  evidence_positioning_statements: string[];
  profile_signals: {
    clarity: CareerProfileSignalLevel;
    alignment: CareerProfileSignalLevel;
    differentiation: CareerProfileSignalLevel;
  };
  completeness: {
    overall_score: number;
    dashboard_state: CareerProfileDashboardState;
    sections: Array<{
      id: 'direction' | 'positioning' | 'narrative' | 'constraints';
      label: string;
      status: CareerProfileCompletenessStatus;
      score: number;
      summary: string;
    }>;
  };
  profile_summary: string;
}
