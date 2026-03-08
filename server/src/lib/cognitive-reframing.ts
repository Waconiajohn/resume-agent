/**
 * Cognitive Reframing Engine — stall detection + LLM coaching messages.
 *
 * Detects "stall" conditions from a user's activity and application history,
 * then generates compassionate, evidence-based coaching messages using MODEL_MID.
 *
 * Coaching methodology from Bible Ch 8:
 * - Five emotional phases: Shock → Anger → Bargaining → Depression → Acceptance
 * - The platform interrupts imposter syndrome with evidence
 * - Small wins should be celebrated specifically
 * - When overwhelmed, reduce to single next step
 * - Never add tasks, reduce them
 * - Validate frustration, then pivot to action
 *
 * This module is pure logic — no HTTP, no Hono. Routes call into it.
 */

import { supabaseAdmin } from './supabase.js';
import { llm, MODEL_MID } from './llm.js';
import logger from './logger.js';
import type { EmotionalBaseline } from './emotional-baseline.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type StallTriggerType =
  | 'stalled_pipeline'
  | 'rejection_streak'
  | 'inactivity'
  | 'milestone';

export interface StallSignal {
  trigger_type: StallTriggerType;
  /** Human-readable description of what was detected */
  context: string;
}

// ─── Milestone thresholds ─────────────────────────────────────────────────────

const MILESTONE_COUNTS = new Set([10, 25, 50, 100, 200]);

// ─── detectStalls ─────────────────────────────────────────────────────────────

/**
 * Analyzes a user's recent activity and application history to detect stall
 * conditions. Returns an array of stall signals (may be empty if no stalls).
 *
 * Heuristics:
 * 1. Inactivity — no activities in last 5 days
 * 2. Stalled pipeline — applications stuck at same stage for 14+ days
 * 3. Rejection streak — 3+ applications moved to closed_lost in last 7 days
 * 4. Milestone (positive) — 10th, 25th, 50th activity logged
 */
export async function detectStalls(userId: string): Promise<StallSignal[]> {
  const signals: StallSignal[] = [];

  try {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

    const [
      recentActivityResult,
      totalCountResult,
      recentApplicationsResult,
      stalledApplicationsResult,
    ] = await Promise.allSettled([
      // Recent activities (last 5 days)
      supabaseAdmin
        .from('user_momentum_activities')
        .select('id', { count: 'exact' })
        .eq('user_id', userId)
        .gte('created_at', fiveDaysAgo),

      // Total activity count (for milestone detection)
      supabaseAdmin
        .from('user_momentum_activities')
        .select('id', { count: 'exact' })
        .eq('user_id', userId),

      // Applications closed as rejected in last 7 days
      supabaseAdmin
        .from('job_applications')
        .select('id', { count: 'exact' })
        .eq('user_id', userId)
        .in('status', ['rejected', 'closed_lost', 'declined'])
        .gte('updated_at', sevenDaysAgo),

      // Applications stuck in non-terminal stage for 14+ days
      supabaseAdmin
        .from('job_applications')
        .select('id, status', { count: 'exact' })
        .eq('user_id', userId)
        .not('status', 'in', '("offer_received","accepted","rejected","closed_lost","declined","withdrawn")')
        .lte('updated_at', fourteenDaysAgo),
    ]);

    // ── Inactivity ──
    if (recentActivityResult.status === 'fulfilled') {
      const { count } = recentActivityResult.value;
      if ((count ?? 0) === 0) {
        signals.push({
          trigger_type: 'inactivity',
          context: 'No career activities logged in the past 5 days',
        });
      }
    } else {
      logger.warn({ error: recentActivityResult.reason, userId }, 'detectStalls: recent activity query rejected');
    }

    // ── Milestone ──
    // NOTE: Uses exact match — if two activities are logged in rapid succession
    // and the count jumps past a milestone, it will be missed. Acceptable trade-off
    // given the dedup window prevents double-fire and missing an exact count is low-impact.
    if (totalCountResult.status === 'fulfilled') {
      const total = totalCountResult.value.count ?? 0;
      if (MILESTONE_COUNTS.has(total)) {
        signals.push({
          trigger_type: 'milestone',
          context: `Reached ${total} total career activities — a meaningful milestone`,
        });
      }
    } else {
      logger.warn({ error: totalCountResult.reason, userId }, 'detectStalls: total count query rejected');
    }

    // ── Rejection streak ──
    if (recentApplicationsResult.status === 'fulfilled') {
      const rejectionCount = recentApplicationsResult.value.count ?? 0;
      if (rejectionCount >= 3) {
        signals.push({
          trigger_type: 'rejection_streak',
          context: `${rejectionCount} applications closed as rejections in the past 7 days`,
        });
      }
    } else {
      logger.warn({ error: recentApplicationsResult.reason, userId }, 'detectStalls: recent applications query rejected');
    }

    // ── Stalled pipeline ──
    if (stalledApplicationsResult.status === 'fulfilled') {
      const stalledCount = stalledApplicationsResult.value.count ?? 0;
      if (stalledCount > 0) {
        signals.push({
          trigger_type: 'stalled_pipeline',
          context: `${stalledCount} application${stalledCount > 1 ? 's' : ''} stuck at the same stage for 14+ days without movement`,
        });
      }
    } else {
      logger.warn({ error: stalledApplicationsResult.reason, userId }, 'detectStalls: stalled applications query rejected');
    }
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : String(err), userId },
      'detectStalls: unexpected error during stall analysis',
    );
  }

  return signals;
}

// ─── generateCoachingMessage ──────────────────────────────────────────────────

/**
 * Generates a 2-3 sentence coaching message tailored to the stall trigger
 * and the user's coaching tone. Uses MODEL_MID.
 *
 * Falls back to a static message if the LLM call fails.
 */
export async function generateCoachingMessage(
  signal: StallSignal,
  baseline: EmotionalBaseline | null,
  userName: string,
): Promise<string> {
  const coachingTone = baseline?.coaching_tone ?? 'supportive';
  const emotionalState = baseline?.emotional_state ?? 'acceptance';
  const urgencyScore = baseline?.urgency_score ?? 5;

  // Extract a short name for personalization (email prefix or full name)
  const displayName = userName.includes('@') ? userName.split('@')[0] : userName;

  const systemPrompt = `You are a compassionate, evidence-based executive career coach. Your coaching philosophy draws from decades of experience guiding executives through career transitions.

COACHING METHODOLOGY (Bible Ch 8):
- Executives in job search go through five emotional phases: Shock → Anger → Bargaining → Depression → Acceptance → Growth
- The most powerful intervention is interrupting imposter syndrome with evidence — the executive's own accomplishments
- Small wins deserve specific, genuine celebration — not generic praise
- When someone feels overwhelmed, your job is to reduce everything to one concrete next step
- NEVER add tasks. ALWAYS reduce and simplify.
- First validate their experience honestly, then pivot to an actionable reframe
- Career transitions are marathons, not sprints — pace matters

TONE REGISTER: ${coachingTone.toUpperCase()}
${coachingTone === 'supportive' ? `- This person is navigating difficulty. Lead with empathy and validation.
- Acknowledge the challenge without dwelling on it.
- Frame the next step as small and achievable.
- Use "we" language: "Let's look at..." not "You need to..."` : ''}
${coachingTone === 'direct' ? `- This person values efficiency and candor.
- Skip the hand-holding. Lead with insight and a concrete action.
- Be direct but not harsh. Respect their intelligence.` : ''}
${coachingTone === 'motivational' ? `- This person has momentum and wants to level up.
- Channel their energy. Push them to think bigger.
- Aspirational framing works well here.` : ''}

EMOTIONAL STATE CONTEXT: ${emotionalState} (urgency: ${urgencyScore}/10)
${urgencyScore >= 8 ? 'This person has a high urgency score — keep the message action-oriented and efficient.' : ''}
${urgencyScore <= 3 ? 'This person has time — a deeper, more exploratory reframe is appropriate.' : ''}

OUTPUT FORMAT:
Write exactly 2-3 sentences. No headers, no bullet points, no markdown. Plain prose.
Be specific to the situation described. Avoid generic motivational platitudes.
End with exactly one concrete, small next step.`;

  const triggerDescriptions: Record<StallTriggerType, string> = {
    inactivity: 'has not logged any career activities in the past 5 days',
    rejection_streak: 'has received multiple rejections in quick succession',
    stalled_pipeline: 'has applications that have been sitting at the same stage for over two weeks',
    milestone: 'has just reached a meaningful activity milestone in their job search',
  };

  const userPrompt = `Write a coaching message for ${displayName}, who ${triggerDescriptions[signal.trigger_type]}.

Specific context: "${signal.context}"

The message should acknowledge what they're experiencing, offer a brief reframe grounded in their demonstrated capability, and suggest one small next step. Keep it to 2-3 sentences.`;

  try {
    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const message = response.text.trim();
    if (message.length < 20) {
      throw new Error('LLM returned too short a message');
    }

    return message;
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : String(err), trigger: signal.trigger_type },
      'generateCoachingMessage: LLM call failed — using fallback message',
    );
    return buildFallbackMessage(signal.trigger_type, displayName, coachingTone);
  }
}

// ─── buildFallbackMessage ─────────────────────────────────────────────────────

/**
 * Static fallback messages for when the LLM is unavailable.
 * Grounded in the coaching methodology — specific, actionable, non-generic.
 */
function buildFallbackMessage(
  triggerType: StallTriggerType,
  displayName: string,
  coachingTone: string,
): string {
  switch (triggerType) {
    case 'inactivity':
      if (coachingTone === 'direct') {
        return `${displayName}, the search only moves when you do — even 20 minutes today counts. Pick one thing: reach out to one contact, update one section, or review one job posting. Small consistent actions compound faster than you'd expect.`;
      }
      return `It's completely normal to need a break, ${displayName} — job searches are exhausting. When you're ready to re-engage, start with the smallest possible step: send one message to someone in your network. Momentum builds from there.`;

    case 'rejection_streak':
      if (coachingTone === 'direct') {
        return `Rejection clusters are data, not verdicts, ${displayName}. Take 30 minutes to look at what these roles had in common and whether your positioning is landing correctly. One targeted tweak often changes the trajectory.`;
      }
      return `A string of rejections is genuinely hard, and it makes sense if you're feeling discouraged, ${displayName}. Remember that these decisions say more about fit-to-role than about your capabilities. Let's look at one thing you can adjust in how you're presenting your experience.`;

    case 'stalled_pipeline':
      if (coachingTone === 'direct') {
        return `Applications go stale after two weeks without a nudge, ${displayName}. Send a brief follow-up to each stalled opportunity — one sentence expressing continued interest. It takes 10 minutes and often re-activates a dead thread.`;
      }
      return `Waiting without hearing back is one of the hardest parts of this process, ${displayName}. You haven't done anything wrong — hiring timelines are often out of everyone's control. A short, professional follow-up note can gently re-open the conversation.`;

    case 'milestone':
      return `${displayName}, you've hit a meaningful milestone in your search — that consistency is genuinely impressive and it matters. Every one of those activities represents momentum that compounds over time. Keep going.`;

    default:
      return `You're making progress, ${displayName}. Pick one next step and take it today — the search rewards consistent action.`;
  }
}
