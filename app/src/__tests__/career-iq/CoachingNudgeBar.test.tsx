/**
 * CoachingNudgeBar — Component tests.
 *
 * @vitest-environment jsdom
 */

// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { CoachingNudgeBar } from '@/components/career-iq/CoachingNudgeBar';
import type { CoachingNudge } from '@/hooks/useMomentum';

afterEach(() => cleanup());

const NUDGE_INACTIVITY: CoachingNudge = {
  id: 'n1',
  user_id: 'test-user',
  trigger_type: 'inactivity',
  message: "It's been a few days — even 15 minutes of focused effort keeps momentum alive.",
  coaching_tone: 'warm',
  dismissed: false,
  created_at: '2026-03-07T09:00:00Z',
};

const NUDGE_REJECTION: CoachingNudge = {
  id: 'n2',
  user_id: 'test-user',
  trigger_type: 'rejection_streak',
  message: 'Three rejections in a row is hard. Remember: one yes changes everything.',
  coaching_tone: 'compassionate',
  dismissed: false,
  created_at: '2026-03-06T09:00:00Z',
};

const NUDGE_STALLED: CoachingNudge = {
  id: 'n3',
  user_id: 'test-user',
  trigger_type: 'stalled_pipeline',
  message: 'Your pipeline has been quiet for 2 weeks. Time to follow up with 3 companies.',
  coaching_tone: 'direct',
  dismissed: false,
  created_at: '2026-03-05T09:00:00Z',
};

const NUDGE_MILESTONE: CoachingNudge = {
  id: 'n4',
  user_id: 'test-user',
  trigger_type: 'milestone',
  message: "You've applied to 10 roles — that's real momentum. Keep going.",
  coaching_tone: 'celebratory',
  dismissed: false,
  created_at: '2026-03-04T09:00:00Z',
};

describe('CoachingNudgeBar', () => {
  it('renders nudge messages', () => {
    render(
      <CoachingNudgeBar
        nudges={[NUDGE_INACTIVITY, NUDGE_REJECTION]}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText(NUDGE_INACTIVITY.message)).toBeInTheDocument();
    expect(screen.getByText(NUDGE_REJECTION.message)).toBeInTheDocument();
  });

  it('renders nothing when nudges array is empty', () => {
    const { container } = render(<CoachingNudgeBar nudges={[]} onDismiss={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('calls onDismiss with the correct nudge id when X button is clicked', () => {
    const onDismiss = vi.fn();
    render(
      <CoachingNudgeBar nudges={[NUDGE_INACTIVITY, NUDGE_REJECTION]} onDismiss={onDismiss} />,
    );

    const dismissButtons = screen.getAllByRole('button', { name: /dismiss nudge/i });
    expect(dismissButtons).toHaveLength(2);

    fireEvent.click(dismissButtons[0]);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith('n1');
  });

  it('shows max 3 nudges even when more are provided', () => {
    render(
      <CoachingNudgeBar
        nudges={[NUDGE_INACTIVITY, NUDGE_REJECTION, NUDGE_STALLED, NUDGE_MILESTONE]}
        onDismiss={vi.fn()}
      />,
    );

    // Only first 3 should appear
    expect(screen.getByText(NUDGE_INACTIVITY.message)).toBeInTheDocument();
    expect(screen.getByText(NUDGE_REJECTION.message)).toBeInTheDocument();
    expect(screen.getByText(NUDGE_STALLED.message)).toBeInTheDocument();
    expect(screen.queryByText(NUDGE_MILESTONE.message)).not.toBeInTheDocument();
  });

  it('applies amber border for inactivity trigger_type', () => {
    const { container } = render(
      <CoachingNudgeBar nudges={[NUDGE_INACTIVITY]} onDismiss={vi.fn()} />,
    );
    // The GlassCard wrapper should have the amber border class
    const card = container.querySelector('.border-\\[\\#dfc797\\]\\/20');
    expect(card).not.toBeNull();
  });

  it('applies blue border for rejection_streak trigger_type', () => {
    const { container } = render(
      <CoachingNudgeBar nudges={[NUDGE_REJECTION]} onDismiss={vi.fn()} />,
    );
    const card = container.querySelector('.border-\\[\\#98b3ff\\]\\/20');
    expect(card).not.toBeNull();
  });

  it('applies green border for milestone trigger_type', () => {
    const { container } = render(
      <CoachingNudgeBar nudges={[NUDGE_MILESTONE]} onDismiss={vi.fn()} />,
    );
    const card = container.querySelector('.border-\\[\\#b5dec2\\]\\/20');
    expect(card).not.toBeNull();
  });

  it('renders a single nudge correctly', () => {
    const onDismiss = vi.fn();
    render(<CoachingNudgeBar nudges={[NUDGE_MILESTONE]} onDismiss={onDismiss} />);
    expect(screen.getByText(NUDGE_MILESTONE.message)).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: /dismiss nudge/i });
    fireEvent.click(btn);
    expect(onDismiss).toHaveBeenCalledWith('n4');
  });

  it('each nudge has an accessible dismiss button', () => {
    render(
      <CoachingNudgeBar nudges={[NUDGE_INACTIVITY, NUDGE_STALLED]} onDismiss={vi.fn()} />,
    );
    const buttons = screen.getAllByRole('button', { name: /dismiss nudge/i });
    expect(buttons).toHaveLength(2);
  });
});
