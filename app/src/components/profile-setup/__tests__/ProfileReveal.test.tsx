// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ProfileReveal } from '../ProfileReveal';

const navigateMock = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

function makeProfile() {
  return {
    career_thread: 'Operator to engineering leader',
    top_capabilities: [
      {
        capability: 'Executive communication',
        evidence: 'Built trust with cross-functional leaders.',
        source: 'interview' as const,
      },
    ],
    signature_story: {
      situation: '',
      task: '',
      action: '',
      result: '',
      reflection: '',
    },
    honest_answer: {
      concern: '',
      response: '',
    },
    righteous_close: '',
    why_me_final: {
      headline: 'Engineering leader',
      body: 'Scales platforms and teams.',
    },
    target_roles: ['VP Engineering'],
    created_at: '2026-04-07T00:00:00.000Z',
  };
}

describe('ProfileReveal', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows a retry affordance when the master resume was not created', () => {
    const onRetry = vi.fn();

    render(
      <ProfileReveal
        profile={makeProfile()}
        masterResumeCreated={false}
        onRetryMasterResume={onRetry}
      />,
    );

    expect(screen.getByText(/your profile is saved, but your first master resume still needs one more step/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /retry creating my master resume/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('hides the retry affordance once the master resume exists', () => {
    render(
      <ProfileReveal
        profile={makeProfile()}
        masterResumeCreated
      />,
    );

    expect(screen.queryByRole('button', { name: /retry creating my master resume/i })).not.toBeInTheDocument();
  });

  it('shows a success confirmation once the master resume retry succeeds', () => {
    render(
      <ProfileReveal
        profile={makeProfile()}
        masterResumeCreated
        masterResumeRecovered
      />,
    );

    expect(screen.getByText(/your master resume is ready now/i)).toBeInTheDocument();
    expect(screen.getByText(/the retry worked/i)).toBeInTheDocument();
  });
});
