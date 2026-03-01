// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { BlueprintReviewPanel } from '../../components/panels/BlueprintReviewPanel';
import type { BlueprintReviewData } from '../../types/panels';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeData(overrides?: Partial<BlueprintReviewData>): BlueprintReviewData {
  return {
    target_role: 'VP of Engineering',
    positioning_angle: 'Systems thinker who scales engineering orgs from 10 to 100+.',
    section_plan: {
      order: ['summary', 'experience', 'skills', 'education'],
      rationale: 'Experience-first layout for senior IC.',
    },
    age_protection: {
      flags: [],
      clean: true,
    },
    evidence_allocation_count: 8,
    keyword_count: 14,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BlueprintReviewPanel', () => {
  afterEach(() => cleanup());

  // 1. Renders target role and positioning angle
  it('renders the target role', () => {
    render(<BlueprintReviewPanel data={makeData()} onApprove={vi.fn()} />);
    expect(screen.getByText('VP of Engineering')).toBeInTheDocument();
  });

  it('renders the positioning angle text', () => {
    render(<BlueprintReviewPanel data={makeData()} onApprove={vi.fn()} />);
    expect(screen.getByText(/systems thinker who scales engineering orgs/i)).toBeInTheDocument();
  });

  // 2. Renders section order list
  it('renders all sections in the section order', () => {
    render(<BlueprintReviewPanel data={makeData()} onApprove={vi.fn()} />);
    expect(screen.getByText('Summary')).toBeInTheDocument();
    expect(screen.getByText('Experience')).toBeInTheDocument();
    expect(screen.getByText('Skills')).toBeInTheDocument();
    expect(screen.getByText('Education')).toBeInTheDocument();
  });

  // 3. Approve button calls onApprove without edits
  it('calls onApprove with no arguments when no edits were made', () => {
    const onApprove = vi.fn();
    render(<BlueprintReviewPanel data={makeData()} onApprove={onApprove} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Approve blueprint and start writing' }),
    );
    expect(onApprove).toHaveBeenCalledWith();
  });

  // 4. Edit mode toggle — clicking the angle text enters edit mode
  it('enters edit mode when positioning angle area is clicked', () => {
    render(<BlueprintReviewPanel data={makeData()} onApprove={vi.fn()} />);
    // The positioning angle is rendered inside a <button> (read-only display mode)
    const angleButton = screen.getByRole('button', { name: /systems thinker/i });
    fireEvent.click(angleButton);
    // After clicking, a textarea should appear
    expect(screen.getByPlaceholderText(/enter positioning angle/i)).toBeInTheDocument();
  });

  // 5. Section reorder — move up button works
  it('move up button reorders sections', () => {
    const onApprove = vi.fn();
    render(<BlueprintReviewPanel data={makeData()} onApprove={onApprove} />);

    // "Skills" is at index 2; click its labeled "Move Skills up" button
    const moveSkillsUp = screen.getByRole('button', { name: 'Move Skills up' });
    fireEvent.click(moveSkillsUp);

    // After reorder, the approve button text changes to reflect edits
    expect(
      screen.getByText('Approve with Edits & Start Writing'),
    ).toBeInTheDocument();
  });

  // 6. Approve with edits sends edits object
  it('calls onApprove with edits when positioning angle was changed', () => {
    const onApprove = vi.fn();
    render(<BlueprintReviewPanel data={makeData()} onApprove={onApprove} />);

    // Enter edit mode
    const angleButton = screen.getByRole('button', { name: /systems thinker/i });
    fireEvent.click(angleButton);

    // Change the text
    const textarea = screen.getByPlaceholderText(/enter positioning angle/i);
    fireEvent.change(textarea, { target: { value: 'Operational excellence leader who scales globally.' } });

    // Click Done to exit edit mode
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    // Approve should now pass edits — use aria-label to find button
    const approveBtn = screen.getByRole('button', {
      name: 'Approve blueprint with edits and start writing',
    });
    fireEvent.click(approveBtn);
    expect(onApprove).toHaveBeenCalledWith(
      expect.objectContaining({
        positioning_angle: 'Operational excellence leader who scales globally.',
      }),
    );
  });
});
