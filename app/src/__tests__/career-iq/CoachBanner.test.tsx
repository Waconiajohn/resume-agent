/**
 * CoachBanner — Component tests.
 *
 * CoachBanner is an internal function inside Sidebar.tsx, so it is tested
 * through the public Sidebar component.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { Sidebar } from '@/components/career-iq/Sidebar';
import type { CareerIQRoom } from '@/components/career-iq/Sidebar';
import type { DashboardState } from '@/components/career-iq/useWhyMeStory';

afterEach(() => cleanup());

const BASE_PROPS = {
  activeRoom: 'dashboard' as CareerIQRoom,
  onNavigate: vi.fn(),
  dashboardState: 'strong' as DashboardState,
};

describe('CoachBanner (via Sidebar)', () => {
  it('renders a generic coach label', () => {
    render(
      <Sidebar
        {...BASE_PROPS}
        coachData={{ phase: 'Resume Building' }}
      />,
    );
    expect(screen.getByRole('button', { name: /open coach/i })).toBeInTheDocument();
    expect(screen.getAllByText('Coach').length).toBeGreaterThan(0);
  });

  it('renders the phase subtitle from coachData.phase', () => {
    render(
      <Sidebar
        {...BASE_PROPS}
        coachData={{ phase: 'Interview Prep' }}
      />,
    );
    expect(within(screen.getByRole('button', { name: /open coach/i })).getByText('Interview Prep')).toBeInTheDocument();
  });

  it('renders recommendation text when coachData.recommendation is provided', () => {
    render(
      <Sidebar
        {...BASE_PROPS}
        coachData={{
          phase: 'Networking',
          recommendation: 'Update your LinkedIn headline today.',
        }}
      />,
    );
    expect(screen.getByText('Update your LinkedIn headline today.')).toBeInTheDocument();
  });

  it('does not render recommendation text when coachData.recommendation is absent', () => {
    render(
      <Sidebar
        {...BASE_PROPS}
        coachData={{ phase: 'Networking' }}
      />,
    );
    // Without a recommendation, no recommendation button should be present
    expect(screen.queryByText(/update your/i)).not.toBeInTheDocument();
  });

  it('shows only the avatar circle (no name text) when sidebar is collapsed', () => {
    // The collapse button is rendered by CoachBanner; click it to collapse.
    render(
      <Sidebar
        {...BASE_PROPS}
        coachData={{ phase: 'Job Search' }}
      />,
    );
    const collapseBtn = screen.getByRole('button', { name: /collapse sidebar/i });
    fireEvent.click(collapseBtn);

    expect(screen.queryByText('Coach')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open coach/i })).toBeInTheDocument();
  });

  it('calls onOpenCoach when the avatar/banner button is clicked', () => {
    const onOpenCoach = vi.fn();
    render(
      <Sidebar
        {...BASE_PROPS}
        onOpenCoach={onOpenCoach}
        coachData={{ phase: 'Offer Negotiation' }}
      />,
    );
    const openBtn = screen.getByRole('button', { name: /open coach/i });
    fireEvent.click(openBtn);
    expect(onOpenCoach).toHaveBeenCalledTimes(1);
  });

  it('calls onOpenCoach when recommendation text is clicked', () => {
    const onOpenCoach = vi.fn();
    render(
      <Sidebar
        {...BASE_PROPS}
        onOpenCoach={onOpenCoach}
        coachData={{
          phase: 'Offer Negotiation',
          recommendation: 'Negotiate your base salary first.',
        }}
      />,
    );
    fireEvent.click(screen.getByText('Negotiate your base salary first.'));
    expect(onOpenCoach).toHaveBeenCalledTimes(1);
  });

  it('falls back to "Coach" when no coach data is provided', () => {
    render(<Sidebar {...BASE_PROPS} />);
    expect(screen.getByRole('button', { name: /open coach/i })).toBeInTheDocument();
    expect(screen.getAllByText('Coach').length).toBeGreaterThan(0);
  });

  it('falls back to "Career Profile" phase when phase is not provided', () => {
    render(<Sidebar {...BASE_PROPS} />);
    expect(within(screen.getByRole('button', { name: /open coach/i })).getByText('Career Profile')).toBeInTheDocument();
  });
});
