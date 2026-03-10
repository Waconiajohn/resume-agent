/**
 * Tests for momentum routes and streak computation logic.
 *
 * Sprint 49, Story 5-2: Momentum CRUD routes + streak computation
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks — hoisted before any module imports ────────────────────────────────

const mockFrom = vi.hoisted(() => vi.fn());
const mockAuthGetUser = vi.hoisted(() => vi.fn());

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: mockFrom,
    auth: { getUser: mockAuthGetUser },
  },
}));

vi.mock('../lib/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
}));

vi.mock('../lib/feature-flags.js', () => ({
  FF_MOMENTUM: true,
  FF_NETWORKING_CRM: false,
}));

vi.mock('../lib/cognitive-reframing.js', () => ({
  detectStalls: vi.fn().mockResolvedValue([]),
  generateCoachingMessage: vi.fn().mockResolvedValue('Keep going — you have this.'),
}));

vi.mock('../lib/emotional-baseline.js', () => ({
  getEmotionalBaseline: vi.fn().mockResolvedValue(null),
}));

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: vi.fn(
    async (c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
      c.set('user', { id: 'test-user-id', email: 'test@example.com', accessToken: 'test-token' });
      await next();
    },
  ),
}));

vi.mock('../middleware/rate-limit.js', () => ({
  rateLimitMiddleware: () =>
    async (_c: unknown, next: () => Promise<void>) => {
      await next();
    },
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { Hono } from 'hono';
import { computeStreak, momentumRoutes } from '../routes/momentum.js';
import { detectStalls, generateCoachingMessage } from '../lib/cognitive-reframing.js';

const mockDetectStalls = detectStalls as ReturnType<typeof vi.fn>;
const mockGenerateCoachingMessage = generateCoachingMessage as ReturnType<typeof vi.fn>;

// ─── Test app ────────────────────────────────────────────────────────────────

const app = new Hono();
app.route('/momentum', momentumRoutes);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeActivity(daysAgo: number): { created_at: string } {
  const d = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return { created_at: d.toISOString() };
}

function makeActivityOnDate(utcDate: string): { created_at: string } {
  return { created_at: `${utcDate}T12:00:00.000Z` };
}

// ─── computeStreak ────────────────────────────────────────────────────────────

describe('computeStreak', () => {
  it('returns 0/0 for empty activity array', () => {
    const result = computeStreak([]);
    expect(result.current).toBe(0);
    expect(result.longest).toBe(0);
  });

  it('returns current=0 when most recent activity is not today', () => {
    const activities = [makeActivity(1), makeActivity(2)];
    const result = computeStreak(activities);
    expect(result.current).toBe(0);
  });

  it('returns current=1 when there is exactly one activity today', () => {
    const activities = [makeActivity(0)];
    const result = computeStreak(activities);
    expect(result.current).toBe(1);
    expect(result.longest).toBe(1);
  });

  it('counts consecutive days including today', () => {
    // Today + yesterday + 2 days ago = 3
    const activities = [makeActivity(0), makeActivity(1), makeActivity(2)];
    const result = computeStreak(activities);
    expect(result.current).toBe(3);
    expect(result.longest).toBe(3);
  });

  it('breaks streak on gap (day 0, day 1, then gap, day 5)', () => {
    const activities = [makeActivity(0), makeActivity(1), makeActivity(5)];
    const result = computeStreak(activities);
    expect(result.current).toBe(2);
  });

  it('computes longest streak even if current is 0', () => {
    // No activity today; but days 2/3/4 are consecutive
    const activities = [makeActivity(2), makeActivity(3), makeActivity(4)];
    const result = computeStreak(activities);
    expect(result.current).toBe(0);
    expect(result.longest).toBe(3);
  });

  it('deduplicates multiple activities on the same day', () => {
    // Three activities on the same day (today) + yesterday
    const todayUtc = new Date().toISOString().slice(0, 10);
    const yesterdayUtc = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const activities = [
      makeActivityOnDate(todayUtc),
      makeActivityOnDate(todayUtc),
      makeActivityOnDate(todayUtc),
      makeActivityOnDate(yesterdayUtc),
    ];
    const result = computeStreak(activities);
    expect(result.current).toBe(2); // today + yesterday
    expect(result.longest).toBe(2);
  });

  it('handles a single activity not today — current=0, longest=1', () => {
    const activities = [makeActivity(3)];
    const result = computeStreak(activities);
    expect(result.current).toBe(0);
    expect(result.longest).toBe(1);
  });

  it('finds longest streak across non-current window', () => {
    // Long streak 10-14 days ago (5 days), short streak today
    const activities = [
      makeActivity(0),
      makeActivity(10),
      makeActivity(11),
      makeActivity(12),
      makeActivity(13),
      makeActivity(14),
    ];
    const result = computeStreak(activities);
    expect(result.current).toBe(1);
    expect(result.longest).toBe(5);
  });

  it('handles activities sorted ascending (not descending)', () => {
    // computeStreak re-sorts internally
    const todayUtc = new Date().toISOString().slice(0, 10);
    const yesterdayUtc = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const activities = [
      makeActivityOnDate(yesterdayUtc),
      makeActivityOnDate(todayUtc),
    ];
    const result = computeStreak(activities);
    expect(result.current).toBe(2);
  });
});

// ─── Route integration tests ─────────────────────────────────────────────────

describe('momentum routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── POST /log ──

  describe('POST /momentum/log', () => {
    it('validates activity_type', async () => {
      const res = await app.request('http://test/momentum/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activity_type: 'invalid_type' }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Validation failed');
    });

    it('rejects missing body', async () => {
      const res = await app.request('http://test/momentum/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      });
      expect(res.status).toBe(400);
    });

    it('inserts valid activity and returns 201', async () => {
      const fakeActivity = {
        id: 'act-1',
        user_id: 'test-user-id',
        activity_type: 'job_applied',
        related_id: null,
        metadata: {},
        created_at: new Date().toISOString(),
      };

      mockFrom.mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: fakeActivity, error: null }),
          }),
        }),
      });

      const res = await app.request('http://test/momentum/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activity_type: 'job_applied' }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.activity.activity_type).toBe('job_applied');
    });
  });

  // ── GET /summary ──

  describe('GET /momentum/summary', () => {
    it('returns summary with streak and wins', async () => {
      const todayIso = new Date().toISOString();

      const mockChain = {
        select: vi.fn().mockImplementation((fields: string) => {
          if (fields === 'activity_type, created_at') {
            return {
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({
                    data: [{ activity_type: 'job_applied', created_at: todayIso }],
                    error: null,
                  }),
                }),
              }),
            };
          }
          // recent wins query
          return {
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            }),
          };
        }),
      };

      mockFrom.mockReturnValue(mockChain);

      const res = await app.request('http://test/momentum/summary');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('current_streak');
      expect(body).toHaveProperty('longest_streak');
      expect(body).toHaveProperty('total_activities');
      expect(body).toHaveProperty('this_week_activities');
      expect(body).toHaveProperty('recent_wins');
    });
  });

  // ── PATCH /nudges/:id/dismiss ──

  describe('PATCH /momentum/nudges/:id/dismiss', () => {
    it('returns 404 for non-existent nudge', async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'not found' } }),
            }),
          }),
        }),
      });

      const res = await app.request('http://test/momentum/nudges/bad-id/dismiss', {
        method: 'PATCH',
      });
      expect(res.status).toBe(404);
    });
  });

  // ── POST /check-stalls ──

  describe('POST /momentum/check-stalls', () => {
    it('returns empty nudges when no stalls detected', async () => {
      mockDetectStalls.mockResolvedValueOnce([]);

      const res = await app.request('http://test/momentum/check-stalls', { method: 'POST' });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.nudges).toEqual([]);
    });

    it('deduplicates nudges within 3-day window', async () => {
      mockDetectStalls.mockResolvedValueOnce([
        { trigger_type: 'inactivity', context: 'No activity in 5 days' },
      ]);

      // Mock: recent nudges already contain 'inactivity'
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockResolvedValue({
              data: [{ trigger_type: 'inactivity' }],
              error: null,
            }),
          }),
        }),
      });

      const res = await app.request('http://test/momentum/check-stalls', { method: 'POST' });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.nudges).toEqual([]);
      // generateCoachingMessage should NOT have been called
      expect(mockGenerateCoachingMessage).not.toHaveBeenCalled();
    });
  });
});

// ─── Route validation helpers (unit-level, no HTTP) ──────────────────────────

describe('momentum activity type validation', () => {
  const ALLOWED = [
    'resume_completed',
    'cover_letter_completed',
    'job_applied',
    'interview_prep',
    'mock_interview',
    'debrief_logged',
    'networking_outreach',
    'linkedin_post',
    'profile_update',
    'salary_negotiation',
  ];

  it('allowed list has exactly 10 activity types', () => {
    expect(ALLOWED).toHaveLength(10);
  });

  it('all allowed types are non-empty strings', () => {
    for (const type of ALLOWED) {
      expect(typeof type).toBe('string');
      expect(type.length).toBeGreaterThan(0);
    }
  });

  it('activity type list does not include invalid type', () => {
    expect(ALLOWED).not.toContain('invalid_type');
    expect(ALLOWED).not.toContain('');
    expect(ALLOWED).not.toContain('completed'); // too generic
  });
});

// ─── Edge cases for streak computation ───────────────────────────────────────

describe('computeStreak — edge cases', () => {
  it('handles a very long streak of 30 consecutive days', () => {
    const activities: Array<{ created_at: string }> = [];
    for (let i = 0; i < 30; i++) {
      activities.push(makeActivity(i));
    }
    const result = computeStreak(activities);
    expect(result.current).toBe(30);
    expect(result.longest).toBe(30);
  });

  it('returns longest=1 for multiple non-consecutive isolated days', () => {
    // Activities on days 5, 10, 15 (no today, no consecutive)
    const activities = [makeActivity(5), makeActivity(10), makeActivity(15)];
    const result = computeStreak(activities);
    expect(result.current).toBe(0);
    expect(result.longest).toBe(1);
  });

  it('handles exactly two consecutive days, neither today', () => {
    const activities = [makeActivity(3), makeActivity(4)];
    const result = computeStreak(activities);
    expect(result.current).toBe(0);
    expect(result.longest).toBe(2);
  });
});
