/**
 * Emotional Baseline — cross-cutting middleware for tone adaptation.
 *
 * Reads the Client Profile from platform context (produced by the Onboarding
 * Assessment Agent in Phase 1A) and provides:
 * 1. Emotional baseline data (grief cycle position, financial segment, coaching tone)
 * 2. Tone guidance text for injection into any agent's system prompt
 * 3. Distress detection with gentle professional referral resources
 *
 * Bible Ch 8: Every agent adapts tone based on emotional baseline.
 * Emotional state is INTERNAL ONLY — never labeled or shown to the user.
 */

import { getUserContext } from './platform-context.js';
import logger from './logger.js';
import type { ContextType } from './platform-context.js';

// ─── Types ─────────────────────────────────────────────────────────────

export type EmotionalState =
  | 'denial'
  | 'anger'
  | 'bargaining'
  | 'depression'
  | 'acceptance'
  | 'growth';

export type FinancialSegment = 'crisis' | 'stressed' | 'ideal' | 'comfortable';

export type CoachingTone = 'supportive' | 'direct' | 'motivational';

export interface EmotionalBaseline {
  /** Grief cycle position — never shown to user */
  emotional_state: EmotionalState;
  /** Financial segment — inferred, never asked directly */
  financial_segment: FinancialSegment;
  /** Coaching tone derived from emotional + financial state */
  coaching_tone: CoachingTone;
  /** Urgency score (1-10) from onboarding assessment */
  urgency_score: number;
  /** Whether severe distress was detected */
  distress_detected: boolean;
}

/** Professional referral resources for severe distress cases */
export interface ReferralResources {
  message: string;
  resources: Array<{ name: string; description: string; contact: string }>;
}

// ─── Emotional State Categories ────────────────────────────────────────

const NEGATIVE_STATES: ReadonlySet<EmotionalState> = new Set([
  'denial', 'anger', 'bargaining', 'depression',
]);

const DISTRESS_STATES: ReadonlySet<EmotionalState> = new Set([
  'depression', 'anger',
]);

// ─── getEmotionalBaseline ──────────────────────────────────────────────

/**
 * Reads the Client Profile from platform context and extracts the
 * emotional baseline. Returns null if no onboarding data exists.
 */
export async function getEmotionalBaseline(
  userId: string,
): Promise<EmotionalBaseline | null> {
  try {
    const profileRows = await getUserContext(userId, 'client_profile' as ContextType);
    if (profileRows.length === 0) return null;

    const content = profileRows[0].content as Record<string, unknown>;

    const emotionalState = (
      typeof content.emotional_state === 'string' &&
      isValidEmotionalState(content.emotional_state)
    ) ? content.emotional_state : 'acceptance';

    const financialSegment = (
      typeof content.financial_segment === 'string' &&
      isValidFinancialSegment(content.financial_segment)
    ) ? content.financial_segment : 'ideal';

    const coachingTone = (
      typeof content.coaching_tone === 'string' &&
      isValidCoachingTone(content.coaching_tone)
    ) ? content.coaching_tone : deriveCoachingTone(emotionalState, financialSegment);

    const urgencyScore = typeof content.urgency_score === 'number'
      ? Math.min(10, Math.max(1, content.urgency_score))
      : 5;

    const distressDetected =
      DISTRESS_STATES.has(emotionalState) &&
      (financialSegment === 'crisis' || financialSegment === 'stressed' || urgencyScore >= 9);

    return {
      emotional_state: emotionalState,
      financial_segment: financialSegment,
      coaching_tone: coachingTone,
      urgency_score: urgencyScore,
      distress_detected: distressDetected,
    };
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : String(err), userId },
      'getEmotionalBaseline: failed to load client profile',
    );
    return null;
  }
}

// ─── buildToneGuidance ─────────────────────────────────────────────────

/**
 * Generates tone guidance text for injection into an agent's system prompt.
 * Returns empty string if no baseline is available (graceful degradation).
 */
export function buildToneGuidance(baseline: EmotionalBaseline | null): string {
  if (!baseline) return '';

  const parts: string[] = [
    '',
    '## Coaching Tone Adaptation',
    `Tone register: ${baseline.coaching_tone.toUpperCase()}`,
  ];

  switch (baseline.coaching_tone) {
    case 'supportive':
      parts.push(
        'This client is navigating a challenging transition. Adapt your communication:',
        '- Lead with empathy and validation before giving advice',
        '- Acknowledge the difficulty of their situation without dwelling on it',
        '- Frame every piece of feedback as building toward their next success',
        '- Use "we" language: "Let\'s work on..." not "You need to..."',
        '- Celebrate small wins explicitly — they need momentum',
        '- Keep pacing measured — don\'t rush through steps',
        '- If they seem overwhelmed, offer to break work into smaller pieces',
      );
      break;

    case 'direct':
      parts.push(
        'This client is in a stable position and values efficiency. Adapt your communication:',
        '- Be direct and strategic — they respect candor over comfort',
        '- Lead with insights and recommendations, not process',
        '- Challenge them when their positioning undersells their experience',
        '- Use confident language: "Here\'s what will work" not "Would you consider..."',
        '- Move at their pace — they want results, not hand-holding',
        '- Point out competitive advantages they may be overlooking',
      );
      break;

    case 'motivational':
      parts.push(
        'This client is in a growth mindset and ready to level up. Adapt your communication:',
        '- Channel their energy toward strategic positioning',
        '- Push them to think bigger about their narrative and capabilities',
        '- Use aspirational framing: "You\'re positioning for X" not "You\'re qualified for Y"',
        '- Be enthusiastic about their potential without being patronizing',
        '- Challenge limiting beliefs about what roles they can target',
        '- Set ambitious but realistic expectations',
      );
      break;
  }

  if (baseline.urgency_score >= 8) {
    parts.push(
      '',
      'URGENCY: High (score ' + baseline.urgency_score + '/10). Prioritize actionable output over exploration. Get them to a usable result as quickly as possible.',
    );
  } else if (baseline.urgency_score <= 3) {
    parts.push(
      '',
      'URGENCY: Low (score ' + baseline.urgency_score + '/10). This client has time for deeper exploration. Invest in positioning quality over speed.',
    );
  }

  return parts.join('\n');
}

// ─── detectDistress ────────────────────────────────────────────────────

/**
 * Returns professional referral resources if severe distress is detected.
 * Returns null if no intervention is needed.
 *
 * CRITICAL: The platform never diagnoses, never labels emotional state to the user,
 * and never positions itself as a substitute for professional help. It gently
 * surfaces resources as a "just in case" alongside its normal output.
 */
export function detectDistress(
  baseline: EmotionalBaseline | null,
): ReferralResources | null {
  if (!baseline || !baseline.distress_detected) return null;

  return {
    message: [
      'Career transitions can be one of life\'s most stressful experiences.',
      'While we\'re here to help with your professional positioning, we also want to make sure you have access to broader support if you need it.',
      'These resources are completely optional — they\'re here if you ever want them.',
    ].join(' '),
    resources: [
      {
        name: 'National Alliance on Mental Illness (NAMI)',
        description: 'Free support, education, and advocacy for anyone affected by mental health challenges',
        contact: '1-800-950-NAMI (6264) or text "HelpLine" to 62640',
      },
      {
        name: '988 Suicide & Crisis Lifeline',
        description: '24/7 free, confidential support for people in distress',
        contact: 'Call or text 988',
      },
      {
        name: 'Career Transition Coaching',
        description: 'Professional career coaches who specialize in executive transitions and the emotional aspects of job loss',
        contact: 'Ask us for a referral to a certified career coach in your area',
      },
    ],
  };
}

// ─── Input Helpers (for routes and products) ───────────────────────────

/**
 * Convenience: extract tone guidance from a pipeline input record.
 * Safe to call even when emotional_baseline is absent — returns empty string.
 */
export function getToneGuidanceFromInput(input: Record<string, unknown>): string {
  const baseline = input.emotional_baseline as EmotionalBaseline | null | undefined;
  return buildToneGuidance(baseline ?? null);
}

/**
 * Convenience: extract distress resources from a pipeline input record.
 * Returns null when no intervention is needed.
 */
export function getDistressFromInput(input: Record<string, unknown>): ReferralResources | null {
  const baseline = input.emotional_baseline as EmotionalBaseline | null | undefined;
  return detectDistress(baseline ?? null);
}

// ─── Validation Helpers ────────────────────────────────────────────────

function isValidEmotionalState(value: string): value is EmotionalState {
  return ['denial', 'anger', 'bargaining', 'depression', 'acceptance', 'growth'].includes(value);
}

function isValidFinancialSegment(value: string): value is FinancialSegment {
  return ['crisis', 'stressed', 'ideal', 'comfortable'].includes(value);
}

function isValidCoachingTone(value: string): value is CoachingTone {
  return ['supportive', 'direct', 'motivational'].includes(value);
}

function deriveCoachingTone(
  emotional: EmotionalState,
  financial: FinancialSegment,
): CoachingTone {
  if (NEGATIVE_STATES.has(emotional) || financial === 'crisis' || financial === 'stressed') {
    return 'supportive';
  }
  if (emotional === 'growth') {
    return 'motivational';
  }
  return 'direct';
}
