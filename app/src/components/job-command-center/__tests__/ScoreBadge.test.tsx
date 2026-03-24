// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ScoreBadge } from '../ScoreBadge';

vi.mock('@/lib/utils', () => ({
  cn: (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' '),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ScoreBadge — score rendering', () => {
  it('renders the numeric score', () => {
    render(<ScoreBadge score={85} />);
    expect(screen.getByText('85')).toBeInTheDocument();
  });

  it('renders score 0', () => {
    render(<ScoreBadge score={0} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('renders score 100', () => {
    render(<ScoreBadge score={100} />);
    expect(screen.getByText('100')).toBeInTheDocument();
  });
});

describe('ScoreBadge — color tiers', () => {
  it('applies green class for high score (>=80)', () => {
    render(<ScoreBadge score={80} />);
    const badge = screen.getByText('80');
    expect(badge.className).toContain('text-[#b5dec2]');
    expect(badge.className).toContain('bg-[#b5dec2]/10');
  });

  it('applies green class at exactly 80 (boundary)', () => {
    render(<ScoreBadge score={80} />);
    expect(screen.getByText('80').className).toContain('text-[#b5dec2]');
  });

  it('applies green class for score 95', () => {
    render(<ScoreBadge score={95} />);
    expect(screen.getByText('95').className).toContain('text-[#b5dec2]');
  });

  it('applies blue class for medium score (>=60 and <80)', () => {
    render(<ScoreBadge score={70} />);
    const badge = screen.getByText('70');
    expect(badge.className).toContain('text-[#98b3ff]');
    expect(badge.className).toContain('bg-[#98b3ff]/10');
  });

  it('applies blue class at exactly 60 (boundary)', () => {
    render(<ScoreBadge score={60} />);
    expect(screen.getByText('60').className).toContain('text-[#98b3ff]');
  });

  it('applies blue class at 79 (just below green threshold)', () => {
    render(<ScoreBadge score={79} />);
    expect(screen.getByText('79').className).toContain('text-[#98b3ff]');
  });

  it('applies neutral class for low score (<60)', () => {
    render(<ScoreBadge score={45} />);
    const badge = screen.getByText('45');
    expect(badge.className).toContain('text-[var(--text-soft)]');
  });

  it('applies neutral class at 59 (just below medium threshold)', () => {
    render(<ScoreBadge score={59} />);
    expect(screen.getByText('59').className).toContain('text-[var(--text-soft)]');
  });

  it('applies neutral class for score 0', () => {
    render(<ScoreBadge score={0} />);
    expect(screen.getByText('0').className).toContain('text-[var(--text-soft)]');
  });
});
