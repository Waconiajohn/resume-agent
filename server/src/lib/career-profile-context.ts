import { getEmotionalBaseline, type EmotionalBaseline } from './emotional-baseline.js';
import {
  getLatestUserContext,
  getUserContext,
  getWhyMeContext,
} from './platform-context.js';
import logger from './logger.js';
import { buildSharedContextFromLegacyBundle } from '../contracts/shared-context-adapter.js';
import type { SharedContext } from '../contracts/shared-context.js';

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

export interface AgentContextBundleOptions {
  includeCareerProfile?: boolean;
  includePositioningStrategy?: boolean;
  includeEvidenceItems?: boolean;
  includeBenchmarkCandidate?: boolean;
  includeGapAnalysis?: boolean;
  includeCareerNarrative?: boolean;
  includeIndustryResearch?: boolean;
  includeLinkedInProfile?: boolean;
  includeWhyMeStory?: boolean;
  includeClientProfile?: boolean;
  includeTargetRole?: boolean;
  includeEmotionalBaseline?: boolean;
}

export async function loadCareerProfileContext(userId: string): Promise<CareerProfileV2 | null> {
  try {
    const row = await getLatestUserContext(userId, 'career_profile');
    if (!row) return null;

    const content = row.content as Record<string, unknown> | null;
    if (!content || content.version !== 'career_profile_v2') return null;

    return content as unknown as CareerProfileV2;
  } catch (error) {
    logger.warn(
      { userId, error: error instanceof Error ? error.message : String(error) },
      'Failed to load career profile',
    );
    return null;
  }
}

export async function loadAgentContextBundle(
  userId: string,
  options: AgentContextBundleOptions = {},
): Promise<{
  platformContext: Record<string, unknown>;
  emotionalBaseline: EmotionalBaseline | null;
  careerProfile: CareerProfileV2 | null;
  sharedContext: SharedContext;
}> {
  const includeCareerProfile = options.includeCareerProfile ?? true;
  const includeEmotionalBaseline = options.includeEmotionalBaseline ?? true;
  const includeLinkedInProfile = options.includeLinkedInProfile ?? true;

  const [
    careerProfile,
    baseline,
    positioningStrategyRow,
    benchmarkCandidateRow,
    gapAnalysisRow,
    careerNarrativeRow,
    industryResearchRow,
    linkedInProfileRow,
    targetRoleRow,
    clientProfileRow,
    whyMeContext,
    evidenceRows,
  ] = await Promise.all([
    includeCareerProfile ? loadCareerProfileContext(userId) : Promise.resolve(null),
    includeEmotionalBaseline ? getEmotionalBaseline(userId) : Promise.resolve(null),
    options.includePositioningStrategy ? getLatestUserContext(userId, 'positioning_strategy') : Promise.resolve(null),
    options.includeBenchmarkCandidate ? getLatestUserContext(userId, 'benchmark_candidate') : Promise.resolve(null),
    options.includeGapAnalysis ? getLatestUserContext(userId, 'gap_analysis') : Promise.resolve(null),
    options.includeCareerNarrative ? getLatestUserContext(userId, 'career_narrative') : Promise.resolve(null),
    options.includeIndustryResearch ? getLatestUserContext(userId, 'industry_research') : Promise.resolve(null),
    includeLinkedInProfile ? getLatestUserContext(userId, 'linkedin_profile') : Promise.resolve(null),
    options.includeTargetRole ? getLatestUserContext(userId, 'target_role') : Promise.resolve(null),
    options.includeClientProfile ? getLatestUserContext(userId, 'client_profile') : Promise.resolve(null),
    options.includeWhyMeStory ? getWhyMeContext(userId) : Promise.resolve(null),
    options.includeEvidenceItems ? getUserContext(userId, 'evidence_item') : Promise.resolve([]),
  ]);

  const platformContext: Record<string, unknown> = {};

  if (careerProfile) {
    platformContext.career_profile = careerProfile;
    if (careerProfile.benchmark_profile) {
      platformContext.benchmark_profile = careerProfile.benchmark_profile;
    }
  }
  if (positioningStrategyRow?.content) {
    platformContext.positioning_strategy = positioningStrategyRow.content;
  }
  if (benchmarkCandidateRow?.content) {
    platformContext.benchmark_candidate = benchmarkCandidateRow.content;
  }
  if (gapAnalysisRow?.content) {
    platformContext.gap_analysis = gapAnalysisRow.content;
  }
  if (careerNarrativeRow?.content) {
    platformContext.career_narrative = careerNarrativeRow.content;
  }
  if (industryResearchRow?.content) {
    platformContext.industry_research = industryResearchRow.content;
  }
  if (linkedInProfileRow?.content) {
    platformContext.linkedin_profile = linkedInProfileRow.content;
  }
  if (targetRoleRow?.content) {
    platformContext.target_role = targetRoleRow.content;
  }
  if (clientProfileRow?.content) {
    platformContext.client_profile = clientProfileRow.content;
  }
  if (whyMeContext) {
    platformContext.why_me_story = {
      colleaguesCameForWhat: whyMeContext.colleaguesCameForWhat,
      knownForWhat: whyMeContext.knownForWhat,
      whyNotMe: whyMeContext.whyNotMe,
    };
  } else if (careerProfile) {
    platformContext.why_me_story = {
      colleaguesCameForWhat: careerProfile.narrative.colleagues_came_for_what,
      knownForWhat: careerProfile.narrative.known_for_what,
      whyNotMe: careerProfile.narrative.why_not_me,
    };
  }
  if (evidenceRows.length > 0) {
    platformContext.evidence_items = evidenceRows.map((row) => row.content);
  }

  const sharedContext = buildSharedContextFromLegacyBundle({
    userId,
    careerProfile,
    clientProfileRow,
    positioningStrategyRow,
    benchmarkCandidateRow,
    gapAnalysisRow,
    careerNarrativeRow,
    industryResearchRow,
    linkedInProfileRow,
    targetRoleRow,
    evidenceRows,
    emotionalBaseline: baseline,
  });

  return {
    platformContext,
    emotionalBaseline: baseline,
    careerProfile,
    sharedContext,
  };
}
