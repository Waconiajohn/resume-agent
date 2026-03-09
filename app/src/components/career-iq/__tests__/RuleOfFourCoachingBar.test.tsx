// @vitest-environment jsdom
/**
 * RuleOfFourCoachingBar component — unit tests.
 *
 * Sprint 63 — Coaching Discipline.
 * Tests: renders nothing when all groups complete, shows incomplete applications,
 * lists missing roles as clickable chips, caps display at 5 groups,
 * calls onFixGap with correct args.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/components/GlassCard', () => ({
  GlassCard: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="glass-card" className={className}>{children}</div>
  ),
}));

vi.mock('@/lib/utils', () => ({
  cn: (...args: string[]) => args.filter(Boolean).join(' '),
}));

vi.mock('@/hooks/useRuleOfFour', () => ({
  CONTACT_ROLE_LABELS: {
    hiring_manager: 'Hiring Manager',
    team_leader: 'Team Leader',
    peer: 'Peer',
    hr_recruiter: 'HR / Recruiter',
  },
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { RuleOfFourCoachingBar } from '../RuleOfFourCoachingBar';
import type { RuleOfFourGroup } from '@/hooks/useRuleOfFour';
import type { Application } from '@/hooks/useApplicationPipeline';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeApplication(overrides: Partial<Application> = {}): Application {
  return {
    id: 'app-1',
    role_title: 'Engineering Director',
    company_name: 'Acme Corp',
    stage: 'applied',
    source: 'manual',
    stage_history: [],
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeGroup(
  progress: number,
  missingRoles: string[],
  appOverrides: Partial<Application> = {},
): RuleOfFourGroup {
  return {
    application: makeApplication(appOverrides),
    contacts: [],
    progress,
    missingRoles: missingRoles as RuleOfFourGroup['missingRoles'],
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ─── Rendering ────────────────────────────────────────────────────────────────

describe('RuleOfFourCoachingBar — rendering', () => {
  it('renders nothing when all groups are complete (progress = 4)', () => {
    const groups = [
      makeGroup(4, []),
      makeGroup(4, []),
    ];
    const { container } = render(
      <RuleOfFourCoachingBar groups={groups} onFixGap={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when groups is empty', () => {
    const { container } = render(
      <RuleOfFourCoachingBar groups={[]} onFixGap={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders when at least one group is incomplete', () => {
    const groups = [makeGroup(2, ['team_leader', 'hr_recruiter'])];
    render(<RuleOfFourCoachingBar groups={groups} onFixGap={vi.fn()} />);
    expect(screen.getByTestId('glass-card')).toBeInTheDocument();
  });

  it('renders alert icon label', () => {
    const groups = [makeGroup(1, ['hiring_manager', 'team_leader', 'peer'])];
    render(<RuleOfFourCoachingBar groups={groups} onFixGap={vi.fn()} />);
    // The header shows "N application(s) need(s) more contacts"
    expect(screen.getByText(/needs more contacts/)).toBeInTheDocument();
  });
});

// ─── Incomplete count display ─────────────────────────────────────────────────

describe('RuleOfFourCoachingBar — count display', () => {
  it('shows "1 application needs more contacts" for 1 incomplete group', () => {
    const groups = [makeGroup(2, ['peer', 'hr_recruiter'])];
    render(<RuleOfFourCoachingBar groups={groups} onFixGap={vi.fn()} />);
    expect(screen.getByText(/1 application needs more contacts/)).toBeInTheDocument();
  });

  it('shows "2 applications need more contacts" for 2 incomplete groups', () => {
    const groups = [
      makeGroup(2, ['peer']),
      makeGroup(0, ['hiring_manager', 'team_leader', 'peer', 'hr_recruiter']),
    ];
    render(<RuleOfFourCoachingBar groups={groups} onFixGap={vi.fn()} />);
    expect(screen.getByText(/2 applications need more contacts/)).toBeInTheDocument();
  });

  it('excludes complete groups from count', () => {
    const groups = [
      makeGroup(4, []), // complete
      makeGroup(2, ['peer', 'hr_recruiter']), // incomplete
    ];
    render(<RuleOfFourCoachingBar groups={groups} onFixGap={vi.fn()} />);
    expect(screen.getByText(/1 application needs more contacts/)).toBeInTheDocument();
  });
});

// ─── Company names ────────────────────────────────────────────────────────────

describe('RuleOfFourCoachingBar — company names', () => {
  it('shows company name for each incomplete application', () => {
    const groups = [
      makeGroup(2, ['peer'], { id: 'app-1', company_name: 'Acme Corp' }),
      makeGroup(1, ['team_leader', 'hr_recruiter'], { id: 'app-2', company_name: 'Beta Co' }),
    ];
    render(<RuleOfFourCoachingBar groups={groups} onFixGap={vi.fn()} />);
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('Beta Co')).toBeInTheDocument();
  });
});

// ─── Missing role chips ───────────────────────────────────────────────────────

describe('RuleOfFourCoachingBar — missing role chips', () => {
  it('renders missing role label as a button', () => {
    const groups = [makeGroup(3, ['hr_recruiter'])];
    render(<RuleOfFourCoachingBar groups={groups} onFixGap={vi.fn()} />);
    expect(screen.getByText('HR / Recruiter')).toBeInTheDocument();
  });

  it('renders multiple missing roles as separate buttons', () => {
    const groups = [makeGroup(1, ['team_leader', 'peer', 'hr_recruiter'])];
    render(<RuleOfFourCoachingBar groups={groups} onFixGap={vi.fn()} />);
    expect(screen.getByText('Team Leader')).toBeInTheDocument();
    expect(screen.getByText('Peer')).toBeInTheDocument();
    expect(screen.getByText('HR / Recruiter')).toBeInTheDocument();
  });

  it('calls onFixGap with correct applicationId and role when chip is clicked', () => {
    const onFixGap = vi.fn();
    const groups = [
      makeGroup(2, ['team_leader', 'hr_recruiter'], { id: 'app-42' }),
    ];
    render(<RuleOfFourCoachingBar groups={groups} onFixGap={onFixGap} />);

    fireEvent.click(screen.getByText('Team Leader'));

    expect(onFixGap).toHaveBeenCalledWith('app-42', 'team_leader');
  });

  it('calls onFixGap with correct role when second chip is clicked', () => {
    const onFixGap = vi.fn();
    const groups = [makeGroup(2, ['peer', 'hr_recruiter'], { id: 'app-5' })];
    render(<RuleOfFourCoachingBar groups={groups} onFixGap={onFixGap} />);

    fireEvent.click(screen.getByText('HR / Recruiter'));

    expect(onFixGap).toHaveBeenCalledWith('app-5', 'hr_recruiter');
  });
});

// ─── Display cap ─────────────────────────────────────────────────────────────

describe('RuleOfFourCoachingBar — 5 group cap', () => {
  it('shows at most 5 incomplete groups', () => {
    const groups = Array.from({ length: 8 }, (_, i) =>
      makeGroup(0, ['hiring_manager'], { id: `app-${i}`, company_name: `Company ${i}` }),
    );
    render(<RuleOfFourCoachingBar groups={groups} onFixGap={vi.fn()} />);

    // Only first 5 should be rendered
    expect(screen.getByText('Company 0')).toBeInTheDocument();
    expect(screen.getByText('Company 4')).toBeInTheDocument();
    expect(screen.queryByText('Company 5')).not.toBeInTheDocument();
    expect(screen.queryByText('Company 7')).not.toBeInTheDocument();
  });

  it('shows all incomplete groups when <= 5', () => {
    const groups = Array.from({ length: 3 }, (_, i) =>
      makeGroup(1, ['team_leader'], { id: `app-${i}`, company_name: `Corp ${i}` }),
    );
    render(<RuleOfFourCoachingBar groups={groups} onFixGap={vi.fn()} />);

    expect(screen.getByText('Corp 0')).toBeInTheDocument();
    expect(screen.getByText('Corp 1')).toBeInTheDocument();
    expect(screen.getByText('Corp 2')).toBeInTheDocument();
  });
});

// ─── Mixed complete/incomplete ────────────────────────────────────────────────

describe('RuleOfFourCoachingBar — mixed groups', () => {
  it('does not render rows for complete groups', () => {
    const groups = [
      makeGroup(4, [], { id: 'app-complete', company_name: 'Done Corp' }),
      makeGroup(2, ['peer'], { id: 'app-incomplete', company_name: 'Pending Corp' }),
    ];
    render(<RuleOfFourCoachingBar groups={groups} onFixGap={vi.fn()} />);

    // Done Corp should NOT appear (complete)
    expect(screen.queryByText('Done Corp')).not.toBeInTheDocument();
    // Pending Corp should appear (incomplete)
    expect(screen.getByText('Pending Corp')).toBeInTheDocument();
  });
});
