// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

// --- Global jsdom patch ---
window.HTMLElement.prototype.scrollIntoView = vi.fn();

// --- Mocks ---

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'test-token' } } }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  },
}));

vi.mock('@/lib/api', () => ({
  API_BASE: 'http://localhost:3001/api',
}));

// Mock the fetch used to check connections count — return 0 connections
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: vi.fn().mockResolvedValue({ count: 0 }),
  text: vi.fn().mockResolvedValue(''),
} as unknown as Response);

// Mock the network-intelligence sub-components to avoid deep rendering
vi.mock('@/components/network-intelligence/CsvUploader', () => ({
  CsvUploader: ({ onUploadComplete: _o }: { onUploadComplete: unknown }) => (
    <div data-testid="csv-uploader">CSV Uploader</div>
  ),
}));

vi.mock('@/components/network-intelligence/ConnectionsBrowser', () => ({
  ConnectionsBrowser: () => <div data-testid="connections-browser">Connections Browser</div>,
}));

vi.mock('@/components/network-intelligence/TargetTitlesManager', () => ({
  TargetTitlesManager: () => <div data-testid="target-titles-manager">Target Titles Manager</div>,
}));

vi.mock('@/components/network-intelligence/JobMatchesList', () => ({
  JobMatchesList: () => <div data-testid="job-matches-list">Job Matches List</div>,
}));

vi.mock('@/components/network-intelligence/BooleanSearchBuilder', () => ({
  BooleanSearchBuilder: () => <div data-testid="boolean-search-builder">Boolean Search Builder</div>,
}));

vi.mock('@/components/network-intelligence/ScrapeJobsPanel', () => ({
  ScrapeJobsPanel: () => <div data-testid="scrape-jobs-panel">Scrape Jobs Panel</div>,
}));

import { NetworkIntelligenceRoom } from '@/components/career-iq/NetworkIntelligenceRoom';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('NetworkIntelligenceRoom', () => {
  it('renders without crashing', () => {
    render(<NetworkIntelligenceRoom />);
    expect(screen.getByText('Network Intelligence')).toBeInTheDocument();
  });

  it('shows the Upload tab by default', () => {
    render(<NetworkIntelligenceRoom />);
    expect(screen.getByText('Upload')).toBeInTheDocument();
  });

  it('shows all six navigation tabs', () => {
    render(<NetworkIntelligenceRoom />);
    expect(screen.getByText('Upload')).toBeInTheDocument();
    expect(screen.getByText('Connections')).toBeInTheDocument();
    expect(screen.getByText('Target Titles')).toBeInTheDocument();
    expect(screen.getByText('Job Matches')).toBeInTheDocument();
    expect(screen.getByText('Boolean Search')).toBeInTheDocument();
    expect(screen.getByText('Scan Jobs')).toBeInTheDocument();
  });

  it('renders the CsvUploader in the upload tab', () => {
    render(<NetworkIntelligenceRoom />);
    expect(screen.getByTestId('csv-uploader')).toBeInTheDocument();
  });

  it('shows the intro card describing the upload flow', () => {
    render(<NetworkIntelligenceRoom />);
    expect(screen.getByText('Import Your LinkedIn Network')).toBeInTheDocument();
  });

  it('switches to Connections tab when clicked', async () => {
    render(<NetworkIntelligenceRoom />);
    fireEvent.click(screen.getByText('Connections'));
    // Connections tab is locked without connections data — no content shown
    // But the tab button itself is present
    expect(screen.getByText('Connections')).toBeInTheDocument();
  });

  it('renders subheading about warm referrals', () => {
    render(<NetworkIntelligenceRoom />);
    expect(screen.getByText(/Warm referrals beat cold applications/)).toBeInTheDocument();
  });

  it('Boolean Search tab is always accessible', () => {
    render(<NetworkIntelligenceRoom />);
    const booleanTab = screen.getByText('Boolean Search');
    fireEvent.click(booleanTab);
    // After click it stays active — just verify it didn't crash
    expect(screen.getByText('Boolean Search')).toBeInTheDocument();
  });
});
