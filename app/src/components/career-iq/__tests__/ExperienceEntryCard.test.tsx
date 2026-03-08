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

// ─── Tests ────────────────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('ExperienceEntryCard — header content', () => {
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
    // The middle-dot separator should not appear
    expect(screen.queryByText(/·/)).not.toBeInTheDocument();
  });
});

describe('ExperienceEntryCard — optimized content', () => {
  it('renders the optimized text', () => {
    const entry = makeEntry();
    render(<ExperienceEntryCard entry={entry} />);
    expect(screen.getByText(entry.optimized)).toBeInTheDocument();
  });

  it('renders empty content area when optimized is an empty string', () => {
    render(<ExperienceEntryCard entry={makeEntry({ optimized: '' })} />);
    // The <pre> element should exist and be empty
    const pre = document.querySelector('pre');
    expect(pre).toBeInTheDocument();
    expect(pre?.textContent).toBe('');
  });
});

describe('ExperienceEntryCard — quality score badges', () => {
  it('renders all four score badge labels', () => {
    render(<ExperienceEntryCard entry={makeEntry()} />);
    expect(screen.getByText(/Impact/)).toBeInTheDocument();
    expect(screen.getByText(/Metrics/)).toBeInTheDocument();
    expect(screen.getByText(/Context/)).toBeInTheDocument();
    expect(screen.getByText(/Keywords/)).toBeInTheDocument();
  });

  it('renders the numeric score next to each label', () => {
    const entry = makeEntry({
      quality_scores: { impact: 85, metrics: 90, context: 78, keywords: 72 },
    });
    render(<ExperienceEntryCard entry={entry} />);
    expect(screen.getByText(/Impact 85/)).toBeInTheDocument();
    expect(screen.getByText(/Metrics 90/)).toBeInTheDocument();
    expect(screen.getByText(/Context 78/)).toBeInTheDocument();
    expect(screen.getByText(/Keywords 72/)).toBeInTheDocument();
  });

  it('applies green color class for scores >= 80', () => {
    const entry = makeEntry({
      quality_scores: { impact: 80, metrics: 95, context: 82, keywords: 100 },
    });
    render(<ExperienceEntryCard entry={entry} />);
    const impactBadge = screen.getByText(/Impact 80/);
    expect(impactBadge.className).toContain('text-[#b5dec2]');
    expect(impactBadge.className).toContain('bg-[#b5dec2]/10');
  });

  it('applies yellow color class for scores in range 60–79', () => {
    const entry = makeEntry({
      quality_scores: { impact: 60, metrics: 79, context: 65, keywords: 70 },
    });
    render(<ExperienceEntryCard entry={entry} />);
    const impactBadge = screen.getByText(/Impact 60/);
    expect(impactBadge.className).toContain('text-[#dfc797]');
    expect(impactBadge.className).toContain('bg-[#dfc797]/10');
  });

  it('applies red color class for scores < 60', () => {
    const entry = makeEntry({
      quality_scores: { impact: 59, metrics: 0, context: 45, keywords: 30 },
    });
    render(<ExperienceEntryCard entry={entry} />);
    const impactBadge = screen.getByText(/Impact 59/);
    expect(impactBadge.className).toContain('text-red-400');
    expect(impactBadge.className).toContain('bg-red-400/10');
  });

  it('applies green at exactly 80 (boundary)', () => {
    const entry = makeEntry({
      quality_scores: { impact: 80, metrics: 80, context: 80, keywords: 80 },
    });
    render(<ExperienceEntryCard entry={entry} />);
    const badge = screen.getByText(/Impact 80/);
    expect(badge.className).toContain('text-[#b5dec2]');
  });

  it('applies yellow at exactly 60 (boundary)', () => {
    const entry = makeEntry({
      quality_scores: { impact: 60, metrics: 60, context: 60, keywords: 60 },
    });
    render(<ExperienceEntryCard entry={entry} />);
    const badge = screen.getByText(/Impact 60/);
    expect(badge.className).toContain('text-[#dfc797]');
  });

  it('applies red at 59 (one below yellow boundary)', () => {
    const entry = makeEntry({
      quality_scores: { impact: 59, metrics: 59, context: 59, keywords: 59 },
    });
    render(<ExperienceEntryCard entry={entry} />);
    const badge = screen.getByText(/Impact 59/);
    expect(badge.className).toContain('text-red-400');
  });

  it('applies correct color independently for each score when they differ in tier', () => {
    const entry = makeEntry({
      quality_scores: { impact: 90, metrics: 70, context: 40, keywords: 80 },
    });
    render(<ExperienceEntryCard entry={entry} />);
    expect(screen.getByText(/Impact 90/).className).toContain('text-[#b5dec2]');
    expect(screen.getByText(/Metrics 70/).className).toContain('text-[#dfc797]');
    expect(screen.getByText(/Context 40/).className).toContain('text-red-400');
    expect(screen.getByText(/Keywords 80/).className).toContain('text-[#b5dec2]');
  });
});

describe('ExperienceEntryCard — copy button', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
    });
  });

  it('shows "Copy" text before the button is clicked', () => {
    render(<ExperienceEntryCard entry={makeEntry()} />);
    // Button title is "Copy optimized content"; accessible name comes from text children = "Copy"
    const button = screen.getByTitle('Copy optimized content');
    expect(button).toBeInTheDocument();
    expect(screen.getByText('Copy')).toBeInTheDocument();
  });

  it('calls navigator.clipboard.writeText with the optimized text when clicked', async () => {
    const entry = makeEntry();
    render(<ExperienceEntryCard entry={entry} />);
    const button = screen.getByTitle('Copy optimized content');

    await act(async () => {
      fireEvent.click(button);
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledOnce();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(entry.optimized);
  });

  it('shows "Copied" feedback immediately after click', async () => {
    render(<ExperienceEntryCard entry={makeEntry()} />);
    const button = screen.getByTitle('Copy optimized content');

    await act(async () => {
      fireEvent.click(button);
    });

    expect(screen.getByText('Copied')).toBeInTheDocument();
    expect(screen.queryByText('Copy')).not.toBeInTheDocument();
  });

  it('reverts "Copied" back to "Copy" after 2 seconds', async () => {
    render(<ExperienceEntryCard entry={makeEntry()} />);
    const button = screen.getByTitle('Copy optimized content');

    await act(async () => {
      fireEvent.click(button);
    });

    expect(screen.getByText('Copied')).toBeInTheDocument();

    // Advance fake timers past the 2-second reset threshold
    act(() => {
      vi.advanceTimersByTime(2001);
    });

    // State update from setTimeout has now been flushed by act
    expect(screen.getByText('Copy')).toBeInTheDocument();
    expect(screen.queryByText('Copied')).not.toBeInTheDocument();
  });

  it('does not throw when clipboard.writeText rejects', async () => {
    (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Clipboard unavailable'),
    );
    render(<ExperienceEntryCard entry={makeEntry()} />);
    const button = screen.getByTitle('Copy optimized content');

    await act(async () => {
      fireEvent.click(button);
    });

    // Component is still rendered — clipboard failure is swallowed
    expect(screen.getByTitle('Copy optimized content')).toBeInTheDocument();
  });
});
