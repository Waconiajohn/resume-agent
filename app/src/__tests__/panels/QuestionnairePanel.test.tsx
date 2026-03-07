// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuestionnairePanel } from '../../components/panels/QuestionnairePanel';
import type { QuestionnaireData } from '../../types/panels';
import type { QuestionnaireQuestion } from '../../types/session';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/constants/process-contract', () => ({
  processStepFromQuestionnaireStage: vi.fn().mockReturnValue('positioning'),
}));

vi.mock('@/components/shared/ProcessStepGuideCard', () => ({
  ProcessStepGuideCard: ({ step }: { step: string }) => (
    <div data-testid="process-step-guide">{step}</div>
  ),
}));

vi.mock('../GlassCard', () => ({
  GlassCard: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="glass-card" className={className}>{children}</div>
  ),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQuestion(overrides?: Partial<QuestionnaireQuestion>): QuestionnaireQuestion {
  return {
    id: 'q1',
    question_text: 'What is your leadership style?',
    input_type: 'single_choice',
    allow_custom: false,
    allow_skip: false,
    options: [
      { id: 'opt-a', label: 'Collaborative' },
      { id: 'opt-b', label: 'Directive' },
    ],
    ...overrides,
  };
}

function makeData(overrides?: Partial<QuestionnaireData>): QuestionnaireData {
  return {
    questionnaire_id: 'qn-001',
    schema_version: 1,
    stage: 'positioning',
    title: 'Getting to Know You',
    current_index: 0,
    questions: [makeQuestion()],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('QuestionnairePanel', () => {
  afterEach(() => cleanup());

  // ── Rendering ───────────────────────────────────────────────────────────

  describe('rendering', () => {
    it('renders the question text', () => {
      render(<QuestionnairePanel data={makeData()} onComplete={vi.fn()} />);
      expect(screen.getByText('What is your leadership style?')).toBeInTheDocument();
    });

    it('renders progress header with step count', () => {
      render(
        <QuestionnairePanel
          data={makeData({
            questions: [makeQuestion({ id: 'q1' }), makeQuestion({ id: 'q2', question_text: 'Second?' })],
          })}
          onComplete={vi.fn()}
        />,
      );
      // ProgressHeader shows "1 of 2"
      expect(screen.getByText(/1/)).toBeInTheDocument();
    });

    it('renders batch mode label for positioning stage', () => {
      render(<QuestionnairePanel data={makeData({ stage: 'positioning', title: 'Panel Title' })} onComplete={vi.fn()} />);
      expect(screen.getByText('Getting to Know You')).toBeInTheDocument();
    });

    it('renders batch mode label for gap_analysis stage', () => {
      render(<QuestionnairePanel data={makeData({ stage: 'gap_analysis' })} onComplete={vi.fn()} />);
      expect(screen.getByText('Closing the Gaps')).toBeInTheDocument();
    });

    it('renders batch mode label for quality_fixes stage', () => {
      render(<QuestionnairePanel data={makeData({ stage: 'quality_fixes' })} onComplete={vi.fn()} />);
      expect(screen.getByText('Final Touches')).toBeInTheDocument();
    });

    it('renders empty state when no questions available', () => {
      render(
        <QuestionnairePanel
          data={makeData({ questions: [] })}
          onComplete={vi.fn()}
        />,
      );
      expect(screen.getByText('No questions available.')).toBeInTheDocument();
    });

    it('renders subtitle on first question when provided', () => {
      render(
        <QuestionnairePanel
          data={makeData({ subtitle: 'Help us understand your background.' })}
          onComplete={vi.fn()}
        />,
      );
      expect(screen.getByText('Help us understand your background.')).toBeInTheDocument();
    });

    it('renders single choice options', () => {
      render(<QuestionnairePanel data={makeData()} onComplete={vi.fn()} />);
      expect(screen.getByText('Collaborative')).toBeInTheDocument();
      expect(screen.getByText('Directive')).toBeInTheDocument();
    });

    it('renders impact tier badge when present', () => {
      render(
        <QuestionnairePanel
          data={makeData({
            questions: [makeQuestion({ impact_tier: 'high', payoff_hint: 'This shapes your positioning.' })],
          })}
          onComplete={vi.fn()}
        />,
      );
      expect(screen.getByText('High Impact')).toBeInTheDocument();
      expect(screen.getByText('This shapes your positioning.')).toBeInTheDocument();
    });

    it('renders context card when question has context', () => {
      render(
        <QuestionnairePanel
          data={makeData({
            questions: [makeQuestion({ context: 'Think about your recent roles.' })],
          })}
          onComplete={vi.fn()}
        />,
      );
      expect(screen.getByText('Think about your recent roles.')).toBeInTheDocument();
    });

    it('renders custom text input when allow_custom is true', () => {
      render(
        <QuestionnairePanel
          data={makeData({
            questions: [makeQuestion({ allow_custom: true })],
          })}
          onComplete={vi.fn()}
        />,
      );
      expect(screen.getByLabelText('Custom answer')).toBeInTheDocument();
    });
  });

  // ── Navigation ──────────────────────────────────────────────────────────

  describe('navigation', () => {
    it('back button is disabled on first question', () => {
      render(<QuestionnairePanel data={makeData()} onComplete={vi.fn()} />);
      expect(screen.getByLabelText('Go back to previous question')).toBeDisabled();
    });

    it('continue button is disabled when no option is selected', () => {
      render(
        <QuestionnairePanel
          data={makeData({
            questions: [makeQuestion({ id: 'q1' }), makeQuestion({ id: 'q2', question_text: 'Q2?' })],
          })}
          onComplete={vi.fn()}
        />,
      );
      expect(screen.getByLabelText('Next question')).toBeDisabled();
    });

    it('continue button label says "Submit Answers" on last question', () => {
      render(<QuestionnairePanel data={makeData()} onComplete={vi.fn()} />);
      // Single question = last question
      expect(screen.getByLabelText('Submit your answers')).toBeInTheDocument();
    });

    it('skip button is visible when allow_skip is true', () => {
      render(
        <QuestionnairePanel
          data={makeData({ questions: [makeQuestion({ allow_skip: true })] })}
          onComplete={vi.fn()}
        />,
      );
      expect(screen.getByLabelText('Skip this question')).toBeInTheDocument();
    });

    it('skip button is hidden when allow_skip is false', () => {
      render(<QuestionnairePanel data={makeData()} onComplete={vi.fn()} />);
      expect(screen.queryByLabelText('Skip this question')).not.toBeInTheDocument();
    });

    it('"I\'m Ready" button is visible for positioning stage when onDraftNow is provided', () => {
      render(
        <QuestionnairePanel
          data={makeData({ stage: 'positioning' })}
          onComplete={vi.fn()}
          onDraftNow={vi.fn()}
        />,
      );
      expect(screen.getByLabelText('Skip remaining questions and start writing resume')).toBeInTheDocument();
    });

    it('"I\'m Ready" button is hidden for non-positioning stages', () => {
      render(
        <QuestionnairePanel
          data={makeData({ stage: 'gap_analysis' })}
          onComplete={vi.fn()}
          onDraftNow={vi.fn()}
        />,
      );
      expect(screen.queryByLabelText('Skip remaining questions and start writing resume')).not.toBeInTheDocument();
    });
  });

  // ── User Interactions ───────────────────────────────────────────────────

  describe('interactions', () => {
    it('selecting an option enables the continue button', async () => {
      const user = userEvent.setup();
      render(<QuestionnairePanel data={makeData()} onComplete={vi.fn()} />);

      await user.click(screen.getByText('Collaborative'));
      expect(screen.getByLabelText('Submit your answers')).not.toBeDisabled();
    });

    it('toggling a single-choice option deselects it', async () => {
      const user = userEvent.setup();
      render(<QuestionnairePanel data={makeData()} onComplete={vi.fn()} />);

      await user.click(screen.getByText('Collaborative'));
      expect(screen.getByLabelText('Submit your answers')).not.toBeDisabled();

      // Clicking the same option again deselects
      await user.click(screen.getByText('Collaborative'));
      expect(screen.getByLabelText('Submit your answers')).toBeDisabled();
    });

    it('multi-choice allows multiple selections', async () => {
      const user = userEvent.setup();
      const multiQ = makeQuestion({
        input_type: 'multi_choice',
        options: [
          { id: 'opt-a', label: 'Option A' },
          { id: 'opt-b', label: 'Option B' },
          { id: 'opt-c', label: 'Option C' },
        ],
      });
      render(
        <QuestionnairePanel
          data={makeData({ questions: [multiQ] })}
          onComplete={vi.fn()}
        />,
      );

      await user.click(screen.getByText('Option A'));
      await user.click(screen.getByText('Option C'));
      // Continue should be enabled
      expect(screen.getByLabelText('Submit your answers')).not.toBeDisabled();
    });

    it('typing custom text enables continue button', async () => {
      const user = userEvent.setup();
      render(
        <QuestionnairePanel
          data={makeData({ questions: [makeQuestion({ allow_custom: true })] })}
          onComplete={vi.fn()}
        />,
      );

      await user.type(screen.getByLabelText('Custom answer'), 'My leadership philosophy');
      expect(screen.getByLabelText('Submit your answers')).not.toBeDisabled();
    });
  });

  // ── Submission ──────────────────────────────────────────────────────────

  describe('submission', () => {
    it('calls onComplete with correct submission shape on submit', async () => {
      const user = userEvent.setup();
      const onComplete = vi.fn();
      render(<QuestionnairePanel data={makeData()} onComplete={onComplete} />);

      await user.click(screen.getByText('Collaborative'));
      await user.click(screen.getByLabelText('Submit your answers'));

      // Wait for setTimeout in navigate()
      await vi.waitFor(() => {
        expect(onComplete).toHaveBeenCalledOnce();
      });

      const submission = onComplete.mock.calls[0][0];
      expect(submission.questionnaire_id).toBe('qn-001');
      expect(submission.schema_version).toBe(1);
      expect(submission.stage).toBe('positioning');
      expect(submission.responses).toHaveLength(1);
      expect(submission.responses[0].selected_option_ids).toContain('opt-a');
      expect(submission.submitted_at).toBeDefined();
    });

    it('skipping a question calls onComplete (submits when last question)', async () => {
      const user = userEvent.setup();
      const onComplete = vi.fn();
      render(
        <QuestionnairePanel
          data={makeData({ questions: [makeQuestion({ allow_skip: true })] })}
          onComplete={onComplete}
        />,
      );

      await user.click(screen.getByLabelText('Skip this question'));

      await vi.waitFor(() => {
        expect(onComplete).toHaveBeenCalledOnce();
      });

      const submission = onComplete.mock.calls[0][0];
      expect(submission.questionnaire_id).toBe('qn-001');
      expect(submission.responses).toHaveLength(1);
    });

    it('skipping navigates forward when not on last question', async () => {
      const user = userEvent.setup();
      const onComplete = vi.fn();
      render(
        <QuestionnairePanel
          data={makeData({
            questions: [
              makeQuestion({ id: 'q1', allow_skip: true }),
              makeQuestion({ id: 'q2', question_text: 'Second question?' }),
            ],
          })}
          onComplete={onComplete}
        />,
      );

      await user.click(screen.getByLabelText('Skip this question'));
      // Should not submit yet — navigates to next question
      expect(onComplete).not.toHaveBeenCalled();
    });
  });

  // ── Dependency Resolution ───────────────────────────────────────────────

  describe('dependency resolution', () => {
    it('hides dependent question when parent has no response', () => {
      const questions: QuestionnaireQuestion[] = [
        makeQuestion({ id: 'q1', question_text: 'Parent question' }),
        makeQuestion({
          id: 'q2',
          question_text: 'Dependent question',
          depends_on: { question_id: 'q1', condition: 'equals', value: 'opt-a' },
        }),
      ];
      render(
        <QuestionnairePanel
          data={makeData({ questions })}
          onComplete={vi.fn()}
        />,
      );

      // Should show "Submit" on last visible question (only q1 is visible)
      expect(screen.getByLabelText('Submit your answers')).toBeInTheDocument();
    });

    it('shows dependent question after parent is answered with matching value', async () => {
      const user = userEvent.setup();
      const questions: QuestionnaireQuestion[] = [
        makeQuestion({ id: 'q1', question_text: 'Parent question' }),
        makeQuestion({
          id: 'q2',
          question_text: 'Follow-up question',
          depends_on: { question_id: 'q1', condition: 'equals', value: 'opt-a' },
        }),
      ];
      render(
        <QuestionnairePanel
          data={makeData({ questions })}
          onComplete={vi.fn()}
        />,
      );

      // Select the matching option
      await user.click(screen.getByText('Collaborative')); // opt-a
      // Now two questions visible, so button says "Next question"
      expect(screen.getByLabelText('Next question')).toBeInTheDocument();
    });

    it('includes impact_tag in submission when question has impact_tier', async () => {
      const user = userEvent.setup();
      const onComplete = vi.fn();
      render(
        <QuestionnairePanel
          data={makeData({
            questions: [makeQuestion({ impact_tier: 'high' })],
          })}
          onComplete={onComplete}
        />,
      );

      await user.click(screen.getByText('Collaborative'));
      await user.click(screen.getByLabelText('Submit your answers'));

      await vi.waitFor(() => {
        expect(onComplete).toHaveBeenCalledOnce();
      });

      const submission = onComplete.mock.calls[0][0];
      expect(submission.responses[0].impact_tag).toBe('high');
    });
  });
});
