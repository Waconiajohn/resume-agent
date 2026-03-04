import { type ReactNode, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ContextPanelProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export function ContextPanel({ isOpen, onClose, title, children }: ContextPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Focus management: move focus into panel on open, restore on close
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      // Wait for transition to start, then focus close button
      requestAnimationFrame(() => closeButtonRef.current?.focus());
    } else if (previousFocusRef.current) {
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }
  }, [isOpen]);

  // Close on Escape key — only listen when open
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <>
      {/* Backdrop — click to close */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Slide-over panel */}
      <div
        ref={panelRef}
        className={`fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-white/[0.08] bg-[#0d1117] shadow-[-8px_0_24px_-12px_rgba(0,0,0,0.5)] transition-transform duration-300 ease-in-out sm:w-[400px] lg:w-[440px] xl:w-[500px] ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="dialog"
        aria-modal={isOpen}
        aria-hidden={!isOpen}
        aria-label={title ?? 'Context panel'}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
          <span className="text-sm font-medium text-white/85">
            {title ?? 'Context'}
          </span>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="rounded p-1 text-white/40 transition-colors hover:bg-white/[0.08] hover:text-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            aria-label="Close context panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </>
  );
}
