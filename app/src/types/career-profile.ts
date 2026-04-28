export type CareerProfileSignalLevel = 'green' | 'yellow' | 'red';
export type CareerProfileDashboardState = 'new-user' | 'refining' | 'strong';
export type CareerProfileCompletenessStatus = 'ready' | 'partial' | 'missing';
export type BenchmarkProfileConfidence = 'high_confidence' | 'good_inference' | 'needs_answer' | 'risky_claim';
export type BenchmarkProfileReviewStatus = 'draft' | 'needs_confirmation' | 'approved' | 'needs_evidence';
export type BenchmarkProfileDownstreamTool =
  | 'resume'
  | 'linkedin'
  | 'cover_letter'
  | 'networking'
  | 'interview'
  | 'job_search'
  | 'thank_you'
  | 'follow_up';

export interface BenchmarkProfileDraftItem {
  id: string;
  label: string;
  statement: string;
  confidence: BenchmarkProfileConfidence;
  review_status: BenchmarkProfileReviewStatus;
  source: 'resume' | 'linkedin' | 'interview' | 'inference' | 'user';
  evidence: string[];
  used_by: BenchmarkProfileDownstreamTool[];
}

export interface BenchmarkProfileDiscoveryQuestion {
  id: string;
  question: string;
  why_it_matters: string;
  evidence_found: string[];
  recommended_answer?: string;
  answer?: string;
  answered_at?: string;
  confidence_if_confirmed: BenchmarkProfileConfidence;
  used_by: BenchmarkProfileDownstreamTool[];
}

export interface BenchmarkProfileV1 {
  version: 'benchmark_profile_v1';
  generated_at: string;
  source_material_summary: {
    resume_quality: string;
    linkedin_quality: string;
    strongest_inputs: string[];
    missing_inputs: string[];
  };
  identity: {
    benchmark_headline: BenchmarkProfileDraftItem;
    why_me_story: BenchmarkProfileDraftItem;
    why_not_me: BenchmarkProfileDraftItem;
    operating_identity: BenchmarkProfileDraftItem;
  };
  proof: {
    signature_accomplishments: BenchmarkProfileDraftItem[];
    proof_themes: BenchmarkProfileDraftItem[];
    scope_markers: BenchmarkProfileDraftItem[];
  };
  linkedin_brand: {
    five_second_verdict: BenchmarkProfileDraftItem;
    headline_direction: BenchmarkProfileDraftItem;
    about_opening: BenchmarkProfileDraftItem;
    recruiter_keywords: string[];
    content_pillars: BenchmarkProfileDraftItem[];
    profile_gaps: BenchmarkProfileDraftItem[];
  };
  risk_and_gaps: {
    objections: BenchmarkProfileDraftItem[];
    adjacent_proof_needed: BenchmarkProfileDraftItem[];
    claims_to_soften: BenchmarkProfileDraftItem[];
  };
  approved_language: {
    positioning_statement: string;
    resume_summary_seed: string;
    linkedin_opening: string;
    networking_intro: string;
    cover_letter_thesis: string;
  };
  discovery_questions: BenchmarkProfileDiscoveryQuestion[];
  downstream_readiness: Record<BenchmarkProfileDownstreamTool, {
    status: 'ready' | 'usable' | 'needs_review' | 'blocked';
    summary: string;
  }>;
}

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
  benchmark_profile?: BenchmarkProfileV1;
}
