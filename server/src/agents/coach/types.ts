/**
 * Virtual Coach Agent — Shared types for the platform orchestrator.
 *
 * The Virtual Coach is the platform's central intelligence layer. It knows
 * where each client is in the 8-phase coaching journey and makes methodology-
 * grounded recommendations about what they should do next.
 *
 * Unlike product agents that run pipelines, the coach runs as a conversation
 * agent — it answers questions, orients the client, and routes them to the
 * right product at the right time.
 */

import type { AgentTool, AgentContext, BaseState } from '../runtime/agent-protocol.js';

// ─── Coaching Phases ───────────────────────────────────────────────

/**
 * The 8-phase coaching journey. Phases are sequential but not strictly
 * gated — a client can engage multiple phases concurrently, though the
 * coach recommends optimal sequencing.
 */
export type CoachingPhase =
  | 'onboarding'       // Client profile established
  | 'positioning'      // Positioning strategy + evidence surfaced
  | 'resume_ready'     // Resume pipeline complete
  | 'linkedin_ready'   // LinkedIn profile updated
  | 'job_targeting'    // Active job search
  | 'interview_prep'   // Interview preparation complete
  | 'offer_stage'      // In active negotiations
  | 'complete';        // Placed / transition complete

/** Human-readable labels for coaching phases (user-facing) */
export const PHASE_LABELS: Record<CoachingPhase, string> = {
  onboarding: 'Getting Started',
  positioning: 'Positioning & Evidence',
  resume_ready: 'Resume Complete',
  linkedin_ready: 'LinkedIn Updated',
  job_targeting: 'Active Job Search',
  interview_prep: 'Interview Preparation',
  offer_stage: 'Offer & Negotiation',
  complete: 'Transition Complete',
};

// ─── Pipeline / Product State ──────────────────────────────────────

/** A currently active pipeline session */
export interface ActivePipeline {
  session_id: string;
  product_type: string;
  pipeline_status: 'running' | 'waiting';
  pipeline_stage?: string;
  pending_gate?: string;
  started_at: string;
}

/** An item that appears stalled (active but no recent progress) */
export interface StalledItem {
  session_id: string;
  product_type: string;
  pipeline_stage?: string;
  stalled_days: number;
}

// ─── Client Snapshot ───────────────────────────────────────────────

/**
 * Full snapshot of client state loaded by load_client_context.
 * Contains everything the coach needs to orient, advise, and route.
 */
export interface ClientSnapshot {
  /** Supabase user ID */
  user_id: string;
  /** Client's name, if known from profile */
  name?: string;
  /** Current position in the 8-phase coaching journey */
  journey_phase: CoachingPhase;
  /**
   * Client profile from onboarding assessment.
   * Includes career_level, industry, financial_segment, coaching_tone.
   */
  client_profile?: Record<string, unknown>;
  /**
   * Positioning strategy from the resume strategist.
   * Includes positioning_angle, differentiators, target_role.
   */
  positioning_strategy?: Record<string, unknown>;
  /**
   * Emotional baseline from the emotional baseline middleware.
   * Includes state (crisis/stressed/ideal/comfortable), tone register.
   */
  emotional_baseline?: Record<string, unknown>;
  /** STAR evidence items from the positioning interview */
  evidence_items: Record<string, unknown>[];
  /** Career narrative entries (Why Me / Why Not Me stories) */
  career_narratives: Record<string, unknown>[];
  /** Currently active pipeline sessions */
  active_pipelines: ActivePipeline[];
  /** product_type strings for all completed pipeline sessions */
  completed_products: string[];
  /** Sessions that appear stalled (no progress in 24+ hours) */
  stalled_items: StalledItem[];
  /** Days since the most recent completed session */
  days_since_last_activity: number;
  /** ISO timestamp of last completed session */
  last_activity_at?: string;
}

// ─── Budget ────────────────────────────────────────────────────────

/**
 * Daily AI budget state for cost-aware recommendations.
 * Loaded from the coach_budget table when available.
 */
export interface CoachBudget {
  daily_limit_usd: number;
  used_today_usd: number;
  remaining_daily_usd: number;
  reset_at: string;
}

// ─── Coach Memory ──────────────────────────────────────────────────

/**
 * A single coaching note from a previous conversation.
 * Stored in the coach_memory table when available.
 */
export interface CoachMemoryNote {
  id: string;
  note: string;
  context: string;
  created_at: string;
}

// ─── Pipeline State ────────────────────────────────────────────────

/** Shared pipeline state for the Virtual Coach conversation agent */
export interface CoachState extends BaseState {
  session_id: string;
  user_id: string;
  /** Conversation mode — chat is free-form, guided follows a structured flow */
  mode: 'chat' | 'guided';
  /** Full client snapshot, populated by load_client_context */
  client_snapshot?: ClientSnapshot;
  /** Current budget state, populated by load_client_context */
  budget?: CoachBudget;
  /** Conversation history for context continuity */
  conversation_history: Array<{ role: 'user' | 'assistant'; content: string }>;
}

// ─── SSE Events ────────────────────────────────────────────────────

/** Discriminated union of all SSE events emitted by the coach pipeline */
export type CoachSSEEvent =
  | { type: 'stage_start'; stage: string; message: string }
  | { type: 'stage_complete'; stage: string; message: string; duration_ms?: number }
  | { type: 'transparency'; stage: string; message: string }
  | {
      type: 'context_loaded';
      journey_phase: CoachingPhase;
      has_profile: boolean;
      active_pipeline_count: number;
      completed_product_count: number;
    }
  | {
      type: 'phase_assessed';
      current_phase: CoachingPhase;
      completed_phases: CoachingPhase[];
      blockers: string[];
    }
  | {
      type: 'recommendation_ready';
      action: string;
      product?: string;
      room?: string;
      urgency: 'immediate' | 'soon' | 'when_ready';
    }
  | { type: 'pipeline_error'; stage: string; error: string };

// ─── Type Aliases ──────────────────────────────────────────────────

/** A tool available to the Virtual Coach agent */
export type CoachTool = AgentTool<CoachState, CoachSSEEvent>;

/** The agent context passed to each Virtual Coach tool */
export type CoachContext = AgentContext<CoachState, CoachSSEEvent>;
