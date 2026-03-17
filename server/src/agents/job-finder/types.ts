/**
 * Job Finder Agent — Shared types for the job-finder product.
 *
 * Agent #21 in the 33-agent platform. Discovers relevant job opportunities
 * by scraping company career pages, generating boolean search strings, and
 * surfacing network-adjacent openings. A Ranker agent scores and narrates
 * each match against the user's positioning strategy.
 *
 * Pipeline: Searcher → Ranker (1 interactive gate: review_results)
 * Delivery: Ranked matches with fit narratives
 */

import type { BaseState } from '../runtime/agent-protocol.js';
import type { CareerProfileV2 } from '../../lib/career-profile-context.js';

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
  source: 'career_page' | 'boolean_search' | 'network';
  /** Raw match score from the discovery source (0-100) */
  match_score?: number;
  /** Short snippet of the job description */
  description_snippet?: string;
}

// ─── Ranked Match ────────────────────────────────────────────────────

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
  | { type: 'results_ready'; total_matches: number; top_fit_score: number }
  | { type: 'job_finder_complete'; session_id: string; ranked_count: number; promoted_count: number }
  | { type: 'pipeline_error'; stage: string; error: string };

// ─── Type alias ──────────────────────────────────────────────────────

import type { AgentTool } from '../runtime/agent-protocol.js';

export type JobFinderTool = AgentTool<JobFinderState, JobFinderSSEEvent>;
