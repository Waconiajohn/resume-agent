/**
 * Phase 5 — Today aggregator tests.
 *
 * Reference time: 2026-04-25T12:00:00Z. All `nowMs` and ISO offsets are
 * pinned so tier-A bucket boundaries (today / tomorrow / 3-day prep window /
 * 24h overdue threshold) are deterministic.
 */

import { describe, it, expect } from 'vitest';
import { aggregateTodaySignals } from '@/lib/timeline/today';
import type { TimelinePayload } from '@/lib/timeline/rules';

const NOW_MS = Date.parse('2026-04-25T12:00:00Z');

function isoHoursAgo(hours: number, ref = NOW_MS): string {
  return new Date(ref - hours * 60 * 60 * 1000).toISOString();
}

function isoDaysAgo(days: number, ref = NOW_MS): string {
  return new Date(ref - days * 24 * 60 * 60 * 1000).toISOString();
}

function isoDaysFromNow(days: number, ref = NOW_MS): string {
  return new Date(ref + days * 24 * 60 * 60 * 1000).toISOString();
}

function isoSameDay(hourOffsetFromNow: number, ref = NOW_MS): string {
  return new Date(ref + hourOffsetFromNow * 60 * 60 * 1000).toISOString();
}

function buildPayload(overrides: Partial<TimelinePayload> & { id: string; company: string }): TimelinePayload {
  const { id, company, ...rest } = overrides;
  return {
    application: {
      id,
      stage: 'researching',
      role_title: 'Director',
      company_name: company,
      stage_history: null,
      created_at: isoDaysAgo(2),
      applied_date: null,
    },
    resume: { exists: false, last_at: null, session_id: null },
    cover_letter: { exists: false, last_at: null },
    interview_prep: { exists: false, last_at: null },
    thank_you: { exists: false, last_at: null },
    follow_up: { exists: false, last_at: null },
    networking_messages: { count: 0, last_at: null },
    events: [],
    referral_bonus: { exists: false },
    ...rest,
  };
}

describe('aggregateTodaySignals — Tier A', () => {
  it('overdue thank-you fires when interview > 24h ago and no thank-you sent', () => {
    const p = buildPayload({
      id: 'a1',
      company: 'Acme',
      events: [
        {
          id: 'e1',
          type: 'interview_happened',
          occurred_at: isoHoursAgo(36),
          metadata: { interview_date: '2026-04-23', interview_type: 'video' },
        },
      ],
    });
    const { tierA } = aggregateTodaySignals([p], { nowMs: NOW_MS });
    expect(tierA.find((it) => it.kind === 'overdue_thank_you')).toBeDefined();
  });

  it('overdue thank-you suppresses when interview < 24h ago', () => {
    const p = buildPayload({
      id: 'a1',
      company: 'Acme',
      events: [
        {
          id: 'e1',
          type: 'interview_happened',
          occurred_at: isoHoursAgo(12),
          metadata: { interview_date: '2026-04-25', interview_type: 'video' },
        },
      ],
    });
    const { tierA } = aggregateTodaySignals([p], { nowMs: NOW_MS });
    expect(tierA.find((it) => it.kind === 'overdue_thank_you')).toBeUndefined();
  });

  it('overdue thank-you suppresses when thank-you already sent', () => {
    const p = buildPayload({
      id: 'a1',
      company: 'Acme',
      thank_you: { exists: true, last_at: isoHoursAgo(2) },
      events: [
        {
          id: 'e1',
          type: 'interview_happened',
          occurred_at: isoHoursAgo(48),
          metadata: { interview_date: '2026-04-23', interview_type: 'video' },
        },
      ],
    });
    const { tierA } = aggregateTodaySignals([p], { nowMs: NOW_MS });
    expect(tierA.find((it) => it.kind === 'overdue_thank_you')).toBeUndefined();
  });

  it('today\'s interview surfaces when scheduled_date is today', () => {
    const p = buildPayload({
      id: 'a1',
      company: 'Acme',
      events: [
        {
          id: 'e1',
          type: 'interview_scheduled',
          occurred_at: isoDaysAgo(1),
          metadata: {
            scheduled_date: isoSameDay(2), // 2 hours from "now"
            interview_type: 'video',
          },
        },
      ],
    });
    const { tierA } = aggregateTodaySignals([p], { nowMs: NOW_MS });
    const today = tierA.find((it) => it.kind === 'interview_today');
    expect(today).toBeDefined();
    expect(today?.days).toBe(0);
  });

  it("tomorrow's interview surfaces when scheduled_date is tomorrow", () => {
    const p = buildPayload({
      id: 'a1',
      company: 'Acme',
      events: [
        {
          id: 'e1',
          type: 'interview_scheduled',
          occurred_at: isoDaysAgo(1),
          metadata: {
            scheduled_date: isoDaysFromNow(1),
            interview_type: 'video',
          },
        },
      ],
    });
    const { tierA } = aggregateTodaySignals([p], { nowMs: NOW_MS });
    const tomorrow = tierA.find((it) => it.kind === 'interview_tomorrow');
    expect(tomorrow).toBeDefined();
    expect(tomorrow?.days).toBe(1);
  });

  it('imminent prep fires when interview within 3 days and no prep brief', () => {
    const p = buildPayload({
      id: 'a1',
      company: 'Acme',
      events: [
        {
          id: 'e1',
          type: 'interview_scheduled',
          occurred_at: isoDaysAgo(1),
          metadata: {
            scheduled_date: isoDaysFromNow(2.5),
            interview_type: 'onsite',
          },
        },
      ],
    });
    const { tierA } = aggregateTodaySignals([p], { nowMs: NOW_MS });
    const imm = tierA.find((it) => it.kind === 'imminent_prep');
    expect(imm).toBeDefined();
  });

  it('imminent prep suppresses once a prep brief exists', () => {
    const p = buildPayload({
      id: 'a1',
      company: 'Acme',
      interview_prep: { exists: true, last_at: isoDaysAgo(0.5) },
      events: [
        {
          id: 'e1',
          type: 'interview_scheduled',
          occurred_at: isoDaysAgo(1),
          metadata: {
            scheduled_date: isoDaysFromNow(2.5),
            interview_type: 'onsite',
          },
        },
      ],
    });
    const { tierA } = aggregateTodaySignals([p], { nowMs: NOW_MS });
    expect(tierA.find((it) => it.kind === 'imminent_prep')).toBeUndefined();
  });

  it('overdue thank-yous always lead within tier A', () => {
    const overdue = buildPayload({
      id: 'a1',
      company: 'Acme',
      events: [
        {
          id: 'e1',
          type: 'interview_happened',
          occurred_at: isoHoursAgo(48),
          metadata: { interview_date: '2026-04-23', interview_type: 'video' },
        },
      ],
    });
    const today = buildPayload({
      id: 'a2',
      company: 'Beta',
      events: [
        {
          id: 'e2',
          type: 'interview_scheduled',
          occurred_at: isoDaysAgo(1),
          metadata: { scheduled_date: isoSameDay(4), interview_type: 'video' },
        },
      ],
    });
    const { tierA } = aggregateTodaySignals([overdue, today], { nowMs: NOW_MS });
    expect(tierA[0].kind).toBe('overdue_thank_you');
  });
});

describe('aggregateTodaySignals — Tier B and C', () => {
  it('Tier B picks up N1 (no resume) for non-applied pursuits', () => {
    const p = buildPayload({
      id: 'a1',
      company: 'Acme',
      // researching, no resume — N1 fires.
    });
    const { tierB } = aggregateTodaySignals([p], { nowMs: NOW_MS });
    const n1 = tierB.find((it) => it.ruleId === 'N1');
    expect(n1).toBeDefined();
    expect(n1?.target).toBe('resume');
  });

  it('Tier B suppresses N5/N6 entries from the rule engine (handled in Tier A)', () => {
    const p = buildPayload({
      id: 'a1',
      company: 'Acme',
      events: [
        {
          id: 'e1',
          type: 'interview_happened',
          occurred_at: isoHoursAgo(36),
          metadata: { interview_date: '2026-04-23', interview_type: 'video' },
        },
      ],
    });
    const { tierB } = aggregateTodaySignals([p], { nowMs: NOW_MS });
    expect(tierB.find((it) => it.ruleId === 'N6')).toBeUndefined();
    expect(tierB.find((it) => it.ruleId === 'N5')).toBeUndefined();
  });

  it('Tier C surfaces T1 when applied with no follow-up signal', () => {
    const p = buildPayload({
      id: 'a1',
      company: 'Acme',
      application: {
        id: 'a1',
        stage: 'applied',
        role_title: 'Director',
        company_name: 'Acme',
        stage_history: null,
        created_at: isoDaysAgo(10),
        applied_date: null,
      },
      events: [
        {
          id: 'e1',
          type: 'applied',
          occurred_at: isoDaysAgo(7),
          metadata: { applied_via: 'manual' },
        },
      ],
    });
    const { tierC } = aggregateTodaySignals([p], { nowMs: NOW_MS });
    expect(tierC.find((it) => it.ruleId === 'T1')).toBeDefined();
  });
});

describe('aggregateTodaySignals — Cross-pursuit fan-out', () => {
  it('aggregates signals across multiple pursuits', () => {
    const p1 = buildPayload({ id: 'a1', company: 'Acme' });
    const p2 = buildPayload({
      id: 'a2',
      company: 'Beta',
      events: [
        {
          id: 'e2',
          type: 'interview_scheduled',
          occurred_at: isoDaysAgo(1),
          metadata: { scheduled_date: isoDaysFromNow(1), interview_type: 'video' },
        },
      ],
    });
    const { tierA, tierB } = aggregateTodaySignals([p1, p2], { nowMs: NOW_MS });
    // p2 contributes a tier-A "interview tomorrow" entry.
    expect(tierA.find((it) => it.kind === 'interview_tomorrow' && it.applicationId === 'a2')).toBeDefined();
    // p1 contributes a tier-B N1 entry.
    expect(tierB.find((it) => it.ruleId === 'N1' && it.applicationId === 'a1')).toBeDefined();
  });

  it('returns empty regions when no signals fire across pursuits', () => {
    // A pursuit at offer stage with everything done → no N rules fire and no
    // T rules fire either. (The rule engine excludes offer from its
    // non-terminal set for N1; N7 would fire but only with an offer event.)
    const p = buildPayload({
      id: 'a1',
      company: 'Acme',
      application: {
        id: 'a1',
        stage: 'researching',
        role_title: 'Director',
        company_name: 'Acme',
        stage_history: null,
        created_at: isoDaysAgo(0.1), // very fresh
        applied_date: null,
      },
      resume: { exists: true, last_at: isoDaysAgo(0.1), session_id: 's1' },
      cover_letter: { exists: true, last_at: isoDaysAgo(0.1) },
      events: [
        {
          id: 'e1',
          type: 'applied',
          occurred_at: isoDaysAgo(0.1),
          metadata: { applied_via: 'manual' },
        },
      ],
    });
    const result = aggregateTodaySignals([p], { nowMs: NOW_MS });
    expect(result.tierA).toHaveLength(0);
    expect(result.tierB).toHaveLength(0);
    // T1 fires at days >= 1; with 0.1 days since applied, no T1.
    expect(result.tierC).toHaveLength(0);
  });
});
