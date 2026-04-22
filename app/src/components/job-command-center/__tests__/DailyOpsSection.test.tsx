// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { DailyOpsSection } from '../DailyOpsSection';
import type { DailyOpsData } from '@/hooks/useDailyOps';
import type { Application, DueAction } from '@/hooks/useJobApplications';

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

function makeData(overrides: Partial<DailyOpsData> = {}): DailyOpsData {
  return {
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
      />,
    );
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders interview count', () => {
    render(
      <DailyOpsSection
        data={makeData({ interviewCount: 2 })}
      />,
    );
    expect(screen.getByText('Interviewing')).toBeInTheDocument();
  });

  it('renders offer count', () => {
    render(
      <DailyOpsSection
        data={makeData({ offerCount: 1 })}
      />,
    );
    expect(screen.getByText('Offers')).toBeInTheDocument();
  });
});

describe('DailyOpsSection — focus stays on active work', () => {
  it('does not render the old top-matches discovery section', () => {
    render(<DailyOpsSection data={makeData()} />);
    expect(screen.queryByText('Top Matches')).not.toBeInTheDocument();
  });
});

describe('DailyOpsSection — due actions', () => {
  it('renders due action text', () => {
    const action = makeDueAction({ next_action: 'Send follow-up', company_name: 'Beta Inc' });
    render(
      <DailyOpsSection
        data={makeData({ dueActions: [action] })}
      />,
    );
    expect(screen.getByText('Send follow-up')).toBeInTheDocument();
    expect(screen.getByText('Beta Inc')).toBeInTheDocument();
  });

  it('shows "No upcoming actions due" when dueActions is empty', () => {
    render(
      <DailyOpsSection
        data={makeData({ dueActions: [] })}
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
      />,
    );
    expect(screen.getByText(/haven't been touched in 7\+ days/i)).toBeInTheDocument();
    expect(screen.getByText(/CTO at OldCo/i)).toBeInTheDocument();
  });

  it('does not show stale callout when staleApplications is empty', () => {
    render(
      <DailyOpsSection
        data={makeData({ staleApplications: [] })}
      />,
    );
    expect(screen.queryByTestId('icon-alert')).not.toBeInTheDocument();
  });
});

describe('DailyOpsSection — empty data', () => {
  it('renders without crashing when all data is empty', () => {
    expect(() =>
      render(
        <DailyOpsSection data={makeData()} />,
      ),
    ).not.toThrow();
  });
});
