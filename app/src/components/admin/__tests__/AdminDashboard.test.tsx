// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminDashboard } from '../AdminDashboard';

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } satisfies Partial<Response>;
}

describe('AdminDashboard', () => {
  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem('admin_key', 'admin-secret');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it('surfaces profile-setup retry recovery in the funnel tab', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/admin/stats')) {
        return jsonResponse({
          pipeline: {
            completions_total: 10,
            errors_total: 1,
            success_rate_pct: 90.9,
            avg_duration_ms: 2200,
            avg_cost_usd: 0.0123,
            total_cost_usd: 0.1353,
            completions_by_domain: { resume: 8, cover_letter: 2 },
            errors_by_domain: { resume: 1 },
          },
          active_users_24h: 5,
          active_sessions: 2,
          generated_at: '2026-04-07T22:00:00.000Z',
        });
      }

      if (url.includes('/admin/product-funnel')) {
        return jsonResponse({
          generated_at: '2026-04-07T22:00:00.000Z',
          days: 7,
          total_events: 42,
          active_users: 8,
          event_counts: {
            profile_setup_retry_requested: 3,
            profile_setup_retry_succeeded: 2,
            smart_referrals_path_selected: 4,
            job_board_search_run: 6,
          },
          funnel_steps: [],
          watch_metrics: [
            {
              id: 'profile_setup_retry_success',
              label: 'Profile Setup Retry Success',
              numerator: 2,
              denominator: 3,
              rate_pct: 66.7,
              status: 'watch',
              note: 'When master-resume creation needs a retry, the reveal-screen recovery should usually succeed.',
            },
            {
              id: 'smart_referrals_network_share',
              label: 'Insider Jobs Network Path Share',
              numerator: 3,
              denominator: 4,
              rate_pct: 75,
              status: 'healthy',
              note: 'The network path is the stronger default and should usually lead the room.',
            },
          ],
          path_breakdown: {
            smart_referrals: { network: 3, bonus: 1 },
            shortlist_entry_points: { overview_cta: 2, board_target: 1 },
            boolean_copy_targets: { linkedin: 1, indeed: 0, titles: 0 },
            profile_setup_retries: {
              needed_initial: 3,
              needed_after_retry: 1,
              requested: 3,
              succeeded: 2,
              failed: 2,
              failures_by_reason: {
                request_failed: 1,
                master_resume_not_created: 1,
              },
            },
          },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    render(<AdminDashboard />);

    expect(await screen.findByText('Total Resume Runs')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Funnel' }));

    expect(await screen.findByText('Profile Setup Recovery')).toBeInTheDocument();
    expect(screen.getByText('Attention Right Now')).toBeInTheDocument();
    expect(screen.getAllByText('Profile Setup Retry Success').length).toBeGreaterThan(0);
    expect(screen.getByText('Monitor whether reveal-screen retry is being used and whether it actually recovers Career Proof creation.')).toBeInTheDocument();
    expect(screen.getByText('Retry request failures: 1')).toBeInTheDocument();
    expect(screen.getByText('Needed again after retry: 1')).toBeInTheDocument();
    expect(screen.getByText('Total failed retry attempts: 2')).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
  });
});
