// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LiveResumePanel } from '../../components/panels/LiveResumePanel';
import type { LiveResumeData, SectionChange } from '../../types/panels';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/clean-text', () => ({
  cleanText: (text: unknown) => (typeof text === 'string' ? text : String(text ?? '')),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeChange(overrides?: Partial<SectionChange>): SectionChange {
  return {
    original: 'Led team of engineers.',
    proposed: 'Led cross-functional team of 45 engineers across 3 continents.',
    reasoning: 'Quantified scope and scale.',
    jd_requirements: ['leadership', 'global experience'],
    ...overrides,
  };
}

function makeData(overrides?: Partial<LiveResumeData>): LiveResumeData {
  return {
    active_section: 'experience',
    changes: [makeChange()],
    proposed_content: '- Led cross-functional team of 45 engineers across 3 continents.\n- Drove $12M annual savings.',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LiveResumePanel', () => {
  afterEach(() => cleanup());

  // ── Rendering ───────────────────────────────────────────────────────────

  describe('rendering', () => {
    it('renders the Resume Preview header', () => {
      render(<LiveResumePanel data={makeData()} />);
      expect(screen.getByText('Resume Preview')).toBeInTheDocument();
    });

    it('renders the active section title formatted', () => {
      render(<LiveResumePanel data={makeData()} />);
      // Section title appears in both the header badge and the WYSIWYG heading
      const matches = screen.getAllByText('Experience');
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    it('renders section with underscored name formatted correctly', () => {
      render(<LiveResumePanel data={makeData({ active_section: 'work_experience' })} />);
      const matches = screen.getAllByText('Work Experience');
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    it('renders WYSIWYG content lines from proposed_content', () => {
      render(<LiveResumePanel data={makeData()} />);
      expect(screen.getByText(/Led cross-functional team/)).toBeInTheDocument();
      expect(screen.getByText(/Drove \$12M annual savings/)).toBeInTheDocument();
    });

    it('renders change diffs as fallback when no proposed_content', () => {
      render(
        <LiveResumePanel
          data={makeData({ proposed_content: undefined })}
        />,
      );
      // Falls back to changes.map(c => c.proposed)
      expect(screen.getByText(/Led cross-functional team of 45 engineers/)).toBeInTheDocument();
    });

    it('handles JSON-wrapped proposed_content gracefully', () => {
      const wrappedContent = JSON.stringify({
        proposed_content: 'Extracted content from JSON wrapper.',
      });
      render(
        <LiveResumePanel data={makeData({ proposed_content: wrappedContent })} />,
      );
      expect(screen.getByText('Extracted content from JSON wrapper.')).toBeInTheDocument();
    });

    it('shows change toggle when both content and changes exist', () => {
      render(
        <LiveResumePanel
          data={makeData()}
          onSendMessage={vi.fn()}
        />,
      );
      expect(screen.getByText(/View 1 change/)).toBeInTheDocument();
    });

    it('does not show action bar when onSendMessage is not provided', () => {
      render(<LiveResumePanel data={makeData()} />);
      expect(screen.queryByText('Approve All')).not.toBeInTheDocument();
    });

    it('shows action bar when onSendMessage is provided', () => {
      render(<LiveResumePanel data={makeData()} onSendMessage={vi.fn()} />);
      expect(screen.getByText('Approve All')).toBeInTheDocument();
      expect(screen.getByText('Request Changes')).toBeInTheDocument();
    });
  });

  // ── Interactions ────────────────────────────────────────────────────────

  describe('interactions', () => {
    it('clicking Approve All sends approve message', async () => {
      const user = userEvent.setup();
      const onSendMessage = vi.fn();
      render(<LiveResumePanel data={makeData()} onSendMessage={onSendMessage} />);

      await user.click(screen.getByText('Approve All'));
      expect(onSendMessage).toHaveBeenCalledWith(
        expect.stringContaining('approve the proposed changes'),
      );
    });

    it('clicking Request Changes sends request changes message', async () => {
      const user = userEvent.setup();
      const onSendMessage = vi.fn();
      render(<LiveResumePanel data={makeData()} onSendMessage={onSendMessage} />);

      await user.click(screen.getByText('Request Changes'));
      expect(onSendMessage).toHaveBeenCalledWith(
        expect.stringContaining('like some changes'),
      );
    });

    it('toggling view changes reveals change diffs', async () => {
      const user = userEvent.setup();
      render(
        <LiveResumePanel
          data={makeData()}
          onSendMessage={vi.fn()}
        />,
      );

      await user.click(screen.getByText(/View 1 change/));
      expect(screen.getByText('Original')).toBeInTheDocument();
      expect(screen.getByText('Proposed')).toBeInTheDocument();
    });

    it('clicking edit button on a line enters edit mode', async () => {
      const user = userEvent.setup();
      render(<LiveResumePanel data={makeData()} onSendMessage={vi.fn()} />);

      const editButtons = screen.getAllByLabelText(/Edit line/);
      await user.click(editButtons[0]);

      // Now editing — should show Save and Cancel buttons
      expect(screen.getByText('Save')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    it('clicking cancel exits edit mode without sending message', async () => {
      const user = userEvent.setup();
      const onSendMessage = vi.fn();
      render(<LiveResumePanel data={makeData()} onSendMessage={onSendMessage} />);

      const editButtons = screen.getAllByLabelText(/Edit line/);
      await user.click(editButtons[0]);
      await user.click(screen.getByText('Cancel'));

      expect(onSendMessage).not.toHaveBeenCalled();
      expect(screen.queryByText('Save')).not.toBeInTheDocument();
    });

    it('clicking remove button on a line sends delete message', async () => {
      const user = userEvent.setup();
      const onSendMessage = vi.fn();
      render(<LiveResumePanel data={makeData()} onSendMessage={onSendMessage} />);

      const removeButtons = screen.getAllByLabelText(/Remove line/);
      await user.click(removeButtons[0]);

      expect(onSendMessage).toHaveBeenCalledWith(
        expect.stringContaining('remove bullet'),
      );
    });

    it('saving an edit sends update message', async () => {
      const user = userEvent.setup();
      const onSendMessage = vi.fn();
      render(<LiveResumePanel data={makeData()} onSendMessage={onSendMessage} />);

      const editButtons = screen.getAllByLabelText(/Edit line/);
      await user.click(editButtons[0]);

      // Clear and type new text
      const textarea = screen.getByRole('textbox');
      await user.clear(textarea);
      await user.type(textarea, 'Updated bullet text');
      await user.click(screen.getByText('Save'));

      expect(onSendMessage).toHaveBeenCalledWith(
        expect.stringContaining('Updated bullet text'),
      );
    });
  });

  // ── Edge Cases ──────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('renders with empty changes array', () => {
      render(
        <LiveResumePanel
          data={makeData({ changes: [], proposed_content: 'Some content line' })}
          onSendMessage={vi.fn()}
        />,
      );
      expect(screen.getByText('Some content line')).toBeInTheDocument();
    });

    it('renders with empty active_section', () => {
      render(<LiveResumePanel data={makeData({ active_section: '' })} />);
      expect(screen.getByText('Resume Preview')).toBeInTheDocument();
    });

    it('disables buttons when isProcessing is true', () => {
      render(
        <LiveResumePanel data={makeData()} isProcessing onSendMessage={vi.fn()} />,
      );
      const approveBtn = screen.getByText('Approve All').closest('button');
      expect(approveBtn).toBeDisabled();
    });

    it('handles change with no original', () => {
      render(
        <LiveResumePanel
          data={makeData({
            proposed_content: undefined,
            changes: [makeChange({ original: '' })],
          })}
          onSendMessage={vi.fn()}
        />,
      );
      expect(screen.getByText(/Led cross-functional team/)).toBeInTheDocument();
    });
  });
});
