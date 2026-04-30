// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

vi.mock('@/lib/api', () => ({
  API_BASE: 'http://localhost:3001/api',
}));

import { JobMatchesList } from '../JobMatchesList';
import { CompanyCard } from '../CompanyCard';
import { ScrapeJobsPanel } from '../ScrapeJobsPanel';
import { JobFilterPanel } from '@/components/shared/JobFilterPanel';

describe('network intelligence panels', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    localStorage.clear();
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
    expect(screen.getByText(/86%/)).toBeInTheDocument();
    expect(screen.getByDisplayValue('new')).toBeInTheDocument();
  });

  it('filters job matches by source and referral overlay', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          matches: [
            {
              id: 'match-1',
              company_id: 'company-1',
              title: 'VP Operations',
              match_score: 82,
              referral_available: false,
              connection_count: 2,
              status: 'new',
              created_at: '2026-03-21T12:00:00Z',
              metadata: { search_context: 'network_connections' },
            },
            {
              id: 'match-2',
              company_id: 'company-2',
              title: 'Chief Revenue Officer',
              match_score: 79,
              referral_available: true,
              connection_count: 0,
              status: 'new',
              created_at: '2026-03-21T12:00:00Z',
              metadata: { search_context: 'bonus_search' },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    render(<JobMatchesList accessToken="test-token" />);

    expect(await screen.findByText('VP Operations')).toBeInTheDocument();
    expect(screen.getByText('Chief Revenue Officer')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Your Network \(1\)/i }));
    expect(screen.getByText('VP Operations')).toBeInTheDocument();
    expect(screen.queryByText('Chief Revenue Officer')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Referral Bonus \(1\)/i }));
    expect(screen.getByText('Chief Revenue Officer')).toBeInTheDocument();
    expect(screen.queryByText('VP Operations')).not.toBeInTheDocument();
  });

  it('starts on the requested match filter when a path-specific filter is provided', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          matches: [
            {
              id: 'match-1',
              company_id: 'company-1',
              title: 'VP Operations',
              match_score: 82,
              referral_available: false,
              connection_count: 2,
              status: 'new',
              created_at: '2026-03-21T12:00:00Z',
              metadata: { search_context: 'network_connections' },
            },
            {
              id: 'match-2',
              company_id: 'company-2',
              title: 'Chief Revenue Officer',
              match_score: 79,
              referral_available: true,
              connection_count: 0,
              status: 'new',
              created_at: '2026-03-21T12:00:00Z',
              metadata: { search_context: 'bonus_search' },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    render(
      <JobMatchesList
        accessToken="test-token"
        initialFilter="bonus_search"
        title="Bonus Matches"
      />,
    );

    expect(await screen.findByText('Chief Revenue Officer')).toBeInTheDocument();
    expect(screen.queryByText('VP Operations')).not.toBeInTheDocument();
    expect(screen.getByText('Bonus Matches')).toBeInTheDocument();
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

  it('shows the no-eligible-companies guidance in company job search when nothing can be checked', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ companies: [] }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ titles: [] }), { status: 200 }),
      );

    render(<ScrapeJobsPanel accessToken="test-token" />);

    expect(await screen.findByText('Find Job Openings')).toBeInTheDocument();
    expect(
      screen.getByText(/Import LinkedIn connections first/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Find Jobs/i })).toBeDisabled();
  });

  it('makes selected companies obvious and enables the company job search action', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            companies: [
              {
                companyRaw: 'Acme Corp',
                companyDisplayName: 'Acme Corp',
                companyId: '550e8400-e29b-41d4-a716-446655440000',
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

    const searchButton = await screen.findByRole('button', { name: /Find Jobs/i });
    expect(searchButton).toBeDisabled();

    fireEvent.click(await screen.findByRole('button', { name: /Select Acme Corp/i }));

    expect(screen.getByText('Selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Deselect Acme Corp/i })).toHaveAttribute('aria-pressed', 'true');
    expect(searchButton).toBeEnabled();
  });

  it('explains verified freshness and offers all supported freshness windows', () => {
    render(
      <JobFilterPanel
        location=""
        onLocationChange={vi.fn()}
        radiusMiles={25}
        onRadiusMilesChange={vi.fn()}
        workModes={{ remote: true, hybrid: true, onsite: false }}
        onWorkModesChange={vi.fn()}
        postedWithin="7d"
        onPostedWithinChange={vi.fn()}
        workModeSelection="scan-shape"
      />,
    );

    expect(screen.getByText(/Remote is nationwide/i)).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Last 24 hours' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Last 3 days' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Last 7 days' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Last 14 days' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Last 30 days' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Any date' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Remote Nationwide/i })).toHaveAttribute('aria-pressed', 'true');
  });

  it('supports a single-select work-mode control for Broad Search', () => {
    const onWorkModesChange = vi.fn();

    render(
      <JobFilterPanel
        location=""
        onLocationChange={vi.fn()}
        radiusMiles={25}
        onRadiusMilesChange={vi.fn()}
        workModes={{ remote: true, hybrid: true, onsite: false }}
        onWorkModesChange={onWorkModesChange}
        postedWithin="7d"
        onPostedWithinChange={vi.fn()}
        workModeSelection="single"
      />,
    );

    expect(screen.getByRole('button', { name: 'Any' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/checks fresh listings/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remote' }));
    expect(onWorkModesChange).toHaveBeenLastCalledWith({ remote: true, hybrid: false, onsite: false });

    fireEvent.click(screen.getByRole('button', { name: 'Any' }));
    expect(onWorkModesChange).toHaveBeenLastCalledWith({ remote: false, hybrid: false, onsite: false });
  });

  it('starts a remote-only company job search without tying it to city/radius', async () => {
    localStorage.setItem(
      'ni-job-filters',
      JSON.stringify({
        location: 'Dallas, TX',
        radiusMiles: 50,
        workModes: { remote: true, hybrid: false, onsite: false },
        postedWithin: '30d',
      }),
    );

    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            companies: [
              {
                companyRaw: 'Acme Corp',
                companyDisplayName: 'Acme Corp',
                companyId: '550e8400-e29b-41d4-a716-446655440000',
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
      .mockResolvedValueOnce(new Response(JSON.stringify({ scrape_log_id: 'scrape-1' }), { status: 202 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            log: {
              id: 'scrape-1',
              status: 'completed',
              output_summary: { companies_scanned: 1 },
              error_message: null,
            },
          }),
          { status: 200 },
        ),
      );

    render(<ScrapeJobsPanel accessToken="test-token" />);

    fireEvent.click(await screen.findByRole('button', { name: /Select Acme Corp/i }));
    fireEvent.click(screen.getByRole('button', { name: /Find Jobs/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/ni/scrape/start',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    const startCall = vi.mocked(fetch).mock.calls.find(([url]) =>
      String(url).includes('/ni/scrape/start'),
    );
    const body = JSON.parse((startCall?.[1] as RequestInit).body as string);
    expect(body).toEqual(
      expect.objectContaining({
        remote_only: true,
        work_modes: ['remote'],
        max_days_old: 30,
      }),
    );
    expect(body).not.toHaveProperty('location');
    expect(body).not.toHaveProperty('radius_miles');
  });

  it('starts a hybrid company job search with city/radius and hybrid work mode', async () => {
    localStorage.setItem(
      'ni-job-filters',
      JSON.stringify({
        location: 'Dallas, TX',
        radiusMiles: 50,
        workModes: { remote: false, hybrid: true, onsite: false },
        postedWithin: '14d',
      }),
    );

    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            companies: [
              {
                companyRaw: 'Acme Corp',
                companyDisplayName: 'Acme Corp',
                companyId: '550e8400-e29b-41d4-a716-446655440000',
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
      .mockResolvedValueOnce(new Response(JSON.stringify({ scrape_log_id: 'scrape-1' }), { status: 202 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            log: {
              id: 'scrape-1',
              status: 'completed',
              output_summary: { companies_scanned: 1 },
              error_message: null,
            },
          }),
          { status: 200 },
        ),
      );

    render(<ScrapeJobsPanel accessToken="test-token" />);

    fireEvent.click(await screen.findByRole('button', { name: /Select Acme Corp/i }));
    fireEvent.click(screen.getByRole('button', { name: /Find Jobs/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/ni/scrape/start',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    const startCall = vi.mocked(fetch).mock.calls.find(([url]) =>
      String(url).includes('/ni/scrape/start'),
    );
    expect(JSON.parse((startCall?.[1] as RequestInit).body as string)).toEqual(
      expect.objectContaining({
        location: 'Dallas, TX',
        radius_miles: 50,
        remote_only: false,
        work_modes: ['hybrid'],
        max_days_old: 14,
      }),
    );
  });

  it('explains normalization is still running when connections exist but no companies are ready yet', async () => {
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

    expect(await screen.findByText('Find Job Openings')).toBeInTheDocument();
    expect(
      screen.getByText(/Connections imported/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/still normalizing before we can check public job pages/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Find Jobs/i })).toBeDisabled();
  });

  it('auto-refreshes the company job panel when company normalization finishes', async () => {
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

    expect(await screen.findByText('Find Job Openings')).toBeInTheDocument();

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(4);
      expect(screen.queryByText(/still normalizing before we can check public job pages/i)).not.toBeInTheDocument();
      // The Find Jobs button is present — user must select companies to enable it
      expect(screen.getByRole('button', { name: /Find Jobs/i })).toBeInTheDocument();
    });

    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });
});
