// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CareerProfileRoom } from '../CareerProfileRoom';
import type { CareerProfileSummary } from '../career-profile-summary';
import type { AssessmentQuestion } from '@/types/onboarding';

const summary: CareerProfileSummary = {
  readinessPercent: 42,
  readinessLabel: 'Needs refinement',
  statusLine: 'The profile is taking shape but still needs stronger detail.',
  primaryStory: 'Operations leader with a record of building order inside fast-moving environments.',
  strengthSnapshot: 'People rely on you to align leaders, simplify complexity, and steady execution.',
  differentiationSnapshot: 'You bring adjacent executive operating experience that can stretch into broader ownership.',
  highlightPoints: ['Turns messy environments into clear operating systems.'],
  focusAreas: ['Clarify the size of teams, budgets, or business scope you owned.'],
  nextRecommendedRoom: 'career-profile',
  nextRecommendedAction: 'Finish Career Profile',
};

const questions: AssessmentQuestion[] = [
  {
    id: 'q1',
    question: 'What kind of role are you targeting next?',
    category: 'target_role',
    purpose: 'This tells the AI what kind of market story it should build across the platform.',
  },
];

describe('CareerProfileRoom', () => {
  it('renders the conversational intake with live profile preview', () => {
    render(
      <CareerProfileRoom
        profile={null}
        summary={summary}
        profileLoading={false}
        profileError={null}
        onboardingStatus="awaiting_responses"
        questions={questions}
        activityMessages={[]}
        currentStage={null}
        onStartAssessment={vi.fn().mockResolvedValue(true)}
        onSubmitResponses={vi.fn().mockResolvedValue(true)}
        onResetAssessment={vi.fn()}
      />,
    );

    expect(screen.getByText('Why AI is asking this')).toBeInTheDocument();
    expect(screen.getByText('Live profile preview')).toBeInTheDocument();
    expect(screen.queryByText('What the AI already learned')).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'I am targeting VP Operations or COO roles in SaaS.' } });

    expect(screen.getByText(/The AI is hearing/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /build career profile/i })).toBeInTheDocument();
  });
});
