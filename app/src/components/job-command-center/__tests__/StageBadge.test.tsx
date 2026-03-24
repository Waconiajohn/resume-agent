// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { StageBadge } from '../StageBadge';

vi.mock('@/lib/utils', () => ({
  cn: (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' '),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('StageBadge — stage name rendering', () => {
  it('renders the stage name for "saved"', () => {
    render(<StageBadge stage="saved" />);
    expect(screen.getByText('saved')).toBeInTheDocument();
  });

  it('renders "closed won" with underscore replaced by space', () => {
    render(<StageBadge stage="closed_won" />);
    expect(screen.getByText('closed won')).toBeInTheDocument();
  });

  it('renders "closed lost" with underscore replaced by space', () => {
    render(<StageBadge stage="closed_lost" />);
    expect(screen.getByText('closed lost')).toBeInTheDocument();
  });

  it('renders "interviewing" as-is', () => {
    render(<StageBadge stage="interviewing" />);
    expect(screen.getByText('interviewing')).toBeInTheDocument();
  });
});

describe('StageBadge — color classes', () => {
  it('applies neutral color class for "saved"', () => {
    render(<StageBadge stage="saved" />);
    const badge = screen.getByText('saved');
    expect(badge.className).toContain('text-[var(--text-soft)]');
  });

  it('applies blue color class for "researching"', () => {
    render(<StageBadge stage="researching" />);
    const badge = screen.getByText('researching');
    expect(badge.className).toContain('text-[#98b3ff]');
  });

  it('applies golden color class for "applied"', () => {
    render(<StageBadge stage="applied" />);
    const badge = screen.getByText('applied');
    expect(badge.className).toContain('text-[#f0d99f]');
  });

  it('applies green color class for "offer"', () => {
    render(<StageBadge stage="offer" />);
    const badge = screen.getByText('offer');
    expect(badge.className).toContain('text-[#b5dec2]');
  });

  it('applies red color class for "closed_lost"', () => {
    render(<StageBadge stage="closed_lost" />);
    const badge = screen.getByText('closed lost');
    expect(badge.className).toContain('text-red-400');
  });
});
