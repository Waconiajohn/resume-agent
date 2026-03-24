// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TemplateSelector } from '../TemplateSelector';
import type { TemplateId } from '@/lib/export-templates';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderSelector(selected: TemplateId = 'ats-classic', onChange = vi.fn()) {
  return render(<TemplateSelector selected={selected} onChange={onChange} />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TemplateSelector', () => {
  afterEach(() => cleanup());

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  it('renders 2 template options (ATS-Optimized and Executive Presence)', () => {
    renderSelector();
    expect(screen.getByText('ATS-Optimized')).toBeInTheDocument();
    expect(screen.getByText('Executive Presence')).toBeInTheDocument();
  });

  it('renders template descriptions', () => {
    renderSelector();
    expect(screen.getByText(/Clean, scannable format/i)).toBeInTheDocument();
    expect(screen.getByText(/Polished design/i)).toBeInTheDocument();
  });

  it('renders a "Template" label heading', () => {
    renderSelector();
    expect(screen.getByText('Template')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Accessibility roles
  // -------------------------------------------------------------------------

  it('has role="radiogroup" on the container', () => {
    renderSelector();
    expect(screen.getByRole('radiogroup', { name: /resume template/i })).toBeInTheDocument();
  });

  it('each option has role="radio"', () => {
    renderSelector();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(2);
  });

  it('selected option has aria-checked="true"', () => {
    renderSelector('ats-classic');
    const radios = screen.getAllByRole('radio');
    const atsRadio = radios.find((r) => r.closest('button')?.textContent?.includes('ATS-Optimized'));
    expect(atsRadio).toHaveAttribute('aria-checked', 'true');
  });

  it('unselected option has aria-checked="false"', () => {
    renderSelector('ats-classic');
    const radios = screen.getAllByRole('radio');
    const execRadio = radios.find((r) =>
      r.closest('button')?.textContent?.includes('Executive Presence'),
    );
    expect(execRadio).toHaveAttribute('aria-checked', 'false');
  });

  // -------------------------------------------------------------------------
  // Default selection
  // -------------------------------------------------------------------------

  it('ats-classic is shown as selected when selected prop is ats-classic', () => {
    renderSelector('ats-classic');
    const radios = screen.getAllByRole('radio');
    // First radio corresponds to ats-classic (first in RESUME_TEMPLATES array)
    expect(radios[0]).toHaveAttribute('aria-checked', 'true');
    expect(radios[1]).toHaveAttribute('aria-checked', 'false');
  });

  it('executive is shown as selected when selected prop is executive', () => {
    renderSelector('executive');
    const radios = screen.getAllByRole('radio');
    expect(radios[0]).toHaveAttribute('aria-checked', 'false');
    expect(radios[1]).toHaveAttribute('aria-checked', 'true');
  });

  // -------------------------------------------------------------------------
  // onChange interaction
  // -------------------------------------------------------------------------

  it('clicking the executive option calls onChange with "executive"', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderSelector('ats-classic', onChange);

    // Find the Executive Presence button by its text content
    const execButton = screen.getByRole('radio', { name: /executive presence/i });
    await user.click(execButton);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('executive');
  });

  it('clicking the ats-classic option calls onChange with "ats-classic"', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderSelector('executive', onChange);

    const atsButton = screen.getByRole('radio', { name: /ats-optimized/i });
    await user.click(atsButton);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('ats-classic');
  });

  it('clicking the already-selected option still calls onChange', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderSelector('ats-classic', onChange);

    const atsButton = screen.getByRole('radio', { name: /ats-optimized/i });
    await user.click(atsButton);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('ats-classic');
  });

  // -------------------------------------------------------------------------
  // className prop
  // -------------------------------------------------------------------------

  it('accepts an optional className prop without crashing', () => {
    expect(() =>
      renderSelector('ats-classic', vi.fn()),
    ).not.toThrow();
  });
});
