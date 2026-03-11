// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SectionEditor } from '../../components/panels/SectionEditor';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultProps = {
  content: 'Led a team of 50 engineers across three continents.',
  section: 'professional_summary',
  onSave: vi.fn(),
  onCancel: vi.fn(),
};

function renderEditor(overrides?: Partial<typeof defaultProps>) {
  return render(<SectionEditor {...defaultProps} {...overrides} />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SectionEditor', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  // --- Rendering ---
  it('renders the textarea with content', () => {
    renderEditor();
    const textarea = screen.getByLabelText(/Edit Professional Summary section content/i) as HTMLTextAreaElement;
    expect(textarea).toBeInTheDocument();
    expect(textarea.value).toBe('Led a team of 50 engineers across three continents.');
  });

  it('renders aria-label with properly formatted section name', () => {
    renderEditor({ section: 'work_experience' });
    expect(screen.getByLabelText(/Edit Work Experience section content/i)).toBeInTheDocument();
  });

  // --- Word Count ---
  it('displays the correct word count', () => {
    renderEditor();
    // "Led a team of 50 engineers across three continents." = 9 words
    // sr-only live region + visible span both show word count
    expect(screen.getAllByText('9 words').length).toBeGreaterThanOrEqual(1);
  });

  it('shows singular "word" for single word content', () => {
    renderEditor({ content: 'Hello' });
    expect(screen.getAllByText('1 word').length).toBeGreaterThanOrEqual(1);
  });

  it('shows 0 words for empty content', () => {
    renderEditor({ content: '' });
    expect(screen.getAllByText('0 words').length).toBeGreaterThanOrEqual(1);
  });

  it('updates word count as user types', () => {
    renderEditor({ content: 'Hello world' });
    expect(screen.getAllByText('2 words').length).toBeGreaterThanOrEqual(1);

    const textarea = screen.getByLabelText(/Edit Professional Summary section content/i);
    fireEvent.change(textarea, { target: { value: 'Hello world foo bar' } });
    expect(screen.getAllByText('4 words').length).toBeGreaterThanOrEqual(1);
  });

  // --- Save / Cancel ---
  it('renders Save and Cancel buttons', () => {
    renderEditor();
    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('calls onSave with the current value when Save is clicked', () => {
    const onSave = vi.fn();
    renderEditor({ onSave });

    const textarea = screen.getByLabelText(/Edit Professional Summary section content/i);
    fireEvent.change(textarea, { target: { value: 'Updated content here' } });
    fireEvent.click(screen.getByText('Save'));

    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledWith('Updated content here');
  });

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn();
    renderEditor({ onCancel });
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('disables Save button when content is only whitespace', () => {
    renderEditor({ content: '   ' });
    const saveBtn = screen.getByText('Save').closest('button')!;
    expect(saveBtn).toBeDisabled();
  });

  it('enables Save button when content has text', () => {
    renderEditor();
    const saveBtn = screen.getByText('Save').closest('button')!;
    expect(saveBtn).not.toBeDisabled();
  });
});
