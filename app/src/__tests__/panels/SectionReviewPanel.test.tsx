// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SectionReviewPanel } from '../../components/panels/SectionReviewPanel';

// jsdom doesn't implement scrollIntoView
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultProps = {
  section: 'professional_summary',
  content: '- Led a team of 50 engineers\n- Delivered $10M in savings\nA seasoned executive with deep cloud expertise.',
  onApprove: vi.fn(),
  onRequestChanges: vi.fn(),
  onDirectEdit: vi.fn(),
};

function renderPanel(overrides?: Partial<typeof defaultProps>) {
  return render(<SectionReviewPanel {...defaultProps} {...overrides} />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SectionReviewPanel', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  // --- Header & Rendering ---
  it('renders the panel header', () => {
    renderPanel();
    expect(screen.getByText('Review This Section')).toBeInTheDocument();
  });

  it('renders the section title in Title Case', () => {
    renderPanel();
    // Title appears in both the badge and the content heading
    const titles = screen.getAllByText('Professional Summary');
    expect(titles.length).toBeGreaterThanOrEqual(1);
  });

  it('renders kebab-case section names as Title Case', () => {
    renderPanel({ section: 'work-experience' });
    const titles = screen.getAllByText('Work Experience');
    expect(titles.length).toBeGreaterThanOrEqual(1);
  });

  it('renders content lines as text', () => {
    renderPanel();
    expect(screen.getByText('Led a team of 50 engineers')).toBeInTheDocument();
    expect(screen.getByText(/Delivered \$10M in savings/)).toBeInTheDocument();
    expect(screen.getByText(/A seasoned executive/)).toBeInTheDocument();
  });

  it('shows empty state when content is blank', () => {
    renderPanel({ content: '' });
    expect(screen.getByText('No content to display.')).toBeInTheDocument();
  });

  // --- Action Buttons ---
  it('renders Approve, Quick Fix, and Edit buttons', () => {
    renderPanel();
    expect(screen.getByText('Approve')).toBeInTheDocument();
    expect(screen.getByText('Quick Fix')).toBeInTheDocument();
    expect(screen.getByText('Edit')).toBeInTheDocument();
  });

  it('calls onApprove when Approve is clicked', () => {
    const onApprove = vi.fn();
    renderPanel({ onApprove });
    fireEvent.click(screen.getByText('Approve'));
    expect(onApprove).toHaveBeenCalledOnce();
  });

  // --- Quick Fix Mode ---
  it('shows quick fix chips when Quick Fix button is clicked', () => {
    renderPanel();
    fireEvent.click(screen.getByText('Quick Fix'));
    expect(screen.getByText('Select quick fixes')).toBeInTheDocument();
    expect(screen.getByText('Add metrics')).toBeInTheDocument();
    expect(screen.getByText('Make it shorter')).toBeInTheDocument();
    expect(screen.getByText('Sounds too generic')).toBeInTheDocument();
  });

  it('toggles chip selection on click', () => {
    renderPanel();
    fireEvent.click(screen.getByText('Quick Fix'));

    const chip = screen.getByText('Add metrics');
    fireEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'false');
  });

  it('sends feedback with selected chips when Send Feedback is clicked', () => {
    const onRequestChanges = vi.fn();
    renderPanel({ onRequestChanges });
    fireEvent.click(screen.getByText('Quick Fix'));

    fireEvent.click(screen.getByText('Add metrics'));
    fireEvent.click(screen.getByText('Wrong tone'));
    fireEvent.click(screen.getByText('Send Feedback'));

    expect(onRequestChanges).toHaveBeenCalledOnce();
    const arg = onRequestChanges.mock.calls[0][0] as string;
    expect(arg).toContain('Add metrics');
    expect(arg).toContain('Wrong tone');
  });

  it('disables Send Feedback when no chips are selected', () => {
    renderPanel();
    fireEvent.click(screen.getByText('Quick Fix'));
    const sendBtn = screen.getByText('Send Feedback').closest('button')!;
    expect(sendBtn).toBeDisabled();
  });

  it('toggles Quick Fix mode off on second click', () => {
    renderPanel();
    fireEvent.click(screen.getByText('Quick Fix'));
    expect(screen.getByText('Select quick fixes')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Quick Fix'));
    expect(screen.queryByText('Select quick fixes')).not.toBeInTheDocument();
  });

  // --- Edit Mode ---
  it('switches to editor when Edit is clicked', () => {
    renderPanel();
    fireEvent.click(screen.getByText('Edit'));
    // SectionEditor should render — look for its textarea aria-label
    expect(screen.getByLabelText(/Edit Professional Summary section content/i)).toBeInTheDocument();
  });

  it('hides action bar in edit mode', () => {
    renderPanel();
    fireEvent.click(screen.getByText('Edit'));
    expect(screen.queryByText('Approve')).not.toBeInTheDocument();
    expect(screen.queryByText('Quick Fix')).not.toBeInTheDocument();
  });

  // --- Prop-change Reset ---
  it('resets mode to view when section prop changes', () => {
    const { rerender } = render(
      <SectionReviewPanel {...defaultProps} />,
    );
    // Enter quickfix mode
    fireEvent.click(screen.getByText('Quick Fix'));
    expect(screen.getByText('Select quick fixes')).toBeInTheDocument();

    // Section changes
    rerender(<SectionReviewPanel {...defaultProps} section="work_experience" />);
    expect(screen.queryByText('Select quick fixes')).not.toBeInTheDocument();
    expect(screen.getByText('Approve')).toBeInTheDocument();
  });

  it('resets mode to view when content prop changes', () => {
    const { rerender } = render(
      <SectionReviewPanel {...defaultProps} />,
    );
    fireEvent.click(screen.getByText('Quick Fix'));
    expect(screen.getByText('Select quick fixes')).toBeInTheDocument();

    rerender(<SectionReviewPanel {...defaultProps} content="Updated content from server" />);
    expect(screen.queryByText('Select quick fixes')).not.toBeInTheDocument();
  });
});
