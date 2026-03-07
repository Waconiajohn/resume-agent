// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DesignOptionsPanel } from '../../components/panels/DesignOptionsPanel';
import type { DesignOptionsData, DesignOption } from '../../types/panels';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOption(overrides?: Partial<DesignOption>): DesignOption {
  return {
    id: 'opt-1',
    name: 'Executive Standard',
    description: 'Classic top-down layout emphasizing leadership.',
    section_order: ['summary', 'experience', 'skills', 'education'],
    rationale: 'Best for senior leadership roles.',
    ...overrides,
  };
}

function makeData(overrides?: Partial<DesignOptionsData>): DesignOptionsData {
  return {
    options: [
      makeOption(),
      makeOption({
        id: 'opt-2',
        name: 'Skills-Forward',
        description: 'Leads with skills to highlight technical expertise.',
        section_order: ['skills', 'summary', 'experience', 'education'],
        rationale: 'Best when technical skills are paramount.',
      }),
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DesignOptionsPanel', () => {
  afterEach(() => cleanup());

  // ── Rendering ───────────────────────────────────────────────────────────

  describe('rendering', () => {
    it('renders the Resume Design header', () => {
      render(<DesignOptionsPanel data={makeData()} />);
      expect(screen.getByText('Resume Design')).toBeInTheDocument();
    });

    it('renders all option names', () => {
      render(<DesignOptionsPanel data={makeData()} />);
      expect(screen.getByText('Executive Standard')).toBeInTheDocument();
      expect(screen.getByText('Skills-Forward')).toBeInTheDocument();
    });

    it('renders option descriptions', () => {
      render(<DesignOptionsPanel data={makeData()} />);
      expect(screen.getByText('Classic top-down layout emphasizing leadership.')).toBeInTheDocument();
    });

    it('renders rationale text', () => {
      render(<DesignOptionsPanel data={makeData()} />);
      expect(screen.getByText('Best for senior leadership roles.')).toBeInTheDocument();
    });

    it('renders wireframe section labels', () => {
      render(<DesignOptionsPanel data={makeData()} />);
      // section_order: summary, experience, skills, education
      const summaryLabels = screen.getAllByText('Summary');
      expect(summaryLabels.length).toBeGreaterThan(0);
    });

    it('uses radiogroup role on the options container', () => {
      render(<DesignOptionsPanel data={makeData()} />);
      expect(screen.getByRole('radiogroup', { name: /resume design options/i })).toBeInTheDocument();
    });

    it('renders radio roles for each option', () => {
      render(<DesignOptionsPanel data={makeData()} />);
      const radios = screen.getAllByRole('radio');
      expect(radios).toHaveLength(2);
    });
  });

  // ── Selection ───────────────────────────────────────────────────────────

  describe('selection', () => {
    it('clicking an option selects it', async () => {
      const user = userEvent.setup();
      render(<DesignOptionsPanel data={makeData()} />);

      await user.click(screen.getByText('Skills-Forward'));
      // After clicking, "Selected" badge should appear
      expect(screen.getByText('Selected')).toBeInTheDocument();
    });

    it('pre-selects option when selected_id is provided', () => {
      render(<DesignOptionsPanel data={makeData({ selected_id: 'opt-2' })} />);
      expect(screen.getByText('Selected')).toBeInTheDocument();
    });

    it('pre-selects option when option.selected is true', () => {
      const data = makeData({
        options: [
          makeOption({ selected: true }),
          makeOption({ id: 'opt-2', name: 'Other', description: 'Other layout', section_order: ['experience'] }),
        ],
      });
      render(<DesignOptionsPanel data={data} />);
      expect(screen.getByText('Selected')).toBeInTheDocument();
    });

    it('filters to selected option once server selection exists', () => {
      render(<DesignOptionsPanel data={makeData({ selected_id: 'opt-1' })} />);
      // Only the selected option should be displayed
      expect(screen.getByText('Executive Standard')).toBeInTheDocument();
      expect(screen.queryByText('Skills-Forward')).not.toBeInTheDocument();
    });
  });

  // ── Keyboard Navigation ─────────────────────────────────────────────────

  describe('keyboard navigation', () => {
    it('ArrowDown moves selection to next option', async () => {
      const user = userEvent.setup();
      render(<DesignOptionsPanel data={makeData()} />);

      const radiogroup = screen.getByRole('radiogroup');
      const radios = screen.getAllByRole('radio');

      // Click first to select
      await user.click(radios[0]);
      // Press ArrowDown on the radiogroup
      radios[0].focus();
      await user.keyboard('{ArrowDown}');

      // Second option should now be selected
      expect(radios[1]).toHaveFocus();
    });

    it('ArrowUp wraps from first to last option', async () => {
      const user = userEvent.setup();
      render(<DesignOptionsPanel data={makeData()} />);

      const radios = screen.getAllByRole('radio');
      await user.click(radios[0]);
      radios[0].focus();
      await user.keyboard('{ArrowUp}');

      // Should wrap to last option
      expect(radios[1]).toHaveFocus();
    });

    it('Enter key selects focused option', async () => {
      const user = userEvent.setup();
      render(<DesignOptionsPanel data={makeData()} />);

      const radios = screen.getAllByRole('radio');
      radios[1].focus();
      await user.keyboard('{Enter}');

      expect(screen.getByText('Selected')).toBeInTheDocument();
    });

    it('Space key selects focused option', async () => {
      const user = userEvent.setup();
      render(<DesignOptionsPanel data={makeData()} />);

      const radios = screen.getAllByRole('radio');
      radios[0].focus();
      await user.keyboard(' ');

      expect(screen.getByText('Selected')).toBeInTheDocument();
    });
  });

  // ── Edge Cases ──────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('renders with empty options array', () => {
      render(<DesignOptionsPanel data={makeData({ options: [] })} />);
      expect(screen.getByText('Resume Design')).toBeInTheDocument();
    });

    it('renders option without rationale', () => {
      render(
        <DesignOptionsPanel
          data={makeData({
            options: [makeOption({ rationale: undefined })],
          })}
        />,
      );
      expect(screen.getByText('Executive Standard')).toBeInTheDocument();
    });

    it('renders option with empty section_order', () => {
      render(
        <DesignOptionsPanel
          data={makeData({
            options: [makeOption({ section_order: [] })],
          })}
        />,
      );
      expect(screen.getByText('Executive Standard')).toBeInTheDocument();
    });
  });
});
