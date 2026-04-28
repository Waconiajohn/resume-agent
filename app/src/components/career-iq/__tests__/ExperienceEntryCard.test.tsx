// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup, waitFor } from '@testing-library/react';
import { ExperienceEntryCard } from '../ExperienceEntryCard';
import type { ExperienceEntry } from '@/hooks/useLinkedInOptimizer';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/utils', () => ({
  cn: (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' '),
}));

// ─── Factories ────────────────────────────────────────────────────────────────

function makeEntry(overrides?: Partial<ExperienceEntry>): ExperienceEntry {
  return {
    role_id: 'role-1',
    title: 'VP of Engineering',
    company: 'Acme Corp',
    duration: 'Jan 2020 – Present',
    original: 'Led a team of engineers.',
    optimized: 'Scaled engineering org from 8 to 45 engineers across 6 product teams, reducing time-to-deploy by 60%.',
    quality_scores: {
      impact: 85,
      metrics: 90,
      context: 78,
      keywords: 72,
    },
    ...overrides,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getExpandButton(container: HTMLElement = document.body): HTMLButtonElement {
  // The expand/collapse button has aria-expanded attribute
  const btn = container.querySelector('button[aria-expanded]');
  if (!btn) throw new Error('Expand button not found');
  return btn as HTMLButtonElement;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

// ─── Header content (always visible) ─────────────────────────────────────────

describe('ExperienceEntryCard — header content (collapsed state)', () => {
  it('renders the job title', () => {
    render(<ExperienceEntryCard entry={makeEntry()} />);
    expect(screen.getByText('VP of Engineering')).toBeInTheDocument();
  });

  it('renders the company name', () => {
    render(<ExperienceEntryCard entry={makeEntry()} />);
    expect(screen.getByText(/Acme Corp/)).toBeInTheDocument();
  });

  it('renders the duration when provided', () => {
    render(<ExperienceEntryCard entry={makeEntry()} />);
    expect(screen.getByText(/Jan 2020 – Present/)).toBeInTheDocument();
  });

  it('omits the duration separator when duration is empty string', () => {
    render(<ExperienceEntryCard entry={makeEntry({ duration: '' })} />);
    expect(screen.queryByText(/·/)).not.toBeInTheDocument();
  });

  it('starts collapsed — optimized content is not visible', () => {
    const entry = makeEntry();
    render(<ExperienceEntryCard entry={entry} />);
    // The <pre> with optimized content should not be in the DOM
    const pre = document.querySelector('pre');
    expect(pre).not.toBeInTheDocument();
  });

  it('shows compact score numbers in the collapsed header', () => {
    const entry = makeEntry({
      quality_scores: { impact: 85, metrics: 90, context: 78, keywords: 72 },
    });
    render(<ExperienceEntryCard entry={entry} />);
    // Compact badges show score numbers only (no labels) in collapsed state
    expect(screen.getByText('85')).toBeInTheDocument();
    expect(screen.getByText('90')).toBeInTheDocument();
    expect(screen.getByText('78')).toBeInTheDocument();
    expect(screen.getByText('72')).toBeInTheDocument();
  });

  it('header button has aria-expanded="false" when collapsed', () => {
    render(<ExperienceEntryCard entry={makeEntry()} />);
    const btn = getExpandButton();
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });
});

// ─── Expand / collapse ────────────────────────────────────────────────────────

describe('ExperienceEntryCard — expand / collapse', () => {
  it('expands when header is clicked', () => {
    const entry = makeEntry();
    render(<ExperienceEntryCard entry={entry} />);
    const btn = getExpandButton();

    fireEvent.click(btn);

    const pre = document.querySelector('pre');
    expect(pre).toBeInTheDocument();
  });

  it('shows optimized content after expanding', () => {
    const entry = makeEntry();
    render(<ExperienceEntryCard entry={entry} />);

    fireEvent.click(getExpandButton());

    expect(screen.getByText(entry.optimized)).toBeInTheDocument();
  });

  it('collapses again when header is clicked a second time', () => {
    render(<ExperienceEntryCard entry={makeEntry()} />);
    const btn = getExpandButton();

    fireEvent.click(btn); // expand
    expect(document.querySelector('pre')).toBeInTheDocument();

    fireEvent.click(btn); // collapse
    expect(document.querySelector('pre')).not.toBeInTheDocument();
  });

  it('aria-expanded toggles between false and true', () => {
    render(<ExperienceEntryCard entry={makeEntry()} />);
    const btn = getExpandButton();

    expect(btn.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  it('shows labeled score badges in expanded body', () => {
    render(<ExperienceEntryCard entry={makeEntry()} />);
    fireEvent.click(getExpandButton());

    expect(screen.getByText(/Impact 85/)).toBeInTheDocument();
    expect(screen.getByText(/Metrics 90/)).toBeInTheDocument();
    expect(screen.getByText(/Context 78/)).toBeInTheDocument();
    expect(screen.getByText(/Keywords 72/)).toBeInTheDocument();
  });
});

// ─── Quality score badges (expanded) ─────────────────────────────────────────

describe('ExperienceEntryCard — quality score badges (expanded)', () => {
  it('applies green color class for scores >= 80', () => {
    const entry = makeEntry({
      quality_scores: { impact: 80, metrics: 95, context: 82, keywords: 100 },
    });
    render(<ExperienceEntryCard entry={entry} />);
    fireEvent.click(getExpandButton());

    const impactBadge = screen.getByText(/Impact 80/);
    expect(impactBadge.className).toContain('text-[var(--badge-green-text)]');
    expect(impactBadge.className).toContain('bg-[var(--badge-green-text)]/10');
  });

  it('applies yellow color class for scores in range 60–79', () => {
    const entry = makeEntry({
      quality_scores: { impact: 60, metrics: 79, context: 65, keywords: 70 },
    });
    render(<ExperienceEntryCard entry={entry} />);
    fireEvent.click(getExpandButton());

    const impactBadge = screen.getByText(/Impact 60/);
    expect(impactBadge.className).toContain('text-[var(--badge-amber-text)]');
    expect(impactBadge.className).toContain('bg-[var(--badge-amber-text)]/10');
  });

  it('applies red color class for scores < 60', () => {
    const entry = makeEntry({
      quality_scores: { impact: 59, metrics: 0, context: 45, keywords: 30 },
    });
    render(<ExperienceEntryCard entry={entry} />);
    fireEvent.click(getExpandButton());

    const impactBadge = screen.getByText(/Impact 59/);
    expect(impactBadge.className).toContain('text-[var(--badge-red-text)]');
    expect(impactBadge.className).toContain('bg-[var(--badge-red-bg)]');
  });

  it('applies green at exactly 80 (boundary)', () => {
    const entry = makeEntry({
      quality_scores: { impact: 80, metrics: 80, context: 80, keywords: 80 },
    });
    render(<ExperienceEntryCard entry={entry} />);
    fireEvent.click(getExpandButton());

    const badge = screen.getByText(/Impact 80/);
    expect(badge.className).toContain('text-[var(--badge-green-text)]');
  });

  it('applies yellow at exactly 60 (boundary)', () => {
    const entry = makeEntry({
      quality_scores: { impact: 60, metrics: 60, context: 60, keywords: 60 },
    });
    render(<ExperienceEntryCard entry={entry} />);
    fireEvent.click(getExpandButton());

    const badge = screen.getByText(/Impact 60/);
    expect(badge.className).toContain('text-[var(--badge-amber-text)]');
  });

  it('applies red at 59 (one below yellow boundary)', () => {
    const entry = makeEntry({
      quality_scores: { impact: 59, metrics: 59, context: 59, keywords: 59 },
    });
    render(<ExperienceEntryCard entry={entry} />);
    fireEvent.click(getExpandButton());

    const badge = screen.getByText(/Impact 59/);
    expect(badge.className).toContain('text-[var(--badge-red-text)]');
  });

  it('applies correct color independently for each score when they differ in tier', () => {
    const entry = makeEntry({
      quality_scores: { impact: 90, metrics: 70, context: 40, keywords: 80 },
    });
    render(<ExperienceEntryCard entry={entry} />);
    fireEvent.click(getExpandButton());

    expect(screen.getByText(/Impact 90/).className).toContain('text-[var(--badge-green-text)]');
    expect(screen.getByText(/Metrics 70/).className).toContain('text-[var(--badge-amber-text)]');
    expect(screen.getByText(/Context 40/).className).toContain('text-[var(--badge-red-text)]');
    expect(screen.getByText(/Keywords 80/).className).toContain('text-[var(--badge-green-text)]');
  });
});

// ─── Before/after toggle ──────────────────────────────────────────────────────

describe('ExperienceEntryCard — before/after toggle', () => {
  it('shows Optimized and Original toggle buttons when original is non-empty', () => {
    const entry = makeEntry({ original: 'Led a team of engineers.' });
    render(<ExperienceEntryCard entry={entry} />);
    fireEvent.click(getExpandButton());

    expect(screen.getByRole('button', { name: 'Optimized' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Original' })).toBeInTheDocument();
  });

  it('does not show toggle buttons when original is empty string', () => {
    const entry = makeEntry({ original: '' });
    render(<ExperienceEntryCard entry={entry} />);
    fireEvent.click(getExpandButton());

    expect(screen.queryByRole('button', { name: 'Optimized' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Original' })).not.toBeInTheDocument();
  });

  it('does not show toggle buttons when original is whitespace only', () => {
    const entry = makeEntry({ original: '   ' });
    render(<ExperienceEntryCard entry={entry} />);
    fireEvent.click(getExpandButton());

    expect(screen.queryByRole('button', { name: 'Optimized' })).not.toBeInTheDocument();
  });

  it('shows optimized content by default after expanding', () => {
    const entry = makeEntry({
      original: 'Old bullets.',
      optimized: 'New better bullets.',
    });
    render(<ExperienceEntryCard entry={entry} />);
    fireEvent.click(getExpandButton());

    const pre = document.querySelector('pre');
    expect(pre?.textContent).toBe('New better bullets.');
  });

  it('switches to original content when Original button is clicked', () => {
    const entry = makeEntry({
      original: 'Old bullets.',
      optimized: 'New better bullets.',
    });
    render(<ExperienceEntryCard entry={entry} />);
    fireEvent.click(getExpandButton());

    fireEvent.click(screen.getByRole('button', { name: 'Original' }));

    const pre = document.querySelector('pre');
    expect(pre?.textContent).toBe('Old bullets.');
  });

  it('switches back to optimized content when Optimized button is clicked', () => {
    const entry = makeEntry({
      original: 'Old bullets.',
      optimized: 'New better bullets.',
    });
    render(<ExperienceEntryCard entry={entry} />);
    fireEvent.click(getExpandButton());
    fireEvent.click(screen.getByRole('button', { name: 'Original' }));
    fireEvent.click(screen.getByRole('button', { name: 'Optimized' }));

    const pre = document.querySelector('pre');
    expect(pre?.textContent).toBe('New better bullets.');
  });
});

// ─── Optimized content (expanded, no original) ────────────────────────────────

describe('ExperienceEntryCard — optimized content (expanded)', () => {
  it('renders the optimized text after expanding', () => {
    const entry = makeEntry({ original: '' });
    render(<ExperienceEntryCard entry={entry} />);
    fireEvent.click(getExpandButton());

    expect(screen.getByText(entry.optimized)).toBeInTheDocument();
  });

  it('renders empty content area when optimized is an empty string', () => {
    render(<ExperienceEntryCard entry={makeEntry({ optimized: '', original: '' })} />);
    fireEvent.click(getExpandButton());

    const pre = document.querySelector('pre');
    expect(pre).toBeInTheDocument();
    expect(pre?.textContent).toBe('');
  });
});

// ─── Copy button ──────────────────────────────────────────────────────────────

describe('ExperienceEntryCard — copy button (expanded)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
    });
  });

  it('shows "Copy" text before the button is clicked', () => {
    render(<ExperienceEntryCard entry={makeEntry()} />);
    fireEvent.click(getExpandButton());

    expect(screen.getByTitle('Copy optimized content')).toBeInTheDocument();
    expect(screen.getByText('Copy')).toBeInTheDocument();
  });

  it('calls navigator.clipboard.writeText with the optimized text when clicked', async () => {
    const entry = makeEntry();
    render(<ExperienceEntryCard entry={entry} />);
    fireEvent.click(getExpandButton());

    const button = screen.getByTitle('Copy optimized content');
    await act(async () => {
      fireEvent.click(button);
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledOnce();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(entry.optimized);
  });

  it('shows "Copied" feedback immediately after click', async () => {
    render(<ExperienceEntryCard entry={makeEntry()} />);
    fireEvent.click(getExpandButton());

    const button = screen.getByTitle('Copy optimized content');
    await act(async () => {
      fireEvent.click(button);
    });

    expect(screen.getByText('Copied')).toBeInTheDocument();
    expect(screen.queryByText('Copy')).not.toBeInTheDocument();
  });

  it('reverts "Copied" back to "Copy" after 2 seconds', async () => {
    render(<ExperienceEntryCard entry={makeEntry()} />);
    fireEvent.click(getExpandButton());

    const button = screen.getByTitle('Copy optimized content');
    await act(async () => {
      fireEvent.click(button);
    });

    expect(screen.getByText('Copied')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2001);
    });

    expect(screen.getByText('Copy')).toBeInTheDocument();
    expect(screen.queryByText('Copied')).not.toBeInTheDocument();
  });

  it('does not throw when clipboard.writeText rejects', async () => {
    (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Clipboard unavailable'),
    );
    render(<ExperienceEntryCard entry={makeEntry()} />);
    fireEvent.click(getExpandButton());

    const button = screen.getByTitle('Copy optimized content');
    await act(async () => {
      fireEvent.click(button);
    });

    // Component is still rendered — clipboard failure is swallowed
    expect(screen.getByTitle('Copy optimized content')).toBeInTheDocument();
  });

  it('always copies the optimized text regardless of whether Original view is active', async () => {
    const entry = makeEntry({
      original: 'Old bullets.',
      optimized: 'New better bullets.',
    });
    render(<ExperienceEntryCard entry={entry} />);
    fireEvent.click(getExpandButton());

    // Switch to original view
    fireEvent.click(screen.getByRole('button', { name: 'Original' }));

    const button = screen.getByTitle('Copy optimized content');
    await act(async () => {
      fireEvent.click(button);
    });

    // Should still copy the optimized text, not the original
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(entry.optimized);
  });
});
