/**
 * Planner Handoff Service — orchestration layer for the warm handoff pipeline.
 *
 * Consolidates logic that was previously duplicated or inline in the route:
 *   - qualifyWithEmotionalReadiness(): derives emotional readiness from platform
 *     context and runs lead qualification — shared by /qualify and /refer routes.
 *   - runHandoffPipeline(): the full 4-step /refer pipeline (re-qualify, load
 *     context, generate handoff document, create referral record).
 *
 * The core functions (qualifyLead, matchPlanners, generateHandoffDocument,
 * createReferral) remain in lib/planner-handoff.ts. This service wraps the
 * orchestration only.
 *
 * This module is pure logic — no HTTP, no Hono.
 */

import { getUserContext } from './platform-context.js';
import {
  qualifyLead,
  generateHandoffDocument,
  createReferral,
} from './planner-handoff.js';
import type {
  AssetRange,
  QualificationResult,
  ReferralRecord,
  HandoffDocument,
} from './planner-handoff.js';
import logger from './logger.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QualifyWithReadinessResult {
  qualification: QualificationResult;
  emotionalReadiness: boolean;
}

export interface HandoffPipelineInput {
  userId: string;
  plannerId: string;
  optIn: boolean;
  assetRange: AssetRange;
  geography: string;
  careerSituation?: string;
  transitionContext?: string;
}

export interface HandoffPipelineResult {
  referral: ReferralRecord;
  handoffDocument: HandoffDocument;
  qualification: QualificationResult;
}

// ─── qualifyWithEmotionalReadiness ────────────────────────────────────────────

/**
 * Derives emotional readiness from the user's emotional_baseline platform context
 * (distress_detected flag), then runs all 5 lead qualification gates.
 *
 * Used by both POST /qualify and POST /refer to avoid duplicating the
 * emotional readiness derivation logic in the route handlers.
 *
 * Emotional readiness defaults to true if the baseline is unavailable — the
 * planner handoff should not be blocked by a missing optional context entry.
 */
export async function qualifyWithEmotionalReadiness(
  userId: string,
  optIn: boolean,
  assetRange: AssetRange,
  geography: string,
): Promise<QualifyWithReadinessResult> {
  let emotionalReadiness = true;

  try {
    const baselineRows = await getUserContext(userId, 'emotional_baseline');
    if (baselineRows.length > 0) {
      const baseline = baselineRows[0].content;
      emotionalReadiness = baseline.distress_detected !== true;
    }
  } catch {
    // Non-fatal — default to true if baseline unavailable
  }

  const qualification = await qualifyLead(userId, optIn, assetRange, geography, emotionalReadiness);

  return { qualification, emotionalReadiness };
}

// ─── runHandoffPipeline ───────────────────────────────────────────────────────

/**
 * Full 4-step referral pipeline:
 *   1. Re-qualify at referral time (gates enforced server-side, not trusted from client)
 *   2. Load platform context (retirement_readiness + client_profile) for doc generation
 *   3. Generate handoff document (LLM call via generateHandoffDocument)
 *   4. Create referral record in planner_referrals table
 *
 * Throws on qualification failure (caller should catch and return 400) or on
 * hard errors (caller should catch and return 500). Never swallows errors silently.
 */
export async function runHandoffPipeline(
  input: HandoffPipelineInput,
): Promise<HandoffPipelineResult> {
  const { userId, plannerId, optIn, assetRange, geography, careerSituation, transitionContext } = input;

  // Step 1: Re-qualify at referral time
  const { qualification } = await qualifyWithEmotionalReadiness(userId, optIn, assetRange, geography);

  if (!qualification.passed) {
    throw Object.assign(
      new Error('Lead qualification failed'),
      { qualification, isQualificationFailure: true },
    );
  }

  // Step 2: Load platform context for handoff document generation
  let readinessSummary: Record<string, unknown> | undefined;
  let clientProfile: Record<string, unknown> | undefined;

  try {
    const [readinessRows, profileRows] = await Promise.all([
      getUserContext(userId, 'retirement_readiness'),
      getUserContext(userId, 'client_profile'),
    ]);

    if (readinessRows.length > 0) {
      readinessSummary = readinessRows[0].content;
    }
    if (profileRows.length > 0) {
      clientProfile = profileRows[0].content;
    }
  } catch (err) {
    // Non-fatal — handoff doc generation has fallbacks
    logger.warn(
      { error: err instanceof Error ? err.message : String(err), userId },
      'runHandoffPipeline: failed to load platform context (non-fatal)',
    );
  }

  // Step 3: Generate handoff document (LLM call — has fallback in generateHandoffDocument)
  const handoffDocument = await generateHandoffDocument({
    career_situation: careerSituation,
    transition_context: transitionContext,
    readiness_summary: readinessSummary,
    client_profile: clientProfile,
  });

  // Step 4: Create referral record
  const referral = await createReferral(userId, plannerId, handoffDocument, qualification);
  if (!referral) {
    throw new Error('Failed to create referral record');
  }

  logger.info({ userId, plannerId, referralId: referral.id }, 'runHandoffPipeline: referral created');

  return { referral, handoffDocument, qualification };
}
