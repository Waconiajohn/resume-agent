/**
 * Momentum Service — orchestration layer for stall detection and celebration pipelines.
 *
 * Consolidates the multi-step LLM orchestration that was previously inline in the
 * momentum route handlers. Routes call these functions; cognitive-reframing.ts
 * provides the underlying LLM primitives.
 *
 * This module is pure logic — no HTTP, no Hono.
 */

import { supabaseAdmin } from './supabase.js';
import { detectStalls, generateCoachingMessage } from './cognitive-reframing.js';
import { getEmotionalBaseline } from './emotional-baseline.js';
import logger from './logger.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreatedNudge {
  id: string;
  user_id: string;
  trigger_type: string;
  message: string;
  coaching_tone: string;
  dismissed: boolean;
  created_at: string;
}

export interface CheckStallsResult {
  nudges: CreatedNudge[];
}

export interface CelebrationResult {
  message: string;
  nudge: CreatedNudge | null;
}

// ─── Streak helpers ───────────────────────────────────────────────────────────

/**
 * Returns true if `earlier` is exactly one calendar day before `later`.
 * Both inputs are UTC date strings (YYYY-MM-DD).
 */
export function isConsecutiveDay(earlier: string, later: string): boolean {
  const e = new Date(earlier + 'T00:00:00Z');
  const l = new Date(later + 'T00:00:00Z');
  const diffMs = l.getTime() - e.getTime();
  return diffMs === 24 * 60 * 60 * 1000;
}

/**
 * Given activities sorted by created_at DESC, compute:
 * - current: consecutive days backwards from today with at least 1 activity.
 *   If no activity TODAY, current = 0 (encourages daily action).
 * - longest: maximum consecutive day streak ever.
 */
export function computeStreak(
  activities: Array<{ created_at: string }>,
): { current: number; longest: number } {
  if (activities.length === 0) {
    return { current: 0, longest: 0 };
  }

  // Extract unique UTC date strings (YYYY-MM-DD), sorted descending
  const dates = Array.from(
    new Set(
      activities.map((a) => a.created_at.slice(0, 10)),
    ),
  ).sort((a, b) => (a > b ? -1 : 1));

  const todayUtc = new Date().toISOString().slice(0, 10);

  // ── Current streak ──
  // If the most recent activity is not today, streak is 0
  let current = 0;
  if (dates[0] === todayUtc) {
    current = 1;
    for (let i = 1; i < dates.length; i++) {
      const prev = dates[i - 1];
      const curr = dates[i];
      if (isConsecutiveDay(curr, prev)) {
        current += 1;
      } else {
        break;
      }
    }
  }

  // ── Longest streak ──
  let longest = 0;
  let runLength = 1;
  for (let i = 1; i < dates.length; i++) {
    const prev = dates[i - 1];
    const curr = dates[i];
    if (isConsecutiveDay(curr, prev)) {
      runLength += 1;
    } else {
      if (runLength > longest) longest = runLength;
      runLength = 1;
    }
  }
  if (runLength > longest) longest = runLength;

  // Edge: single day of activity counts as streak of 1
  if (dates.length > 0 && longest === 0) longest = 1;

  return { current, longest };
}

// ─── checkStallsAndGenerateNudges ─────────────────────────────────────────────

/**
 * Full stall-check pipeline:
 *   1. Detect stalls via cognitive-reframing engine
 *   2. Fetch emotional baseline
 *   3. Deduplicate — skip trigger types that fired within the last 3 days
 *   4. Generate a coaching message per new stall (LLM via cognitive-reframing)
 *   5. Persist nudges to coaching_nudges table
 *
 * Returns the list of newly created nudges (empty if no stalls or all deduplicated).
 */
export async function checkStallsAndGenerateNudges(
  userId: string,
  userEmail: string,
): Promise<CheckStallsResult> {
  const [stalls, baseline] = await Promise.all([
    detectStalls(userId),
    getEmotionalBaseline(userId),
  ]);

  if (stalls.length === 0) {
    return { nudges: [] };
  }

  // Deduplication: don't re-trigger the same trigger_type within 3 days
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentNudges } = await supabaseAdmin
    .from('coaching_nudges')
    .select('trigger_type')
    .eq('user_id', userId)
    .gte('created_at', threeDaysAgo);

  const recentTriggerTypes = new Set(
    (recentNudges ?? []).map((n: { trigger_type: string }) => n.trigger_type),
  );

  const newStalls = stalls.filter((s) => !recentTriggerTypes.has(s.trigger_type));
  if (newStalls.length === 0) {
    return { nudges: [] };
  }

  // Generate and persist nudges for each new stall
  const nudgeInserts = await Promise.allSettled(
    newStalls.map(async (stall) => {
      const message = await generateCoachingMessage(stall, baseline, userEmail);
      const coachingTone = baseline?.coaching_tone ?? 'supportive';

      const { data: nudge, error } = await supabaseAdmin
        .from('coaching_nudges')
        .insert({
          user_id: userId,
          trigger_type: stall.trigger_type,
          message,
          coaching_tone: coachingTone,
        })
        .select('*')
        .single();

      if (error) {
        logger.error(
          { error: error.message, userId, triggerType: stall.trigger_type },
          'checkStallsAndGenerateNudges: nudge insert failed',
        );
        return null;
      }

      return nudge as CreatedNudge;
    }),
  );

  const createdNudges = nudgeInserts
    .filter((r) => r.status === 'fulfilled' && r.value !== null)
    .map((r) => (r as PromiseFulfilledResult<CreatedNudge>).value);

  return { nudges: createdNudges };
}

// ─── generateCelebration ──────────────────────────────────────────────────────

/**
 * Milestone celebration pipeline:
 *   1. Fetch emotional baseline for personalized tone
 *   2. Generate celebration coaching message (LLM via cognitive-reframing)
 *   3. Persist nudge to coaching_nudges table (best-effort — message returned even if persist fails)
 *
 * Returns the generated message and the persisted nudge (null if persist failed).
 */
export async function generateCelebration(
  userId: string,
  userEmail: string,
  milestone: string,
): Promise<CelebrationResult> {
  const baseline = await getEmotionalBaseline(userId);

  const message = await generateCoachingMessage(
    { trigger_type: 'milestone', context: milestone },
    baseline,
    userEmail,
  );

  const coachingTone = baseline?.coaching_tone ?? 'supportive';

  const { data: nudge, error } = await supabaseAdmin
    .from('coaching_nudges')
    .insert({
      user_id: userId,
      trigger_type: 'milestone',
      message,
      coaching_tone: coachingTone,
    })
    .select('*')
    .single();

  if (error) {
    logger.warn({ error: error.message, userId }, 'generateCelebration: nudge persist failed (non-fatal)');
    return { message, nudge: null };
  }

  return { message, nudge: nudge as CreatedNudge };
}
