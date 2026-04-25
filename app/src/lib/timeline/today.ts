/**
 * Today aggregator — Phase 5 of pursuit timeline.
 *
 * Cross-pursuit signal aggregation. Walks the bulk timeline payloads and
 * builds a tier-grouped action list answering "what should I do today,
 * across everything I'm chasing?"
 *
 * Tier A is custom — tighter thresholds than the per-pursuit rule engine:
 *   - Overdue thank-yous (interview > 24hr ago, no thank-you sent) — tighter
 *     than N6's 48hr window: this surfaces ones already past the courtesy
 *     window.
 *   - Today's interviews (interview_scheduled date == today)
 *   - Tomorrow's interviews
 *   - Imminent prep (interview_scheduled within next 3 days, no prep brief)
 *
 * Tier B reuses the per-pursuit rule engine — same N1/N2/N3/N4 entries, just
 * surfaced across all pursuits.
 *
 * Tier C reuses T1/T2/T3 from the rule engine.
 *
 * Pure function. Single source of truth: changes to the rule engine update
 * the per-pursuit overview, the completion CTAs, AND this Today view.
 */

import {
  computeTimelineRules,
  type NextItem,
  type TheirTurnItem,
  type TimelinePayload,
  type TimelineEvent,
} from '@/lib/timeline/rules';
import type { ApplicationWorkspaceTool } from '@/lib/app-routing';

// ─── Types ─────────────────────────────────────────────────────────────────

export type TodayTier = 'A' | 'B' | 'C';

export type TodayItemKind =
  | 'overdue_thank_you'
  | 'interview_today'
  | 'interview_tomorrow'
  | 'imminent_prep'
  | 'next_rule'
  | 'their_turn';

export interface TodayItem {
  kind: TodayItemKind;
  tier: TodayTier;
  applicationId: string;
  companyName: string;
  roleTitle: string;
  /** Action label shown on the card. */
  label: string;
  /** Tool to deep-link the action button to. */
  target: ApplicationWorkspaceTool;
  /** Days indicator (signed: -N for past events, +N for future). */
  days?: number;
  /** Original rule id when the entry came from the rule engine. */
  ruleId?: string;
  /** Sortable timestamp used for ranking within tier. */
  rankedAtMs: number;
}

export interface TodayAggregation {
  tierA: TodayItem[];
  tierB: TodayItem[];
  tierC: TodayItem[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isoToDateMs(iso: string): number {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : NaN;
}

function startOfDayMs(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function appLabels(payload: TimelinePayload): { companyName: string; roleTitle: string } {
  return {
    companyName: payload.application.company_name ?? 'Unknown company',
    roleTitle: payload.application.role_title ?? 'Unknown role',
  };
}

function nextRuleToToday(
  rule: NextItem,
  payload: TimelinePayload,
): TodayItem {
  const { companyName, roleTitle } = appLabels(payload);
  return {
    kind: 'next_rule',
    tier: rule.tier === 'A' ? 'A' : rule.tier === 'B' ? 'B' : 'C',
    applicationId: payload.application.id,
    companyName,
    roleTitle,
    label: rule.title,
    target: rule.target,
    ruleId: rule.id,
    rankedAtMs: rule.rankedAt ? isoToDateMs(rule.rankedAt) : 0,
  };
}

function theirTurnToToday(
  rule: TheirTurnItem,
  payload: TimelinePayload,
): TodayItem {
  const { companyName, roleTitle } = appLabels(payload);
  return {
    kind: 'their_turn',
    tier: 'C',
    applicationId: payload.application.id,
    companyName,
    roleTitle,
    label: rule.title,
    target: 'overview',
    ruleId: rule.id,
    days: rule.days,
    rankedAtMs: 0,
  };
}

// ─── Aggregator ────────────────────────────────────────────────────────────

export interface AggregateTodayOptions {
  nowMs?: number;
}

export function aggregateTodaySignals(
  payloads: TimelinePayload[],
  options: AggregateTodayOptions = {},
): TodayAggregation {
  const nowMs = options.nowMs ?? Date.now();
  const todayStartMs = startOfDayMs(nowMs);
  const tomorrowStartMs = todayStartMs + MS_PER_DAY;
  const dayAfterTomorrowMs = tomorrowStartMs + MS_PER_DAY;
  const threeDaysFromNowMs = nowMs + 3 * MS_PER_DAY;

  const tierA: TodayItem[] = [];
  const tierB: TodayItem[] = [];
  const tierC: TodayItem[] = [];

  for (const payload of payloads) {
    const { companyName, roleTitle } = appLabels(payload);
    const events = payload.events;

    // ── Tier A.1 — Overdue thank-yous (interview happened > 24h ago, no
    // thank-you sent yet). Tighter than N6's 48h window.
    const interviewHappened = events.find((e) => e.type === 'interview_happened');
    if (interviewHappened && !payload.thank_you.exists) {
      const ms = isoToDateMs(interviewHappened.occurred_at);
      if (Number.isFinite(ms)) {
        const hoursSince = (nowMs - ms) / (60 * 60 * 1000);
        if (hoursSince > 24) {
          const days = Math.floor(hoursSince / 24);
          tierA.push({
            kind: 'overdue_thank_you',
            tier: 'A',
            applicationId: payload.application.id,
            companyName,
            roleTitle,
            label: `Send your thank-you (overdue — interview ${days === 1 ? 'a day' : `${days} days`} ago)`,
            target: 'thank-you-note',
            days: -days,
            rankedAtMs: ms,
          });
        }
      }
    }

    // ── Tier A.2/3/4 — Interview-scheduled buckets (today / tomorrow /
    // imminent prep). Walk all interview_scheduled events; the rule engine
    // already drops past-dated rows but we re-check here so we can split
    // by date bucket. MAX(scheduled_date) is implicit when the same app
    // surfaces multiple buckets — only the earliest upcoming counts.
    const upcoming = events
      .filter((e): e is TimelineEvent => e.type === 'interview_scheduled')
      .map((e) => {
        const meta = (e.metadata as Record<string, unknown> | null) ?? {};
        const sd = typeof meta.scheduled_date === 'string' ? meta.scheduled_date : null;
        const round = typeof meta.round === 'string' ? meta.round : undefined;
        return { event: e, sd, sdMs: sd ? isoToDateMs(sd) : NaN, round };
      })
      .filter((row) => Number.isFinite(row.sdMs) && row.sdMs >= nowMs)
      .sort((a, b) => a.sdMs - b.sdMs);

    const earliestUpcoming = upcoming[0];
    if (earliestUpcoming?.sd) {
      const ms = earliestUpcoming.sdMs;
      const isToday = ms < tomorrowStartMs;
      const isTomorrow = !isToday && ms < dayAfterTomorrowMs;

      if (isToday) {
        const timeLabel = new Date(ms).toLocaleString(undefined, {
          hour: 'numeric',
          minute: '2-digit',
        });
        tierA.push({
          kind: 'interview_today',
          tier: 'A',
          applicationId: payload.application.id,
          companyName,
          roleTitle,
          label: `Interview today at ${timeLabel}${earliestUpcoming.round ? ` · ${earliestUpcoming.round}` : ''}`,
          target: 'interview-prep',
          days: 0,
          rankedAtMs: ms,
        });
      } else if (isTomorrow) {
        const timeLabel = new Date(ms).toLocaleString(undefined, {
          hour: 'numeric',
          minute: '2-digit',
        });
        tierA.push({
          kind: 'interview_tomorrow',
          tier: 'A',
          applicationId: payload.application.id,
          companyName,
          roleTitle,
          label: `Interview tomorrow at ${timeLabel}${earliestUpcoming.round ? ` · ${earliestUpcoming.round}` : ''}`,
          target: 'interview-prep',
          days: 1,
          rankedAtMs: ms,
        });
      } else if (ms < threeDaysFromNowMs && !payload.interview_prep.exists) {
        // Imminent prep: scheduled within next 3 days, no prep brief.
        const days = Math.max(1, Math.ceil((ms - nowMs) / MS_PER_DAY));
        const dateLabel = new Date(ms).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        });
        tierA.push({
          kind: 'imminent_prep',
          tier: 'A',
          applicationId: payload.application.id,
          companyName,
          roleTitle,
          label: `Prep needed — interview ${dateLabel} (in ${days} day${days === 1 ? '' : 's'})`,
          target: 'interview-prep',
          days,
          rankedAtMs: ms,
        });
      }
    }

    // ── Tiers B + C — reuse the per-pursuit rule engine ──────────────
    const rules = computeTimelineRules(payload, { nowMs });

    for (const rule of rules.next) {
      // Tier-A duplicates suppressed: we already emit tier-A signals above
      // for thank-you (N6) and prep-related (N5) cases. The aggregator's
      // versions carry the cross-pursuit copy; the engine's would be
      // redundant.
      if (rule.id === 'N6' || rule.id === 'N5') continue;

      if (rule.tier === 'B') {
        tierB.push(nextRuleToToday(rule, payload));
      } else if (rule.tier === 'C') {
        tierC.push(nextRuleToToday(rule, payload));
      }
    }

    for (const rule of rules.theirTurn) {
      tierC.push(theirTurnToToday(rule, payload));
    }
  }

  // Within each tier, sort by rankedAt desc (most-recent or most-imminent
  // first). For tier A, this naturally puts overdue-thank-yous and today's
  // interviews ahead of tomorrow / imminent. For tier C, T-rules with no
  // rankedAt fall to the bottom.
  tierA.sort((a, b) => {
    // Overdue thank-yous always lead within tier A.
    if (a.kind === 'overdue_thank_you' && b.kind !== 'overdue_thank_you') return -1;
    if (b.kind === 'overdue_thank_you' && a.kind !== 'overdue_thank_you') return 1;
    return b.rankedAtMs - a.rankedAtMs;
  });
  tierB.sort((a, b) => b.rankedAtMs - a.rankedAtMs);
  tierC.sort((a, b) => b.rankedAtMs - a.rankedAtMs);

  return { tierA, tierB, tierC };
}
