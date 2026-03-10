/**
 * Salary Negotiation Agent — Shared types for the salary-negotiation product.
 *
 * Agent #15 in the 33-agent platform. Researches market compensation data,
 * identifies leverage points, builds a total comp breakdown, and generates
 * negotiation scenarios with talking points.
 *
 * Pipeline: Market Researcher → Negotiation Strategist
 * Delivery: Full negotiation strategy report with scenarios at once
 */

import type { BaseState } from '../runtime/agent-protocol.js';

// ─── Compensation Components ──────────────────────────────────────

/** Individual components of a total compensation package */
export type CompComponent =
  | 'base_salary'
  | 'bonus'
  | 'equity'
  | 'benefits'
  | 'signing_bonus'
  | 'relocation';

/** All compensation components in priority order */
export const COMP_COMPONENTS: CompComponent[] = [
  'base_salary',
  'bonus',
  'equity',
  'benefits',
  'signing_bonus',
  'relocation',
];

/** Human-readable labels for compensation components */
export const COMP_LABELS: Record<CompComponent, string> = {
  base_salary: 'Base Salary',
  bonus: 'Bonus',
  equity: 'Equity',
  benefits: 'Benefits',
  signing_bonus: 'Signing Bonus',
  relocation: 'Relocation',
};

// ─── Negotiation Scenario Types ───────────────────────────────────

/** Types of negotiation scenarios the strategist generates */
export type ScenarioType =
  | 'initial_offer_response'
  | 'counter_offer'
  | 'final_negotiation';

/** All scenario types in sequence order */
export const SCENARIO_TYPES: ScenarioType[] = [
  'initial_offer_response',
  'counter_offer',
  'final_negotiation',
];

/** Human-readable labels for scenario types */
export const SCENARIO_LABELS: Record<ScenarioType, string> = {
  initial_offer_response: 'Initial Offer Response',
  counter_offer: 'Counter Offer',
  final_negotiation: 'Final Negotiation',
};

// ─── Market Research ──────────────────────────────────────────────

/** Market compensation research data gathered by the Market Researcher agent */
export interface MarketResearch {
  /** Target role being researched */
  role: string;
  /** Industry vertical */
  industry: string;
  /** Geographic market (city, region, or remote) */
  geography: string;
  /** Company size category (e.g. "startup", "mid-market", "enterprise") */
  company_size: string;
  /** Salary percentile range from market data */
  salary_range: {
    /** 25th percentile */
    p25: number;
    /** 50th percentile (median) */
    p50: number;
    /** 75th percentile */
    p75: number;
    /** 90th percentile */
    p90: number;
  };
  /** Estimated total compensation range including all components */
  total_comp_estimate: {
    /** Low end of total comp range */
    low: number;
    /** Midpoint of total comp range */
    mid: number;
    /** High end of total comp range */
    high: number;
  };
  /** Narrative context about current market conditions, trends, and factors */
  market_context: string;
  /** Confidence level in the research data based on source availability */
  data_confidence: 'low' | 'medium' | 'high';
  /** Source type — always 'ai_estimated' since no live data API is used */
  data_source: 'ai_estimated';
}

// ─── Leverage Points ──────────────────────────────────────────────

/** A negotiation leverage point identified from the user's profile and market context */
export interface LeveragePoint {
  /** Category of leverage (e.g. "competing offers", "unique skills", "market demand") */
  category: string;
  /** Description of the leverage point */
  description: string;
  /** How strong this leverage point is in negotiation */
  strength: 'weak' | 'moderate' | 'strong';
  /** Ready-to-use talking point for the negotiation conversation */
  talking_point: string;
}

// ─── Total Comp Breakdown ─────────────────────────────────────────

/** Breakdown of a single compensation component with market comparison */
export interface TotalCompBreakdown {
  /** Which compensation component this entry covers */
  component: CompComponent;
  /** Current value of this component (null if not currently receiving) */
  current_value: number | null;
  /** Market value for this component at the target level */
  market_value: number;
  /** Whether this component is typically negotiable */
  negotiable: boolean;
  /** Additional notes or context about this component */
  notes: string;
}

// ─── Negotiation Scenarios ────────────────────────────────────────

/** A complete negotiation scenario with recommended approach and fallbacks */
export interface NegotiationScenario {
  /** Type of negotiation scenario */
  type: ScenarioType;
  /** Description of the situation this scenario addresses */
  situation: string;
  /** Recommended response strategy */
  recommended_response: string;
  /** Specific talking points to use in this scenario */
  talking_points: string[];
  /** Potential risks to be aware of */
  risks: string[];
  /** Fallback position if the primary approach does not succeed */
  fallback_position: string;
}

// ─── Talking Points ───────────────────────────────────────────────

/** A structured talking point for use during negotiation conversations */
export interface TalkingPoint {
  /** Topic area this point addresses (e.g. "base salary", "equity", "role scope") */
  topic: string;
  /** The core point to make */
  point: string;
  /** Supporting evidence or data backing up this point */
  evidence: string;
  /** Guidance on tone and delivery (e.g. "collaborative, not adversarial") */
  tone_guidance: string;
}

// ─── Pipeline State ───────────────────────────────────────────────

/** Shared pipeline state for the salary negotiation agent */
export interface SalaryNegotiationState extends BaseState {
  session_id: string;
  user_id: string;
  current_stage: string;

  /** Details of the offer being negotiated */
  offer_details: {
    /** Company extending the offer */
    company: string;
    /** Role/title for the offer */
    role: string;
    /** Base salary offered */
    base_salary?: number;
    /** Total compensation offered */
    total_comp?: number;
    /** Equity details (e.g. options, RSUs, vesting schedule) */
    equity_details?: string;
    /** Any other offer details (signing bonus, relocation, etc.) */
    other_details?: string;
  };

  /** User's current compensation for comparison */
  current_compensation?: {
    /** Current base salary */
    base_salary?: number;
    /** Current total compensation */
    total_comp?: number;
    /** Current equity details */
    equity?: string;
  };

  /** Context about the target role and market */
  target_context?: {
    /** Target role or title */
    target_role: string;
    /** Target industry */
    target_industry: string;
    /** Target seniority level (e.g. "VP", "Director", "Senior Manager") */
    target_seniority: string;
  };

  /** Cross-product context from resume pipeline */
  platform_context?: {
    /** Positioning strategy from the resume agent */
    positioning_strategy?: Record<string, unknown>;
    /** Why-me narrative from the resume agent */
    why_me_story?: string;
  };

  /** Parsed resume data */
  resume_data?: {
    name: string;
    current_title: string;
    career_summary: string;
    key_skills: string[];
    key_achievements: string[];
    work_history: Array<{
      company: string;
      title: string;
      duration: string;
      highlights: string[];
    }>;
  };

  /** Market research from the Market Researcher agent */
  market_research?: MarketResearch;

  /** Identified leverage points for negotiation */
  leverage_points?: LeveragePoint[];

  /** Component-by-component compensation breakdown */
  total_comp_breakdown?: TotalCompBreakdown[];

  /** High-level negotiation strategy */
  negotiation_strategy?: {
    /** Overall approach (e.g. "collaborative", "competitive", "value-anchored") */
    approach: string;
    /** Recommended opening position */
    opening_position: string;
    /** The point below which the user should walk away */
    walk_away_point: string;
    /** Best Alternative to a Negotiated Agreement */
    batna: string;
  };

  /** Structured talking points for negotiation conversations */
  talking_points?: TalkingPoint[];

  /** Pre-built negotiation scenarios with responses */
  scenarios?: NegotiationScenario[];

  /** Final assembled negotiation strategy report (markdown) */
  final_report?: string;

  /** Overall quality score for the negotiation strategy (0-100) */
  quality_score?: number;

  /** User feedback for strategy revision (set when user requests changes at strategy_review gate) */
  revision_feedback?: string;
}

// ─── SSE Events ───────────────────────────────────────────────────

/** Discriminated union of all SSE events emitted by the salary negotiation pipeline */
export type SalaryNegotiationSSEEvent =
  | { type: 'stage_start'; stage: string; message: string }
  | { type: 'stage_complete'; stage: string; message: string; duration_ms?: number }
  | { type: 'transparency'; stage: string; message: string }
  | { type: 'research_complete'; market_p50: number; market_p75: number; data_confidence: 'low' | 'medium' | 'high' }
  | { type: 'strategy_ready'; approach: string; leverage_count: number }
  | { type: 'scenario_complete'; scenario_type: ScenarioType; talking_point_count: number }
  | {
      type: 'strategy_review_ready';
      session_id: string;
      opening_position: string;
      walk_away_point: string;
      batna: string;
      approach: string;
      market_p50?: number;
      market_p75?: number;
      data_confidence?: 'low' | 'medium' | 'high';
    }
  | { type: 'pipeline_gate'; gate: string }
  | { type: 'negotiation_complete'; session_id: string; report: string; quality_score: number }
  | { type: 'pipeline_error'; stage: string; error: string };
