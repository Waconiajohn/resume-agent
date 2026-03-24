// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { JargonTooltip } from '../JargonTooltip';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('JargonTooltip', () => {
  afterEach(() => cleanup());

  // -------------------------------------------------------------------------
  // Children / text rendering
  // -------------------------------------------------------------------------

  it('renders children text', () => {
    render(<JargonTooltip term="ATS">Resume scanning</JargonTooltip>);
    expect(screen.getByText('Resume scanning')).toBeInTheDocument();
  });

  it('renders term as text when no children are provided', () => {
    render(<JargonTooltip term="ATS" />);
    expect(screen.getByText('ATS')).toBeInTheDocument();
  });

  it('renders as plain span with no underline when no definition is available', () => {
    render(<JargonTooltip term="UnknownTerm">UnknownTerm</JargonTooltip>);
    // No role="button" element — just a plain span
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('UnknownTerm')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Tooltip visibility on hover
  // -------------------------------------------------------------------------

  it('shows tooltip on mouseenter for a built-in term', async () => {
    render(<JargonTooltip term="ATS">ATS</JargonTooltip>);

    const trigger = screen.getByRole('button');
    fireEvent.mouseEnter(trigger);

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toBeInTheDocument();
    // The built-in ATS definition should appear
    expect(tooltip.textContent).toContain('Applicant Tracking System');
  });

  it('hides tooltip on mouseleave', async () => {
    render(<JargonTooltip term="ATS">ATS</JargonTooltip>);

    const trigger = screen.getByRole('button');
    fireEvent.mouseEnter(trigger);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.mouseLeave(trigger);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('shows tooltip on focus', () => {
    render(<JargonTooltip term="ATS">ATS</JargonTooltip>);

    const trigger = screen.getByRole('button');
    fireEvent.focus(trigger);

    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('hides tooltip on blur', () => {
    render(<JargonTooltip term="ATS">ATS</JargonTooltip>);

    const trigger = screen.getByRole('button');
    fireEvent.focus(trigger);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.blur(trigger);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Custom definition prop
  // -------------------------------------------------------------------------

  it('accepts and displays a custom definition prop', () => {
    const customDef = 'My custom definition for this term.';
    render(
      <JargonTooltip definition={customDef}>Custom Term</JargonTooltip>,
    );

    const trigger = screen.getByRole('button');
    fireEvent.mouseEnter(trigger);

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip.textContent).toContain(customDef);
  });

  it('custom definition overrides the built-in definition', () => {
    const customDef = 'Override for ATS.';
    render(
      <JargonTooltip term="ATS" definition={customDef}>ATS</JargonTooltip>,
    );

    const trigger = screen.getByRole('button');
    fireEvent.mouseEnter(trigger);

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip.textContent).toContain(customDef);
    expect(tooltip.textContent).not.toContain('Applicant Tracking System');
  });

  // -------------------------------------------------------------------------
  // Dotted underline decoration
  // -------------------------------------------------------------------------

  it('has dotted border-b styling on the trigger element', () => {
    render(<JargonTooltip term="ATS">ATS</JargonTooltip>);

    const trigger = screen.getByRole('button');
    // The component uses border-dashed class for the dotted underline
    expect(trigger.className).toContain('border-dashed');
    expect(trigger.className).toContain('border-b');
  });

  // -------------------------------------------------------------------------
  // Escape key closes tooltip
  // -------------------------------------------------------------------------

  it('pressing Escape hides the tooltip', () => {
    render(<JargonTooltip term="ATS">ATS</JargonTooltip>);

    const trigger = screen.getByRole('button');
    fireEvent.mouseEnter(trigger);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Accessibility attributes
  // -------------------------------------------------------------------------

  it('trigger has tabIndex=0 for keyboard navigation', () => {
    render(<JargonTooltip term="ATS">ATS</JargonTooltip>);
    const trigger = screen.getByRole('button');
    expect(trigger).toHaveAttribute('tabindex', '0');
  });

  it('trigger has aria-describedby that matches the tooltip id', () => {
    render(<JargonTooltip term="ATS">ATS</JargonTooltip>);

    const trigger = screen.getByRole('button');
    fireEvent.mouseEnter(trigger);

    const tooltip = screen.getByRole('tooltip');
    const describedById = trigger.getAttribute('aria-describedby');
    expect(describedById).toBeTruthy();
    expect(tooltip.id).toBe(describedById);
  });

  // -------------------------------------------------------------------------
  // Built-in terms coverage
  // -------------------------------------------------------------------------

  it('shows tooltip for the built-in "Blueprint" term', () => {
    render(<JargonTooltip term="Blueprint">Blueprint</JargonTooltip>);

    fireEvent.mouseEnter(screen.getByRole('button'));

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip.textContent).toContain('strategic plan');
  });

  it('shows tooltip for the built-in "Positioning" term', () => {
    render(<JargonTooltip term="Positioning">Positioning</JargonTooltip>);

    fireEvent.mouseEnter(screen.getByRole('button'));

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip.textContent).toContain('frame your experience');
  });
});
