// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TopMatchCard } from '../TopMatchCard';
import type { RadarJob } from '@/hooks/useRadarSearch';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/utils', () => ({
  cn: (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' '),
}));

vi.mock('lucide-react', () => ({
  Building2: () => <span data-testid="icon-building" />,
  MapPin: () => <span data-testid="icon-mappin" />,
}));

vi.mock('@/components/GlassButton', () => ({
  GlassButton: ({
    children,
    onClick,
    className,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
  }) => (
    <button onClick={onClick} className={className}>
      {children}
    </button>
  ),
}));

vi.mock('@/components/job-command-center/ScoreBadge', () => ({
  ScoreBadge: ({ score }: { score: number }) => (
    <span data-testid="score-badge">{score}</span>
  ),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeJob(overrides: Partial<RadarJob> = {}): RadarJob {
  return {
    external_id: 'jsearch_j1',
    title: 'VP of Engineering',
    company: 'Acme Corp',
    location: 'San Francisco, CA',
    salary_min: null,
    salary_max: null,
    description: null,
    posted_date: new Date().toISOString(),
    apply_url: null,
    source: 'jsearch',
    remote_type: null,
    employment_type: null,
    required_skills: null,
    match_score: 85,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('TopMatchCard — content rendering', () => {
  it('renders the job title', () => {
    render(<TopMatchCard job={makeJob({ title: 'Chief Technology Officer' })} onPromote={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByText('Chief Technology Officer')).toBeInTheDocument();
  });

  it('renders the company name', () => {
    render(<TopMatchCard job={makeJob({ company: 'Google' })} onPromote={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByText('Google')).toBeInTheDocument();
  });

  it('renders the score badge with correct score', () => {
    render(<TopMatchCard job={makeJob({ match_score: 92 })} onPromote={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByTestId('score-badge')).toHaveTextContent('92');
  });

  it('renders location when provided', () => {
    render(<TopMatchCard job={makeJob({ location: 'New York, NY' })} onPromote={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByText('New York, NY')).toBeInTheDocument();
  });

  it('does not render location section when location is null', () => {
    render(<TopMatchCard job={makeJob({ location: null })} onPromote={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.queryByTestId('icon-mappin')).not.toBeInTheDocument();
  });
});

describe('TopMatchCard — button callbacks', () => {
  it('calls onPromote with the full job object when Promote is clicked', () => {
    const onPromote = vi.fn();
    const job = makeJob();
    render(<TopMatchCard job={job} onPromote={onPromote} onDismiss={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /promote/i }));

    expect(onPromote).toHaveBeenCalledOnce();
    expect(onPromote).toHaveBeenCalledWith(job);
  });

  it('calls onDismiss with the external_id when Dismiss is clicked', () => {
    const onDismiss = vi.fn();
    render(<TopMatchCard job={makeJob({ external_id: 'jsearch_xyz' })} onPromote={vi.fn()} onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(onDismiss).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledWith('jsearch_xyz');
  });

  it('calls onSelect when card container is clicked and onSelect is provided', () => {
    const onSelect = vi.fn();
    const job = makeJob();
    render(<TopMatchCard job={job} onPromote={vi.fn()} onDismiss={vi.fn()} onSelect={onSelect} />);

    // The outermost div has role="button" when onSelect is provided.
    // Use querySelector to target the card container specifically.
    const cardDiv = document.querySelector('[role="button"]');
    expect(cardDiv).not.toBeNull();
    fireEvent.click(cardDiv!);

    expect(onSelect).toHaveBeenCalledWith(job);
  });
});
