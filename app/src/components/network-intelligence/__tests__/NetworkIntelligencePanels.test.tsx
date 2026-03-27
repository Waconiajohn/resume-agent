// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

vi.mock('@/lib/api', () => ({
  API_BASE: 'http://localhost:3001/api',
}));

import { JobMatchesList } from '../JobMatchesList';
import { CompanyCard } from '../CompanyCard';
import { ScrapeJobsPanel } from '../ScrapeJobsPanel';

describe('network intelligence panels', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('shows the empty job matches state when no matches are returned', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ matches: [] }), { status: 200 }),
    );

    render(<JobMatchesList accessToken="test-token" />);

    expect(await screen.findByText(/No job matches yet/i)).toBeInTheDocument();
  });

  it('renders returned job matches with referral and score details', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          matches: [
            {
              id: 'match-1',
              company_id: 'company-1',
              title: 'Staff Platform Engineer',
              location: 'Remote',
              salary_range: '$200k-$240k',
              match_score: 86,
              referral_available: true,
              connection_count: 3,
              status: 'new',
              created_at: '2026-03-21T12:00:00Z',
              metadata: {
                search_context: 'bonus_search',
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    render(<JobMatchesList accessToken="test-token" />);

    expect(await screen.findByText('Staff Platform Engineer')).toBeInTheDocument();
    expect(screen.getByText('Bonus Search')).toBeInTheDocument();
    expect(screen.getByText('Referral')).toBeInTheDocument();
    expect(screen.getByText('86%')).toBeInTheDocument();
    expect(screen.getByDisplayValue('new')).toBeInTheDocument();
  });

  it('loads company connections when a company card is expanded', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          connections: [
            {
              id: 'conn-1',
              first_name: 'Jamie',
              last_name: 'Taylor',
              company_raw: 'Acme Corp',
              position: 'Director of Engineering',
            },
          ],
        }),
        { status: 200 },
      ),
    );

    render(
      <CompanyCard
        accessToken="test-token"
        company={{
          companyRaw: 'Acme Corp',
          companyDisplayName: 'Acme Corp',
          companyId: 'company-1',
          connectionCount: 1,
          topPositions: ['Director of Engineering'],
        }}
      />,
    );

    fireEvent.click(screen.getByText('Acme Corp'));

    expect(await screen.findByText('Jamie Taylor')).toBeInTheDocument();
    expect(screen.getAllByText('Director of Engineering').length).toBeGreaterThan(0);
  });

  it('shows the no-eligible-companies guidance in scrape jobs when nothing can be scanned', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ companies: [] }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ titles: [] }), { status: 200 }),
      );

    render(<ScrapeJobsPanel accessToken="test-token" />);

    expect(await screen.findByText('Scan for Job Openings')).toBeInTheDocument();
    expect(
      screen.getByText(/Import LinkedIn connections first/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Scan for Jobs/i })).toBeDisabled();
  });

  it('explains normalization is still running when connections exist but no companies are scan-ready yet', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            companies: [
              {
                companyRaw: 'Acme Corp',
                companyDisplayName: null,
                companyId: null,
                connectionCount: 3,
                topPositions: ['VP Operations'],
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ titles: [{ id: 'title-1', title: 'VP Operations', priority: 1 }] }), {
          status: 200,
        }),
      );

    render(<ScrapeJobsPanel accessToken="test-token" />);

    expect(await screen.findByText('Scan for Job Openings')).toBeInTheDocument();
    expect(
      screen.getByText(/Connections imported/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/still normalizing before we can scan career pages/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Scan for Jobs/i })).toBeDisabled();
  });

  it('auto-refreshes the scan panel when company normalization finishes', async () => {
    const setIntervalSpy = vi
      .spyOn(globalThis, 'setInterval')
      .mockImplementation(((handler: TimerHandler, _timeout?: number, ...args: unknown[]) => {
        queueMicrotask(() => {
          if (typeof handler === 'function') {
            handler(...args);
          }
        });
        return 1 as unknown as ReturnType<typeof setInterval>;
      }) as unknown as typeof setInterval);
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => {});

    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            companies: [
              {
                companyRaw: 'Acme Corp',
                companyDisplayName: null,
                companyId: null,
                connectionCount: 3,
                topPositions: ['VP Operations'],
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ titles: [{ id: 'title-1', title: 'VP Operations', priority: 1 }] }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            companies: [
              {
                companyRaw: 'Acme Corp',
                companyDisplayName: 'Acme Corp',
                companyId: 'company-1',
                connectionCount: 3,
                topPositions: ['VP Operations'],
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ titles: [{ id: 'title-1', title: 'VP Operations', priority: 1 }] }), {
          status: 200,
        }),
    );

    render(<ScrapeJobsPanel accessToken="test-token" />);

    expect(await screen.findByText('Scan for Job Openings')).toBeInTheDocument();

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(4);
      expect(screen.queryByText(/still normalizing before we can scan career pages/i)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Scan for Jobs/i })).toBeEnabled();
    });

    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });
});
