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
    expect(screen.getByText(/please edit the selected suggestion or add a specific example/i)).toBeInTheDocument();

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

  // ───────────────────────────────────────────────────────────────────────────
  // Multi-select + editable suggestions tests
  // ───────────────────────────────────────────────────────────────────────────

  // 9. Multi-select: can select two suggestions (both show checked)
  it('allows selecting multiple suggestion cards', () => {
    const data = makeData({
      current_question: makeQuestion({
        suggestions: [
          { label: 'Led team of 40', description: 'Engineering org scale', source: 'resume' },
          { label: 'Cloud migration', description: 'Led AWS migrations', source: 'resume' },
        ],
        input_type: 'hybrid',
      }),
    });

    render(<PositioningInterviewPanel data={data} />);

    fireEvent.click(screen.getByText('Led team of 40'));
    fireEvent.click(screen.getByText('Cloud migration'));

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0]).toHaveAttribute('aria-checked', 'true');
    expect(checkboxes[1]).toHaveAttribute('aria-checked', 'true');
  });

  // 10. Multi-select: deselect removes from selection
  it('deselects a suggestion when clicked again', () => {
    const data = makeData({
      current_question: makeQuestion({
        suggestions: [
          { label: 'Led team of 40', description: 'Engineering org scale', source: 'resume' },
          { label: 'Cloud migration', description: 'Led AWS migrations', source: 'resume' },
        ],
        input_type: 'hybrid',
      }),
    });

    render(<PositioningInterviewPanel data={data} />);

    fireEvent.click(screen.getByText('Led team of 40'));
    fireEvent.click(screen.getByText('Cloud migration'));
    // Deselect the first
    fireEvent.click(screen.getByText('Led team of 40'));

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0]).toHaveAttribute('aria-checked', 'false');
    expect(checkboxes[1]).toHaveAttribute('aria-checked', 'true');
  });

  // 11. Multi-select: submit composes both texts joined by \n\n
  it('composes multiple selected suggestions joined by double newline on submit', () => {
    const onRespond = vi.fn();
    const data = makeData({
      current_question: makeQuestion({
        suggestions: [
          { label: 'Led team of 40', description: 'Engineering org scale', source: 'resume' },
          { label: 'Cloud migration', description: 'Led AWS migrations', source: 'resume' },
        ],
        input_type: 'hybrid',
      }),
    });

    render(<PositioningInterviewPanel data={data} onRespond={onRespond} />);

    fireEvent.click(screen.getByText('Led team of 40'));
    fireEvent.click(screen.getByText('Cloud migration'));
    fireEvent.click(screen.getByRole('button', { name: /submit answer/i }));

    expect(onRespond).toHaveBeenCalledWith(
      'q-001',
      'Led team of 40: Engineering org scale\n\nCloud migration: Led AWS migrations',
      'Led team of 40, Cloud migration',
    );
  });

  // 12. Editable: inline textarea appears when card is selected
  it('shows inline edit textarea when a suggestion is selected', () => {
    const data = makeData({
      current_question: makeQuestion({
        suggestions: [
          { label: 'Led team of 40', description: 'Engineering org scale', source: 'resume' },
        ],
        input_type: 'hybrid',
      }),
    });

    render(<PositioningInterviewPanel data={data} />);

    // No inline textarea before selection
    expect(screen.queryByLabelText(/edit suggestion/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Led team of 40'));

    // Inline textarea should now exist
    expect(screen.getByLabelText('Edit suggestion: Led team of 40')).toBeInTheDocument();
  });

  // 13. Editable: textarea pre-filled with suggestion text
  it('pre-fills inline textarea with label and description', () => {
    const data = makeData({
      current_question: makeQuestion({
        suggestions: [
          { label: 'Led team of 40', description: 'Engineering org scale', source: 'resume' },
        ],
        input_type: 'hybrid',
      }),
    });

    render(<PositioningInterviewPanel data={data} />);
    fireEvent.click(screen.getByText('Led team of 40'));

    const textarea = screen.getByLabelText('Edit suggestion: Led team of 40') as HTMLTextAreaElement;
    expect(textarea.value).toBe('Led team of 40: Engineering org scale');
  });

  // 14. Editable: edited text used in submitted answer
  it('uses edited suggestion text in submitted answer', () => {
    const onRespond = vi.fn();
    const data = makeData({
      current_question: makeQuestion({
        suggestions: [
          { label: 'Led team of 40', description: 'Engineering org scale', source: 'resume' },
        ],
        input_type: 'hybrid',
      }),
    });

    render(<PositioningInterviewPanel data={data} onRespond={onRespond} />);
    fireEvent.click(screen.getByText('Led team of 40'));

    const textarea = screen.getByLabelText('Edit suggestion: Led team of 40');
    fireEvent.change(textarea, { target: { value: 'Scaled engineering team from 5 to 40 across 3 product lines' } });

    fireEvent.click(screen.getByRole('button', { name: /submit answer/i }));

    expect(onRespond).toHaveBeenCalledWith(
      'q-001',
      'Scaled engineering team from 5 to 40 across 3 product lines',
      'Led team of 40',
    );
  });

  // 15. Elaboration: editing inferred suggestion satisfies needsElaboration
  it('editing inferred suggestion inline satisfies elaboration requirement', () => {
    const data = makeData({
      current_question: makeQuestion({
        suggestions: [
          { label: 'Cloud migration', description: 'Led AWS migrations', source: 'inferred' },
        ],
        input_type: 'hybrid',
      }),
    });

    render(<PositioningInterviewPanel data={data} />);
    fireEvent.click(screen.getByText('Cloud migration'));

    // Submit should be disabled before editing
    expect(screen.getByRole('button', { name: /submit answer/i })).toBeDisabled();

    // Edit the inline textarea
    const textarea = screen.getByLabelText('Edit suggestion: Cloud migration');
    fireEvent.change(textarea, { target: { value: 'Migrated 200 services to AWS, reducing costs by 40%' } });

    // Submit should now be enabled
    expect(screen.getByRole('button', { name: /submit answer/i })).not.toBeDisabled();
  });

  // 16. Elaboration: mixed sources — unedited inferred blocks submit, editing unblocks
  it('mixed sources: unedited inferred blocks submit, editing it unblocks', () => {
    const data = makeData({
      current_question: makeQuestion({
        suggestions: [
          { label: 'Led team of 40', description: 'Engineering org scale', source: 'resume' },
          { label: 'Cloud migration', description: 'Led AWS migrations', source: 'inferred' },
        ],
        input_type: 'hybrid',
      }),
    });

    render(<PositioningInterviewPanel data={data} />);

    // Select both
    fireEvent.click(screen.getByText('Led team of 40'));
    fireEvent.click(screen.getByText('Cloud migration'));

    // Submit blocked because inferred suggestion is unedited
    expect(screen.getByRole('button', { name: /submit answer/i })).toBeDisabled();

    // Edit the inferred suggestion inline
    const textarea = screen.getByLabelText('Edit suggestion: Cloud migration');
    fireEvent.change(textarea, { target: { value: 'Migrated 200 services to AWS' } });

    // Now submit should be enabled
    expect(screen.getByRole('button', { name: /submit answer/i })).not.toBeDisabled();
  });
});
