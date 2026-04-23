// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { mockUseAuth, trackProductEventMock } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  trackProductEventMock: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/lib/api', () => ({
  API_BASE: 'http://localhost:3001/api',
}));

vi.mock('@/lib/product-telemetry', () => ({
  trackProductEvent: trackProductEventMock,
}));

vi.mock('@/components/network-intelligence/CsvUploader', () => ({
  CsvUploader: ({ onUploadComplete }: { onUploadComplete: (summary: {
    totalRows: number;
    validRows: number;
    skippedRows: number;
    duplicatesRemoved: number;
    uniqueCompanies: number;
  }) => void }) => (
    <div data-testid="csv-uploader">
      CSV uploader
      <button
        type="button"
        onClick={() => onUploadComplete({
          totalRows: 125,
          validRows: 101,
          skippedRows: 12,
          duplicatesRemoved: 8,
          uniqueCompanies: 44,
        })}
      >
        Finish upload
      </button>
    </div>
  ),
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
  ReferralOpportunitiesPanel: ({ onGenerateOutreach }: { onGenerateOutreach?: (prefill: { name: string; title: string; company: string }) => void }) => (
    <div data-testid="referral-opportunities-panel">
      Referral opportunities
      <button type="button" onClick={() => onGenerateOutreach?.({ name: 'Jordan Lee', title: 'VP Sales', company: 'Acme Corp' })}>
        Generate outreach
      </button>
    </div>
  ),
}));

vi.mock('@/components/career-iq/NetworkingHubRoom', () => ({
  NetworkingHubRoom: ({ initialPrefill }: { initialPrefill?: { company?: string } }) => (
    <div data-testid="networking-hub-room">
      Networking hub
      {initialPrefill?.company ? <span data-testid="networking-hub-prefill">{initialPrefill.company}</span> : null}
    </div>
  ),
}));

import { SmartReferralsRoom } from '@/components/career-iq/SmartReferralsRoom';

describe('SmartReferralsRoom', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    trackProductEventMock.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows session guidance when the user is signed out', () => {
    mockUseAuth.mockReturnValue({ session: null, loading: false });

    render(<SmartReferralsRoom />);

    expect(screen.getByText('Insider Jobs')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Network path' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bonus path' })).toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: 'Matches' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Outreach' })).toBeEnabled();
    // Network path tab bar includes Target Titles and Job Scan as visible tabs
    expect(screen.getByRole('button', { name: /Target Titles/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Job Scan' })).toBeInTheDocument();
    // Bonus Search is only in the bonus path, not the network path
    expect(screen.queryByRole('button', { name: 'Bonus Search' })).not.toBeInTheDocument();
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

  it('keeps target titles and company scans as support tools inside the connection setup view', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Target titles' }));
    expect(screen.getByTestId('target-titles-manager')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Scan company pages' })).toBeInTheDocument();
  });

  it('routes referral-generated outreach into the merged contacts workspace with prefill context', async () => {
    mockUseAuth.mockReturnValue({
      session: { access_token: 'test-token' },
      loading: false,
    });

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ count: 0 }), { status: 200 }),
    );

    render(<SmartReferralsRoom />);

    await screen.findByTestId('csv-uploader');

    screen.getByRole('button', { name: 'Bonus path' }).click();
    const referralBonusButton = await screen.findByRole('button', { name: 'Referral Bonus' });
    referralBonusButton.click();
    await screen.findByTestId('referral-opportunities-panel');

    screen.getByRole('button', { name: 'Generate outreach' }).click();

    await waitFor(() => {
      expect(screen.getByTestId('networking-hub-room')).toBeInTheDocument();
    });
    expect(screen.getByTestId('networking-hub-prefill')).toHaveTextContent('Acme Corp');
    expect(trackProductEventMock).toHaveBeenCalledWith('smart_referrals_outreach_opened', {
      path: 'network',
      prefilled: true,
      trigger: 'referral_bonus',
    });
  });

  it('falls back to the signed-out locked state when auth disappears after load', async () => {
    mockUseAuth.mockReturnValue({
      session: { access_token: 'test-token' },
      loading: false,
    });

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ count: 3 }), { status: 200 }),
    );

    const { rerender } = render(<SmartReferralsRoom />);

    await waitFor(() => {
      expect(screen.getByTestId('connections-browser')).toBeInTheDocument();
    });

    mockUseAuth.mockReturnValue({
      session: null,
      loading: false,
    });

    rerender(<SmartReferralsRoom />);

    await waitFor(() => {
      expect(screen.getByText(/You need an active session/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Connections' })).toBeDisabled();
    expect(screen.queryByTestId('connections-browser')).not.toBeInTheDocument();
  });

  it('resets to the unlocked-safe tabs when the signed-in user changes to one without connections', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'user-1' },
      session: { access_token: 'token-a' },
      loading: false,
    });

    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ count: 3 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ count: 0 }), { status: 200 }));

    const { rerender } = render(<SmartReferralsRoom initialFocus="connections" />);

    await waitFor(() => {
      expect(screen.getByTestId('connections-browser')).toBeInTheDocument();
    });

    mockUseAuth.mockReturnValue({
      user: { id: 'user-2' },
      session: { access_token: 'token-b' },
      loading: false,
    });

    rerender(<SmartReferralsRoom initialFocus="connections" />);

    await waitFor(() => {
      expect(screen.getByTestId('csv-uploader')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Connections' })).toBeDisabled();
    expect(screen.queryByTestId('connections-browser')).not.toBeInTheDocument();
  });

  it('opens directly into Bonus Search when that focus is provided', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'user-1' },
      session: { access_token: 'test-token' },
      loading: false,
    });

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ count: 0 }), { status: 200 }),
    );

    render(<SmartReferralsRoom initialFocus="bonus-search" />);

    expect(await screen.findByTestId('bonus-search-panel')).toBeInTheDocument();
    // Bonus path selector is active
    expect(screen.getByRole('button', { name: 'Bonus path' })).toBeInTheDocument();
  });

  it('tracks path selection when switching to the bonus path', async () => {
    mockUseAuth.mockReturnValue({
      session: { access_token: 'test-token' },
      loading: false,
    });

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ count: 0 }), { status: 200 }),
    );

    render(<SmartReferralsRoom />);

    await screen.findByTestId('csv-uploader');
    fireEvent.click(screen.getByRole('button', { name: 'Bonus path' }));

    expect(trackProductEventMock).toHaveBeenCalledWith('smart_referrals_path_selected', {
      path: 'bonus',
      source: 'user',
      has_connections: false,
    });
  });

  it('tracks connection imports when a CSV upload completes', async () => {
    mockUseAuth.mockReturnValue({
      session: { access_token: 'test-token' },
      loading: false,
    });

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ count: 0 }), { status: 200 }),
    );

    render(<SmartReferralsRoom />);

    await screen.findByTestId('csv-uploader');
    fireEvent.click(screen.getByRole('button', { name: 'Finish upload' }));

    expect(trackProductEventMock).toHaveBeenCalledWith('smart_referrals_connections_imported', {
      total_rows: 125,
      valid_rows: 101,
      skipped_rows: 12,
      duplicates_removed: 8,
      unique_companies: 44,
    });
  });

  it('opens the company scan support tool inside setup when that focus is provided', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'user-1' },
      session: { access_token: 'test-token' },
      loading: false,
    });

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ count: 3 }), { status: 200 }),
    );

    render(<SmartReferralsRoom initialFocus="job-scan" />);

    await waitFor(() => {
      expect(screen.getByTestId('connections-browser')).toBeInTheDocument();
    });
    expect(screen.getByTestId('scrape-jobs-panel')).toBeInTheDocument();
  });

  it('falls back to Import when a locked focus is requested without connections', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'user-1' },
      session: { access_token: 'test-token' },
      loading: false,
    });

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ count: 0 }), { status: 200 }),
    );

    render(<SmartReferralsRoom initialFocus="connections" />);

    expect(await screen.findByTestId('csv-uploader')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connections' })).toBeDisabled();
  });
});
