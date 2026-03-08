/**
 * Counter-Offer Simulation — Shared types.
 *
 * Supports the interactive counter-offer negotiation simulation where the
 * employer agent presents realistic pushback one round at a time, pauses
 * for the user to respond, evaluates their negotiation technique, and
 * delivers a coaching summary.
 *
 * Pipeline: Employer (single agent, gate-based — one gate per round)
 */

import type { BaseState } from '../../runtime/agent-protocol.js';

// ─── Round & Mode Types ───────────────────────────────────────────────

export type NegotiationRound = 'initial_response' | 'counter' | 'final';

export type CounterOfferMode = 'full' | 'single_round';

// ─── Pushback & Evaluation Types ─────────────────────────────────────

export interface EmployerPushback {
  round: number;
  round_type: NegotiationRound;
  /** What the "employer" says in this round */
  employer_statement: string;
  /** The tactic being used (e.g. "anchoring", "budget constraints", "time pressure") */
  employer_tactic: string;
  /** Subtle coaching hint shown to the user before they respond */
  coaching_hint: string;
}

export interface UserResponseEvaluation {
  round: number;
  user_response: string;
  scores: {
    /** Did they project confidence without arrogance? (0-100) */
    confidence: number;
    /** Did they anchor to their value, not the employer's number? (0-100) */
    value_anchoring: number;
    /** Did they use specific evidence/data? (0-100) */
    specificity: number;
    /** Did they maintain collaborative tone? (0-100) */
    collaboration: number;
  };
  overall_score: number;
  what_worked: string[];
  what_to_improve: string[];
  /** Coaching advice to carry into the next round */
  coach_note: string;
}

// ─── Pipeline State ───────────────────────────────────────────────────

export interface CounterOfferSimState extends BaseState {
  session_id: string;
  user_id: string;
  current_stage: string;
  mode: CounterOfferMode;
  /** 3 for full mode, 1 for single_round */
  max_rounds: number;
  current_round: number;
  pushbacks: EmployerPushback[];
  evaluations: UserResponseEvaluation[];

  // Offer context
  offer_company: string;
  offer_role: string;
  offer_base_salary?: number;
  offer_total_comp?: number;
  /** What the user wants to reach */
  target_salary?: number;

  // Resume and platform context
  resume_text?: string;
  platform_context?: {
    positioning_strategy?: Record<string, unknown>;
    why_me_story?: string;
    /** Market research from a prior salary negotiation report, if available */
    market_research?: Record<string, unknown>;
  };

  final_summary?: {
    overall_score: number;
    total_rounds: number;
    best_round: number;
    strengths: string[];
    areas_for_improvement: string[];
    recommendation: string;
  };
}

// ─── SSE Events ───────────────────────────────────────────────────────

export type CounterOfferSSEEvent =
  | { type: 'stage_start'; stage: string; message: string }
  | { type: 'stage_complete'; stage: string; message: string; duration_ms?: number }
  | { type: 'transparency'; stage: string; message: string }
  | { type: 'pushback_presented'; pushback: EmployerPushback }
  | { type: 'response_evaluated'; evaluation: UserResponseEvaluation }
  | { type: 'simulation_complete'; session_id: string; summary: CounterOfferSimState['final_summary'] }
  | { type: 'pipeline_error'; stage: string; error: string };
