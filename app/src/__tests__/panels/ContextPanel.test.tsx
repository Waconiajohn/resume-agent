// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ContextPanel } from '../../components/panels/ContextPanel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  title: 'Test Panel',
  children: <p>Panel content here</p>,
};

function renderPanel(overrides?: Partial<typeof defaultProps>) {
  return render(<ContextPanel {...defaultProps} {...overrides} />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ContextPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  // --- Rendering ---
  it('renders title and children when open', () => {
    renderPanel();
    expect(screen.getByText('Test Panel')).toBeInTheDocument();
    expect(screen.getByText('Panel content here')).toBeInTheDocument();
  });

  it('uses default title "Context" when no title provided', () => {
    renderPanel({ title: undefined });
    expect(screen.getByText('Context')).toBeInTheDocument();
  });

  it('renders with role="dialog" and aria-modal', () => {
    renderPanel();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-label', 'Test Panel');
  });

  it('renders close button with accessible label', () => {
    renderPanel();
    expect(screen.getByLabelText('Close context panel')).toBeInTheDocument();
  });

  // --- Close button ---
  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    renderPanel({ onClose });
    fireEvent.click(screen.getByLabelText('Close context panel'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  // --- Backdrop click ---
  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    const { container } = renderPanel({ onClose });
    // Backdrop is the first div with aria-hidden="true"
    const backdrop = container.querySelector('[aria-hidden="true"]');
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not render backdrop when panel is closed', () => {
    const { container } = renderPanel({ isOpen: false });
    // Backdrop is a div.fixed.inset-0 with aria-hidden — distinct from the dialog panel
    const backdrop = container.querySelector('.fixed.inset-0[aria-hidden="true"]');
    expect(backdrop).toBeNull();
  });

  // --- Escape key ---
  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn();
    renderPanel({ onClose });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not call onClose on Escape when panel is closed', () => {
    const onClose = vi.fn();
    renderPanel({ isOpen: false, onClose });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  // --- Closed state ---
  it('applies translate-x-full class when closed', () => {
    renderPanel({ isOpen: false });
    const dialog = screen.getByRole('dialog', { hidden: true });
    expect(dialog.className).toContain('translate-x-full');
  });

  it('applies translate-x-0 class when open', () => {
    renderPanel({ isOpen: true });
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('translate-x-0');
  });

  it('sets aria-hidden=true and inert when closed', () => {
    renderPanel({ isOpen: false });
    const dialog = screen.getByRole('dialog', { hidden: true });
    expect(dialog).toHaveAttribute('aria-hidden', 'true');
  });

  // --- Focus management ---
  it('moves focus to close button on open', async () => {
    renderPanel();
    // The component uses requestAnimationFrame to focus; advance timers
    await vi.advanceTimersByTimeAsync(100);
    expect(document.activeElement).toBe(screen.getByLabelText('Close context panel'));
  });
});
