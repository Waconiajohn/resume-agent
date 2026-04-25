/**
 * Timeline Rule Engine — pure function over the timeline payload.
 *
 * Phase 3 of the pursuit timeline. Computes the "Next" and "Their turn"
 * region contents for the workspace overview from the server payload.
 *
 * Design notes:
 *   - Pure function. No effects, no side reads. Easy to unit test.
 *   - Done items are derived elsewhere (the payload speaks for itself).
 *   - Next rules sort by the tier hierarchy in CLAUDE-Phase 3 spec:
 *       Tier A — time-sensitive (N6 within 48h, N5 prep before scheduled date)
 *       Tier B — pursuit-blocking (N1 resume → N4 referral / N2 letter / N3 apply)
 *       Tier C — optional (N7 negotiation)
 *   - N4 suppresses N3 when both fire (apply-after-referral coaching).
 *   - Cap at 4 displayed entries. Tier A always wins; spillover from C drops first.
 *   - T3 "quiet in screening" reads stage_history[last].at and falls back to
 *     application.created_at when no history is present.
 */

import type { ApplicationWorkspaceTool } from '@/lib/app-routing';

// ─── Inputs (matches server payload shape) ────────────────────────────────

export interface TimelineEvent {
  id: string;
  type: 'applied' | 'interview_happened' | 'offer_received' | 'interview_scheduled';
  occurred_at: string;
  metadata: Record<string, unknown> | null;
}

export interface ArtifactSignal {
  exists: boolean;
  last_at: string | null;
}

export interface ReferralBonusSignal {
  exists: boolean;
  bonus_amount?: string | null;
  bonus_currency?: string | null;
  program_url?: string | null;
  source?: string | null;
}

export interface ApplicationCore {
  id: string;
  stage: string;
  role_title: string | null;
  company_name: string | null;
  stage_history: Array<{ stage: string; at: string; from?: string; note?: string }> | null;
  created_at: string;
  applied_date: string | null;
}

export interface TimelinePayload {
  application: ApplicationCore;
  resume: ArtifactSignal & { session_id: string | null };
  cover_letter: ArtifactSignal;
  interview_prep: ArtifactSignal;
  thank_you: ArtifactSignal;
  follow_up: ArtifactSignal;
  networking_messages: { count: number; last_at: string | null };
  events: TimelineEvent[];
  referral_bonus: ReferralBonusSignal;
}

// ─── Outputs ──────────────────────────────────────────────────────────────

export type NextRuleId = 'N1' | 'N2' | 'N3' | 'N4' | 'N5' | 'N6' | 'N7';
export type TheirTurnRuleId = 'T1' | 'T2' | 'T3';

type Tier = 'A' | 'B' | 'C';

export interface NextItem {
  id: NextRuleId;
  tier: Tier;
  title: string;
  body: string;
  /** Tool to navigate to when the user clicks the card. */
  target: ApplicationWorkspaceTool;
  /** Optional ranking timestamp (ISO) used to break ties within a tier. */
  rankedAt?: string;
}

export interface TheirTurnItem {
  id: TheirTurnRuleId;
  title: string;
  body: string;
  /** Days since the last meaningful event/state change. */
  days: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

const NON_TERMINAL_STAGES = new Set(['saved', 'researching', 'applied', 'screening', 'interviewing']);

function daysBetween(fromIso: string, toMs: number): number {
  const fromMs = Date.parse(fromIso);
  if (!Number.isFinite(fromMs)) return 0;
  return Math.floor((toMs - fromMs) / (24 * 60 * 60 * 1000));
}

function latestEventOf(payload: TimelinePayload, type: TimelineEvent['type']): TimelineEvent | undefined {
  return payload.events.find((e) => e.type === type);
}

function latestScheduledInterview(payload: TimelinePayload, nowMs: number): TimelineEvent | undefined {
  // Decision 4: when multiple interview_scheduled events exist, the latest
  // scheduled_date wins. We also drop past-dated rows so N5 only fires for
  // genuinely upcoming interviews.
  const upcoming = payload.events
    .filter((e): e is TimelineEvent => e.type === 'interview_scheduled')
    .map((e) => {
      const meta = e.metadata as Record<string, unknown> | null;
      const sd = typeof meta?.scheduled_date === 'string' ? meta.scheduled_date : null;
      return { event: e, scheduledMs: sd ? Date.parse(sd) : NaN };
    })
    .filter((row) => Number.isFinite(row.scheduledMs) && row.scheduledMs >= nowMs)
    .sort((a, b) => b.scheduledMs - a.scheduledMs);
  return upcoming[0]?.event;
}

function lastStageChangeIso(application: ApplicationCore): string {
  const history = application.stage_history;
  if (Array.isArray(history) && history.length > 0) {
    const last = history[history.length - 1];
    if (last && typeof last.at === 'string') return last.at;
  }
  return application.created_at;
}

// ─── Rule engine ──────────────────────────────────────────────────────────

const TIER_ORDER: Record<Tier, number> = { A: 0, B: 1, C: 2 };
const TIER_B_RULE_ORDER: Record<NextRuleId, number> = {
  N1: 0,
  N4: 1,
  N2: 2,
  N3: 3,
  N6: 0, // tier A — irrelevant here
  N5: 0,
  N7: 0,
};

export interface ComputeRulesOptions {
  /** Override "now" — used in tests. Defaults to Date.now(). */
  nowMs?: number;
  /** Cap on displayed Next entries. Defaults to 4. */
  nextCap?: number;
}

export function computeTimelineRules(
  payload: TimelinePayload,
  options: ComputeRulesOptions = {},
): { next: NextItem[]; theirTurn: TheirTurnItem[] } {
  const nowMs = options.nowMs ?? Date.now();
  const nextCap = options.nextCap ?? 4;

  const stage = payload.application.stage;
  const hasResume = payload.resume.exists;
  const hasCoverLetter = payload.cover_letter.exists;
  const hasInterviewPrep = payload.interview_prep.exists;
  const hasThankYou = payload.thank_you.exists;

  const appliedEvent = latestEventOf(payload, 'applied');
  const offerEvent = latestEventOf(payload, 'offer_received');
  const interviewHappenedEvent = latestEventOf(payload, 'interview_happened');
  const upcomingInterview = latestScheduledInterview(payload, nowMs);

  const candidates: NextItem[] = [];

  // ── Tier A — time-sensitive obligations ──────────────────────────────

  // N6 — thank-you within 48h of interview
  if (interviewHappenedEvent && !hasThankYou) {
    const days = daysBetween(interviewHappenedEvent.occurred_at, nowMs);
    if (days <= 2 && days >= 0) {
      candidates.push({
        id: 'N6',
        tier: 'A',
        title: 'Send your thank-you (within 48 hours)',
        body: 'A thank-you note within two days lands while the conversation is still fresh.',
        target: 'thank-you-note',
        rankedAt: interviewHappenedEvent.occurred_at,
      });
    }
  }

  // N5 — prep for upcoming interview
  if (upcomingInterview && !hasInterviewPrep) {
    const meta = upcomingInterview.metadata as Record<string, unknown> | null;
    const scheduled = typeof meta?.scheduled_date === 'string' ? meta.scheduled_date : null;
    const dateLabel = scheduled
      ? new Date(scheduled).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      : 'soon';
    candidates.push({
      id: 'N5',
      tier: 'A',
      title: `Interview scheduled for ${dateLabel}. Start prepping now.`,
      body: 'Walk in ready: study the role, draft your stories, and rehearse the hard questions.',
      target: 'interview-prep',
      rankedAt: scheduled ?? upcomingInterview.occurred_at,
    });
  }

  // ── Tier B — pursuit-blocking actions ────────────────────────────────

  // N1 — tailor your resume
  if (NON_TERMINAL_STAGES.has(stage) && !hasResume && !appliedEvent) {
    candidates.push({
      id: 'N1',
      tier: 'B',
      title: 'Tailor your resume for this role',
      body: 'Your tailored resume is the foundation everything else points back to.',
      target: 'resume',
      rankedAt: payload.application.created_at,
    });
  }

  // N4 — referral first (suppresses N3)
  const referralActive = payload.referral_bonus.exists && !appliedEvent;
  if (referralActive) {
    const company = payload.application.company_name ?? 'this company';
    candidates.push({
      id: 'N4',
      tier: 'B',
      title: `There's a referral bonus at ${company}. Get the referral first.`,
      body: `If you apply first, you can make a friend or connection ineligible — many programs require the candidate hasn't already applied before the referral is recorded. Some have a referral code.\n\nAsk your contact to refer you first, or send you the company's referral/application link.\n\nThe exact rules are the company's, but the safe default is: get the referral first, then apply through the channel the company uses for referrals.`,
      target: 'networking',
      rankedAt: payload.application.created_at,
    });
  }

  // N2 — draft your cover letter
  if (hasResume && !hasCoverLetter && !appliedEvent) {
    candidates.push({
      id: 'N2',
      tier: 'B',
      title: 'Draft your cover letter',
      body: "A specific letter pulls out the few angles your resume can't show on its own.",
      target: 'cover-letter',
      rankedAt: payload.resume.last_at ?? payload.application.created_at,
    });
  }

  // N3 — apply now (suppressed when N4 fires)
  if (!referralActive && hasCoverLetter && !appliedEvent) {
    candidates.push({
      id: 'N3',
      tier: 'B',
      title: 'Apply now',
      body: 'Submit through the channel the company expects, then mark this pursuit as applied.',
      target: 'resume',
      rankedAt: payload.cover_letter.last_at ?? payload.application.created_at,
    });
  }

  // ── Tier C — optional enhancements ───────────────────────────────────

  // N7 — plan your negotiation
  if (offerEvent) {
    candidates.push({
      id: 'N7',
      tier: 'C',
      title: 'Plan your negotiation',
      body: 'You have an offer on the table. Map out your floor, your target, and the trade-offs.',
      target: 'offer-negotiation',
      rankedAt: offerEvent.occurred_at,
    });
  }

  // ── Sort + cap ───────────────────────────────────────────────────────

  candidates.sort((a, b) => {
    const tierDelta = TIER_ORDER[a.tier] - TIER_ORDER[b.tier];
    if (tierDelta !== 0) return tierDelta;

    // Within tier B, follow the explicit rule order.
    if (a.tier === 'B' && b.tier === 'B') {
      return TIER_B_RULE_ORDER[a.id] - TIER_B_RULE_ORDER[b.id];
    }

    // Otherwise tie-break: most-recent rankedAt first.
    const aMs = a.rankedAt ? Date.parse(a.rankedAt) : 0;
    const bMs = b.rankedAt ? Date.parse(b.rankedAt) : 0;
    return bMs - aMs;
  });

  const next = candidates.slice(0, nextCap);

  // ── Their turn ───────────────────────────────────────────────────────

  const theirTurn: TheirTurnItem[] = [];

  // T1 — no response after applying
  if (
    appliedEvent
    && !upcomingInterview
    && !interviewHappenedEvent
    && !offerEvent
  ) {
    const days = daysBetween(appliedEvent.occurred_at, nowMs);
    if (days >= 1 && days <= 30) {
      theirTurn.push({
        id: 'T1',
        title: `You applied ${days} day${days === 1 ? '' : 's'} ago. No response yet.`,
        body: 'Most pipelines run 1–3 weeks before recruiters reach out. Keep moving on other pursuits.',
        days,
      });
    }
  }

  // T2 — awaiting next step after interview
  if (interviewHappenedEvent && !offerEvent) {
    const days = daysBetween(interviewHappenedEvent.occurred_at, nowMs);
    if (days >= 1 && days <= 21) {
      theirTurn.push({
        id: 'T2',
        title: `Your last interview was ${days} day${days === 1 ? '' : 's'} ago.`,
        body: 'Decisions usually come within a couple of weeks. A follow-up may help if you cross the timeline they gave you.',
        days,
      });
    }
  }

  // T3 — quiet in screening (soft wording, threshold raised to 21d)
  if (stage === 'screening') {
    const days = daysBetween(lastStageChangeIso(payload.application), nowMs);
    if (days > 21) {
      theirTurn.push({
        id: 'T3',
        title: `Screening has been quiet for ${days} days.`,
        body: "It's normal for screening to stretch out. If you have a contact at the company, that's a low-friction way to get a temperature read.",
        days,
      });
    }
  }

  return { next, theirTurn };
}
