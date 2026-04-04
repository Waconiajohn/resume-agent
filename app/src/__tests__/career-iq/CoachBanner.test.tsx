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
  it('renders a generic coach label', () => {
    render(
      <Sidebar
        {...BASE_PROPS}
        coachData={{ phase: 'Resume Building' }}
      />,
    );
    expect(screen.getAllByText('Coach').length).toBeGreaterThan(0);
  });

  it('renders the phase subtitle from coachData.phase', () => {
    render(
      <Sidebar
        {...BASE_PROPS}
        coachData={{ phase: 'Interview Prep' }}
      />,
    );
    // 'Interview Prep' also appears as a nav room label, so use getAllByText
    expect(screen.getAllByText('Interview Prep').length).toBeGreaterThan(0);
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
    expect(screen.queryByText(/update your/i)).not.toBeInTheDocument();
  });

  it('shows only the avatar circle (no name text) when sidebar is collapsed', () => {
    render(
      <Sidebar
        {...BASE_PROPS}
        coachData={{ phase: 'Job Search' }}
      />,
    );
    const collapseBtn = screen.getByRole('button', { name: /collapse sidebar/i });
    fireEvent.click(collapseBtn);

    expect(screen.queryByText('Coach')).not.toBeInTheDocument();
  });

  it('falls back to "Coach" label when no coach data is provided', () => {
    render(<Sidebar {...BASE_PROPS} />);
    expect(screen.getAllByText('Coach').length).toBeGreaterThan(0);
  });

  it('falls back to "Career Profile" phase when phase is not provided', () => {
    render(<Sidebar {...BASE_PROPS} />);
    expect(screen.getByText('Career Profile')).toBeInTheDocument();
  });

  it('recommendation text is static (not a button)', () => {
    render(
      <Sidebar
        {...BASE_PROPS}
        coachData={{
          phase: 'Offer Negotiation',
          recommendation: 'Negotiate your base salary first.',
        }}
      />,
    );
    const recText = screen.getByText('Negotiate your base salary first.');
    expect(recText.tagName).not.toBe('BUTTON');
  });
});
