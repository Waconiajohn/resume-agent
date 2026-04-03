/**
 * Negotiation Simulation — Shared types.
 *
 * Supports the interactive counter-offer simulation where an Employer agent
 * plays the role of the hiring manager / recruiter, presents negotiation
 * positions one at a time, pauses for the user to respond, evaluates the
 * user's counter, and delivers a performance summary after 3-4 rounds.
 *
 * Pipeline: Employer (single agent, gate-based — one gate per round)
 */

import type { BaseState } from '../../runtime/agent-protocol.js';
import type { MarketResearch, LeveragePoint } from '../types.js';
import type { SharedContext } from '../../../contracts/shared-context.js';

// ─── Round & Evaluation Types ─────────────────────────────────────────────────

export type NegotiationRoundType =
  | 'initial_offer_delivery'
  | 'pushback_base_cap'
  | 'equity_leverage'
  | 'final_counter'
  | 'closing_pressure';

export type NegotiationOutcome = 'excellent' | 'good' | 'needs_work' | 'missed';

export interface NegotiationRound {
  index: number;
  type: NegotiationRoundType;
  /** What the employer says in this round */
  employer_position: string;
  /** Why this round type was chosen — internal context for the evaluator */
  context?: string;
}

export interface RoundEvaluation {
  round_index: number;
  round_type: NegotiationRoundType;
  employer_position: string;
  candidate_response: string;
  scores: {
    /** Did the candidate acknowledge the employer's position before countering? (0-100) */
    acknowledgment: number;
    /** Did the candidate support their ask with data or rationale? (0-100) */
    data_support: number;
    /** Did the candidate propose a specific, actionable next step? (0-100) */
    specificity: number;
    /** Was the tone confident and collaborative, not adversarial? (0-100) */
    tone: number;
  };
  overall_score: number;
  outcome: NegotiationOutcome;
  strengths: string[];
  improvements: string[];
  /** A brief coaching note on what a stronger response would look like */
  coaching_note?: string;
}

// ─── Pipeline State ───────────────────────────────────────────────────────────

export interface NegotiationSimulationState extends BaseState {
  session_id: string;
  user_id: string;
  current_stage: string;

  /** Number of negotiation rounds to simulate (3 for practice, 4 for full) */
  max_rounds: number;

  rounds_presented: NegotiationRound[];
  evaluations: RoundEvaluation[];
  current_round_index: number;

  /** Context about the offer being negotiated */
  offer_context: {
    company: string;
    role: string;
    base_salary?: number;
    total_comp?: number;
    equity_details?: string;
  };

  /** Market data from the main salary-negotiation pipeline (optional) */
  market_research?: MarketResearch;

  /** Leverage points identified in the main pipeline (optional) */
  leverage_points?: LeveragePoint[];

  /** Candidate's target numbers (from prior negotiation strategy) */
  candidate_targets?: {
    target_base?: number;
    walk_away_base?: number;
  };

  /** Platform context for personalising employer positions and evaluation */
  platform_context?: {
    positioning_strategy?: Record<string, unknown>;
    why_me_story?: string | Record<string, unknown>;
  };

  /** Canonical shared context */
  shared_context?: SharedContext;

  /** Final performance summary */
  final_summary?: {
    overall_score: number;
    total_rounds: number;
    outcome_summary: string;
    strengths: string[];
    areas_for_improvement: string[];
    coaching_takeaway: string;
  };
}

// ─── SSE Events ───────────────────────────────────────────────────────────────

export type NegotiationSimulationSSEEvent =
  | { type: 'stage_start'; stage: string; message: string }
  | { type: 'stage_complete'; stage: string; message: string; duration_ms?: number }
  | { type: 'transparency'; stage: string; message: string }
  | { type: 'employer_position'; round: NegotiationRound }
  | { type: 'round_evaluated'; evaluation: RoundEvaluation }
  | { type: 'simulation_complete'; session_id: string; summary: NegotiationSimulationState['final_summary'] }
  | { type: 'pipeline_error'; stage: string; error: string };
