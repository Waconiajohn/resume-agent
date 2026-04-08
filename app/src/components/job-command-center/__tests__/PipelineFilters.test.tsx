// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { PipelineFilters } from '../PipelineFilters';
import type { PipelineStage } from '@/hooks/useApplicationPipeline';

vi.mock('@/lib/utils', () => ({
  cn: (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' '),
}));

vi.mock('lucide-react', () => ({
  Search: () => <span data-testid="icon-search" />,
  Filter: () => <span data-testid="icon-filter" />,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderFilters(
  overrides: Partial<{
    searchText: string;
    onSearchChange: (text: string) => void;
    activeStageFilter: PipelineStage | 'all';
    onStageFilterChange: (stage: PipelineStage | 'all') => void;
  }> = {},
) {
  const defaults = {
    searchText: '',
    onSearchChange: vi.fn(),
    activeStageFilter: 'all' as PipelineStage | 'all',
    onStageFilterChange: vi.fn(),
  };
  return render(<PipelineFilters {...defaults} {...overrides} />);
}

describe('PipelineFilters — search input', () => {
  it('renders the search input with placeholder text', () => {
    renderFilters();
    expect(screen.getByPlaceholderText('Search applications...')).toBeInTheDocument();
  });

  it('reflects the current searchText value', () => {
    renderFilters({ searchText: 'Acme' });
    const input = screen.getByPlaceholderText('Search applications...') as HTMLInputElement;
    expect(input.value).toBe('Acme');
  });

  it('calls onSearchChange when user types in the search input', () => {
    const onSearchChange = vi.fn();
    renderFilters({ onSearchChange });
    fireEvent.change(screen.getByPlaceholderText('Search applications...'), {
      target: { value: 'google' },
    });
    expect(onSearchChange).toHaveBeenCalledOnce();
    expect(onSearchChange).toHaveBeenCalledWith('google');
  });
});

describe('PipelineFilters — stage filter pills', () => {
  it('renders all expected stage filter pills', () => {
    renderFilters();
    const expectedLabels = ['All', 'Shortlist', 'Researching', 'Applied', 'Screening', 'Interviewing', 'Offer'];
    for (const label of expectedLabels) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('calls onStageFilterChange with "all" when All pill is clicked', () => {
    const onStageFilterChange = vi.fn();
    renderFilters({ onStageFilterChange });
    fireEvent.click(screen.getByText('All'));
    expect(onStageFilterChange).toHaveBeenCalledWith('all');
  });

  it('calls onStageFilterChange with correct stage when a stage pill is clicked', () => {
    const onStageFilterChange = vi.fn();
    renderFilters({ onStageFilterChange });
    fireEvent.click(screen.getByText('Interviewing'));
    expect(onStageFilterChange).toHaveBeenCalledWith('interviewing');
  });

  it('applies active color class to the currently active stage filter', () => {
    renderFilters({ activeStageFilter: 'applied' });
    const appliedButton = screen.getByText('Applied');
    expect(appliedButton.className).toContain('text-[var(--link)]');
  });

  it('applies inactive color class to non-active pills', () => {
    renderFilters({ activeStageFilter: 'applied' });
    const allButton = screen.getByText('All');
    expect(allButton.className).toContain('text-[var(--text-soft)]');
  });

  it('applies active class to "All" pill when activeStageFilter is "all"', () => {
    renderFilters({ activeStageFilter: 'all' });
    const allButton = screen.getByText('All');
    expect(allButton.className).toContain('text-[var(--link)]');
  });
});
