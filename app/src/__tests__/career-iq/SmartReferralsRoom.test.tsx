// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const mockUseAuth = vi.fn();

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/lib/api', () => ({
  API_BASE: 'http://localhost:3001/api',
}));

vi.mock('@/components/network-intelligence/CsvUploader', () => ({
  CsvUploader: () => <div data-testid="csv-uploader">CSV uploader</div>,
}));

vi.mock('@/components/network-intelligence/ConnectionsBrowser', () => ({
  ConnectionsBrowser: () => <div data-testid="connections-browser">Connections browser</div>,
}));

vi.mock('@/components/network-intelligence/TargetTitlesManager', () => ({
  TargetTitlesManager: () => <div data-testid="target-titles-manager">Target titles</div>,
}));

vi.mock('@/components/network-intelligence/JobMatchesList', () => ({
  JobMatchesList: () => <div data-testid="job-matches-list">Job matches</div>,
}));

vi.mock('@/components/network-intelligence/ScrapeJobsPanel', () => ({
  ScrapeJobsPanel: () => <div data-testid="scrape-jobs-panel">Scrape jobs</div>,
}));

vi.mock('@/components/network-intelligence/BonusSearchPanel', () => ({
  BonusSearchPanel: () => <div data-testid="bonus-search-panel">Bonus search</div>,
}));

vi.mock('@/components/network-intelligence/ReferralOpportunitiesPanel', () => ({
  ReferralOpportunitiesPanel: () => <div data-testid="referral-opportunities-panel">Referral opportunities</div>,
}));

vi.mock('@/components/career-iq/NetworkingHubRoom', () => ({
  NetworkingHubRoom: () => <div data-testid="networking-hub-room">Networking hub</div>,
}));

import { SmartReferralsRoom } from '@/components/career-iq/SmartReferralsRoom';

describe('SmartReferralsRoom', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows session guidance when the user is signed out', () => {
    mockUseAuth.mockReturnValue({ session: null, loading: false });

    render(<SmartReferralsRoom />);

    expect(screen.getByText('Smart Referrals')).toBeInTheDocument();
    expect(screen.getByText('Your Network')).toBeInTheDocument();
    expect(screen.getAllByText('Bonus Search').length).toBeGreaterThan(0);
    expect(screen.getByText(/You need an active session/i)).toBeInTheDocument();
  });

  it('renders the import uploader by default when there are no connections yet', async () => {
    mockUseAuth.mockReturnValue({
      session: { access_token: 'test-token' },
      loading: false,
    });

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ count: 0 }), { status: 200 }),
    );

    render(<SmartReferralsRoom />);

    expect(await screen.findByTestId('csv-uploader')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connections' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Job Matches' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Job Scan' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Bonus Search' })).toBeEnabled();
  });

  it('switches to the connections view automatically when imported connections already exist', async () => {
    mockUseAuth.mockReturnValue({
      session: { access_token: 'test-token' },
      loading: false,
    });

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ count: 3 }), { status: 200 }),
    );

    render(<SmartReferralsRoom />);

    await waitFor(() => {
      expect(screen.getByTestId('connections-browser')).toBeInTheDocument();
    });
  });
});
