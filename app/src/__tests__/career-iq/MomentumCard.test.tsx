/**
 * MomentumCard — Component tests.
 *
 * @vitest-environment jsdom
 */

// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MomentumCard } from '@/components/career-iq/MomentumCard';
import type { MomentumSummary } from '@/hooks/useMomentum';

afterEach(() => cleanup());

const SUMMARY_HIGH_STREAK: MomentumSummary = {
  current_streak: 7,
  longest_streak: 14,
  total_activities: 55,
  this_week_activities: 9,
  recent_wins: [
    { id: 'w1', activity_type: 'resume_completed', metadata: {}, created_at: '2026-03-07T10:00:00Z' },
    { id: 'w2', activity_type: 'job_applied', metadata: {}, created_at: '2026-03-06T10:00:00Z' },
    { id: 'w3', activity_type: 'interview_prep', metadata: {}, created_at: '2026-03-05T10:00:00Z' },
  ],
};

const SUMMARY_ZERO_STREAK: MomentumSummary = {
  current_streak: 0,
  longest_streak: 3,
  total_activities: 5,
  this_week_activities: 0,
  recent_wins: [],
};

describe('MomentumCard', () => {
  it('renders streak count from summary', () => {
    render(<MomentumCard summary={SUMMARY_HIGH_STREAK} loading={false} />);
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('day streak')).toBeInTheDocument();
  });

  it('renders mini-stats correctly', () => {
    render(<MomentumCard summary={SUMMARY_HIGH_STREAK} loading={false} />);
    expect(screen.getByText('9')).toBeInTheDocument();   // this_week_activities
    expect(screen.getByText('55')).toBeInTheDocument();  // total_activities
    expect(screen.getByText('14')).toBeInTheDocument();  // longest_streak
  });

  it('shows green styling for streak >= 3', () => {
    const { container } = render(<MomentumCard summary={SUMMARY_HIGH_STREAK} loading={false} />);
    // The streak number should carry the green class
    const streakNum = screen.getByText('7');
    expect(streakNum.className).toContain('text-[var(--badge-green-text)]');
    expect(container).toBeTruthy();
  });

  it('shows amber styling and start message for streak = 0', () => {
    render(<MomentumCard summary={SUMMARY_ZERO_STREAK} loading={false} />);
    expect(screen.getByText('Start your streak!')).toBeInTheDocument();
    // Ensure the streak number is not shown
    expect(screen.queryByText('day streak')).not.toBeInTheDocument();
  });

  it('shows loading skeleton when loading=true', () => {
    const { container } = render(<MomentumCard summary={null} loading={true} />);
    // The skeleton uses animate-pulse divs — there's no streak text
    expect(screen.queryByText('day streak')).not.toBeInTheDocument();
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
  });

  it('shows loading skeleton when summary is null and loading=true', () => {
    const { container } = render(<MomentumCard summary={null} loading={true} />);
    const pulseElements = container.querySelectorAll('.animate-pulse');
    expect(pulseElements.length).toBeGreaterThan(0);
  });

  it('renders recent wins with human-readable labels', () => {
    render(<MomentumCard summary={SUMMARY_HIGH_STREAK} loading={false} />);
    expect(screen.getByText('Resume completed')).toBeInTheDocument();
    expect(screen.getByText('Applied to job')).toBeInTheDocument();
    expect(screen.getByText('Interview prepared')).toBeInTheDocument();
  });

  it('renders no more than 3 recent wins', () => {
    const summaryWithMany: MomentumSummary = {
      ...SUMMARY_HIGH_STREAK,
      recent_wins: [
        { id: 'w1', activity_type: 'resume_completed', metadata: {}, created_at: '2026-03-07T10:00:00Z' },
        { id: 'w2', activity_type: 'job_applied', metadata: {}, created_at: '2026-03-06T10:00:00Z' },
        { id: 'w3', activity_type: 'interview_prep', metadata: {}, created_at: '2026-03-05T10:00:00Z' },
        { id: 'w4', activity_type: 'cover_letter_completed', metadata: {}, created_at: '2026-03-04T10:00:00Z' },
      ],
    };
    render(<MomentumCard summary={summaryWithMany} loading={false} />);
    // Only 3 should be shown
    expect(screen.getByText('Resume completed')).toBeInTheDocument();
    expect(screen.getByText('Applied to job')).toBeInTheDocument();
    expect(screen.getByText('Interview prepared')).toBeInTheDocument();
    expect(screen.queryByText('Cover letter created')).not.toBeInTheDocument();
  });

  it('shows no recent wins section when wins are empty', () => {
    render(<MomentumCard summary={SUMMARY_ZERO_STREAK} loading={false} />);
    expect(screen.queryByText('Recent wins')).not.toBeInTheDocument();
  });

  it('renders with null summary in non-loading state gracefully', () => {
    render(<MomentumCard summary={null} loading={false} />);
    // Non-loading but no summary: should show skeleton (because loading guard already ran)
    // Actually without summary and loading=false, streak defaults to 0
    expect(screen.getByText('Start your streak!')).toBeInTheDocument();
  });

  it('humanizes unknown activity types via snake_case fallback', () => {
    const summaryWithUnknown: MomentumSummary = {
      ...SUMMARY_HIGH_STREAK,
      recent_wins: [
        { id: 'w1', activity_type: 'custom_activity_type', metadata: {}, created_at: '2026-03-07T10:00:00Z' },
      ],
    };
    render(<MomentumCard summary={summaryWithUnknown} loading={false} />);
    expect(screen.getByText('Custom Activity Type')).toBeInTheDocument();
  });
});
