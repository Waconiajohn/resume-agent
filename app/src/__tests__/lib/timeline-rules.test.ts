/**
 * Phase 3 — pure-function tests for the timeline rule engine.
 *
 * Each test fixes `nowMs` so day-window math (T1/T2/T3, N6 within 48h)
 * is deterministic. Reference time: 2026-04-25T12:00:00Z.
 */

import { describe, it, expect } from 'vitest';
import {
  computeTimelineRules,
  type TimelinePayload,
} from '@/lib/timeline/rules';

const NOW_MS = Date.parse('2026-04-25T12:00:00Z');

function isoDaysAgo(days: number, ref = NOW_MS): string {
  return new Date(ref - days * 24 * 60 * 60 * 1000).toISOString();
}

function isoDaysFromNow(days: number, ref = NOW_MS): string {
  return new Date(ref + days * 24 * 60 * 60 * 1000).toISOString();
}

function basePayload(overrides: Partial<TimelinePayload> = {}): TimelinePayload {
  return {
    application: {
      id: 'app-1',
      stage: 'researching',
      role_title: 'Director of Engineering',
      company_name: 'Acme',
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
    ...overrides,
  };
}

describe('computeTimelineRules — Next rules', () => {
  it('N1 fires when stage is researching and no resume exists', () => {
    const payload = basePayload();
    const { next } = computeTimelineRules(payload, { nowMs: NOW_MS });
    const ids = next.map((n) => n.id);
    expect(ids).toContain('N1');
  });

  it('N1 suppresses once resume is tailored', () => {
    const payload = basePayload({
      resume: { exists: true, last_at: isoDaysAgo(1), session_id: 'r1' },
    });
    const { next } = computeTimelineRules(payload, { nowMs: NOW_MS });
    expect(next.map((n) => n.id)).not.toContain('N1');
  });

  it('N2 fires after resume but before cover letter', () => {
    const payload = basePayload({
      resume: { exists: true, last_at: isoDaysAgo(1), session_id: 'r1' },
    });
    const { next } = computeTimelineRules(payload, { nowMs: NOW_MS });
    expect(next.map((n) => n.id)).toContain('N2');
  });

  it('N3 fires after cover letter when no applied event yet', () => {
    const payload = basePayload({
      resume: { exists: true, last_at: isoDaysAgo(2), session_id: 'r1' },
      cover_letter: { exists: true, last_at: isoDaysAgo(1) },
    });
    const { next } = computeTimelineRules(payload, { nowMs: NOW_MS });
    expect(next.map((n) => n.id)).toContain('N3');
  });

  it('N4 fires when referral bonus exists and suppresses N3', () => {
    const payload = basePayload({
      resume: { exists: true, last_at: isoDaysAgo(2), session_id: 'r1' },
      cover_letter: { exists: true, last_at: isoDaysAgo(1) },
      referral_bonus: { exists: true, bonus_amount: '$2,000' },
    });
    const { next } = computeTimelineRules(payload, { nowMs: NOW_MS });
    const ids = next.map((n) => n.id);
    expect(ids).toContain('N4');
    expect(ids).not.toContain('N3');
  });

  it('N5 fires when an upcoming interview exists and no prep brief', () => {
    const payload = basePayload({
      events: [
        {
          id: 'e1',
          type: 'interview_scheduled',
          occurred_at: isoDaysAgo(1),
          metadata: { scheduled_date: isoDaysFromNow(3), interview_type: 'video' },
        },
      ],
    });
    const { next } = computeTimelineRules(payload, { nowMs: NOW_MS });
    const ids = next.map((n) => n.id);
    expect(ids).toContain('N5');
    // Tier A → must come before tier B rules.
    expect(ids[0]).toBe('N5');
  });

  it('N5 suppresses past-dated scheduled interviews and uses MAX(scheduled_date)', () => {
    const payload = basePayload({
      events: [
        // Past-dated should be ignored.
        {
          id: 'e0',
          type: 'interview_scheduled',
          occurred_at: isoDaysAgo(10),
          metadata: { scheduled_date: isoDaysAgo(3), interview_type: 'video' },
        },
        // Two future events; the LATER one wins per spec.
        {
          id: 'e1',
          type: 'interview_scheduled',
          occurred_at: isoDaysAgo(2),
          metadata: { scheduled_date: isoDaysFromNow(2), interview_type: 'phone' },
        },
        {
          id: 'e2',
          type: 'interview_scheduled',
          occurred_at: isoDaysAgo(1),
          metadata: { scheduled_date: isoDaysFromNow(7), interview_type: 'onsite' },
        },
      ],
    });
    const { next } = computeTimelineRules(payload, { nowMs: NOW_MS });
    const n5 = next.find((n) => n.id === 'N5');
    expect(n5).toBeDefined();
    // The MAX(scheduled_date) is +7 days; rankedAt should match.
    expect(n5?.rankedAt && Date.parse(n5.rankedAt) > NOW_MS).toBe(true);
  });

  it('N6 fires within 48hrs of interview_happened and is tier-A', () => {
    const payload = basePayload({
      events: [
        {
          id: 'e1',
          type: 'interview_happened',
          occurred_at: isoDaysAgo(1),
          metadata: { interview_date: '2026-04-24', interview_type: 'video' },
        },
      ],
    });
    const { next } = computeTimelineRules(payload, { nowMs: NOW_MS });
    expect(next[0]?.id).toBe('N6');
    expect(next[0]?.tier).toBe('A');
  });

  it('N6 suppresses after 2 days', () => {
    const payload = basePayload({
      events: [
        {
          id: 'e1',
          type: 'interview_happened',
          occurred_at: isoDaysAgo(5),
          metadata: { interview_date: '2026-04-20', interview_type: 'video' },
        },
      ],
    });
    const { next } = computeTimelineRules(payload, { nowMs: NOW_MS });
    expect(next.map((n) => n.id)).not.toContain('N6');
  });

  it('N7 fires when offer received', () => {
    const payload = basePayload({
      events: [
        {
          id: 'e1',
          type: 'offer_received',
          occurred_at: isoDaysAgo(1),
          metadata: { amount: 200000 },
        },
      ],
    });
    const { next } = computeTimelineRules(payload, { nowMs: NOW_MS });
    expect(next.map((n) => n.id)).toContain('N7');
  });

  it('caps Next at 4 entries; tier-A always wins over tier-B', () => {
    const payload = basePayload({
      resume: { exists: true, last_at: isoDaysAgo(1), session_id: 'r1' },
      cover_letter: { exists: true, last_at: isoDaysAgo(1) },
      referral_bonus: { exists: true, bonus_amount: '$1k' },
      events: [
        {
          id: 'e1',
          type: 'interview_happened',
          occurred_at: isoDaysAgo(1),
          metadata: { interview_date: '2026-04-24', interview_type: 'video' },
        },
        {
          id: 'e2',
          type: 'interview_scheduled',
          occurred_at: isoDaysAgo(1),
          metadata: { scheduled_date: isoDaysFromNow(2), interview_type: 'video' },
        },
        {
          id: 'e3',
          type: 'offer_received',
          occurred_at: isoDaysAgo(1),
          metadata: {},
        },
      ],
    });
    const { next } = computeTimelineRules(payload, { nowMs: NOW_MS });
    expect(next.length).toBeLessThanOrEqual(4);
    // Tier A (N5/N6) sit at the front.
    expect(['N5', 'N6']).toContain(next[0]?.id);
  });
});

describe('computeTimelineRules — Their-turn rules', () => {
  it('T1 fires 5 days after applied with no further events', () => {
    const payload = basePayload({
      application: {
        ...basePayload().application,
        stage: 'applied',
      },
      events: [
        {
          id: 'e1',
          type: 'applied',
          occurred_at: isoDaysAgo(5),
          metadata: { applied_via: 'manual' },
        },
      ],
    });
    const { theirTurn } = computeTimelineRules(payload, { nowMs: NOW_MS });
    expect(theirTurn.map((t) => t.id)).toContain('T1');
    expect(theirTurn.find((t) => t.id === 'T1')?.days).toBe(5);
  });

  it('T1 suppresses after an interview_scheduled event', () => {
    const payload = basePayload({
      events: [
        {
          id: 'e1',
          type: 'applied',
          occurred_at: isoDaysAgo(5),
          metadata: { applied_via: 'manual' },
        },
        {
          id: 'e2',
          type: 'interview_scheduled',
          occurred_at: isoDaysAgo(1),
          metadata: { scheduled_date: isoDaysFromNow(2), interview_type: 'video' },
        },
      ],
    });
    const { theirTurn } = computeTimelineRules(payload, { nowMs: NOW_MS });
    expect(theirTurn.map((t) => t.id)).not.toContain('T1');
  });

  it('T2 fires after interview_happened with no offer', () => {
    const payload = basePayload({
      events: [
        {
          id: 'e1',
          type: 'interview_happened',
          occurred_at: isoDaysAgo(7),
          metadata: { interview_date: '2026-04-18', interview_type: 'video' },
        },
      ],
    });
    const { theirTurn } = computeTimelineRules(payload, { nowMs: NOW_MS });
    const t2 = theirTurn.find((t) => t.id === 'T2');
    expect(t2).toBeDefined();
    expect(t2?.days).toBe(7);
  });

  it('T3 fires when screening has been quiet for >21 days; uses stage_history', () => {
    const payload = basePayload({
      application: {
        ...basePayload().application,
        stage: 'screening',
        stage_history: [
          { stage: 'applied', at: isoDaysAgo(30) },
          { stage: 'screening', at: isoDaysAgo(25) },
        ],
      },
    });
    const { theirTurn } = computeTimelineRules(payload, { nowMs: NOW_MS });
    expect(theirTurn.map((t) => t.id)).toContain('T3');
  });

  it('T3 falls back to created_at when stage_history is empty', () => {
    const payload = basePayload({
      application: {
        ...basePayload().application,
        stage: 'screening',
        stage_history: null,
        created_at: isoDaysAgo(40),
      },
    });
    const { theirTurn } = computeTimelineRules(payload, { nowMs: NOW_MS });
    expect(theirTurn.map((t) => t.id)).toContain('T3');
    expect(theirTurn.find((t) => t.id === 'T3')?.days).toBe(40);
  });

  it('T3 does NOT fire under 21 days (soft threshold)', () => {
    const payload = basePayload({
      application: {
        ...basePayload().application,
        stage: 'screening',
        stage_history: [
          { stage: 'screening', at: isoDaysAgo(14) },
        ],
      },
    });
    const { theirTurn } = computeTimelineRules(payload, { nowMs: NOW_MS });
    expect(theirTurn.map((t) => t.id)).not.toContain('T3');
  });
});
