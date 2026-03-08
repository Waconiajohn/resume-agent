/**
 * Planner Handoff — Financial Planner Warm Handoff protocol (Story 6-4).
 *
 * Implements the 5-step warm handoff protocol:
 *   1. Lead qualification (5 gates — ALL must pass)
 *   2. Planner matching (geography, asset level, specialization)
 *   3. Handoff document generation (MODEL_MID — professional briefing doc)
 *   4. Referral record creation (stored for manual warm introduction)
 *   5. Follow-up date computation (48h, 1w, 2w tracking windows)
 *
 * This module is pure logic — no HTTP, no Hono. Routes call into it.
 *
 * FIDUCIARY GUARDRAIL: This module facilitates introductions ONLY.
 * It never produces financial advice. The handoff document is a
 * briefing for the planner, not a recommendation for the user.
 */

import { supabaseAdmin } from './supabase.js';
import { llm, MODEL_MID } from './llm.js';
import { repairJSON } from './json-repair.js';
import logger from './logger.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlannerProfile {
  id: string;
  name: string;
  firm: string;
  specializations: string[];
  geographic_regions: string[];
  asset_minimum: number;
  bio: string;
  is_active: boolean;
}

export interface HandoffDocument {
  career_situation: string;
  transition_context: string;
  retirement_readiness_summary: string;
  key_concerns: string[];
  recommended_discussion_topics: string[];
  talking_points_for_planner: string[];
}

export interface ReferralRecord {
  id?: string;
  user_id: string;
  planner_id: string;
  status: 'pending' | 'introduced' | 'meeting_scheduled' | 'engaged' | 'declined' | 'expired';
  handoff_document: HandoffDocument;
  qualification_results: QualificationResult;
  created_at?: string;
  follow_up_dates: {
    hours_48?: string;
    week_1?: string;
    week_2?: string;
  };
}

export interface QualificationResult {
  passed: boolean;
  checks: {
    asset_minimum: boolean;
    user_opt_in: boolean;
    assessment_completed: boolean;
    geographic_match: boolean;
    emotional_readiness: boolean;
  };
  failure_reasons: string[];
}

export type AssetRange = 'under_100k' | '100k_250k' | '250k_500k' | '500k_1m' | 'over_1m';

// ─── Asset range → minimum dollar mapping ────────────────────────────────────

const ASSET_MIN_MAP: Record<string, number> = {
  '100k_250k': 100_000,
  '250k_500k': 250_000,
  '500k_1m': 500_000,
  'over_1m': 1_000_000,
};

const QUALIFYING_ASSET_RANGES: ReadonlySet<string> = new Set([
  '100k_250k',
  '250k_500k',
  '500k_1m',
  'over_1m',
]);

// ─── qualifyLead ──────────────────────────────────────────────────────────────

/**
 * Runs all 5 lead qualification gates.
 * ALL 5 must pass before a referral can be created.
 *
 * Gates:
 *   1. asset_minimum — self-reported range must be $100K+
 *   2. user_opt_in — explicit consent required
 *   3. assessment_completed — at least one retirement_readiness_assessments row
 *   4. geographic_match — at least one active planner covers the region
 *   5. emotional_readiness — user is not flagging acute distress
 */
export async function qualifyLead(
  userId: string,
  optIn: boolean,
  assetRange: AssetRange,
  geography: string,
  emotionalReadiness: boolean,
): Promise<QualificationResult> {
  const checks = {
    asset_minimum: QUALIFYING_ASSET_RANGES.has(assetRange),
    user_opt_in: optIn,
    assessment_completed: false,
    geographic_match: false,
    emotional_readiness: emotionalReadiness,
  };

  // Check 3: completed retirement readiness assessment
  try {
    const { data: assessments, error } = await supabaseAdmin
      .from('retirement_readiness_assessments')
      .select('id')
      .eq('user_id', userId)
      .limit(1);

    if (error) {
      logger.warn({ error: error.message, userId }, 'qualifyLead: assessment query failed');
    } else {
      checks.assessment_completed = (assessments?.length ?? 0) > 0;
    }
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : String(err), userId },
      'qualifyLead: unexpected error checking assessment',
    );
  }

  // Check 4: geographic match — any active planner covers this region
  try {
    const { data: planners, error } = await supabaseAdmin
      .from('financial_planners')
      .select('id')
      .eq('is_active', true)
      .contains('geographic_regions', [geography])
      .limit(1);

    if (error) {
      logger.warn({ error: error.message, geography }, 'qualifyLead: planner geographic query failed');
    } else {
      checks.geographic_match = (planners?.length ?? 0) > 0;
    }
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : String(err), geography },
      'qualifyLead: unexpected error checking geographic match',
    );
  }

  const failureReasons: string[] = [];
  if (!checks.asset_minimum) failureReasons.push('Minimum $100K investable assets not met');
  if (!checks.user_opt_in) failureReasons.push('User has not opted in');
  if (!checks.assessment_completed) failureReasons.push('Retirement readiness assessment not completed');
  if (!checks.geographic_match) failureReasons.push('No active planner available in geographic region');
  if (!checks.emotional_readiness) failureReasons.push('Emotional readiness check not passed');

  return {
    passed: Object.values(checks).every(Boolean),
    checks,
    failure_reasons: failureReasons,
  };
}

// ─── matchPlanners ────────────────────────────────────────────────────────────

/**
 * Returns up to 5 active planners matching the geography and asset range.
 * Results are sorted by specialization match count descending (personality fit
 * proxy), then by name ascending for deterministic ordering.
 *
 * Asset range → minimum: planners with asset_minimum <= the user's lower bound
 * are included (i.e., planner won't refuse the client based on asset size).
 */
export async function matchPlanners(
  geography: string,
  assetRange: AssetRange,
  specializations?: string[],
): Promise<PlannerProfile[]> {
  if (!QUALIFYING_ASSET_RANGES.has(assetRange)) {
    logger.warn({ assetRange }, 'matchPlanners: invalid asset range');
    return [];
  }

  const userMin = ASSET_MIN_MAP[assetRange] ?? 100_000;

  try {
    const { data, error } = await supabaseAdmin
      .from('financial_planners')
      .select('*')
      .eq('is_active', true)
      .contains('geographic_regions', [geography])
      .lte('asset_minimum', userMin)
      .order('name')
      .limit(5);

    if (error) {
      logger.warn({ error: error.message, geography, assetRange }, 'matchPlanners: query failed');
      return [];
    }

    let planners = (data ?? []) as PlannerProfile[];

    // Sort by specialization match count if requested — higher match first
    if (specializations && specializations.length > 0) {
      const specSet = new Set(specializations.map((s) => s.toLowerCase()));
      planners = planners.sort((a, b) => {
        const aMatch = a.specializations.filter((s) => specSet.has(s.toLowerCase())).length;
        const bMatch = b.specializations.filter((s) => specSet.has(s.toLowerCase())).length;
        if (bMatch !== aMatch) return bMatch - aMatch;
        return a.name.localeCompare(b.name);
      });
    }

    return planners;
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : String(err), geography },
      'matchPlanners: unexpected error',
    );
    return [];
  }
}

// ─── generateHandoffDocument ──────────────────────────────────────────────────

/**
 * Uses MODEL_MID to generate a professional planner briefing document.
 *
 * The document is written FOR THE PLANNER — not the user. It surfaces
 * relevant context so the first meeting is immediately productive.
 *
 * Falls back to a minimal static document if the LLM call fails.
 */
export async function generateHandoffDocument(
  userContext: {
    career_situation?: string;
    transition_context?: string;
    readiness_summary?: Record<string, unknown>;
    client_profile?: Record<string, unknown>;
  },
): Promise<HandoffDocument> {
  const readinessSection = userContext.readiness_summary
    ? `## Retirement Readiness Assessment\n${JSON.stringify(userContext.readiness_summary, null, 2)}`
    : '';

  const profileSection = userContext.client_profile
    ? `## Client Profile\n${JSON.stringify(userContext.client_profile, null, 2)}`
    : '';

  const prompt = `Generate a professional handoff document for a fiduciary financial planner meeting.

The document helps the planner understand the client's situation BEFORE the first meeting so the conversation is immediately productive. This is written for the planner — be specific and professional.

## Client Context

Career Situation: ${userContext.career_situation ?? 'Career transition in progress'}
Transition Context: ${userContext.transition_context ?? 'Executive in career transition'}

${readinessSection}
${profileSection}

Return a JSON object with exactly these fields:
{
  "career_situation": "2-3 sentence summary of their career situation for the planner",
  "transition_context": "Context about the nature and timing of their transition",
  "retirement_readiness_summary": "Key findings from their retirement readiness assessment relevant to planning",
  "key_concerns": ["concern 1", "concern 2", "concern 3"],
  "recommended_discussion_topics": ["topic 1", "topic 2", "topic 3"],
  "talking_points_for_planner": ["specific point for the planner to raise proactively", ...]
}

IMPORTANT: This is a facilitator document — never include financial advice, recommendations, or specific investment guidance. Stick to framing, context, and questions to explore.`;

  try {
    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 2048,
      system: 'You are a professional document generator specializing in financial planner intake preparation. Return ONLY valid JSON with no markdown fences.',
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.text.trim();
    const parsed = repairJSON<Record<string, unknown>>(text);

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('LLM returned unparseable JSON');
    }

    return {
      career_situation: String(parsed['career_situation'] ?? ''),
      transition_context: String(parsed['transition_context'] ?? ''),
      retirement_readiness_summary: String(parsed['retirement_readiness_summary'] ?? ''),
      key_concerns: Array.isArray(parsed['key_concerns']) ? parsed['key_concerns'].map(String) : [],
      recommended_discussion_topics: Array.isArray(parsed['recommended_discussion_topics'])
        ? parsed['recommended_discussion_topics'].map(String)
        : [],
      talking_points_for_planner: Array.isArray(parsed['talking_points_for_planner'])
        ? parsed['talking_points_for_planner'].map(String)
        : [],
    };
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : String(err) },
      'generateHandoffDocument: LLM call failed — using fallback document',
    );
    return buildFallbackHandoffDocument(userContext);
  }
}

function buildFallbackHandoffDocument(
  userContext: {
    career_situation?: string;
    transition_context?: string;
  },
): HandoffDocument {
  return {
    career_situation: userContext.career_situation ?? 'Executive in career transition — see assessment data for details.',
    transition_context: userContext.transition_context ?? 'Career transition in progress.',
    retirement_readiness_summary: 'Retirement readiness assessment completed — see platform data for dimension-level signals.',
    key_concerns: [
      'Healthcare bridge coverage during transition gap',
      'Retirement savings impact of employment interruption',
      'Timeline and runway planning',
    ],
    recommended_discussion_topics: [
      'Retirement savings strategy during transition',
      'Healthcare coverage options',
      'Income replacement timeline',
    ],
    talking_points_for_planner: [
      'Client has completed a structured retirement readiness assessment',
      'Career transition context shapes urgency and timeline',
      'Client opted in to this introduction — they are open to guidance',
    ],
  };
}

// ─── createReferral ───────────────────────────────────────────────────────────

/**
 * Persists a planner referral record with pre-computed follow-up windows.
 *
 * Follow-up schedule (from the 5-step protocol):
 *   - 48 hours: confirm introduction was received
 *   - 1 week: check if meeting was scheduled
 *   - 2 weeks: final follow-up / mark as expired if no contact
 */
export async function createReferral(
  userId: string,
  plannerId: string,
  handoffDocument: HandoffDocument,
  qualificationResults: QualificationResult,
): Promise<ReferralRecord | null> {
  const now = new Date();
  const followUpDates = {
    hours_48: new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString(),
    week_1: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    week_2: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  };

  try {
    const { data, error } = await supabaseAdmin
      .from('planner_referrals')
      .insert({
        user_id: userId,
        planner_id: plannerId,
        status: 'pending',
        handoff_document: handoffDocument,
        qualification_results: qualificationResults,
        follow_up_dates: followUpDates,
      })
      .select()
      .single();

    if (error) {
      logger.warn({ error: error.message, userId, plannerId }, 'createReferral: insert failed');
      return null;
    }

    return data as ReferralRecord;
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : String(err), userId, plannerId },
      'createReferral: unexpected error',
    );
    return null;
  }
}

// ─── updateReferralStatus ─────────────────────────────────────────────────────

/**
 * Updates the status of an existing referral.
 * Used by admin/ops to track handoff progress through the 5-step protocol.
 */
export async function updateReferralStatus(
  referralId: string,
  status: ReferralRecord['status'],
): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from('planner_referrals')
      .update({ status })
      .eq('id', referralId);

    if (error) {
      logger.warn({ error: error.message, referralId, status }, 'updateReferralStatus: update failed');
    }
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : String(err), referralId },
      'updateReferralStatus: unexpected error',
    );
  }
}

// ─── getUserReferrals ─────────────────────────────────────────────────────────

/**
 * Returns all referrals for a user, with planner profile data joined.
 * Ordered by most recent first.
 */
export async function getUserReferrals(userId: string): Promise<ReferralRecord[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('planner_referrals')
      .select('*, financial_planners(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.warn({ error: error.message, userId }, 'getUserReferrals: query failed');
      return [];
    }

    return (data ?? []) as ReferralRecord[];
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : String(err), userId },
      'getUserReferrals: unexpected error',
    );
    return [];
  }
}
