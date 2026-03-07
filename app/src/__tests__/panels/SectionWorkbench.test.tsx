// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SectionWorkbench } from '../../components/panels/SectionWorkbench';
import type { SectionWorkbenchContext } from '../../types/panels';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/components/shared/ProcessStepGuideCard', () => ({
  ProcessStepGuideCard: ({ step }: { step: string }) => (
    <div data-testid="process-step-guide">{step}</div>
  ),
}));

vi.mock('@/components/panels/workbench/WorkbenchProgressDots', () => ({
  WorkbenchProgressDots: ({ currentSection }: { currentSection: string }) => (
    <div data-testid="progress-dots">{currentSection}</div>
  ),
}));

vi.mock('@/components/panels/workbench/WorkbenchContentEditor', () => ({
  WorkbenchContentEditor: ({
    content,
    localContent,
    onLocalContentChange,
  }: {
    content: string;
    localContent: string;
    onLocalContentChange: (v: string) => void;
  }) => (
    <div data-testid="content-editor">
      <textarea
        data-testid="editor-textarea"
        value={localContent}
        onChange={(e) => onLocalContentChange(e.target.value)}
      />
    </div>
  ),
}));

vi.mock('@/components/panels/workbench/WorkbenchActionChips', () => ({
  WorkbenchActionChips: ({
    section,
    onAction,
    disabled,
  }: {
    section: string;
    onAction: (instruction: string) => void;
    disabled: boolean;
  }) => (
    <div data-testid="action-chips">
      <button
        data-testid="refine-chip"
        onClick={() => onAction('Make it more concise')}
        disabled={disabled}
      >
        Refine
      </button>
    </div>
  ),
}));

vi.mock('@/components/panels/workbench/WorkbenchSuggestions', () => ({
  WorkbenchSuggestions: () => <div data-testid="suggestions" />,
}));

vi.mock('@/components/panels/workbench/WorkbenchEvidenceCards', () => ({
  WorkbenchEvidenceCards: () => <div data-testid="evidence-cards" />,
}));

vi.mock('@/components/panels/workbench/WorkbenchKeywordBar', () => ({
  WorkbenchKeywordBar: () => <div data-testid="keyword-bar" />,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(overrides?: Partial<SectionWorkbenchContext>): SectionWorkbenchContext {
  return {
    context_version: 1,
    generated_at: '2026-01-01T00:00:00Z',
    blueprint_slice: {},
    evidence: [],
    keywords: [],
    gap_mappings: [],
    section_order: ['summary', 'experience_role_1', 'skills'],
    sections_approved: ['summary'],
    ...overrides,
  };
}

const defaultProps = {
  section: 'experience_role_1',
  content: 'Led a team of 45 engineers delivering mission-critical systems.',
  context: makeContext(),
  onApprove: vi.fn(),
  onRequestChanges: vi.fn(),
  onDirectEdit: vi.fn(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SectionWorkbench', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  // ── Rendering ───────────────────────────────────────────────────────────

  describe('rendering', () => {
    it('renders the section title in title case', () => {
      render(<SectionWorkbench {...defaultProps} />);
      expect(screen.getByText('Experience Role 1')).toBeInTheDocument();
    });

    it('renders the process step guide card', () => {
      render(<SectionWorkbench {...defaultProps} />);
      expect(screen.getByTestId('process-step-guide')).toBeInTheDocument();
    });

    it('renders the content editor', () => {
      render(<SectionWorkbench {...defaultProps} />);
      expect(screen.getByTestId('content-editor')).toBeInTheDocument();
    });

    it('renders action chips when no suggestions', () => {
      render(<SectionWorkbench {...defaultProps} />);
      expect(screen.getByTestId('action-chips')).toBeInTheDocument();
    });

    it('renders "Looks Good" approve button', () => {
      render(<SectionWorkbench {...defaultProps} />);
      expect(screen.getByText('Looks Good')).toBeInTheDocument();
    });

    it('renders positioning angle when present in context', () => {
      const ctx = makeContext({
        blueprint_slice: { positioning_angle: 'Enterprise transformation leader' },
      });
      render(<SectionWorkbench {...defaultProps} context={ctx} />);
      expect(screen.getByText('Enterprise transformation leader')).toBeInTheDocument();
    });

    it('renders bundled review info when review_strategy is bundled', () => {
      const ctx = makeContext({
        review_strategy: 'bundled',
        review_required_sections: ['experience_role_1', 'skills'],
        review_bundles: [
          {
            key: 'core_experience',
            label: 'Core Experience',
            total_sections: 2,
            review_required: 2,
            reviewed_required: 0,
            status: 'in_progress',
          },
        ],
        current_review_bundle_key: 'core_experience',
      });
      render(<SectionWorkbench {...defaultProps} context={ctx} />);
      expect(screen.getByText('Grouped Sections')).toBeInTheDocument();
    });
  });

  // ── Approve Flow ────────────────────────────────────────────────────────

  describe('approve flow', () => {
    it('clicking Looks Good calls onApprove after animation delay', async () => {
      const onApprove = vi.fn();
      render(<SectionWorkbench {...defaultProps} onApprove={onApprove} />);

      const btn = screen.getByText('Looks Good');
      await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(btn);

      vi.advanceTimersByTime(400);
      expect(onApprove).toHaveBeenCalledOnce();
    });

    it('shows approval animation overlay after clicking approve', async () => {
      render(<SectionWorkbench {...defaultProps} />);

      await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(
        screen.getByText('Looks Good'),
      );

      expect(screen.getByText('Section approved')).toBeInTheDocument();
    });
  });

  // ── Inline Editing ──────────────────────────────────────────────────────

  describe('inline editing', () => {
    it('editing content shows Save Edits button', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<SectionWorkbench {...defaultProps} />);

      const textarea = screen.getByTestId('editor-textarea');
      await user.clear(textarea);
      await user.type(textarea, 'Updated content');

      expect(screen.getByText('Save Edits')).toBeInTheDocument();
    });

    it('clicking Save Edits calls onDirectEdit', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onDirectEdit = vi.fn();
      render(<SectionWorkbench {...defaultProps} onDirectEdit={onDirectEdit} />);

      const textarea = screen.getByTestId('editor-textarea');
      await user.clear(textarea);
      await user.type(textarea, 'Updated');

      await user.click(screen.getByText('Save Edits'));
      expect(onDirectEdit).toHaveBeenCalledWith('Updated', undefined);
    });

    it('clicking Discard reverts to original content', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<SectionWorkbench {...defaultProps} />);

      const textarea = screen.getByTestId('editor-textarea');
      await user.clear(textarea);
      await user.type(textarea, 'Modified content');

      expect(screen.getByText('Discard')).toBeInTheDocument();
      await user.click(screen.getByText('Discard'));

      // After discard, "Looks Good" should be back (not "Save Edits")
      expect(screen.getByText('Looks Good')).toBeInTheDocument();
    });
  });

  // ── Undo / Redo ─────────────────────────────────────────────────────────

  describe('undo/redo', () => {
    it('undo button appears after editing and reverts change', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<SectionWorkbench {...defaultProps} />);

      const textarea = screen.getByTestId('editor-textarea');
      await user.clear(textarea);
      await user.type(textarea, 'edit1');

      const undoBtn = screen.getByLabelText('Undo last inline edit');
      expect(undoBtn).toBeInTheDocument();
      await user.click(undoBtn);

      // After undo, the textarea should be empty (the cleared state was pushed to undo stack)
      // and redo should be available
      expect(screen.getByLabelText('Redo inline edit')).toBeInTheDocument();
    });
  });

  // ── Advanced Guidance ───────────────────────────────────────────────────

  describe('advanced guidance', () => {
    it('shows Advanced Guidance toggle when evidence exists', () => {
      const ctx = makeContext({
        evidence: [
          {
            id: 'ev1',
            situation: 'Legacy system',
            action: 'Migrated to cloud',
            result: '$2M savings',
            metrics_defensible: true,
            user_validated: true,
            mapped_requirements: ['cloud'],
            scope_metrics: {},
          },
        ],
      });
      render(<SectionWorkbench {...defaultProps} context={ctx} />);
      expect(screen.getByText(/Advanced Guidance/)).toBeInTheDocument();
    });

    it('does not show Advanced Guidance when no evidence, keywords, or gaps', () => {
      render(<SectionWorkbench {...defaultProps} context={makeContext()} />);
      expect(screen.queryByText(/Advanced Guidance/)).not.toBeInTheDocument();
    });
  });

  // ── Edge Cases ──────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('renders with null context', () => {
      render(<SectionWorkbench {...defaultProps} context={null} />);
      expect(screen.getByText('Experience Role 1')).toBeInTheDocument();
    });

    it('resets state when section prop changes', () => {
      const { rerender } = render(<SectionWorkbench {...defaultProps} />);
      rerender(<SectionWorkbench {...defaultProps} section="skills" content="New skills content" />);
      // The h2 title should now say "Skills"
      const heading = screen.getByRole('heading', { level: 2 });
      expect(heading).toHaveTextContent('Skills');
    });
  });
});
