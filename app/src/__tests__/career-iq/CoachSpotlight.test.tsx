/**
 * CoachSpotlight — Component tests.
 *
 * CoachSpotlight receives recommendation and loading as props (from the
 * single useCoachRecommendation instance in CareerIQScreen).
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

import { CoachSpotlight } from '@/components/career-iq/CoachSpotlight';
import type { CoachRecommendation } from '@/hooks/useCoachRecommendation';

afterEach(() => cleanup());

const MOCK_RECOMMENDATION: CoachRecommendation = {
  action: 'Update your resume summary with your latest leadership accomplishment.',
  product: 'resume',
  room: 'resume',
  urgency: 'immediate',
  phase: 'resume_ready',
  phase_label: 'Resume Complete',
  rationale: 'Your resume summary is over two years old and does not reflect your recent VP promotion.',
};

describe('CoachSpotlight', () => {
  it('returns null when recommendation is null and not loading', () => {
    const { container } = render(
      <CoachSpotlight userName="Jane Smith" recommendation={null} loading={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders a loading skeleton when loading is true', () => {
    const { container } = render(
      <CoachSpotlight userName="Jane Smith" recommendation={null} loading={true} />,
    );
    const skeleton = container.querySelector('.animate-pulse');
    expect(skeleton).not.toBeNull();
  });

  it('renders the recommendation action text', () => {
    render(
      <CoachSpotlight userName="Jane Smith" recommendation={MOCK_RECOMMENDATION} loading={false} />,
    );
    expect(
      screen.getByText('Update your resume summary with your latest leadership accomplishment.'),
    ).toBeInTheDocument();
  });

  it('renders "AI Jane recommends:" header using the first name', () => {
    render(
      <CoachSpotlight userName="Jane Smith" recommendation={MOCK_RECOMMENDATION} loading={false} />,
    );
    expect(screen.getByText('AI Jane recommends:')).toBeInTheDocument();
  });

  it('CTA button calls onNavigateRoom with the recommended room', () => {
    const onNavigateRoom = vi.fn();
    render(
      <CoachSpotlight
        userName="Jane Smith"
        recommendation={MOCK_RECOMMENDATION}
        loading={false}
        onNavigateRoom={onNavigateRoom}
      />,
    );
    fireEvent.click(screen.getByText('Go there'));
    expect(onNavigateRoom).toHaveBeenCalledTimes(1);
    expect(onNavigateRoom).toHaveBeenCalledWith('resume');
  });

  it('CTA button calls onOpenCoach when recommendation has no room', () => {
    const onOpenCoach = vi.fn();
    render(
      <CoachSpotlight
        userName="Jane Smith"
        recommendation={{ ...MOCK_RECOMMENDATION, room: null }}
        loading={false}
        onOpenCoach={onOpenCoach}
      />,
    );
    fireEvent.click(screen.getByText('Talk to coach'));
    expect(onOpenCoach).toHaveBeenCalledTimes(1);
  });

  it('"Why?" button toggles rationale visibility', () => {
    render(
      <CoachSpotlight userName="Jane Smith" recommendation={MOCK_RECOMMENDATION} loading={false} />,
    );

    // Rationale not visible initially
    expect(
      screen.queryByText(MOCK_RECOMMENDATION.rationale),
    ).not.toBeInTheDocument();

    // Click Why? to open
    fireEvent.click(screen.getByText('Why?'));
    expect(screen.getByText(MOCK_RECOMMENDATION.rationale)).toBeInTheDocument();

    // Click Why? again to close
    fireEvent.click(screen.getByText('Why?'));
    expect(
      screen.queryByText(MOCK_RECOMMENDATION.rationale),
    ).not.toBeInTheDocument();
  });

  it('renders the phase badge with phase_label text', () => {
    render(
      <CoachSpotlight userName="Jane Smith" recommendation={MOCK_RECOMMENDATION} loading={false} />,
    );
    expect(screen.getByText('Resume Complete')).toBeInTheDocument();
  });

  it('uses "Coach" as fallback first name when userName is empty', () => {
    render(
      <CoachSpotlight userName="" recommendation={MOCK_RECOMMENDATION} loading={false} />,
    );
    expect(screen.getByText('AI Coach recommends:')).toBeInTheDocument();
  });
});
