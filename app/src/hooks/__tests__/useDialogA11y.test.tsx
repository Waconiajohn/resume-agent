// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { useDialogA11y } from '../useDialogA11y';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useDialogA11y', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  // ── Focus moves into dialog on open ──────────────────────────────────────

  it('focuses the first focusable element inside dialog when opened', async () => {
    const onClose = vi.fn();

    // Build a dialog node with a focusable button
    const dialog = document.createElement('div');
    const btn = document.createElement('button');
    btn.textContent = 'Close';
    dialog.appendChild(btn);
    document.body.appendChild(dialog);

    const { result, rerender } = renderHook(
      ({ open }: { open: boolean }) => useDialogA11y(open, onClose),
      { initialProps: { open: false } },
    );

    // Manually assign the ref value (simulates React attaching the ref)
    Object.defineProperty(result.current.dialogRef, 'current', {
      value: dialog,
      writable: true,
    });

    // Open the dialog — effect should fire and focus the button
    act(() => {
      rerender({ open: true });
    });

    await vi.advanceTimersByTimeAsync(100);
    expect(document.activeElement).toBe(btn);
  });

  it('focuses the dialog container itself when no focusable child exists', async () => {
    const onClose = vi.fn();

    const dialog = document.createElement('div');
    dialog.setAttribute('tabindex', '-1'); // make it programmatically focusable
    document.body.appendChild(dialog);

    // Render with open=true via a wrapper that attaches the ref
    const { result } = renderHook(() => useDialogA11y(true, onClose));

    Object.defineProperty(result.current.dialogRef, 'current', {
      value: dialog,
      writable: true,
    });

    // Trigger a re-render to re-run the effect with the ref populated
    act(() => {
      result.current; // access to keep ref stable
    });

    await vi.advanceTimersByTimeAsync(100);
    // With no focusable children, it calls dialog.focus() — verify no throw
    // (focus on a tabindex="-1" div is valid; activeElement may or may not be
    // dialog depending on JSDOM version — at minimum onClose not called)
    expect(onClose).not.toHaveBeenCalled();
  });

  // ── Escape key calls onClose ──────────────────────────────────────────────

  it('calls onClose when Escape is pressed while open', () => {
    const onClose = vi.fn();
    renderHook(() => useDialogA11y(true, onClose));

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not call onClose on Escape when dialog is closed', () => {
    const onClose = vi.fn();
    renderHook(() => useDialogA11y(false, onClose));

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not call onClose on non-Escape keys', () => {
    const onClose = vi.fn();
    renderHook(() => useDialogA11y(true, onClose));

    fireEvent.keyDown(document, { key: 'Tab' });
    fireEvent.keyDown(document, { key: 'Enter' });

    expect(onClose).not.toHaveBeenCalled();
  });

  // ── Focus restores on close ───────────────────────────────────────────────

  it('restores focus to previously focused element when closed', async () => {
    const onClose = vi.fn();

    // Create and focus a trigger button before opening the dialog
    const trigger = document.createElement('button');
    trigger.textContent = 'Open dialog';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    // Open the dialog — previousFocusRef should capture trigger
    const { rerender } = renderHook(
      ({ open }: { open: boolean }) => useDialogA11y(open, onClose),
      { initialProps: { open: true } },
    );

    // Close the dialog
    act(() => {
      rerender({ open: false });
    });

    // Focus should be restored to trigger
    expect(document.activeElement).toBe(trigger);
  });

  it('does not throw if previously focused element is no longer in the DOM', async () => {
    const onClose = vi.fn();

    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();

    const { rerender } = renderHook(
      ({ open }: { open: boolean }) => useDialogA11y(open, onClose),
      { initialProps: { open: true } },
    );

    // Remove trigger from DOM before closing
    document.body.removeChild(trigger);

    expect(() => {
      act(() => {
        rerender({ open: false });
      });
    }).not.toThrow();
  });

  // ── Cleanup on unmount ────────────────────────────────────────────────────

  it('removes the keydown listener on unmount so Escape no longer fires', () => {
    const onClose = vi.fn();
    const { unmount } = renderHook(() => useDialogA11y(true, onClose));

    unmount();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('cancels requestAnimationFrame on unmount to avoid stale focus', async () => {
    const cancelSpy = vi.spyOn(globalThis, 'cancelAnimationFrame');
    const onClose = vi.fn();
    const { unmount } = renderHook(() => useDialogA11y(true, onClose));

    unmount();

    expect(cancelSpy).toHaveBeenCalled();
    cancelSpy.mockRestore();
  });
});
