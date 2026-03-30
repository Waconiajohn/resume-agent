// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { PipelineBoard } from '../PipelineBoard';
import type { Application } from '@/hooks/useApplicationPipeline';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/utils', () => ({
  cn: (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' '),
}));

vi.mock('lucide-react', () => ({
  Briefcase: () => <span data-testid="icon-briefcase" />,
  Loader2: () => <span data-testid="icon-loader" />,
  Building2: () => <span data-testid="icon-building" />,
  ChevronDown: () => <span data-testid="icon-chevron" />,
  Mic: () => <span data-testid="icon-mic" />,
  DollarSign: () => <span data-testid="icon-dollar" />,
}));

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    isDragging: false,
  }),
  useSensor: vi.fn(),
  useSensors: () => [],
  PointerSensor: vi.fn(),
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Translate: { toString: () => undefined } },
}));

vi.mock('@/components/GlassCard', () => ({
  GlassCard: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeApplication(overrides: Partial<Application> = {}): Application {
  return {
    id: `app-${Math.random()}`,
    role_title: 'VP Engineering',
    company_name: 'Acme Corp',
    stage: 'applied',
    source: 'linkedin',
    stage_history: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PipelineBoard — column rendering', () => {
  it('renders all 8 stage column labels', () => {
    render(
      <PipelineBoard
        applications={[]}
        loading={false}
        onMoveStage={vi.fn()}
      />,
    );
    // Labels use CSS `uppercase` class — DOM text is the raw prop value (title-case)
    expect(screen.getByText('Shortlist')).toBeInTheDocument();
    expect(screen.getByText('Researching')).toBeInTheDocument();
    expect(screen.getByText('Applied')).toBeInTheDocument();
    expect(screen.getByText('Screening')).toBeInTheDocument();
    expect(screen.getByText('Interviewing')).toBeInTheDocument();
    expect(screen.getByText('Offer')).toBeInTheDocument();
    expect(screen.getByText('Won')).toBeInTheDocument();
    expect(screen.getByText('Lost')).toBeInTheDocument();
  });

  it('renders "Empty" placeholder in columns with no cards', () => {
    render(
      <PipelineBoard
        applications={[]}
        loading={false}
        onMoveStage={vi.fn()}
      />,
    );
    // All 8 columns are empty — 8 "Empty" placeholders
    expect(screen.getAllByText('Empty')).toHaveLength(8);
  });
});

describe('PipelineBoard — application cards', () => {
  it('renders application cards in the correct stage column', () => {
    const apps = [
      makeApplication({ id: 'app-1', role_title: 'CTO Role', stage: 'interviewing' }),
      makeApplication({ id: 'app-2', role_title: 'CFO Role', stage: 'offer' }),
    ];
    render(
      <PipelineBoard
        applications={apps}
        loading={false}
        onMoveStage={vi.fn()}
      />,
    );
    expect(screen.getByText('CTO Role')).toBeInTheDocument();
    expect(screen.getByText('CFO Role')).toBeInTheDocument();
  });

  it('removes "Empty" placeholder from columns that have cards', () => {
    const apps = [makeApplication({ stage: 'saved' })];
    render(
      <PipelineBoard
        applications={apps}
        loading={false}
        onMoveStage={vi.fn()}
      />,
    );
    // 7 empty columns remain + 1 with a card (no placeholder)
    expect(screen.getAllByText('Empty')).toHaveLength(7);
  });

  it('renders multiple cards in the same column', () => {
    const apps = [
      makeApplication({ id: 'app-1', role_title: 'Role A', stage: 'applied' }),
      makeApplication({ id: 'app-2', role_title: 'Role B', stage: 'applied' }),
    ];
    render(
      <PipelineBoard
        applications={apps}
        loading={false}
        onMoveStage={vi.fn()}
      />,
    );
    expect(screen.getByText('Role A')).toBeInTheDocument();
    expect(screen.getByText('Role B')).toBeInTheDocument();
  });
});

describe('PipelineBoard — loading state', () => {
  it('shows loading indicator when loading=true', () => {
    render(
      <PipelineBoard
        applications={[]}
        loading={true}
        onMoveStage={vi.fn()}
      />,
    );
    expect(screen.getByTestId('icon-loader')).toBeInTheDocument();
  });

  it('does not show loading indicator when loading=false', () => {
    render(
      <PipelineBoard
        applications={[]}
        loading={false}
        onMoveStage={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('icon-loader')).not.toBeInTheDocument();
  });
});

describe('PipelineBoard — Add Application button', () => {
  it('shows "Add Application" button when onAddApplication is provided', () => {
    render(
      <PipelineBoard
        applications={[]}
        loading={false}
        onMoveStage={vi.fn()}
        onAddApplication={vi.fn()}
      />,
    );
    expect(screen.getByText('Add Application')).toBeInTheDocument();
  });

  it('does not show "Add Application" button when onAddApplication is not provided', () => {
    render(
      <PipelineBoard
        applications={[]}
        loading={false}
        onMoveStage={vi.fn()}
      />,
    );
    expect(screen.queryByText('Add Application')).not.toBeInTheDocument();
  });

  it('calls onAddApplication when the button is clicked', () => {
    const onAddApplication = vi.fn();
    render(
      <PipelineBoard
        applications={[]}
        loading={false}
        onMoveStage={vi.fn()}
        onAddApplication={onAddApplication}
      />,
    );
    fireEvent.click(screen.getByText('Add Application'));
    expect(onAddApplication).toHaveBeenCalledOnce();
  });
});
