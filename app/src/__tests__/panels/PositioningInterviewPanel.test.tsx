// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { PositioningInterviewPanel } from '../../components/panels/PositioningInterviewPanel';
import type { PositioningInterviewData } from '../../types/panels';
import type { PositioningQuestion } from '../../types/session';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeQuestion(overrides?: Partial<PositioningQuestion>): PositioningQuestion {
  return {
    id: 'q-001',
    question_number: 1,
    question_text: 'Describe a time you scaled an engineering team.',
    context: 'This maps to the leadership requirement.',
    input_type: 'hybrid',
    suggestions: [],
    requirement_map: [],
    is_follow_up: false,
    ...overrides,
  };
}

function makeData(overrides?: Partial<PositioningInterviewData>): PositioningInterviewData {
  return {
    current_question: makeQuestion(),
    questions_total: 10,
    questions_answered: 3,
    category_progress: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PositioningInterviewPanel', () => {
  afterEach(() => cleanup());

  // 1. Renders question text
  it('renders the current question text', () => {
    render(<PositioningInterviewPanel data={makeData()} />);
    expect(screen.getByText('Describe a time you scaled an engineering team.')).toBeInTheDocument();
  });

  // 2. Shows progress counter
  it('renders question progress counter', () => {
    render(<PositioningInterviewPanel data={makeData()} />);
    // questions_answered=3, so displayedIndex=4; questions_total=10
    expect(screen.getByLabelText('Question 4 of 10')).toBeInTheDocument();
  });

  // 3. Renders suggestion options when present
  it('renders suggestion cards when suggestions are provided', () => {
    const data = makeData({
      current_question: makeQuestion({
        suggestions: [
          { label: 'Led team of 40', description: 'Engineering org scale', source: 'resume' },
          { label: 'Built hiring pipeline', description: 'Recruited 15 engineers', source: 'inferred' },
        ],
        input_type: 'hybrid',
      }),
    });

    render(<PositioningInterviewPanel data={data} />);

    expect(screen.getByText('Led team of 40')).toBeInTheDocument();
    expect(screen.getByText('Built hiring pipeline')).toBeInTheDocument();
  });

  // 4. Submit button disabled when no input
  it('submit button is disabled when no answer has been provided', () => {
    render(<PositioningInterviewPanel data={makeData()} />);
    const submitBtn = screen.getByRole('button', { name: /submit answer/i });
    expect(submitBtn).toBeDisabled();
  });

  // 5. Submit button enabled after typing in textarea
  it('submit button is enabled after typing a custom answer', () => {
    render(<PositioningInterviewPanel data={makeData()} />);
    const textarea = screen.getByRole('textbox', { name: /custom answer/i });
    fireEvent.change(textarea, { target: { value: 'I led a team of 40 engineers across 5 product areas.' } });
    const submitBtn = screen.getByRole('button', { name: /submit answer/i });
    expect(submitBtn).not.toBeDisabled();
  });

  // 6. Calls onRespond with answer on submit
  it('calls onRespond with the typed answer when Continue is clicked', () => {
    const onRespond = vi.fn();
    render(<PositioningInterviewPanel data={makeData()} onRespond={onRespond} />);
    const textarea = screen.getByRole('textbox', { name: /custom answer/i });
    fireEvent.change(textarea, { target: { value: 'Grew the team from 5 to 40.' } });
    fireEvent.click(screen.getByRole('button', { name: /submit answer/i }));
    expect(onRespond).toHaveBeenCalledWith('q-001', 'Grew the team from 5 to 40.', undefined);
  });

  // 7. needsElaboration gates submit when inferred suggestion is selected without custom text
  it('shows elaboration hint and disables submit when inferred suggestion is selected without custom text', () => {
    const data = makeData({
      current_question: makeQuestion({
        suggestions: [
          { label: 'Cloud migration', description: 'Led AWS migrations', source: 'inferred' },
        ],
        input_type: 'hybrid',
      }),
    });

    render(<PositioningInterviewPanel data={data} />);

    // Select the inferred suggestion
    fireEvent.click(screen.getByText('Cloud migration'));

    // Elaboration hint should appear
    expect(screen.getByText(/please add a specific example/i)).toBeInTheDocument();

    // Submit should remain disabled
    const submitBtn = screen.getByRole('button', { name: /submit answer/i });
    expect(submitBtn).toBeDisabled();
  });

  // 8. Loading state renders when no current_question
  it('renders loading state when current_question is undefined', () => {
    const data = makeData({ current_question: undefined });
    render(<PositioningInterviewPanel data={data} />);
    expect(screen.getByText(/loading next question/i)).toBeInTheDocument();
  });
});
