import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFrom = vi.hoisted(() => vi.fn());

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: mockFrom,
    auth: { getUser: vi.fn() },
  },
}));

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: vi.fn(async (c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
    c.set('user', { id: 'user-test-123', email: 'tester@example.com', accessToken: 'tok' });
    await next();
  }),
}));

vi.mock('../middleware/rate-limit.js', () => ({
  rateLimitMiddleware: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

vi.mock('../lib/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { Hono } from 'hono';
import { productTelemetryRoutes } from '../routes/product-telemetry.js';
import { admin } from '../routes/admin.js';

function buildSelectChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.gte = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.range = vi.fn().mockResolvedValue(result);
  return chain;
}

describe('product telemetry routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_API_KEY = 'admin-secret';
  });

  it('ingests a batch of telemetry events for the authenticated user', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValueOnce({ upsert });

    const app = new Hono();
    app.route('/api/product-telemetry', productTelemetryRoutes);

    const res = await app.request('/api/product-telemetry/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer tok',
      },
      body: JSON.stringify({
        schema_version: 1,
        events: [
          {
            id: 'evt_1',
            name: 'job_board_search_run',
            timestamp: '2026-03-30T12:00:00.000Z',
            path: '/workspace?room=jobs',
            payload: {
              query: 'VP Marketing',
              location: 'Chicago',
              date_posted: 'any',
              remote_type: 'any',
              source: 'manual',
            },
          },
        ],
      }),
    });

    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          user_id: 'user-test-123',
          client_event_id: 'evt_1',
          schema_version: 1,
          event_name: 'job_board_search_run',
        }),
      ],
      expect.objectContaining({
        onConflict: 'user_id,client_event_id',
        ignoreDuplicates: true,
      }),
    );
  });

  it('builds the admin product funnel summary from stored events', async () => {
    mockFrom.mockReturnValueOnce(buildSelectChain({
      data: [
        {
          user_id: 'user-a',
          event_name: 'resume_builder_session_started',
          occurred_at: '2026-03-30T10:00:00.000Z',
          path: '/workspace?room=resume',
          payload: { source: 'workspace_resume_builder' },
        },
        {
          user_id: 'user-a',
          event_name: 'job_board_search_run',
          occurred_at: '2026-03-30T10:05:00.000Z',
          path: '/workspace?room=jobs',
          payload: {
            query: 'COO',
            location: null,
            date_posted: 'any',
            remote_type: 'any',
            source: 'manual',
          },
        },
        {
          user_id: 'user-b',
          event_name: 'smart_referrals_path_selected',
          occurred_at: '2026-03-30T10:08:00.000Z',
          path: '/workspace?room=networking',
          payload: { path: 'bonus', source: 'user', has_connections: false },
        },
        {
          user_id: 'user-c',
          event_name: 'profile_setup_retry_needed',
          occurred_at: '2026-03-30T10:08:30.000Z',
          path: '/profile-setup',
          payload: { session_id: 'setup-1', source: 'initial_complete' },
        },
        {
          user_id: 'user-c',
          event_name: 'profile_setup_retry_requested',
          occurred_at: '2026-03-30T10:09:00.000Z',
          path: '/profile-setup',
          payload: { session_id: 'setup-1', source: 'reveal' },
        },
        {
          user_id: 'user-c',
          event_name: 'profile_setup_retry_succeeded',
          occurred_at: '2026-03-30T10:10:00.000Z',
          path: '/profile-setup',
          payload: { session_id: 'setup-1', master_resume_id: 'resume-1' },
        },
        {
          user_id: 'user-d',
          event_name: 'profile_setup_retry_needed',
          occurred_at: '2026-03-30T10:11:00.000Z',
          path: '/profile-setup',
          payload: { session_id: 'setup-2', source: 'retry' },
        },
        {
          user_id: 'user-d',
          event_name: 'profile_setup_retry_failed',
          occurred_at: '2026-03-30T10:12:00.000Z',
          path: '/profile-setup',
          payload: {
            session_id: 'setup-2',
            reason: 'master_resume_not_created',
            message: 'Automatic retry still did not create the master resume.',
          },
        },
      ],
      error: null,
    }));

    const app = new Hono();
    app.route('/api/admin', admin);

    const res = await app.request('/api/admin/product-funnel?days=7', {
      headers: {
        Authorization: 'Bearer admin-secret',
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as {
      days: number;
      active_users: number;
      total_events: number;
      event_counts: Record<string, number>;
      watch_metrics: Array<{
        id: string;
        rate_pct: number | null;
      }>;
      path_breakdown: {
        smart_referrals: Record<string, number>;
        profile_setup_retries: {
          needed_initial: number;
          needed_after_retry: number;
          requested: number;
          succeeded: number;
          failed: number;
          failures_by_reason: {
            request_failed: number;
            master_resume_not_created: number;
          };
        };
      };
    };

    expect(body.days).toBe(7);
    expect(body.active_users).toBe(4);
    expect(body.total_events).toBe(8);
    expect(body.event_counts.resume_builder_session_started).toBe(1);
    expect(body.event_counts.job_board_search_run).toBe(1);
    expect(body.path_breakdown.smart_referrals.bonus).toBe(1);
    expect(body.path_breakdown.profile_setup_retries.needed_initial).toBe(1);
    expect(body.path_breakdown.profile_setup_retries.needed_after_retry).toBe(1);
    expect(body.path_breakdown.profile_setup_retries.requested).toBe(1);
    expect(body.path_breakdown.profile_setup_retries.succeeded).toBe(1);
    expect(body.path_breakdown.profile_setup_retries.failed).toBe(1);
    expect(body.path_breakdown.profile_setup_retries.failures_by_reason.master_resume_not_created).toBe(1);
    expect(body.watch_metrics.some((metric) => metric.id === 'smart_referrals_network_share')).toBe(true);
    expect(body.watch_metrics.some((metric) => metric.id === 'profile_setup_retry_success')).toBe(true);
  });
});
