// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { DailyOpsSection } from '../DailyOpsSection';
import type { DailyOpsData } from '@/hooks/useDailyOps';
import type { Application, DueAction } from '@/hooks/useApplicationPipeline';
import type { RadarJob } from '@/hooks/useRadarSearch';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/utils', () => ({
  cn: (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' '),
}));

vi.mock('lucide-react', () => ({
  Clock: () => <span data-testid="icon-clock" />,
  Building2: () => <span data-testid="icon-building" />,
  Star: () => <span data-testid="icon-star" />,
  AlertTriangle: () => <span data-testid="icon-alert" />,
  MapPin: () => <span data-testid="icon-mappin" />,
}));

vi.mock('@/components/GlassCard', () => ({
  GlassCard: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

vi.mock('@/components/GlassButton', () => ({
  GlassButton: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

vi.mock('@/components/job-command-center/ScoreBadge', () => ({
  ScoreBadge: ({ score }: { score: number }) => (
    <span data-testid="score-badge">{score}</span>
  ),
}));

vi.mock('@/components/job-command-center/TopMatchCard', () => ({
  TopMatchCard: ({ job, onPromote, onDismiss }: {
    job: RadarJob;
    onPromote: (j: RadarJob) => void;
    onDismiss: (id: string) => void;
  }) => (
    <div data-testid={`top-match-${job.external_id}`}>
      <span>{job.title}</span>
      <button onClick={() => onPromote(job)}>Promote</button>
      <button onClick={() => onDismiss(job.external_id)}>Dismiss</button>
    </div>
  ),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeApp(overrides: Partial<Application> = {}): Application {
  return {
    id: 'app-1',
    role_title: 'CTO',
    company_name: 'Acme Corp',
    stage: 'applied',
    source: 'linkedin',
    stage_history: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeDueAction(overrides: Partial<DueAction> = {}): DueAction {
  return {
    id: 'due-1',
    role_title: 'CTO',
    company_name: 'Acme Corp',
    next_action: 'Send follow-up email',
    next_action_due: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days out
    stage: 'applied',
    ...overrides,
  };
}

function makeRadarJob(id: string, score = 85): RadarJob {
  return {
    external_id: id,
    title: 'VP Engineering',
    company: 'Acme Corp',
    location: null,
    salary_min: null,
    salary_max: null,
    description: null,
    posted_date: new Date().toISOString(),
    apply_url: null,
    source: 'jsearch',
    remote_type: null,
    employment_type: null,
    required_skills: null,
    match_score: score,
  };
}

function makeData(overrides: Partial<DailyOpsData> = {}): DailyOpsData {
  return {
    topMatches: [],
    dueActions: [],
    staleApplications: [],
    activeCount: 0,
    interviewCount: 0,
    offerCount: 0,
    loading: false,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('DailyOpsSection — quick stats bar', () => {
  it('renders active count', () => {
    render(
      <DailyOpsSection
        data={makeData({ activeCount: 4 })}
        onPromoteJob={vi.fn()}
        onDismissJob={vi.fn()}
      />,
    );
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders interview count', () => {
    render(
      <DailyOpsSection
        data={makeData({ interviewCount: 2 })}
        onPromoteJob={vi.fn()}
        onDismissJob={vi.fn()}
      />,
    );
    expect(screen.getByText('Interviewing')).toBeInTheDocument();
  });

  it('renders offer count', () => {
    render(
      <DailyOpsSection
        data={makeData({ offerCount: 1 })}
        onPromoteJob={vi.fn()}
        onDismissJob={vi.fn()}
      />,
    );
    expect(screen.getByText('Offers')).toBeInTheDocument();
  });
});

describe('DailyOpsSection — top match cards', () => {
  it('renders a TopMatchCard for each top match', () => {
    const jobs = [makeRadarJob('j1'), makeRadarJob('j2')];
    render(
      <DailyOpsSection
        data={makeData({ topMatches: jobs })}
        onPromoteJob={vi.fn()}
        onDismissJob={vi.fn()}
      />,
    );
    expect(screen.getByTestId('top-match-j1')).toBeInTheDocument();
    expect(screen.getByTestId('top-match-j2')).toBeInTheDocument();
  });

  it('shows empty matches message when topMatches is empty', () => {
    render(
      <DailyOpsSection
        data={makeData({ topMatches: [] })}
        onPromoteJob={vi.fn()}
        onDismissJob={vi.fn()}
      />,
    );
    expect(screen.getByText(/no scored matches yet/i)).toBeInTheDocument();
  });
});

describe('DailyOpsSection — due actions', () => {
  it('renders due action text', () => {
    const action = makeDueAction({ next_action: 'Send follow-up', company_name: 'Beta Inc' });
    render(
      <DailyOpsSection
        data={makeData({ dueActions: [action] })}
        onPromoteJob={vi.fn()}
        onDismissJob={vi.fn()}
      />,
    );
    expect(screen.getByText('Send follow-up')).toBeInTheDocument();
    expect(screen.getByText('Beta Inc')).toBeInTheDocument();
  });

  it('shows "No upcoming actions due" when dueActions is empty', () => {
    render(
      <DailyOpsSection
        data={makeData({ dueActions: [] })}
        onPromoteJob={vi.fn()}
        onDismissJob={vi.fn()}
      />,
    );
    expect(screen.getByText(/no upcoming actions due/i)).toBeInTheDocument();
  });
});

describe('DailyOpsSection — stale applications callout', () => {
  it('shows stale callout when staleApplications is non-empty', () => {
    const stale = [makeApp({ id: 'stale-1', role_title: 'CTO', company_name: 'OldCo' })];
    render(
      <DailyOpsSection
        data={makeData({ staleApplications: stale })}
        onPromoteJob={vi.fn()}
        onDismissJob={vi.fn()}
      />,
    );
    expect(screen.getByText(/haven't been touched in 7\+ days/i)).toBeInTheDocument();
    expect(screen.getByText(/CTO at OldCo/i)).toBeInTheDocument();
  });

  it('does not show stale callout when staleApplications is empty', () => {
    render(
      <DailyOpsSection
        data={makeData({ staleApplications: [] })}
        onPromoteJob={vi.fn()}
        onDismissJob={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('icon-alert')).not.toBeInTheDocument();
  });
});

describe('DailyOpsSection — empty data', () => {
  it('renders without crashing when all data is empty', () => {
    expect(() =>
      render(
        <DailyOpsSection
          data={makeData()}
          onPromoteJob={vi.fn()}
          onDismissJob={vi.fn()}
        />,
      ),
    ).not.toThrow();
  });
});
