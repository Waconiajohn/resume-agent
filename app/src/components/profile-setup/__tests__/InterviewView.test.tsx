// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { InterviewView } from '../InterviewView';
import type { IntakeAnalysis } from '@/types/profile-setup';

function makeIntake(): IntakeAnalysis {
  return {
    why_me_draft: 'Neal turns messy healthcare data into tools leaders use.',
    career_thread: 'Healthcare analytics leader',
    top_capabilities: [],
    profile_gaps: [],
    primary_concern: null,
    interview_questions: [
      {
        question: 'What is the biggest data system you owned?',
        what_we_are_looking_for: 'scale and ownership',
        references_resume_element: 'Kaiser Permanente',
        suggested_starters: [
          'Membership forecasting models',
          'Executive reporting dashboards',
          'Data quality programs',
          'Something else',
        ],
      },
      {
        question: 'What was the measurable result?',
        what_we_are_looking_for: 'impact',
        references_resume_element: null,
        suggested_starters: [],
      },
    ],
    structured_experience: [],
  };
}

describe('Profile Setup InterviewView', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('lets users choose multiple suggested starters before sending an answer', async () => {
    const onAnswer = vi.fn().mockResolvedValue(undefined);

    render(
      <InterviewView
        intake={makeIntake()}
        currentQuestionIndex={0}
        onAnswer={onAnswer}
        onComplete={vi.fn()}
        answering={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Membership forecasting models' }));
    fireEvent.click(screen.getByRole('button', { name: 'Executive reporting dashboards' }));

    expect(screen.getByRole('button', { name: 'Membership forecasting models' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Executive reporting dashboards' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText(/your answer/i)).toHaveValue(
      'Membership forecasting models —\nExecutive reporting dashboards — ',
    );

    fireEvent.keyDown(screen.getByLabelText(/your answer/i), { key: 'Enter' });

    await waitFor(() => {
      expect(onAnswer).toHaveBeenCalledWith(
        'Membership forecasting models —\nExecutive reporting dashboards —',
      );
    });
  });
});
