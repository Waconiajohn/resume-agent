// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { RadarSection } from '../RadarSection';
import type { RadarJob } from '@/hooks/useRadarSearch';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/utils', () => ({
  cn: (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' '),
}));

vi.mock('lucide-react', () => ({
  Search: () => <span data-testid="icon-search" />,
  MapPin: () => <span data-testid="icon-mappin" />,
  Building2: () => <span data-testid="icon-building" />,
  DollarSign: () => <span data-testid="icon-dollar" />,
  Star: () => <span data-testid="icon-star" />,
  X: () => <span data-testid="icon-x" />,
  Plus: () => <span data-testid="icon-plus" />,
  Loader2: () => <span data-testid="icon-loader" />,
  Sparkles: () => <span data-testid="icon-sparkles" />,
  Users: () => <span data-testid="icon-users" />,
  ExternalLink: () => <span data-testid="icon-external-link" />,
  FileText: () => <span data-testid="icon-filetext" />,
  AlertCircle: () => <span data-testid="icon-alert-circle" />,
}));

vi.mock('@/components/GlassCard', () => ({
  GlassCard: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
}));

vi.mock('@/components/GlassButton', () => ({
  GlassButton: ({
    children,
    onClick,
    disabled,
    className,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
  }) => (
    <button onClick={onClick} disabled={disabled} className={className}>
      {children}
    </button>
  ),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeJob(id: string, overrides: Partial<RadarJob> = {}): RadarJob {
  return {
    external_id: `jsearch_${id}`,
    title: 'VP of Engineering',
    company: 'Acme Corp',
    location: 'San Francisco, CA',
    salary_min: null,
    salary_max: null,
    description: 'Lead engineering teams.',
    posted_date: new Date().toISOString(),
    apply_url: null,
    source: 'jsearch',
    remote_type: null,
    employment_type: null,
    required_skills: null,
    match_score: null,
    ...overrides,
  };
}

function defaultProps(overrides: Partial<React.ComponentProps<typeof RadarSection>> = {}) {
  return {
    jobs: [],
    loading: false,
    error: null,
    onSearch: vi.fn(),
    onDismiss: vi.fn(),
    onPromote: vi.fn(),
    // Phase 2.2.1 — controlled props (formerly inner-state). Defaults mirror
    // the default freshness window driven by the outer JobFilterPanel.
    location: '',
    datePosted: '7d' as const,
    remoteType: 'any' as const,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('RadarSection — search inputs', () => {
  it('renders the job title search input', () => {
    render(<RadarSection {...defaultProps()} />);
    expect(screen.getByPlaceholderText('Job title, keywords...')).toBeInTheDocument();
  });

  // Phase 2.2.1 — Location / Date Posted / Remote Type are now controlled by
  // the outer JobFilterPanel and no longer rendered inside RadarSection.
});

describe('RadarSection — job result cards', () => {
  it('renders a card with the job title', () => {
    const job = makeJob('j1', { title: 'Chief Technology Officer' });
    render(<RadarSection {...defaultProps({ jobs: [job] })} />);
    expect(screen.getByText('Chief Technology Officer')).toBeInTheDocument();
  });

  it('renders the company name', () => {
    const job = makeJob('j1', { company: 'Google' });
    render(<RadarSection {...defaultProps({ jobs: [job] })} />);
    expect(screen.getByText('Google')).toBeInTheDocument();
  });

  it('renders the job location when provided', () => {
    const job = makeJob('j1', { location: 'New York, NY' });
    render(<RadarSection {...defaultProps({ jobs: [job] })} />);
    expect(screen.getByText('New York, NY')).toBeInTheDocument();
  });

  it('renders results count when jobs are present', () => {
    const jobs = [makeJob('j1'), makeJob('j2'), makeJob('j3')];
    render(<RadarSection {...defaultProps({ jobs })} />);
    expect(screen.getByText('3 results')).toBeInTheDocument();
  });

  it('renders a Promote button for each job', () => {
    const jobs = [makeJob('j1'), makeJob('j2')];
    render(<RadarSection {...defaultProps({ jobs })} />);
    const promoteButtons = screen.getAllByRole('button', { name: /^save$/i });
    expect(promoteButtons).toHaveLength(2);
  });

  it('renders a Dismiss button for each job', () => {
    const jobs = [makeJob('j1'), makeJob('j2')];
    render(<RadarSection {...defaultProps({ jobs })} />);
    const dismissButtons = screen.getAllByRole('button', { name: /dismiss/i });
    expect(dismissButtons).toHaveLength(2);
  });

  it('renders an Open Job link when apply_url is provided', () => {
    const job = makeJob('j1', { apply_url: 'https://example.com/job' });
    render(<RadarSection {...defaultProps({ jobs: [job] })} />);
    expect(screen.getByRole('link', { name: /open job/i })).toHaveAttribute('href', 'https://example.com/job');
  });

  it('renders a Tailor Resume button when the handler is provided', () => {
    const job = makeJob('j1');
    render(<RadarSection {...defaultProps({ jobs: [job], onBuildResume: vi.fn() })} />);
    expect(screen.getByRole('button', { name: /tailor resume/i })).toBeInTheDocument();
  });
});

describe('RadarSection — loading state', () => {
  it('shows loading indicator when loading is true', () => {
    render(<RadarSection {...defaultProps({ loading: true })} />);
    // The search button is disabled during loading
    const searchButton = screen.getByRole('button', { name: /searching/i });
    expect(searchButton).toBeDisabled();
  });
});

describe('RadarSection — error state', () => {
  it('displays the error message when error is set', () => {
    render(<RadarSection {...defaultProps({ error: 'Search service unavailable' })} />);
    expect(screen.getByText('Search service unavailable')).toBeInTheDocument();
  });
});

describe('RadarSection — empty state', () => {
  it('shows the empty state message when no jobs and not loading', () => {
    render(<RadarSection {...defaultProps()} />);
    expect(
      screen.getByText(/search fresh job listings here/i),
    ).toBeInTheDocument();
  });

  it('shows a completed no-results message after a search returns no jobs', () => {
    render(<RadarSection {...defaultProps({
      hasSearched: true,
      lastQuery: 'VP Operations',
      lastLocation: 'Dallas, TX',
      emptyReason: 'No jobs came back from the provider for this title and location.',
      sourcesQueried: ['serper'],
      executionTimeMs: 1400,
    })} />);

    expect(screen.getByText(/no verified jobs found for "VP Operations"/i)).toBeInTheDocument();
    expect(screen.getByText(/no jobs came back/i)).toBeInTheDocument();
    expect(screen.queryByText(/sources:/i)).not.toBeInTheDocument();
  });
});

describe('RadarSection — button callbacks', () => {
  it('calls onPromote with the job data when Promote is clicked', () => {
    const onPromote = vi.fn();
    const job = makeJob('j1');
    render(<RadarSection {...defaultProps({ jobs: [job], onPromote })} />);

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(onPromote).toHaveBeenCalledOnce();
    expect(onPromote).toHaveBeenCalledWith(job);
  });

  it('calls onDismiss with the external_id when Dismiss is clicked', () => {
    const onDismiss = vi.fn();
    const job = makeJob('j1');
    render(<RadarSection {...defaultProps({ jobs: [job], onDismiss })} />);

    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(onDismiss).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledWith('jsearch_j1');
  });

  it('calls onBuildResume with the job data when Tailor Resume is clicked', () => {
    const onBuildResume = vi.fn();
    const job = makeJob('j1');
    render(<RadarSection {...defaultProps({ jobs: [job], onBuildResume })} />);

    fireEvent.click(screen.getByRole('button', { name: /tailor resume/i }));

    expect(onBuildResume).toHaveBeenCalledOnce();
    expect(onBuildResume).toHaveBeenCalledWith(job);
  });

  it('calls onSearch when Enter key is pressed in the query input', () => {
    const onSearch = vi.fn();
    render(<RadarSection {...defaultProps({ onSearch })} />);

    const input = screen.getByPlaceholderText('Job title, keywords...');
    fireEvent.change(input, { target: { value: 'CTO' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSearch).toHaveBeenCalledOnce();
    expect(onSearch).toHaveBeenCalledWith('CTO', '', expect.any(Object));
  });
});
