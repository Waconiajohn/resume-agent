/**
 * CoachBanner — Component tests.
 *
 * CoachBanner is an internal function inside Sidebar.tsx, so it is tested
 * through the public Sidebar component.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
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
  it('renders "AI John" when firstName is "John"', () => {
    render(
      <Sidebar
        {...BASE_PROPS}
        coachData={{ firstName: 'John', phase: 'Resume Building' }}
      />,
    );
    expect(screen.getByText('AI John')).toBeInTheDocument();
  });

  it('renders the phase subtitle from coachData.phase', () => {
    render(
      <Sidebar
        {...BASE_PROPS}
        coachData={{ firstName: 'Sarah', phase: 'Interview Prep' }}
      />,
    );
    expect(screen.getByText('Interview Prep')).toBeInTheDocument();
  });

  it('renders recommendation text when coachData.recommendation is provided', () => {
    render(
      <Sidebar
        {...BASE_PROPS}
        coachData={{
          firstName: 'Alex',
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
        coachData={{ firstName: 'Alex', phase: 'Networking' }}
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
        coachData={{ firstName: 'Maria', phase: 'Job Search' }}
      />,
    );
    const collapseBtn = screen.getByRole('button', { name: /collapse sidebar/i });
    fireEvent.click(collapseBtn);

    // After collapsing, the display name text should no longer be visible
    expect(screen.queryByText('AI Maria')).not.toBeInTheDocument();
    // The avatar circle is still rendered (aria-label still contains the name)
    expect(screen.getByRole('button', { name: /open ai maria/i })).toBeInTheDocument();
  });

  it('calls onOpenCoach when the avatar/banner button is clicked', () => {
    const onOpenCoach = vi.fn();
    render(
      <Sidebar
        {...BASE_PROPS}
        onOpenCoach={onOpenCoach}
        coachData={{ firstName: 'Tom', phase: 'Offer Negotiation' }}
      />,
    );
    const openBtn = screen.getByRole('button', { name: /open ai tom/i });
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
          firstName: 'Tom',
          phase: 'Offer Negotiation',
          recommendation: 'Negotiate your base salary first.',
        }}
      />,
    );
    fireEvent.click(screen.getByText('Negotiate your base salary first.'));
    expect(onOpenCoach).toHaveBeenCalledTimes(1);
  });

  it('falls back to "AI Coach" display name when firstName is not provided', () => {
    render(<Sidebar {...BASE_PROPS} />);
    expect(screen.getByText('AI Coach')).toBeInTheDocument();
  });

  it('falls back to "Getting Started" phase when phase is not provided', () => {
    render(<Sidebar {...BASE_PROPS} />);
    expect(screen.getByText('Getting Started')).toBeInTheDocument();
  });
});
