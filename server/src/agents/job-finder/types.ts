/**
 * Job Finder Agent — Shared types for the job-finder product.
 *
 * Agent #21 in the 33-agent platform. Discovers relevant job opportunities
 * from public company job pages, generating boolean search strings, and
 * surfacing network-adjacent openings. A Ranker agent scores and narrates
 * each match against the user's positioning strategy.
 *
 * Pipeline: Searcher → Ranker (1 interactive gate: review_results)
 * Delivery: Ranked matches with fit narratives
 */

import type { BaseState } from '../runtime/agent-protocol.js';
import type { CareerProfileV2 } from '../../lib/career-profile-context.js';
import type { SharedContext } from '../../contracts/shared-context.js';

// ─── Discovered Job ─────────────────────────────────────────────────

/** A job opening discovered during the search phase */
export interface DiscoveredJob {
  /** Job title */
  title: string;
  /** Company name */
  company: string;
  /** Company directory ID (if resolved from NI) */
  company_id?: string;
  /** URL to the job posting */
  url?: string;
  /** Job location */
  location?: string;
  /** Salary range if available */
  salary_range?: string;
  /** Source of this job discovery */
  source: 'career_page' | 'boolean_search' | 'serper' | 'network';
  /** Raw match score from the discovery source (0-100) */
  match_score?: number;
  /** Short snippet of the job description */
  description_snippet?: string;
}

// ─── Job Evaluation ──────────────────────────────────────────────────

/** Structured evaluation to help the user decide whether a role is worth pursuing */
export interface JobEvaluation {
  fit_check: {
    rating: 'STRONG_FIT' | 'STRETCH' | 'MISMATCH';
    reasoning: string;
  };
  gap_assessment: {
    summary: string;
    bridgeable: boolean;
  };
  red_flags: string[];
  verdict: {
    decision: 'APPLY_NOW' | 'WORTH_A_CONVERSATION' | 'DEPRIORITIZE';
    reasoning: string;
  };
}

// ─── Ranked Match ────────────────────────────────────────────────────

/** Career-Ops-style career level strategy assessment */
export interface CareerLevelStrategy {
  current_level: string;
  target_level: string;
  move_type: 'step_up' | 'lateral' | 'step_down' | 'reset';
  scope_change: string;
  strategic_rationale: string;
}

/** Compensation analysis relative to role and candidate level */
export interface CompensationAnalysis {
  posted_range?: string;
  market_estimate: string;
  vs_current: 'premium' | 'in_range' | 'below_market' | 'unknown';
  level_alignment: string;
  red_flags: string[];
}

/** How well the candidate's evidence maps to this specific JD */
export interface PersonalizationPotential {
  evidence_alignment_score: number;
  strongest_evidence_matches: Array<{
    requirement: string;
    evidence: string;
    confidence: 'High' | 'Moderate' | 'Low';
  }>;
  evidence_gaps: Array<{
    requirement: string;
    gap_type: 'unaddressed' | 'adjacent_proof_only' | 'supportable_inference';
  }>;
  personalization_narrative: string;
}

/** STAR-scaffolded interview story for a specific role challenge */
export interface InterviewPrepStory {
  jd_challenge: string;
  star_setup: {
    situation: string;
    task: string;
    action: string;
    result: string;
  };
  relevance_to_role: string;
}

/** A job opening ranked and narrated against the user's positioning */
export interface RankedMatch extends DiscoveredJob {
  /** Overall fit score (0-100) */
  fit_score: number;
  /** Why this role matches the candidate's positioning */
  fit_narrative: string;
  /** How well this aligns with the positioning strategy */
  positioning_alignment: string;
  /** Whether the career trajectory supports this move */
  career_trajectory_fit: string;
  /** Seniority alignment assessment */
  seniority_fit: string;
  /** Names of network connections at this company (if any) */
  network_connections?: string[];
  /** Structured evaluation — fit check, gap assessment, red flags, verdict */
  evaluation?: JobEvaluation;
  /** Career-Ops block 3: Career level strategy (step up/lateral/down/reset) */
  career_level_strategy?: CareerLevelStrategy;
  /** Career-Ops block 4: Compensation analysis */
  compensation_analysis?: CompensationAnalysis;
  /** Career-Ops block 5: How much resume evidence maps to this JD */
  personalization_potential?: PersonalizationPotential;
  /** Career-Ops block 6: STAR-scaffolded interview prep stories */
  interview_prep_stories?: InterviewPrepStory[];
}

// ─── User Decision (from review gate) ───────────────────────────────

export type JobDecisionStatus = 'promoted' | 'dismissed' | 'pending';

/** User's decision on a ranked job match */
export interface JobDecision {
  company: string;
  title: string;
  status: JobDecisionStatus;
}

// ─── Pipeline State ──────────────────────────────────────────────────

export interface JobFinderState extends BaseState {
  session_id: string;
  user_id: string;
  current_stage: string;

  /** Cross-product context from resume and research pipelines */
  platform_context?: {
    career_profile?: CareerProfileV2;
    positioning_strategy?: Record<string, unknown>;
    benchmark_candidate?: Record<string, unknown>;
    gap_analysis?: Record<string, unknown>;
    evidence_items?: Record<string, unknown>[];
    career_narrative?: Record<string, unknown>;
    industry_research?: Record<string, unknown>;
  };

  /** Canonical shared context, populated alongside legacy platform_context during migration */
  shared_context?: SharedContext;

  /** All jobs discovered across all search sources */
  search_results: DiscoveredJob[];

  /** Jobs ranked and narrated by the Ranker agent */
  ranked_results: RankedMatch[];

  /** User decisions from the review gate (dismissed/promoted) */
  user_decisions: JobDecision[];
}

// ─── SSE Events ──────────────────────────────────────────────────────

export type JobFinderSSEEvent =
  | { type: 'stage_start'; stage: string; message: string }
  | { type: 'stage_complete'; stage: string; message: string; duration_ms?: number }
  | { type: 'transparency'; stage: string; message: string }
  | { type: 'search_progress'; source: string; jobs_found: number; companies_scanned?: number }
  | { type: 'match_found'; title: string; company: string; source: string; match_score: number }
  | { type: 'results_ready'; total_matches: number; top_fit_score: number; matches?: RankedMatch[] }
  | { type: 'job_finder_complete'; session_id: string; ranked_count: number; promoted_count: number }
  | { type: 'pipeline_error'; stage: string; error: string };

// ─── Type alias ──────────────────────────────────────────────────────

import type { AgentTool } from '../runtime/agent-protocol.js';

export type JobFinderTool = AgentTool<JobFinderState, JobFinderSSEEvent>;
