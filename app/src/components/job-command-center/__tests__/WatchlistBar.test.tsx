// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { WatchlistBar } from '../WatchlistBar';
import type { WatchlistCompany } from '@/hooks/useWatchlist';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('lucide-react', () => ({
  Building2: () => <span data-testid="icon-building" />,
  Plus: () => <span data-testid="icon-plus" />,
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeCompany(id: string, name: string, priority = 5): WatchlistCompany {
  return {
    id,
    name,
    industry: 'Technology',
    website: null,
    careers_url: null,
    priority,
    source: 'manual',
    notes: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('WatchlistBar — company chips', () => {
  it('renders a chip for each company (up to 5)', () => {
    const companies = [
      makeCompany('c1', 'Google'),
      makeCompany('c2', 'Apple'),
      makeCompany('c3', 'Microsoft'),
    ];
    render(
      <WatchlistBar companies={companies} onSearchCompany={vi.fn()} onManage={vi.fn()} />,
    );

    expect(screen.getByText('Google')).toBeInTheDocument();
    expect(screen.getByText('Apple')).toBeInTheDocument();
    expect(screen.getByText('Microsoft')).toBeInTheDocument();
  });

  it('shows at most 5 companies even when more are provided', () => {
    const companies = Array.from({ length: 8 }, (_, i) =>
      makeCompany(`c${i}`, `Company ${i}`, 10 - i),
    );
    render(
      <WatchlistBar companies={companies} onSearchCompany={vi.fn()} onManage={vi.fn()} />,
    );

    // Each chip is a button with the company name — count them
    const buttons = screen.getAllByRole('button');
    // 5 company chips + 1 manage (Plus) button
    expect(buttons.length).toBeLessThanOrEqual(6);
  });

  it('calls onSearchCompany with the company name when a chip is clicked', () => {
    const onSearchCompany = vi.fn();
    const companies = [makeCompany('c1', 'Stripe')];
    render(
      <WatchlistBar companies={companies} onSearchCompany={onSearchCompany} onManage={vi.fn()} />,
    );

    fireEvent.click(screen.getByText('Stripe'));

    expect(onSearchCompany).toHaveBeenCalledOnce();
    expect(onSearchCompany).toHaveBeenCalledWith('Stripe');
  });
});

describe('WatchlistBar — empty state', () => {
  it('shows the empty state message when no companies', () => {
    render(<WatchlistBar companies={[]} onSearchCompany={vi.fn()} onManage={vi.fn()} />);
    expect(screen.getByText('Add target companies to watch')).toBeInTheDocument();
  });

  it('does not render company chips when companies list is empty', () => {
    render(<WatchlistBar companies={[]} onSearchCompany={vi.fn()} onManage={vi.fn()} />);
    // No buttons with company names — only the manage (Plus) button
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1); // only the + manage button
  });
});

describe('WatchlistBar — add/manage button', () => {
  it('renders the add/manage button', () => {
    render(<WatchlistBar companies={[]} onSearchCompany={vi.fn()} onManage={vi.fn()} />);
    // The plus button is always rendered
    expect(screen.getByTestId('icon-plus')).toBeInTheDocument();
  });

  it('calls onManage when the add button is clicked', () => {
    const onManage = vi.fn();
    render(<WatchlistBar companies={[]} onSearchCompany={vi.fn()} onManage={onManage} />);

    // The manage button contains the Plus icon
    const manageButton = screen.getByTitle('Manage watchlist');
    fireEvent.click(manageButton);

    expect(onManage).toHaveBeenCalledOnce();
  });
});

describe('WatchlistBar — priority ordering', () => {
  it('displays companies sorted by priority descending', () => {
    const companies = [
      makeCompany('c1', 'Low Priority', 1),
      makeCompany('c2', 'High Priority', 10),
      makeCompany('c3', 'Mid Priority', 5),
    ];
    render(
      <WatchlistBar companies={companies} onSearchCompany={vi.fn()} onManage={vi.fn()} />,
    );

    const buttons = screen.getAllByRole('button');
    // First company chip should be High Priority (sorted by priority desc)
    expect(buttons[0].textContent).toContain('High Priority');
  });
});
