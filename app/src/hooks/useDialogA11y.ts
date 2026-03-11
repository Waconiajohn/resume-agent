import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTORS =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialogA11y(
  isOpen: boolean,
  onClose: () => void,
): { dialogRef: RefObject<HTMLDivElement | null> } {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Focus management: save previous focus, move into dialog on open, restore on close
  useEffect(() => {
    let rafId: number;

    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      rafId = requestAnimationFrame(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        const first = dialog.querySelector<HTMLElement>(FOCUSABLE_SELECTORS);
        if (first) {
          first.focus();
        } else {
          dialog.focus();
        }
      });
    } else if (previousFocusRef.current) {
      if (document.body.contains(previousFocusRef.current)) {
        previousFocusRef.current.focus();
      }
      previousFocusRef.current = null;
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [isOpen]);

  // Escape key: only listen when open
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return { dialogRef };
}
